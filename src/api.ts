import cors from "cors";
import express, { NextFunction, Request, Response } from "express";

import { ApiError, RateLimiter, authorize } from "./auth.js";
import { ClubConfig, Settings } from "./config.js";
import { ClubInfo, PERIODS, Period, VERSION } from "./models.js";
import { SyncRunner, SyncTooSoon } from "./runner.js";
import { MAX_TOP, TrackerService } from "./services/tracker.js";
import { iso, utcNow } from "./timeutil.js";

export interface DiscordStatusPayload {
  state: string;
  latency_ms: number | null;
  error: string | null;
}

interface ClubStatusJson {
  key: string;
  club_id: string;
  label: string;
  name: string | null;
  member_count: number;
  last_synced_at: string | null;
  last_error: string | null;
}

function formatClubStatus(club: ClubConfig, info: ClubInfo): ClubStatusJson {
  return {
    key: club.key,
    club_id: club.clubId,
    label: club.label,
    name: info.name,
    member_count: info.memberCount,
    last_synced_at: info.lastSyncedAt ? iso(info.lastSyncedAt) : null,
    last_error: info.lastError,
  };
}

function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "LilyAi Fan Tracker API",
      version: VERSION,
      description: "HTTP API for tracking uma.moe club fan gains.",
    },
    paths: {
      "/health": {
        get: { summary: "Health check", responses: { "200": { description: "OK" } } },
      },
      "/api/v1/status": {
        get: { summary: "Server, Discord, and club sync status", responses: { "200": { description: "OK" } } },
      },
      "/api/v1/clubs/{club}/leaderboard": {
        get: {
          summary: "Club fan-gain leaderboard",
          parameters: [
            { name: "club", in: "path", required: true, schema: { type: "string" } },
            { name: "period", in: "query", schema: { type: "string", enum: ["daily", "weekly", "monthly"], default: "daily" } },
            { name: "top", in: "query", schema: { type: "integer", minimum: 1, maximum: MAX_TOP, default: MAX_TOP } },
          ],
          responses: { "200": { description: "Leaderboard" } },
        },
      },
      "/api/v1/members/{trainer_id}": {
        get: {
          summary: "Member standings across periods",
          parameters: [{ name: "trainer_id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Member standings" } },
        },
      },
      "/api/v1/sync": {
        post: { summary: "Trigger immediate sync (write key required)", responses: { "200": { description: "Sync outcomes" } } },
      },
    },
  };
}

