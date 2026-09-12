const axios = require('axios');
const config = require('./config');

const GROUP_ID = config.groupId;
const API_KEY = config.robloxApiKey;
const COOKIE = config.robloxCookie; // optional — only for exile/ban

// ---------------------------------------------------------------------------
// Open Cloud client (API key). Handles accept / acceptall / setrank / roles.
// ---------------------------------------------------------------------------
const cloud = axios.create({
  baseURL: 'https://apis.roblox.com/cloud/v2',
  headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------
let rolesCache = []; // [{ id, name, rank }] sorted by rank asc
const idCache = new Map(); // username(lower) -> { id, ts }
const ID_TTL = 10 * 60 * 1000;

// Cookie-based ops (exile/ban) are loaded lazily so the bot runs API-key-only.
let noblox = null;
let cookieReady = false;
let csrfToken = null;

// ---------------------------------------------------------------------------
// Init & auth
// ---------------------------------------------------------------------------
async function init() {
  // Validate the API key by reading the group (needs group:read).
  const { data } = await cloud.get(`/groups/${GROUP_ID}`);
  await refreshRoles();

  let cookie = 'disabled (no ROBLOX_COOKIE — .exile/.ban off)';
  if (COOKIE) {
    try {
      noblox = require('noblox.js');
      await noblox.setCookie(COOKIE);
      cookieReady = true;
      cookie = 'enabled (.exile/.ban available)';
    } catch (err) {
      cookie = `FAILED (${err.message}) — .exile/.ban off`;
    }
  }

  return { group: data.displayName || data.name || String(GROUP_ID), cookie };
}

// ---------------------------------------------------------------------------
// Ranks / roles — from Open Cloud
// ---------------------------------------------------------------------------
async function refreshRoles() {
  const roles = [];
  let pageToken = '';
  do {
    const { data } = await cloud.get(`/groups/${GROUP_ID}/roles`, {
      params: { maxPageSize: 100, pageToken: pageToken || undefined },
    });
    for (const r of data.groupRoles || []) {
      roles.push({
        id: r.id ?? String(r.path || '').split('/').pop(),
        name: r.displayName,
        rank: r.rank,
      });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  rolesCache = roles.sort((a, b) => a.rank - b.rank);
  return rolesCache;
}

function getRoles() {
  return rolesCache;
}

/** Resolve a rank by number ("255") or name ("Admin", partial match ok). */
function findRole(query) {
  if (query == null) return null;
  const q = String(query).trim().toLowerCase();
  if (!q) return null;

  if (/^\d+$/.test(q)) {
    const n = parseInt(q, 10);
    return rolesCache.find((r) => r.rank === n) || null;
  }

  return (
    rolesCache.find((r) => r.name.toLowerCase() === q) ||
    rolesCache.find((r) => r.name.toLowerCase().includes(q)) ||
    null
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
async function resolveUserId(input) {
  const raw = String(input).trim().replace(/^@/, '');
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);

  const key = raw.toLowerCase();
  const cached = idCache.get(key);
  if (cached && Date.now() - cached.ts < ID_TTL) return cached.id;

  // Public username -> id endpoint (no auth needed).
  const { data } = await axios.post(
    'https://users.roblox.com/v1/usernames/users',
    { usernames: [raw], excludeBannedUsers: false }
  );
  const user = data?.data?.[0];
  if (!user) throw new Error(`Roblox user "${raw}" not found`);
  idCache.set(key, { id: user.id, ts: Date.now() });
  return user.id;
}

/** Fetch the membership resource for a user (or null if not a member). */
async function getMembership(userId) {
  const { data } = await cloud.get(`/groups/${GROUP_ID}/memberships`, {
    params: { maxPageSize: 1, filter: `user == 'users/${userId}'` },
  });
  return (data.groupMemberships || [])[0] || null;
}

async function getRankInGroup(userId) {
  const m = await getMembership(userId);
  if (!m) return 0;
  const roleId = String(m.role || '').split('/').pop();
  const role = rolesCache.find((r) => String(r.id) === String(roleId));
  return role ? role.rank : 0;
}

// ---------------------------------------------------------------------------
// Actions (Open Cloud)
// ---------------------------------------------------------------------------
async function setRank(userId, role) {
  const m = await getMembership(userId);
  if (!m) throw new Error('User is not a member of the group');
  const membershipId = String(m.path || '').split('/').pop();
  await cloud.patch(`/groups/${GROUP_ID}/memberships/${membershipId}`, {
    role: `groups/${GROUP_ID}/roles/${role.id}`,
  });
}

async function acceptJoinRequest(userId) {
  // join_request_id is the user id.
  await cloud.post(`/groups/${GROUP_ID}/join-requests/${userId}:accept`);
}

/** Collect every pending join-request user id (paginated). */
async function getAllJoinRequestIds() {
  const ids = [];
  let pageToken = '';
  do {
    const { data } = await cloud.get(`/groups/${GROUP_ID}/join-requests`, {
      params: { maxPageSize: 100, pageToken: pageToken || undefined },
    });
    for (const jr of data.groupJoinRequests || []) {
      const uid = String(jr.user || '').split('/').pop();
      if (uid) ids.push(parseInt(uid, 10));
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return ids;
}

// ---------------------------------------------------------------------------
// Exile / Ban — Open Cloud has NO endpoint for these, so they require the
// optional .ROBLOSECURITY cookie. Without it, they return a clear message.
// ---------------------------------------------------------------------------
async function exile(userId) {
  if (!cookieReady) {
    throw new Error('Exile needs ROBLOX_COOKIE — Open Cloud API keys cannot remove members.');
  }
  return noblox.exile(GROUP_ID, userId);
}

async function fetchCsrf() {
  try {
    await axios.post(
      'https://auth.roblox.com/v2/logout',
      {},
      { headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` } }
    );
    return null;
  } catch (err) {
    const token = err.response?.headers?.['x-csrf-token'];
    if (token) return token;
    throw new Error('Could not obtain CSRF token from Roblox');
  }
}

async function banRequest(userId, attempt) {
  if (!csrfToken) csrfToken = await fetchCsrf();
  try {
    const res = await axios.post(
      `https://groups.roblox.com/v1/groups/${GROUP_ID}/bans/${userId}`,
      {},
      {
        headers: {
          Cookie: `.ROBLOSECURITY=${COOKIE}`,
          'X-CSRF-TOKEN': csrfToken,
          'Content-Type': 'application/json',
        },
      }
    );
    return res.data;
  } catch (err) {
    if (err.response?.status === 403 && err.response.headers['x-csrf-token'] && attempt < 2) {
      csrfToken = err.response.headers['x-csrf-token'];
      return banRequest(userId, attempt + 1);
    }
    throw err;
  }
}

async function banUser(userId) {
  if (!COOKIE) {
    throw new Error('Ban needs ROBLOX_COOKIE — Open Cloud API keys cannot ban members.');
  }
  return banRequest(userId, 0);
}

module.exports = {
  GROUP_ID,
  init,
  refreshRoles,
  getRoles,
  findRole,
  resolveUserId,
  getRankInGroup,
  setRank,
  exile,
  acceptJoinRequest,
  getAllJoinRequestIds,
  banUser,
};
