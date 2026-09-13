const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');

const config = require('./config');
const roblox = require('./roblox');
const { isStaff } = require('./utils/permissions');
const { error } = require('./utils/embed');
const { sanitizeError } = require('./utils/errors');

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

// Prefix -> group routes, populated after roblox.init(), longest prefix first.
let routes = [];

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
client.once('clientReady', () => {
  console.log(`[discord] Logged in as ${client.user.tag}`);
  const help = routes.map((r) => `${r.prefix}help`).join(' / ');
  client.user.setActivity(`${help} • ${routes.length} group(s)`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // Pick the group whose prefix this message starts with.
  const route = routes.find((r) => message.content.startsWith(r.prefix));
  if (!route) return;

  const args = message.content.slice(route.prefix.length).trim().split(/\s+/);
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
    await command.execute(message, args, {
      roblox: route.group, // the Group this prefix targets
      group: route.group,
      prefix: route.prefix,
      config,
      client,
    });
  } catch (err) {
    console.error(`[command:${name}]`, sanitizeError(err));
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
    const { groups, cookie } = await roblox.init();
    routes = [...groups.entries()]
      .map(([prefix, group]) => ({ prefix, group }))
      .sort((a, b) => b.prefix.length - a.prefix.length); // longest prefix wins
    for (const { prefix, group } of routes) {
      console.log(`[roblox] "${prefix}" -> ${group.name} (${group.groupId}) — ${group.getRoles().length} ranks`);
    }
    console.log(`[roblox] Cookie ops: ${cookie}`);
  } catch (err) {
    console.error('[roblox] Open Cloud auth failed — check ROBLOX_API_KEY and that the key is scoped to EVERY group.');
    console.error(sanitizeError(err));
    process.exit(1);
  }

  await client.login(config.discordToken);

  // Keep every group's rank cache in sync.
  setInterval(() => roblox.refreshAllRoles(), config.roleRefreshInterval);

  // Drop stale cooldown entries so the map can't grow without bound.
  setInterval(() => {
    const cutoff = Date.now() - COOLDOWN_MS;
    for (const [id, ts] of cooldowns) if (ts < cutoff) cooldowns.delete(id);
  }, 5 * 60 * 1000).unref();

  // Optional keepalive HTTP server (Railway sets PORT for web services).
  // Health check only — accepts GET/HEAD, echoes nothing, exposes no data.
  if (config.port) {
    http
      .createServer((req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405).end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      })
      .listen(config.port, () => console.log(`[http] Keepalive listening on :${config.port}`));
  }
})();

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', sanitizeError(err)));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', sanitizeError(err)));
