const { PermissionsBitField } = require('discord.js');
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

    const guild = message.guild;
    const me = guild.members.me || (await guild.members.fetchMe());
    const verifiedRole = guild.roles.cache.get(config.verifiedRoleId);
    const unverifiedRole = guild.roles.cache.get(config.unverifiedRoleId);

    // Fail loudly if the configured role IDs don't exist in THIS server.
    if (!verifiedRole) {
      return message.reply({
        embeds: [error('Bad role ID', `No role with ID \`${config.verifiedRoleId}\` exists here. Set **VERIFIED_ROLE_ID** to a real role in this server.`)],
      });
    }
    // Hierarchy / permission pre-checks so we never claim success falsely.
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return message.reply({ embeds: [error('Missing permission', 'The bot needs the **Manage Roles** permission.')] });
    }
    if (me.roles.highest.comparePositionTo(verifiedRole) <= 0) {
      return message.reply({
        embeds: [error('Role too high', `The bot's role must be **above** ${verifiedRole} in Server Settings → Roles.`)],
      });
    }

    try {
      const alreadyVerified = member.roles.cache.has(verifiedRole.id);
      await member.roles.add(verifiedRole, 'Verified via .verify');

      let removedUnverified = false;
      if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
        if (me.roles.highest.comparePositionTo(unverifiedRole) > 0) {
          await member.roles.remove(unverifiedRole, 'Verified via .verify');
          removedUnverified = true;
        }
      }

      // Confirm the change actually applied before reporting success.
      const fresh = await member.fetch();
      if (!fresh.roles.cache.has(verifiedRole.id)) {
        return message.reply({
          embeds: [error('Verify failed', `The role was not applied. Check the bot has **Manage Roles** and sits **above** ${verifiedRole}.`)],
        });
      }

      const lines = [
        alreadyVerified ? `• Already had ${verifiedRole}` : `➕ Added ${verifiedRole}`,
        removedUnverified ? `➖ Removed ${unverifiedRole}` : (unverifiedRole ? `• No ${unverifiedRole} to remove` : ''),
      ].filter(Boolean);

      return message.reply({
        embeds: [success('Verified', `${member} has been verified.\n${lines.join('\n')}`)],
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
