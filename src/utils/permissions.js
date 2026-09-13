const { PermissionsBitField } = require('discord.js');
const config = require('../config');

/**
 * A member may use commands if they are whitelisted (always), a server admin /
 * can manage the server, or if they hold one of the configured STAFF_ROLE_IDS.
 */
function isStaff(member) {
  if (!member) return false;

  // Always-allowed users, regardless of roles/permissions.
  if (config.whitelistUserIds.includes(member.id)) return true;

  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;

  if (config.staffRoleIds.length === 0) return false;
  return member.roles.cache.some((role) => config.staffRoleIds.includes(role.id));
}

module.exports = { isStaff };
