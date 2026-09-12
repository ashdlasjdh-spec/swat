const { info } = require('../utils/embed');
const config = require('../config');

module.exports = {
  name: 'help',
  aliases: ['commands', 'h'],
  description: 'Show the command list.',
  usage: 'help',
  async execute(message, args, { client }) {
    const p = config.prefix;
    const lines = [...new Set([...client.commands.values()])]
      .map((c) => `**${p}${c.usage}**\n${c.description}`)
      .join('\n\n');
    return message.reply({ embeds: [info('Group Management Commands', lines)] });
  },
};
