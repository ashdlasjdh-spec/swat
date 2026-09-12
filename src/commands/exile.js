const { success, error } = require('../utils/embed');
const { humanize } = require('../utils/errors');

module.exports = {
  name: 'exile',
  aliases: ['kick'],
  description: 'Remove (exile) a user from the group.',
  usage: 'exile <username|userId>',
  async execute(message, args, { roblox, group }) {
    if (!args[0]) {
      return message.reply({ embeds: [error('Usage', `\`${this.usage}\``)] });
    }
    const target = args[0];
    try {
      const userId = await roblox.resolveUserId(target);
      const rank = await roblox.getRankInGroup(userId);
      if (rank === 0) {
        return message.reply({ embeds: [error('Not a member', `**${target}** is not in **${group.name}**.`)] });
      }
      await roblox.exile(userId);
      return message.reply({
        embeds: [success('User Exiled', `Removed **${target}** (\`${userId}\`) from **${group.name}**.`)],
      });
    } catch (err) {
      return message.reply({ embeds: [error('Failed to exile', humanize(err))] });
    }
  },
};
