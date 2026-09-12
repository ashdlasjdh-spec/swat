const { info } = require('../utils/embed');
const roblox = require('../roblox');

module.exports = {
  name: 'help',
  aliases: ['commands', 'h'],
  description: 'Show the command list.',
  usage: 'help',
  async execute(message, args, { client, prefix, group }) {
    const lines = [...new Set([...client.commands.values()])]
      .map((c) => `**${prefix}${c.usage}**\n${c.description}`)
      .join('\n\n');

    // Show which prefix drives which group.
    const routing = [...roblox.getGroups().entries()]
      .map(([pfx, g]) => `\`${pfx}\` → **${g.name}** (\`${g.groupId}\`)`)
      .join('\n');

    const body = `You're using \`${prefix}\` → **${group.name}**.\n\n${lines}\n\n**Group prefixes**\n${routing}`;
    return message.reply({ embeds: [info('Group Management Commands', body)] });
  },
};
