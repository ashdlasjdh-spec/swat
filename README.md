# Get swatted.gg — Roblox Group Management Bot

A lightweight, optimized Discord bot for managing the Roblox group
[**Get swatted.gg** (`981953580`)](https://www.roblox.com/communities/981953580/Get-swatted-gg#!/about).

It uses **prefix commands** (default `.`) and talks to Roblox through
[`noblox.js`](https://noblox.js.org/) plus a direct call for native group bans.
All group ranks are **registered from the Roblox API on startup** so `.setrank`
works by rank name *or* rank number with no hard-coded values.

---

## ✨ Commands

| Command      | Usage                                   | What it does                                        |
| ------------ | --------------------------------------- | --------------------------------------------------- |
| `.accept`    | `.accept <username\|userId>`            | Accept one user's join request                      |
| `.acceptall` | `.acceptall`                            | Accept **every** pending join request               |
| `.exile`     | `.exile <username\|userId>`             | Remove a user from the group (alias `.kick`)        |
| `.ban`       | `.ban <username\|userId>`               | Roblox **native group ban**                         |
| `.setrank`   | `.setrank <username\|userId> <rank>`    | Set rank by **name** or **number** (alias `.rank`)  |
| `.verify`    | `.verify <@user\|userId>`               | Remove the unverified role, add the verified role   |
| `.help`      | `.help`                                 | List commands                                       |

> `.accept`, `.acceptall`, `.exile`, `.ban`, `.setrank` act on **Roblox**
> (username or userId). `.verify` acts on **Discord** (mention or user ID).

> Run `.setrank` with **no rank** to print every registered rank + its number.

### Examples
```
.accept Builderman
.acceptall
.exile 156
.setrank Builderman Admin
.setrank 261 255
.ban SomeTroll
.verify @NewMember
.verify 123456789012345678
```

---

## ⚙️ How it's built (optimizations)

- **Rank registry via API** — `noblox.getRoles()` is called at startup and cached,
  then auto-refreshed every 10 minutes so `.setrank` always matches the live group.
- **Username → ID cache** — resolved IDs are cached for 10 minutes to cut API calls.
- **CSRF token reuse** — the group-ban call caches the `X-CSRF-TOKEN` and only
  refreshes it when Roblox rotates it.
- **Rate-limit friendly `.acceptall`** — collects all pending IDs first (so the
  cursor never invalidates), then accepts with a short delay between each.
- **Per-user cooldown** (1.5s) to prevent command spam.
- **Single Roblox session**, dynamic command loader, tiny footprint.

---

## 📋 Prerequisites

1. **A Discord bot** — https://discord.com/developers/applications
2. **A Roblox account** that is in the group with permission to
   rank / exile / ban / accept join requests (a bot/alt account is recommended).
3. **Node.js 18+** (only needed for local runs — Railway installs it for you).

---

## 🔑 Step 1 — Create the Discord bot

1. Go to the **Developer Portal → New Application**.
2. **Bot** tab → **Reset Token** → copy it → this is `DISCORD_TOKEN`.
3. Under **Privileged Gateway Intents**, enable **MESSAGE CONTENT INTENT** ✅
   *(required for prefix commands — the bot will not read messages without it).*
4. **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Bot permissions: `Send Messages`, `Read Message History`, `Embed Links`,
     **`Manage Roles`** (required for `.verify`)
   - After inviting, drag the bot's role **above** the verified/unverified roles
     in **Server Settings → Roles**, or `.verify` can't change them.
5. Open the generated URL and invite the bot to your server.

---

## 🍪 Step 2 — Get the Roblox cookie (`ROBLOX_COOKIE`)

> ⚠️ Treat this like a password. Anyone with it controls that Roblox account.
> Use a dedicated bot account, never share it, and never commit it to git.

1. Log into the ranking account on Roblox in a browser.
2. `F12` → **Application** (Chrome) / **Storage** (Firefox) → **Cookies** →
   `https://www.roblox.com`.
3. Copy the **full value** of `.ROBLOSECURITY`
   (it starts with `_|WARNING:-DO-NOT-SHARE-THIS...`). That whole string is
   `ROBLOX_COOKIE`.

If you log that account out of the browser, the cookie is invalidated — keep a
separate browser/session for it, or just don't log it out.

---

## 💻 Step 3 — Run locally (optional test)

```bash
npm install
cp .env.example .env      # then fill in the values
npm start
```
You should see `Authenticated as …`, `Registered N ranks…`, and `Logged in as …`.

---

## 🚂 Step 4 — Host on Railway

You can deploy straight from this folder — no build config needed.

### Option A — GitHub (recommended)
1. Push this folder to a **private** GitHub repo (`.env` is git-ignored — good).
2. Go to **https://railway.app** → **New Project → Deploy from GitHub repo**.
3. Pick the repo. Railway auto-detects Node and runs `npm start`.
4. Open the service → **Variables** tab → add:

   | Variable        | Value                                   |
   | --------------- | --------------------------------------- |
   | `DISCORD_TOKEN` | your bot token                          |
   | `ROBLOX_COOKIE` | your `.ROBLOSECURITY` value             |
   | `GROUP_ID`      | `981953580`                             |
   | `PREFIX`        | `.`                                     |
   | `STAFF_ROLE_IDS`| e.g. `1234567890,9876543210` (optional) |

5. Railway redeploys automatically. Check **Deployments → Logs** for the
   `Logged in as …` line.

### Option B — Railway CLI
```bash
npm i -g @railway/cli
railway login
railway init          # create a new project
railway up            # deploy this folder
# add variables:
railway variables set DISCORD_TOKEN=xxx ROBLOX_COOKIE=xxx GROUP_ID=981953580 PREFIX=.
```

### Notes for Railway
- This is a **background worker** — it does **not** need a public port.
  If Railway complains about no exposed port, that's fine for a Discord bot;
  optionally set a `PORT` variable and the bot starts a tiny keepalive server.
- Restart policy is already set in `railway.json` (`ON_FAILURE`, up to 10 retries).
- To update: push to GitHub (Option A) or run `railway up` again (Option B).

---

## 🔐 Step 5 — Restrict who can use commands

By default, only members with **Administrator** or **Manage Server** can run
commands. To allow specific roles, set `STAFF_ROLE_IDS` to a comma-separated
list of Discord **role IDs** (enable Developer Mode in Discord → right-click a
role → *Copy ID*).

---

## 🌱 Environment variables

| Variable         | Required | Default     | Description                                        |
| ---------------- | -------- | ----------- | -------------------------------------------------- |
| `DISCORD_TOKEN`  | ✅        | —           | Discord bot token                                  |
| `ROBLOX_COOKIE`  | ✅        | —           | `.ROBLOSECURITY` cookie of the ranking account     |
| `GROUP_ID`       | ❌        | `981953580` | Roblox group ID                                    |
| `PREFIX`         | ❌        | `.`         | Command prefix                                     |
| `STAFF_ROLE_IDS` | ❌        | *(empty)*   | Discord role IDs allowed to use commands           |
| `VERIFIED_ROLE_ID`   | ❌   | `1521999556852711476` | Role **given** by `.verify`               |
| `UNVERIFIED_ROLE_ID` | ❌   | `1522001263376597073` | Role **removed** by `.verify`             |
| `PORT`           | ❌        | *(unset)*   | If set, starts a keepalive HTTP server             |

---

## 🧯 Troubleshooting

| Symptom | Fix |
| --- | --- |
| Bot online but ignores commands | Enable **MESSAGE CONTENT INTENT** in the Dev Portal. |
| `Authentication failed` on boot | `ROBLOX_COOKIE` is wrong/expired — re-copy the full cookie. |
| `Failed to set rank / exile: You do not have permission` | The Roblox account's group role lacks that permission, **or** the target's rank is ≥ the bot account's rank. Give the bot a higher-ranked role with the right permissions. |
| `.ban` fails | The group must have **group bans** enabled and the account needs the ban permission. Use `.exile` if bans aren't enabled. |
| `.verify` says "Missing Permissions" | Give the bot **Manage Roles** and drag its role **above** both the verified and unverified roles. |
| Rank name not found | Run `.setrank` with no rank to see exact names, or use the rank **number**. |
| Works locally, not on Railway | Double-check the Variables tab — env vars from `.env` are **not** uploaded. |

---

## 🗂️ Project structure

```
swatted-group-bot/
├── src/
│   ├── index.js            # bot entry, command loader, permissions gate
│   ├── config.js           # env parsing/validation
│   ├── roblox.js           # noblox wrapper: ranks, resolve, actions, ban
│   ├── commands/
│   │   ├── accept.js
│   │   ├── acceptall.js
│   │   ├── exile.js
│   │   ├── ban.js
│   │   ├── setrank.js
│   │   ├── verify.js
│   │   └── help.js
│   └── utils/
│       ├── embed.js
│       ├── permissions.js
│       └── errors.js
├── .env.example
├── railway.json
├── Procfile
├── package.json
└── README.md
```

---

## ⚠️ Disclaimer

Automating a Roblox account must comply with Roblox's Terms of Use. Use a
dedicated account you control, keep the cookie secret, and only grant the bot
the group permissions it actually needs.
