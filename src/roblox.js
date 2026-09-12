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

// Auto-retry rate limits (429) and transient 5xx, honoring Retry-After.
// Keeps .acceptall / .setrank resilient under load instead of failing.
cloud.interceptors.response.use(undefined, async (err) => {
  const cfg = err.config;
  const status = err.response?.status;
  if (!cfg || !(status === 429 || (status >= 500 && status < 600))) throw err;
  cfg.__retry = (cfg.__retry || 0) + 1;
  if (cfg.__retry > 3) throw err;
  const retryAfter = Number(err.response?.headers?.['retry-after']);
  const delay =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 300 * 2 ** (cfg.__retry - 1); // 300 → 600 → 1200ms backoff
  await new Promise((r) => setTimeout(r, delay));
  return cloud.request(cfg);
});

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------
let rolesCache = []; // [{ id, name, rank }] sorted by rank asc
const idCache = new Map(); // username(lower) -> { id, ts }
const ID_TTL = 10 * 60 * 1000;

// Cookie-based ops (exile/ban) use direct HTTP with the raw cookie — no
// noblox, so there's no flaky pre-flight validation. A browser-like
// User-Agent is required or Roblox bot-flags the request.
let cookieReady = false;
let csrfToken = null;

const web = COOKIE
  ? axios.create({
      timeout: 15000,
      headers: {
        Cookie: `.ROBLOSECURITY=${COOKIE}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
      },
    })
  : null;

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
      const { data: me } = await web.get('https://users.roblox.com/v1/users/authenticated');
      cookieReady = true;
      cookie = `enabled as ${me.name} (${me.id})`;
      // Pre-warm the CSRF token so the first .exile/.ban has no extra round-trip.
      csrfToken = await fetchCsrf().catch(() => null);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.errors?.[0]?.message || err.message;
      cookie = `FAILED (${status || ''} ${detail}) — .exile/.ban off`;
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
  if (idCache.size > 500) pruneIdCache();
  idCache.set(key, { id: user.id, ts: Date.now() });
  return user.id;
}

// Drop expired entries so the cache can't grow without bound on long uptime.
function pruneIdCache() {
  const now = Date.now();
  for (const [k, v] of idCache) {
    if (now - v.ts >= ID_TTL) idCache.delete(k);
  }
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
  // One membership fetch does both the "is a member?" check and the update,
  // instead of the command doing a separate getRankInGroup call first.
  const m = await getMembership(userId);
  if (!m) throw new Error('NOT_A_MEMBER');

  // No-op if they're already at that rank — skip the PATCH entirely.
  const currentRoleId = String(m.role || '').split('/').pop();
  if (String(currentRoleId) === String(role.id)) return { changed: false };

  const membershipId = String(m.path || '').split('/').pop();
  await cloud.patch(`/groups/${GROUP_ID}/memberships/${membershipId}`, {
    role: `groups/${GROUP_ID}/roles/${role.id}`,
  });
  return { changed: true };
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
// Obtain an X-CSRF-TOKEN: an unauthenticated-style POST returns it in a 403 header.
async function fetchCsrf() {
  try {
    await web.post('https://auth.roblox.com/v2/logout', {});
    return null;
  } catch (err) {
    const token = err.response?.headers?.['x-csrf-token'];
    if (token) return token;
    throw new Error('Could not obtain CSRF token from Roblox');
  }
}

// Generic cookie request with one automatic CSRF refresh + retry.
async function cookieRequest(method, url, attempt = 0) {
  if (!csrfToken) csrfToken = await fetchCsrf();
  try {
    const res = await web.request({ method, url, headers: { 'X-CSRF-TOKEN': csrfToken } });
    return res.data;
  } catch (err) {
    if (err.response?.status === 403 && err.response.headers['x-csrf-token'] && attempt < 2) {
      csrfToken = err.response.headers['x-csrf-token'];
      return cookieRequest(method, url, attempt + 1);
    }
    throw err;
  }
}

async function exile(userId) {
  if (!cookieReady) {
    throw new Error('Exile needs a valid ROBLOX_COOKIE — Open Cloud API keys cannot remove members.');
  }
  // Classic "remove from group" endpoint.
  return cookieRequest('delete', `https://groups.roblox.com/v1/groups/${GROUP_ID}/users/${userId}`);
}

async function banUser(userId) {
  if (!cookieReady) {
    throw new Error('Ban needs a valid ROBLOX_COOKIE — Open Cloud API keys cannot ban members.');
  }
  return cookieRequest('post', `https://groups.roblox.com/v1/groups/${GROUP_ID}/bans/${userId}`);
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
