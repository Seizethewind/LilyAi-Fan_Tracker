import cors from "cors";
import express from "express";

import { ChatAssistant } from "../ai_chat/chat_assistant.js";
import { RateLimiter } from "../authentication/rate_limiter.js";
import { SyncRunner } from "../background_sync/sync_runner.js";
import { Settings } from "../configuration/config_types.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { DiscordStatusPayload } from "./api_types.js";
import { buildOpenApiSpec } from "./build_openapi_spec.js";
import { handleChat } from "./handle_chat.js";
import { handleChatContext } from "./handle_chat_context.js";
import { handleDashboardHourly } from "./handle_dashboard_hourly.js";
import { handleDashboardLeaderboard } from "./handle_dashboard_leaderboard.js";
import { handleError } from "./handle_error.js";
import { handleHealth } from "./handle_health.js";
import { handleLeaderboard } from "./handle_leaderboard.js";
import { handleMember } from "./handle_member.js";
import { handleNotFound } from "./handle_not_found.js";
import { handleRoot } from "./handle_root.js";
import { handleStatus } from "./handle_status.js";
import { handleSync } from "./handle_sync.js";
import { renderDocsHtml } from "./render_docs_html.js";
import { requireAuthMiddleware } from "./require_auth_middleware.js";

export function createApiApp(options: {
  settings: Settings;
  service: TrackerService;
  syncRunner: SyncRunner;
  discordStatus: () => DiscordStatusPayload;
  assistant?: ChatAssistant | null;
}): express.Express {
  const { settings, service, syncRunner, discordStatus, assistant = null } = options;
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
  const readAccess = requireAuthMiddleware(settings, limiter, false);
  const writeAccess = requireAuthMiddleware(settings, limiter, true);

  app.get("/health", handleHealth);
  app.get("/api/v1", handleRoot);
  app.get("/api/v1/openapi.json", (_req, res) => res.json(buildOpenApiSpec()));
  app.get("/api/v1/docs", (_req, res) => res.type("html").send(renderDocsHtml()));
  app.get("/api/v1/status", readAccess, handleStatus(service, discordStatus));
  app.get("/api/v1/clubs/:club/leaderboard", readAccess, handleLeaderboard(service));
  app.get("/api/v1/members/:trainer_id", readAccess, handleMember(service));
  app.get("/api/v1/chat/context", readAccess, handleChatContext(assistant, service));
  app.post("/api/v1/chat", readAccess, handleChat(assistant, service));
  app.post("/api/v1/sync", writeAccess, handleSync(syncRunner));

  app.get("/api/dashboard/leaderboard", handleDashboardLeaderboard(service));
  app.get("/api/dashboard/hourly", handleDashboardHourly(service));
  app.get("/api/dashboard/members/:trainer_id", handleMember(service));
  app.post("/api/dashboard/chat", handleChat(assistant, service));
  app.post("/api/dashboard/sync", handleSync(syncRunner));

  app.use("/api/{*splat}", handleNotFound);
  app.use(handleError);
  return app;
}
