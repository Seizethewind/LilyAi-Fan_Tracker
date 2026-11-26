import { VERSION } from "../domain_models/types.js";
import { MAX_TOP } from "../fan_tracker/tracker_types.js";

export function buildOpenApiSpec() {
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
      "/api/v1/chat/context": {
        get: { summary: "AI availability and live club summary context", responses: { "200": { description: "Context payload" } } },
      },
      "/api/v1/chat": {
        post: { summary: "Answer a @mention chat message (read/write key)", responses: { "200": { description: "Chat reply" } } },
      },
      "/api/v1/sync": {
        post: { summary: "Trigger immediate sync (write key required)", responses: { "200": { description: "Sync outcomes" } } },
      },
    },
  };
}
