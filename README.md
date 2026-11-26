# LilyAi Fan Tracker

A Node.js 22 + TypeScript Discord bot, REST API, and React dashboard for tracking fan gains across two `uma.moe` clubs. The web console, API server, 5-minute sync loop, Render self-pinger, and Discord gateway all run in one unified process.

## Discord Bot Features

### Slash commands

| Command | What it does |
| --- | --- |
| `/link trainer_id` | Links your Discord account to your trainer ID (must be on one of the two club rosters) |
| `/unlink` | Removes your trainer link |
| `/leaderboard [club] [period] [top]` | Club 1, Club 2, or both; `daily`, `weekly`, or `monthly`; top 1–30 |
| `/fan_gain [user]` | Your daily, weekly, and monthly fan gain, rank, and total fans (or another linked user's) |
| `/fan_gain_history [club] [user] [day]` | Hour-by-hour fan gain breakdown since the 15:00 UTC reset (`today` or `yesterday`) |

### `@mention` AI Chat

Mention Lily in Discord (or test prompts from the **AI Chat** panel in the web dashboard) when `AI_ROUTER_URL` and `AI_ROUTER_API_KEY` are configured:

- Walks backward through Discord reply chains (up to 6 messages) for conversational continuity.
- Supplies live club sync timestamps, top daily/weekly/monthly leaders, and the asker's linked trainer standings.
- Enforces per-user cooldowns and automatic `Retry-After` backoff during upstream AI router outages without affecting fan tracking or slash commands.

## Rules

- Every reset happens at **15:00 UTC** (00:00 JST), matching the game and `uma.moe`.
- **Daily** is one game day. **Monthly** runs from the 1st until the next month's reset.
- **Weekly** runs Monday to Sunday (Monday reset is Sunday 15:00 UTC), capped at month boundaries so a week never spans two months.
- **Join day counts as 0.** Gains compute normally starting the next game day.
- **Moving between clubs keeps the gain** instead of restarting at 0, resolving stale duplicates cleanly.
- Data refreshes every 5 minutes (`SYNC_INTERVAL_SECONDS`). Commands and API queries read stored state and never call `uma.moe` directly.

## Run locally (Node.js 22)

```bash
npm install
cp .env.example .env        # fill in your keys and load into your shell environment
npm run lint
npm run build
npm test
npm start                   # or `npm run dev` for development
```

Without Turso settings, local runs fall back to an in-memory store. Without `DISCORD_TOKEN`, only the HTTP API and web dashboard run.

## Deploy on Render

Deploy cleanly using `render.yaml`:

1. Create a Turso database and token (`turso db create fan-tracker`, `turso db show fan-tracker --url`, `turso db tokens create fan-tracker`).
2. Create a Discord bot in the Discord Developer Portal and invite it with the `applications.commands` and `bot` scopes (optionally enable **Message Content** intent so Lily can read replied-to message text on `@mentions`).
3. In Render choose **New → Blueprint** and select this repository (`render.yaml` configures Node 22, build/start commands, and `/health`).
4. Enter your secrets when prompted: `DISCORD_TOKEN`, `UMAMOE_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `API_READ_KEY`, `API_WRITE_KEY`, and optionally `DISCORD_GUILD_ID`, `AI_ROUTER_URL`, `AI_ROUTER_API_KEY`.
5. Render injects `RENDER=true` and `RENDER_EXTERNAL_URL` automatically; the app requires Turso when `RENDER` is set and pings `/health` every 300 seconds.

> **Troubleshooting build errors on an older Render service**: If deploy logs still show an old runtime, cached build environment, or a missing legacy command (`command not found`), pushing `render.yaml` alone will not overwrite an existing Render Web Service's runtime or Build Command. Retire the old service (or clear its legacy runtime variables and build cache) and recreate it using **New → Blueprint** after pushing the latest commit to `main`.

## Environment variables

See [.env.example](.env.example). Secrets are read solely from environment variables and never stored in client code.

## API

Interactive API summary: `/api/v1/docs` (OpenAPI spec at `/api/v1/openapi.json`). See [docs/API.md](docs/API.md), [docs/HOURLY.md](docs/HOURLY.md), and [docs/AI.md](docs/AI.md).
