const { success, error } = require('../utils/embed');
const { humanize } = require('../utils/errors');
const config = require('../config');

module.exports = {
  name: 'verify',
  aliases: ['v'],
  description: 'Remove the unverified role and give the verified role.',
  usage: 'verify <@user|userId>',
  async execute(message, args) {
    const raw = (args[0] || '').replace(/[<@!>]/g, '');
    if (!raw) {
      return message.reply({ embeds: [error('Usage', `\`${this.usage}\``)] });
    }

    // Accept a mention or a raw user ID.
    let member = message.mentions.members?.first() || null;
    if (!member) {
      try {
        member = await message.guild.members.fetch(raw);
      } catch {
        member = null;
      }
    }
    if (!member) {
      return message.reply({ embeds: [error('User not found', `Could not find a member for \`${args[0]}\`.`)] });
    }

    try {
      await member.roles.add(config.verifiedRoleId, 'Verified via .verify');
      if (member.roles.cache.has(config.unverifiedRoleId)) {
        await member.roles.remove(config.unverifiedRoleId, 'Verified via .verify');
      }
      return message.reply({
        embeds: [
          success(
            'Verified',
            `${member} has been verified.\n➕ Added <@&${config.verifiedRoleId}>\n➖ Removed <@&${config.unverifiedRoleId}>`
          ),
        ],
      });
    } catch (err) {
      return message.reply({
        embeds: [
          error(
            'Failed to verify',
            `${humanize(err)}\nMake sure the bot has **Manage Roles** and its own role is **above** both roles in Server Settings → Roles.`
          ),
        ],
      });
    }
  },
};