const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LilyAi Fan Tracker API</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; line-height: 1.5; color: #1f2937; }
    h1 { margin-bottom: 4px; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .endpoint { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin: 12px 0; }
    .method { font-weight: 700; margin-right: 8px; }
    .get { color: #059669; }
    .post { color: #2563eb; }
    .muted { color: #6b7280; font-size: 0.92em; }
  </style>
</head>
<body>
  <h1>LilyAi Fan Tracker API <span class="muted">v${VERSION}</span></h1>
  <p class="muted">OpenAPI spec: <a href="/api/v1/openapi.json"><code>/api/v1/openapi.json</code></a></p>

  <div class="endpoint">
    <div><span class="method get">GET</span><code>/health</code> <span class="muted">(public)</span></div>
    <p>Cheap liveness check returning server status and version.</p>
  </div>

  <div class="endpoint">
    <div><span class="method get">GET</span><code>/api/v1/status</code> <span class="muted">(Bearer read/write key)</span></div>
    <p>Server time, Discord connection state, and per-club sync status.</p>
  </div>

  <div class="endpoint">
    <div><span class="method get">GET</span><code>/api/v1/clubs/{club}/leaderboard?period=daily&amp;top=30</code> <span class="muted">(Bearer read/write key)</span></div>
    <p><code>club</code> is <code>club1</code>, <code>club2</code>, or a configured club ID. <code>period</code> is <code>daily</code>, <code>weekly</code>, or <code>monthly</code>. <code>top</code> is 1–30.</p>
  </div>

  <div class="endpoint">
    <div><span class="method get">GET</span><code>/api/v1/members/{trainer_id}</code> <span class="muted">(Bearer read/write key)</span></div>
    <p>Daily, weekly, and monthly gain &amp; rank for an active club member.</p>
  </div>

  <div class="endpoint">
    <div><span class="method post">POST</span><code>/api/v1/sync</code> <span class="muted">(Bearer write key)</span></div>
    <p>Triggers an immediate refresh of both clubs (30-second cooldown).</p>
  </div>
</body>
</html>`;

export function createApp(options: {
  settings: Settings;
  service: TrackerService;
  syncRunner: SyncRunner;
  discordStatus: () => DiscordStatusPayload;
}): express.Express {
  const { settings, service, syncRunner, discordStatus } = options;
  const app = express();
  app.use(express.json());

  if (settings.corsOrigins.length > 0) {
    app.use(
      cors({
        origin: settings.corsOrigins,
        methods: ["GET", "POST"],
        allowedHeaders: ["Authorization", "Content-Type"],
      })
    );
  }

  const limiter = new RateLimiter(120, 60);

  function requireAuth(needWrite: boolean) {
    return (req: Request, _res: Response, next: NextFunction): void => {
      try {
        const role = authorize(
          settings.apiReadKey,
          settings.apiWriteKey,
          req.header("authorization"),
          needWrite
        );
        const wait = limiter.check(role);
        if (wait > 0) {
          throw new ApiError(429, "rate_limited", "Too many requests.", {
            "Retry-After": String(Math.ceil(wait)),
          });
        }
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  const readAccess = requireAuth(false);
  const writeAccess = requireAuth(true);

  app.get("/", (_req, res) => {
    res.json({
      name: "LilyAi Fan Tracker API",
      version: VERSION,
      health: "/health",
      docs: "/api/v1/docs",
      openapi: "/api/v1/openapi.json",
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: VERSION });
  });

  app.get("/api/v1/openapi.json", (_req, res) => {
    res.json(buildOpenApiSpec());
  });

  app.get("/api/v1/docs", (_req, res) => {
    res.type("html").send(DOCS_HTML);
  });

  app.get("/api/v1/status", readAccess, (_req, res) => {
    res.json({
      server: "ok",
      version: VERSION,
      time: iso(utcNow()),
      discord: discordStatus(),
      clubs: service.clubInfos().map(([club, info]) => formatClubStatus(club, info)),
    });
  });

  app.get("/api/v1/clubs/:club/leaderboard", readAccess, (req, res, next) => {
    try {
      const rawClubParam = req.params.club;
      const clubParam = Array.isArray(rawClubParam) ? rawClubParam[0] ?? "" : rawClubParam;
      const club = service.club(clubParam);
      if (!club) {
        throw new ApiError(
          404,
          "club_not_found",
          `Unknown club '${clubParam}'. Use club1, club2 or a configured club id.`
        );
      }

      const rawPeriod = typeof req.query.period === "string" ? req.query.period : "daily";
      if (!PERIODS.includes(rawPeriod as Period)) {
        throw new ApiError(
          422,
          "invalid_request",
          `query.period: Input should be 'daily', 'weekly' or 'monthly'`
        );
      }
      const period = rawPeriod as Period;

      let top = MAX_TOP;
      if (req.query.top !== undefined) {
        const rawTop = String(req.query.top);
        if (!/^-?\d+$/.test(rawTop)) {
          throw new ApiError(422, "invalid_request", "query.top: Input should be a valid integer");
        }
        top = Number.parseInt(rawTop, 10);
        if (top < 1 || top > MAX_TOP) {
          throw new ApiError(
            422,
            "invalid_request",
            `query.top: Input should be between 1 and ${MAX_TOP}`
          );
        }
      }

      const board = service.leaderboard(club, period, top);
      res.json({
        club: formatClubStatus(club, board.info),
        period,
        top: board.top,
        resets_at: iso(board.resetsAt),
        entries: board.rows.map((r) => ({
          rank: r.rank,
          trainer_id: r.trainerId,
          name: r.name,
          fans: r.fans,
          gain: r.gain,
          has_baseline: r.hasBaseline,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/members/:trainer_id", readAccess, (req, res, next) => {
    try {
      const rawTrainerId = req.params.trainer_id;
      const trainerId = Array.isArray(rawTrainerId) ? rawTrainerId[0] ?? "" : rawTrainerId;
      const standings = service.allStandingsForTrainer(trainerId);
      const first = PERIODS.map((p) => standings[p]).find((s) => s !== undefined);
      if (!first) {
        throw new ApiError(
          404,
          "member_not_found",
          "That trainer is not on a club roster right now."
        );
      }

      const periodsJson: Record<string, { gain: number; rank: number; has_baseline: boolean }> = {};
      for (const p of PERIODS) {
        const s = standings[p];
        if (s) {
          periodsJson[p] = {
            gain: s.row.gain,
            rank: s.row.rank,
            has_baseline: s.row.hasBaseline,
          };
        }
      }

      res.json({
        trainer_id: first.row.trainerId,
        name: first.row.name,
        fans: first.row.fans,
        club: formatClubStatus(first.club, first.info),
        roster_size: first.rosterSize,
        periods: periodsJson,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/sync", writeAccess, async (_req, res, next) => {
    try {
      const outcomes = await syncRunner.syncNow();
      res.json({
        results: outcomes.map((o) => ({
          club: o.clubKey,
          ok: o.ok,
          member_count: o.result ? o.result.memberCount : null,
          error: o.error,
        })),
      });
    } catch (err) {
      if (err instanceof SyncTooSoon) {
        next(
          new ApiError(
            429,
            "rate_limited",
            "A sync ran moments ago; try again shortly.",
            { "Retry-After": String(Math.ceil(err.retryAfter)) }
          )
        );
        return;
      }
      next(err);
    }
  });

  // 404 fallback in standard JSON error format
  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "http_error", message: "Not Found" },
    });
  });

  // Error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      for (const [k, v] of Object.entries(err.headers)) {
        res.setHeader(k, v);
      }
      res.status(err.status).json({
        error: { code: err.code, message: err.message },
      });
      return;
    }

    if (err instanceof SyntaxError && "body" in err) {
      res.status(422).json({
        error: { code: "invalid_request", message: "Invalid JSON body." },
      });
      return;
    }

    console.error("Unhandled error in an API request", err);
    res.status(500).json({
      error: { code: "internal_error", message: "Internal server error." },
    });
  });

  return app;
}
