import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";

import { ApiError, RateLimiter, authorize } from "./auth.js";
import { ClubConfig, Settings } from "./config.js";
import { DAYS, HourlyDay } from "./hourly.js";
import { AiAssistant, ChatTurn, MAX_CONTEXT_CHARS, createAiAssistant } from "./llm.js";
import { ClubInfo, PERIODS, Period, VERSION } from "./models.js";
import { SyncRunner, SyncTooSoon } from "./runner.js";
import { HourlyView, MAX_TOP, TrackerService } from "./services/tracker.js";
import { gameDay, iso, utcNow } from "./timeutil.js";

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

function formatHourlyPayload(view: HourlyView) {
  return {
    club: formatClubStatus(view.club, view.info),
    day: view.day,
    game_day: gameDay(view.history.dayStart),
    day_start: iso(view.history.dayStart),
    day_end: iso(view.history.dayEnd),
    first_mark: view.history.firstMark ? iso(view.history.firstMark) : null,
    starts_late: view.history.startsLate,
    counted: view.history.counted,
    total: view.history.total,
    resets_at: iso(view.resetsAt),
    lines: view.history.lines.map((line) => ({
      time: iso(line.time),
      hours: line.hours,
      gain: line.gain,
      since_reset: line.sinceReset,
      live: line.live,
    })),
  };
}

