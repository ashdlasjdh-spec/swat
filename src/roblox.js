const noblox = require('noblox.js');
const axios = require('axios');
const config = require('./config');

const GROUP_ID = config.groupId;
const COOKIE = config.robloxCookie;

// ---------------------------------------------------------------------------
// Caches (optimization: avoid re-hitting the Roblox API for stable data)
// ---------------------------------------------------------------------------
let rolesCache = []; // [{ id, name, rank, memberCount }] sorted by rank asc
let csrfToken = null; // reused across ban requests
const idCache = new Map(); // username(lower) -> { id, ts }
const ID_TTL = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Init & auth
// ---------------------------------------------------------------------------
async function init() {
  await noblox.setCookie(COOKIE);
  const me = await noblox.getCurrentUser();
  await refreshRoles();
  return { id: me.id ?? me.UserID, name: me.name ?? me.UserName ?? 'account' };
}

// ---------------------------------------------------------------------------
// Ranks / roles — registered from the group via the API at startup
// ---------------------------------------------------------------------------
async function refreshRoles() {
  const roles = await noblox.getRoles(GROUP_ID);
  rolesCache = [...roles].sort((a, b) => a.rank - b.rank);
  return rolesCache;
}

function getRoles() {
  return rolesCache;
}

/**
 * Resolve a rank from a user query: either the rank number (e.g. "5" / "255")
 * or the rank name ("Member", "Admin", partial match allowed).
 */
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

  const id = await noblox.getIdFromUsername(raw);
  if (!id) throw new Error(`Roblox user "${raw}" not found`);
  idCache.set(key, { id, ts: Date.now() });
  return id;
}

async function getRankInGroup(userId) {
  return noblox.getRankInGroup(GROUP_ID, userId);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function setRank(userId, role) {
  return noblox.setRank(GROUP_ID, userId, role.rank);
}

async function exile(userId) {
  return noblox.exile(GROUP_ID, userId);
}

async function acceptJoinRequest(userId) {
  return noblox.handleJoinRequest(GROUP_ID, userId, true);
}

/**
 * Collect every pending join-request userId first (paginated), so we don't
 * invalidate the cursor while accepting.
 */
async function getAllJoinRequestIds() {
  const ids = [];
  let cursor = null;

  do {
    const page = await noblox.getJoinRequests(GROUP_ID, 'Asc', 100, cursor);
    const data = Array.isArray(page) ? page : page?.data || [];
    for (const req of data) {
      const uid = req?.requester?.userId ?? req?.requesterId ?? req?.userId;
      if (uid) ids.push(uid);
    }
    cursor = Array.isArray(page) ? null : page?.nextPageCursor || null;
  } while (cursor);

  return ids;
}

// ---------------------------------------------------------------------------
// Group ban — Roblox native group ban endpoint (needs the ban feature + perms)
// ---------------------------------------------------------------------------
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
    // CSRF token rotated — refresh once and retry.
    if (
      err.response?.status === 403 &&
      err.response.headers['x-csrf-token'] &&
      attempt < 2
    ) {
      csrfToken = err.response.headers['x-csrf-token'];
      return banRequest(userId, attempt + 1);
    }
    throw err;
  }
}

async function banUser(userId) {
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
