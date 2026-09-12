const { success, error } = require('../utils/embed');
const { humanize } = require('../utils/errors');

module.exports = {
  name: 'ban',
  description: "Ban a user from the group (Roblox native group ban).",
  usage: 'ban <username|userId>',
  async execute(message, args, { roblox, group }) {
    if (!args[0]) {
      return message.reply({ embeds: [error('Usage', `\`${this.usage}\``)] });
    }
    const target = args[0];
    try {
      const userId = await roblox.resolveUserId(target);
      await roblox.banUser(userId);
      return message.reply({
        embeds: [success('User Banned', `Banned **${target}** (\`${userId}\`) from **${group.name}**.`)],
      });
    } catch (err) {
      return message.reply({ embeds: [error('Failed to ban', humanize(err))] });
    }
  },
};
