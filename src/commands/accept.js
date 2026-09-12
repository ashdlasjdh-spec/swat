const { success, error } = require('../utils/embed');
const { humanize } = require('../utils/errors');

module.exports = {
  name: 'accept',
  description: "Accept a single user's join request.",
  usage: 'accept <username|userId>',
  async execute(message, args, { roblox, group }) {
    if (!args[0]) {
      return message.reply({ embeds: [error('Usage', `\`${this.usage}\``)] });
    }
    const target = args[0];
    try {
      const userId = await roblox.resolveUserId(target);
      await roblox.acceptJoinRequest(userId);
      return message.reply({
        embeds: [success('Join Request Accepted', `Accepted **${target}** (\`${userId}\`) into **${group.name}**.`)],
      });
    } catch (err) {
      return message.reply({ embeds: [error('Failed to accept', humanize(err))] });
    }
  },
};
