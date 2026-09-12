const { success, error, info } = require('../utils/embed');
const { humanize } = require('../utils/errors');
const roblox = require('../roblox');

const CONCURRENCY = 4; // parallel accepts; 429s auto-retry in roblox.js

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

      // Bounded worker pool: CONCURRENCY workers drain a shared queue.
      let ok = 0;
      let fail = 0;
      let next = 0;
      const worker = async () => {
        while (next < ids.length) {
          const userId = ids[next++];
          try {
            await roblox.acceptJoinRequest(userId);
            ok += 1;
          } catch {
            fail += 1;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

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
