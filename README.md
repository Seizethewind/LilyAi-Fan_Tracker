# LilyAi Fan Tracker

A Discord bot that tracks fan gains for two uma.moe clubs, plus a small HTTP API for the
LilyAi app. It runs 24/7 on Render's free tier: the bot and the web server share one
process, and a self-pinger requests the service's own `/health` every 300 seconds.

> **Status:** everything works against a mocked data source. The uma.moe client is
> still to be written because the API spec was not reachable; see [docs/UMAMOE.md](docs/UMAMOE.md).
> The Discord layer and the API have not been run against real Discord, Turso or uma.moe yet.

## Slash commands

| Command | What it does |
| --- | --- |
| `/link trainer_id` | Links your Discord account to your trainer ID (must be in one of the two clubs) |
| `/unlink` | Removes the link |
| `/leaderboard club period [top]` | Club 1, Club 2 or both; daily, weekly or monthly; top 10, 15 or 30 |
| `/fan_gain period [user]` | Your fan gain, rank and total, or another linked user's |

## Rules

- All resets use **UTC** (game time): daily at 00:00, weekly on **Monday** 00:00, monthly on the 1st.
- **Join day counts as 0.** Gains compute normally from the next UTC day.
- Members who leave are removed from the roster.
- Leaving and rejoining in the **same month** keeps the original baseline. Rejoining in a **later month** counts as a new player.
- Data refreshes every 5 minutes. Commands read saved data and never call uma.moe directly.
- Tables show at most 30 rows per club.

## Run locally

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env        # fill in the values, then export them or use your shell's env loader
python -m pytest
python -m fantracker.main
```

Without Turso settings it uses a local SQLite file (`SQLITE_PATH`). Without `DISCORD_TOKEN` only the API runs.

## Deploy on Render

1. Create a Turso database and a token: `turso db create fan-tracker`, `turso db show fan-tracker --url`, `turso db tokens create fan-tracker`.
2. In the Discord developer portal create a bot. No privileged intents are needed. Invite it with the `applications.commands` and `bot` scopes.
3. In Render choose **New > Blueprint** and pick this repo. `render.yaml` sets up the web service.
4. Enter the secrets when prompted: `DISCORD_TOKEN`, `UMAMOE_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `API_READ_KEY`, `API_WRITE_KEY`, and optionally `DISCORD_GUILD_ID`.
5. Render sets `RENDER_EXTERNAL_URL` itself, which is what the self-pinger uses.

Render's free filesystem is wiped on every restart, so the app refuses to start on Render without Turso.
Free services have 750 instance hours per month, which is enough for one service running continuously.

## Environment variables

See [.env.example](.env.example). Secrets are only ever read from the environment.

## API

See [docs/API.md](docs/API.md).

## Layout

```
fantracker/
  config.py, timeutil.py     settings, UTC period boundaries
  storage/                   SQLite and Turso backends, all SQL in store.py
  sources/                   data source interface (uma.moe client goes here)
  services/tracker.py        sync and query logic, shared by Discord and the API
  commands.py, formatting.py command replies and tables
  discord_bot.py             discord.py wiring
  api.py, auth.py            FastAPI routes, bearer keys, rate limit
  runner.py                  5-minute sync loop and self-ping loop
  main.py                    entry point
```
