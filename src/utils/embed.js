const { EmbedBuilder } = require('discord.js');

const COLORS = {
  success: 0x2ecc71,
  error: 0xe74c3c,
  info: 0x3498db,
  warn: 0xf1c40f,
};

function build(color, title, description) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description ?? null)
    .setFooter({ text: 'Get swatted.gg • Group Management' })
    .setTimestamp();
}

module.exports = {
  success: (title, desc) => build(COLORS.success, `✅ ${title}`, desc),
  error: (title, desc) => build(COLORS.error, `❌ ${title}`, desc),
  info: (title, desc) => build(COLORS.info, `ℹ️ ${title}`, desc),
  warn: (title, desc) => build(COLORS.warn, `⚠️ ${title}`, desc),
};
