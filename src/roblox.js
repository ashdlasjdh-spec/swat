const axios = require('axios');
const config = require('./config');

const API_KEY = config.robloxApiKey;
const COOKIE = config.robloxCookie; // optional — only for exile/ban

// ---------------------------------------------------------------------------
// Shared Open Cloud client (one API key covers every managed group).
// ---------------------------------------------------------------------------
const cloud = axios.create({
  baseURL: 'https://apis.roblox.com/cloud/v2',
  headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Auto-retry rate limits (429) and transient 5xx, honoring Retry-After.
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
// Shared cookie client (same account ranks/exiles/bans in every group).
// ---------------------------------------------------------------------------
let cookieReady = false;
let csrfToken = null;

const web = COOKIE
  ? axios.create({
      timeout: 15000,
      // No default Content-Type: axios sets it only when a body is sent, so
      // body-less DELETEs don't get an application/json header + empty payload.
      headers: {
        Cookie: `.ROBLOSECURITY=${COOKIE}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    })
  : null;

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
    // POST endpoints (ban) want a valid JSON body; DELETE (exile) wants none.
    const data = method === 'post' ? {} : undefined;
    const res = await web.request({ method, url, data, headers: { 'X-CSRF-TOKEN': csrfToken } });
    return res.data;
  } catch (err) {
    if (err.response?.status === 403 && err.response.headers['x-csrf-token'] && attempt < 2) {
      csrfToken = err.response.headers['x-csrf-token'];
      return cookieRequest(method, url, attempt + 1);
    }
    throw err;
  }
}

function isCookieReady() {
  return cookieReady;
}

// ---------------------------------------------------------------------------
// Shared username -> id cache (group-independent).
// ---------------------------------------------------------------------------
const idCache = new Map(); // username(lower) -> { id, ts }
const ID_TTL = 10 * 60 * 1000;

function pruneIdCache() {
  const now = Date.now();
  for (const [k, v] of idCache) if (now - v.ts >= ID_TTL) idCache.delete(k);
}

async function resolveUserId(input) {
  const raw = String(input).trim().replace(/^@/, '');
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);

  const key = raw.toLowerCase();
  const cached = idCache.get(key);
  if (cached && Date.now() - cached.ts < ID_TTL) return cached.id;

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

// ---------------------------------------------------------------------------
// One managed group: its own rank registry + actions, on the shared clients.
// ---------------------------------------------------------------------------
class Group {
  constructor(groupId, prefix) {
    this.groupId = groupId;
    this.prefix = prefix;
    this.name = String(groupId);
    this.roles = []; // [{ id, name, rank }] sorted by rank asc
    // Expose the shared resolver so commands can call group.resolveUserId(...).
    this.resolveUserId = resolveUserId;
  }

  async refreshRoles() {
    const roles = [];
    let pageToken = '';
    do {
      const { data } = await cloud.get(`/groups/${this.groupId}/roles`, {
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

    this.roles = roles.sort((a, b) => a.rank - b.rank);
    return this.roles;
  }

  getRoles() {
    return this.roles;
  }

  /** Resolve a rank by number ("255") or name ("Admin", partial match ok). */
  findRole(query) {
    if (query == null) return null;
    const q = String(query).trim().toLowerCase();
    if (!q) return null;

    if (/^\d+$/.test(q)) {
      const n = parseInt(q, 10);
      return this.roles.find((r) => r.rank === n) || null;
    }

    return (
      this.roles.find((r) => r.name.toLowerCase() === q) ||
      this.roles.find((r) => r.name.toLowerCase().includes(q)) ||
      null
    );
  }

  /** Membership resource for a user (or null if not a member). */
  async getMembership(userId) {
    const { data } = await cloud.get(`/groups/${this.groupId}/memberships`, {
      params: { maxPageSize: 1, filter: `user == 'users/${userId}'` },
    });
    return (data.groupMemberships || [])[0] || null;
  }

  async getRankInGroup(userId) {
    const m = await this.getMembership(userId);
    if (!m) return 0;
    const roleId = String(m.role || '').split('/').pop();
    const role = this.roles.find((r) => String(r.id) === String(roleId));
    return role ? role.rank : 0;
  }

  async setRank(userId, role) {
    const m = await this.getMembership(userId);
    if (!m) throw new Error('NOT_A_MEMBER');

    const currentRoleId = String(m.role || '').split('/').pop();
    if (String(currentRoleId) === String(role.id)) return { changed: false };

    const membershipId = String(m.path || '').split('/').pop();
    await cloud.patch(`/groups/${this.groupId}/memberships/${membershipId}`, {
      role: `groups/${this.groupId}/roles/${role.id}`,
    });
    return { changed: true };
  }

  async acceptJoinRequest(userId) {
    // Body MUST be valid JSON — an empty body with an application/json header
    // is rejected as "Request JSON payload is not correctly formatted".
    await cloud.post(`/groups/${this.groupId}/join-requests/${userId}:accept`, {});
  }

  /** Collect every pending join-request user id (paginated). */
  async getAllJoinRequestIds() {
    const ids = [];
    let pageToken = '';
    do {
      const { data } = await cloud.get(`/groups/${this.groupId}/join-requests`, {
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

  // Exile / Ban — no Open Cloud endpoint, so these need the cookie.
  async exile(userId) {
    if (!cookieReady) {
      throw new Error('Exile needs a valid ROBLOX_COOKIE — Open Cloud API keys cannot remove members.');
    }
    return cookieRequest('delete', `https://groups.roblox.com/v1/groups/${this.groupId}/users/${userId}`);
  }

  async banUser(userId) {
    if (!cookieReady) {
      throw new Error('Ban needs a valid ROBLOX_COOKIE — Open Cloud API keys cannot ban members.');
    }
    return cookieRequest('post', `https://groups.roblox.com/v1/groups/${this.groupId}/bans/${userId}`);
  }
}

// ---------------------------------------------------------------------------
// Init: authenticate, build each managed group, validate the cookie once.
// ---------------------------------------------------------------------------
const groupsByPrefix = new Map(); // prefix -> Group

async function init() {
  for (const g of config.groups) {
    const group = new Group(g.groupId, g.prefix);
    // Validate the API key against this group (needs group:read).
    const { data } = await cloud.get(`/groups/${g.groupId}`);
    group.name = data.displayName || data.name || String(g.groupId);
    await group.refreshRoles();
    groupsByPrefix.set(g.prefix, group);
  }

  let cookie = 'disabled (no ROBLOX_COOKIE — .exile/.ban off)';
  if (COOKIE) {
    try {
      const { data: me } = await web.get('https://users.roblox.com/v1/users/authenticated');
      cookieReady = true;
      cookie = `enabled as ${me.name} (${me.id})`;
      csrfToken = await fetchCsrf().catch(() => null); // pre-warm
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.errors?.[0]?.message || err.message;
      cookie = `FAILED (${status || ''} ${detail}) — .exile/.ban off`;
    }
  }

  return { groups: groupsByPrefix, cookie };
}

function getGroups() {
  return groupsByPrefix;
}

async function refreshAllRoles() {
  await Promise.all([...groupsByPrefix.values()].map((g) => g.refreshRoles().catch(() => {})));
}

module.exports = {
  init,
  getGroups,
  refreshAllRoles,
  resolveUserId,
  isCookieReady,
};
