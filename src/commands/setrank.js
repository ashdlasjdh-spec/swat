const { success, error, info } = require('../utils/embed');
const { humanize } = require('../utils/errors');

module.exports = {
  name: 'setrank',
  aliases: ['rank', 'sr'],
  description: 'Set a user\'s rank by rank name or rank number.',
  usage: 'setrank <username|userId> <rankName|rankNumber>',
  async execute(message, args, { roblox, group }) {
    // No rank provided -> show every registered rank (pulled from the API).
    if (args.length < 2) {
      const roles = roblox.getRoles();
      const list = roles.length
        ? roles.map((r) => `\`${String(r.rank).padStart(3)}\` — ${r.name}`).join('\n')
        : '_No ranks cached yet._';
      return message.reply({
        embeds: [info(`Ranks — ${group.name}`, `\`${this.usage}\`\n\n**Registered ranks:**\n${list}`)],
      });
    }

    const target = args[0];
    const rankQuery = args.slice(1).join(' ');

    try {
      const role = roblox.findRole(rankQuery);
      if (!role) {
        return message.reply({
          embeds: [error('Unknown rank', `No rank matches \`${rankQuery}\`. Run \`setrank\` with no rank to list them.`)],
        });
      }

      const userId = await roblox.resolveUserId(target);
      const { changed } = await roblox.setRank(userId, role);

      const note = changed ? '' : ' _(already at that rank)_';
      return message.reply({
        embeds: [success('Rank Updated', `Set **${target}** (\`${userId}\`) to **${role.name}** (rank \`${role.rank}\`) in **${group.name}**.${note}`)],
      });
    } catch (err) {
      if (err.message === 'NOT_A_MEMBER') {
        return message.reply({ embeds: [error('Not a member', `**${target}** is not in **${group.name}**.`)] });
      }
      return message.reply({ embeds: [error('Failed to set rank', humanize(err))] });
    }
  },
};
