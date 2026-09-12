const { success, error, info } = require('../utils/embed');
const { humanize } = require('../utils/errors');
const roblox = require('../roblox');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  name: 'acceptall',
  aliases: ['aa'],
  description: 'Accept every pending join request.',
  usage: 'acceptall',
  async execute(message) {
    let statusMsg;
    try {
      const ids = await roblox.getAllJoinRequestIds();
      if (ids.length === 0) {
        return message.reply({ embeds: [info('No Requests', 'There are no pending join requests.')] });
      }

      statusMsg = await message.reply({
        embeds: [info('Processing', `Accepting **${ids.length}** join request(s)…`)],
      });

      let ok = 0;
      let fail = 0;
      for (const userId of ids) {
        try {
          await roblox.acceptJoinRequest(userId);
          ok += 1;
        } catch {
          fail += 1;
        }
        await sleep(350); // rate-limit friendly
      }

      return statusMsg.edit({
        embeds: [success('Accept All Complete', `✅ Accepted: **${ok}**\n❌ Failed: **${fail}**`)],
      });
    } catch (err) {
      const embed = error('Failed', humanize(err));
      if (statusMsg) return statusMsg.edit({ embeds: [embed] });
      return message.reply({ embeds: [embed] });
    }
  },
};
