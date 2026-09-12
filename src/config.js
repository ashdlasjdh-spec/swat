require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const config = {
  discordToken: required('DISCORD_TOKEN'),
  robloxCookie: required('ROBLOX_COOKIE'),
  groupId: parseInt(process.env.GROUP_ID || '981953580', 10),
  prefix: process.env.PREFIX || '.',
  // Discord role IDs (comma separated) allowed to run commands.
  // Server admins / Manage Server always allowed regardless of this list.
  staffRoleIds: (process.env.STAFF_ROLE_IDS || '')
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