function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "LilyAi Fan Tracker API",
      version: VERSION,
      description: "HTTP API for tracking uma.moe club fan gains and hourly history.",
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
      "/api/v1/clubs/{club}/hourly": {
        get: {
          summary: "Club hourly fan-gain breakdown",
          parameters: [
            { name: "club", in: "path", required: true, schema: { type: "string" } },
            { name: "day", in: "query", schema: { type: "string", enum: ["today", "yesterday"], default: "today" } },
          ],
          responses: { "200": { description: "Hourly history" } },
        },
      },
      "/api/v1/members/{trainer_id}": {
        get: {
          summary: "Member standings across periods",
          parameters: [{ name: "trainer_id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Member standings" } },
        },
      },
      "/api/v1/members/{trainer_id}/hourly": {
        get: {
          summary: "Member hourly fan-gain breakdown",
          parameters: [
            { name: "trainer_id", in: "path", required: true, schema: { type: "string" } },
            { name: "day", in: "query", schema: { type: "string", enum: ["today", "yesterday"], default: "today" } },
          ],
          responses: { "200": { description: "Member hourly history" } },
        },
      },
      "/api/v1/sync": {
        post: { summary: "Trigger immediate sync (write key required)", responses: { "200": { description: "Sync outcomes" } } },
      },
      "/api/v1/chat/context": {
        get: {
          summary: "Live club context and AI router availability",
          parameters: [
            { name: "trainer_id", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "AI chat context" } },
        },
      },
      "/api/v1/chat": {
        post: {
          summary: "Test AI mention assistant with reply-chain memory & live club context",
          responses: { "200": { description: "AI assistant reply" } },
        },
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
  <p class="muted"><a href="/">Open Dashboard</a> · OpenAPI spec: <a href="/api/v1/openapi.json"><code>/api/v1/openapi.json</code></a></p>

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
    <div><span class="method get">GET</span><code>/api/v1/clubs/{club}/hourly?day=today</code> <span class="muted">(Bearer read/write key)</span></div>
    <p>Hour-by-hour fan gain timeline since the 15:00 UTC reset for <code>today</code> or <code>yesterday</code>.</p>
  </div>

  <div class="endpoint">
    <div><span class="method get">GET</span><code>/api/v1/members/{trainer_id}</code> <span class="muted">(Bearer read/write key)</span></div>
    <p>Daily, weekly, and monthly gain &amp; rank for an active club member.</p>
  </div>

  <div class="endpoint">
    <div><span class="method get">GET</span><code>/api/v1/members/{trainer_id}/hourly?day=today</code> <span class="muted">(Bearer read/write key)</span></div>
    <p>Hour-by-hour fan gain timeline for an active club member.</p>
  </div>

  <div class="endpoint">
    <div><span class="method post">POST</span><code>/api/v1/sync</code> <span class="muted">(Bearer write key)</span></div>
    <p>Triggers an immediate refresh of both clubs (30-second cooldown).</p>
  </div>

  <div class="endpoint">
    <div><span class="method get">GET</span><code>/api/v1/chat/context</code> <span class="muted">(Bearer read/write key)</span></div>
    <p>Returns live club fan-gain context and whether the AI router is configured.</p>
  </div>

  <div class="endpoint">
    <div><span class="method post">POST</span><code>/api/v1/chat</code> <span class="muted">(Bearer read/write key)</span></div>
    <p>Tests Lily AI replies with multi-turn thread history, optional replied-to text, and live club context.</p>
  </div>
</body>
</html>`;

export function createApp(options: {
  settings: Settings;
  service: TrackerService;
  syncRunner: SyncRunner;
  discordStatus: () => DiscordStatusPayload;
  assistant?: AiAssistant;
}): express.Express {
  const { settings, service, syncRunner, discordStatus } = options;
  const assistant = options.assistant ?? createAiAssistant(settings, service);
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

  function parseParam(raw: string | string[]): string {
    return Array.isArray(raw) ? raw[0] ?? "" : raw;
  }

  function parseDayQuery(raw: unknown): HourlyDay {
    const val = typeof raw === "string" ? raw : "today";
    if (!DAYS.includes(val as HourlyDay)) {
      throw new ApiError(422, "invalid_request", "query.day: Input should be 'today' or 'yesterday'");
    }
    return val as HourlyDay;
  }

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: VERSION });
  });

  app.get("/api/v1/openapi.json", (_req, res) => {
    res.json(buildOpenApiSpec());
  });

  app.get("/api/v1/docs", (_req, res) => {
    res.type("html").send(DOCS_HTML);
  });

  app.get("/api/v1/status", readAccess, async (_req, res, next) => {
    try {
      const infos = await service.clubInfos();
      res.json({
        server: "ok",
        version: VERSION,
        time: iso(utcNow()),
        discord: discordStatus(),
        clubs: infos.map(([club, info]) => formatClubStatus(club, info)),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/clubs/:club/leaderboard", readAccess, async (req, res, next) => {
    try {
      const clubParam = parseParam(req.params.club);
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

      const board = await service.leaderboard(club, period, top);
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

  app.get("/api/v1/clubs/:club/hourly", readAccess, async (req, res, next) => {
    try {
      const clubParam = parseParam(req.params.club);
      const club = service.club(clubParam);
      if (!club) {
        throw new ApiError(
          404,
          "club_not_found",
          `Unknown club '${clubParam}'. Use club1, club2 or a configured club id.`
        );
      }
      const day = parseDayQuery(req.query.day);
      const view = await service.fanGainHistory(club, day);
      res.json(formatHourlyPayload(view));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/members/:trainer_id", readAccess, async (req, res, next) => {
    try {
      const trainerId = parseParam(req.params.trainer_id);
      const standings = await service.allStandingsForTrainer(trainerId);
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

  app.get("/api/v1/members/:trainer_id/hourly", readAccess, async (req, res, next) => {
    try {
      const trainerId = parseParam(req.params.trainer_id);
      const day = parseDayQuery(req.query.day);
      const view = await service.trainerFanGainHistory(trainerId, day);
      if (!view) {
        throw new ApiError(
          404,
          "member_not_found",
          "That trainer is not on a club roster right now."
        );
      }
      res.json({
        trainer_id: view.trainerId,
        name: view.trainerName,
        ...formatHourlyPayload(view),
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

  app.get("/api/v1/chat/context", readAccess, async (req, res, next) => {
    try {
      const rawTrainer = typeof req.query.trainer_id === "string" ? req.query.trainer_id.trim() : "";
      if (rawTrainer.length > 32) {
        throw new ApiError(422, "invalid_request", "query.trainer_id must be 32 characters or fewer.");
      }
      const context = await assistant.getLiveContext({
        trainerId: rawTrainer || null,
      });
      res.json({
        ai_enabled: assistant.isEnabled(),
        model: assistant.model,
        cooldown_seconds: assistant.userCooldownSeconds,
        outage_remaining_seconds: assistant.outageRemainingSeconds(),
        context,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/chat", readAccess, async (req, res, next) => {
    try {
      const body = req.body as {
        messages?: unknown;
        replied_text?: unknown;
        trainer_id?: unknown;
      };

      if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
        throw new ApiError(422, "invalid_request", "messages must be a non-empty array.");
      }
      if (body.messages.length > 12) {
        throw new ApiError(422, "invalid_request", "messages cannot exceed 12 turns.");
      }

      const validated: ChatTurn[] = [];
      for (const item of body.messages) {
        if (!item || typeof item !== "object") {
          throw new ApiError(422, "invalid_request", "Each message must be an object.");
        }
        const role = (item as { role?: unknown }).role;
        const content = (item as { content?: unknown }).content;
        if (role !== "user" && role !== "assistant") {
          throw new ApiError(422, "invalid_request", "Message role must be 'user' or 'assistant'.");
        }
        if (typeof content !== "string" || content.trim().length === 0) {
          throw new ApiError(422, "invalid_request", "Message content must be a non-empty string.");
        }
        if (content.length > MAX_CONTEXT_CHARS) {
          throw new ApiError(
            422,
            "invalid_request",
            `Message content must be ${MAX_CONTEXT_CHARS} characters or fewer.`
          );
        }
        validated.push({ role, content: content.trim() });
      }

      const lastTurn = validated[validated.length - 1];
      if (lastTurn.role !== "user") {
        throw new ApiError(422, "invalid_request", "The last message must have role 'user'.");
      }

      let repliedTo: ChatTurn | null = null;
      if (body.replied_text !== undefined && body.replied_text !== null) {
        if (typeof body.replied_text !== "string") {
          throw new ApiError(422, "invalid_request", "replied_text must be a string.");
        }
        if (body.replied_text.length > MAX_CONTEXT_CHARS) {
          throw new ApiError(
            422,
            "invalid_request",
            `replied_text must be ${MAX_CONTEXT_CHARS} characters or fewer.`
          );
        }
        if (body.replied_text.trim()) {
          repliedTo = {
            role: "user",
            author: "Replied message",
            content: body.replied_text.trim(),
          };
        }
      }

      let trainerId: string | null = null;
      if (body.trainer_id !== undefined && body.trainer_id !== null) {
        if (typeof body.trainer_id !== "string" || body.trainer_id.trim().length > 32) {
          throw new ApiError(422, "invalid_request", "trainer_id must be a string up to 32 characters.");
        }
        trainerId = body.trainer_id.trim() || null;
      }

      if (!assistant.isEnabled()) {
        throw new ApiError(
          503,
          "ai_disabled",
          "AI chat is disabled: configure AI_ROUTER_URL and AI_ROUTER_API_KEY on the server."
        );
      }

      const history = validated.slice(0, -1);
      const result = await assistant.answer({
        userKey: `web:${trainerId ?? "tester"}`,
        question: lastTurn.content,
        history,
        repliedTo,
        trainerId,
        respectCooldown: true,
      });

      if (result.cooldownRemaining > 0) {
        throw new ApiError(429, "rate_limited", result.reply, {
          "Retry-After": String(result.cooldownRemaining),
        });
      }

      if (result.unavailable) {
        const headers: Record<string, string> = {};
        if (result.retryAfterSeconds) {
          headers["Retry-After"] = String(result.retryAfterSeconds);
        }
        throw new ApiError(503, "ai_unavailable", result.reply, headers);
      }

      res.json({
        reply: result.reply,
        model: result.model,
        latency_ms: result.latencyMs,
        context_summary: result.context.summary_text,
        context: result.context,
      });
    } catch (err) {
      next(err);
    }
  });

  // Unknown API routes return consistent JSON 404
  app.use("/api", (_req, res) => {
    res.status(404).json({
      error: { code: "http_error", message: "Not Found" },
    });
  });

  // Serve built Vite SPA frontend
  const clientDistDir = path.resolve(process.cwd(), "dist/client");
  if (fs.existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(clientDistDir, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.json({
        name: "LilyAi Fan Tracker API",
        version: VERSION,
        health: "/health",
        docs: "/api/v1/docs",
        openapi: "/api/v1/openapi.json",
      });
    });
  }

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
