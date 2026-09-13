require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

// Build the list of managed groups. Each group has its own command prefix,
// so one bot in one server can manage several groups:
//   "."  -> 981953580 (Get swatted.gg)
//   ","  -> 807480487 (swatk raider tag)
// Override with GROUPS="<prefix>:<groupId>,<prefix>:<groupId>", or with the
// individual PREFIX/GROUP_ID and PREFIX2/GROUP2_ID vars.
function buildGroups() {
  const out = [];
  const raw = (process.env.GROUPS || '').trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const [prefix, gid] = part.split(':').map((s) => s.trim());
      const groupId = parseInt(gid, 10);
      if (prefix && Number.isFinite(groupId) && groupId > 0) out.push({ prefix, groupId });
    }
  } else {
    out.push({ prefix: process.env.PREFIX || '.', groupId: parseInt(process.env.GROUP_ID || '981953580', 10) });
    const g2 = parseInt(process.env.GROUP2_ID || '807480487', 10);
    if (Number.isFinite(g2) && g2 > 0) out.push({ prefix: process.env.PREFIX2 || ',', groupId: g2 });
  }
  // First prefix wins if duplicated; longest prefixes matched first at dispatch.
  const seen = new Set();
  return out.filter((g) => (seen.has(g.prefix) ? false : (seen.add(g.prefix), true)));
}

const groups = buildGroups();

const config = {
  discordToken: required('DISCORD_TOKEN'),
  // Open Cloud API key — used for accept / acceptall / setrank / roles.
  // Must be scoped to EVERY managed group.
  robloxApiKey: required('ROBLOX_API_KEY'),
  // Optional .ROBLOSECURITY cookie — only needed for .exile / .ban, which
  // Open Cloud has no endpoint for. The account must be in every managed group.
  robloxCookie: (process.env.ROBLOX_COOKIE || '').trim(),
  // Managed groups (prefix -> groupId). config.groupId/prefix are the first.
  groups,
  groupId: groups[0].groupId,
  prefix: groups[0].prefix,
  // Discord role IDs (comma separated) allowed to run commands.
  // Server admins / Manage Server always allowed regardless of this list.
  staffRoleIds: (process.env.STAFF_ROLE_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Discord user IDs that ALWAYS pass the permission gate, in every server,
  // regardless of roles/permissions. Comma-separated; defaults include the owner.
  whitelistUserIds: (process.env.WHITELIST_USER_IDS || '1434685900704583770')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // .verify role swap (Discord). Defaults match the requested role IDs.
  verifiedRoleId: process.env.VERIFIED_ROLE_ID || '1521999556852711476',
  unverifiedRoleId: process.env.UNVERIFIED_ROLE_ID || '1522001263376597073',
  // Optional keepalive HTTP port (Railway sets PORT automatically for web services).
  port: parseInt(process.env.PORT || '0', 10),
  // How often (ms) to refresh the cached group ranks.
  roleRefreshInterval: 10 * 60 * 1000,
};

module.exports = config;
