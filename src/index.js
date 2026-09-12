const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');

const config = require('./config');
const roblox = require('./roblox');
const { isStaff } = require('./utils/permissions');
const { error } = require('./utils/embed');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged — enable in the Dev Portal
  ],
  partials: [Partials.Channel],
});

// ---------------------------------------------------------------------------
// Load commands
// ---------------------------------------------------------------------------
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.name, command);
  for (const alias of command.aliases || []) client.commands.set(alias, command);
}

// Simple per-user cooldown to avoid API spam (ms).
const cooldowns = new Map();
const COOLDOWN_MS = 1500;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
client.once('clientReady', () => {
  console.log(`[discord] Logged in as ${client.user.tag}`);
  client.user.setActivity(`${config.prefix}help • Get swatted.gg`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
  const name = (args.shift() || '').toLowerCase();
  const command = client.commands.get(name);
  if (!command) return;

  if (!isStaff(message.member)) {
    return message.reply({ embeds: [error('No Permission', 'You are not allowed to use this command.')] });
  }

  const last = cooldowns.get(message.author.id) || 0;
  if (Date.now() - last < COOLDOWN_MS) return;
  cooldowns.set(message.author.id, Date.now());

  try {
    await command.execute(message, args, { roblox, config, client });
  } catch (err) {
    console.error(`[command:${name}]`, err);
    message
      .reply({ embeds: [error('Error', 'Something went wrong executing that command.')] })
      .catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async () => {
  try {
    const info = await roblox.init();
    console.log(`[roblox] Open Cloud authenticated for group "${info.group}" (${config.groupId})`);
    console.log(`[roblox] Registered ${roblox.getRoles().length} ranks`);
    console.log(`[roblox] Cookie ops: ${info.cookie}`);
  } catch (err) {
    console.error('[roblox] Open Cloud auth failed — check ROBLOX_API_KEY / GROUP_ID and the key\'s group permissions.');
    console.error(err.response?.data ? JSON.stringify(err.response.data) : err.message);
    process.exit(1);
  }

  await client.login(config.discordToken);

  // Keep the rank cache in sync with the group.
  setInterval(() => roblox.refreshRoles().catch(() => {}), config.roleRefreshInterval);

  // Optional keepalive HTTP server (Railway sets PORT for web services).
  if (config.port) {
    http
      .createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      })
      .listen(config.port, () => console.log(`[http] Keepalive listening on :${config.port}`));
  }
})();

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
