import { ConfigError, Settings } from "./config_types.js";
import { isAiEnabled } from "./is_ai_enabled.js";

export function validateForRuntime(settings: Settings): string[] {
  const warnings: string[] = [];
  if (settings.onRender && (!settings.tursoUrl || !settings.tursoToken)) {
    throw new ConfigError(
      "RENDER is set, so both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required."
    );
  }
  if (Boolean(settings.tursoUrl) !== Boolean(settings.tursoToken)) {
    warnings.push("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN partially set: using in-memory store.");
  }
  if (!settings.discordToken) {
    warnings.push("DISCORD_TOKEN is not set: running HTTP API only.");
  }
  if (!(settings.apiReadKey || settings.apiWriteKey)) {
    warnings.push("API_READ_KEY / API_WRITE_KEY are not set: private API endpoints will answer 503.");
  }
  if (!settings.umamoeApiKey) {
    warnings.push("UMAMOE_API_KEY is not set: uma.moe sync is disabled until configured.");
  }
  if (Boolean(settings.aiRouterUrl) !== Boolean(settings.aiRouterApiKey)) {
    warnings.push("Set both AI_ROUTER_URL and AI_ROUTER_API_KEY to enable AI replies.");
  } else if (settings.aiRouterUrl && !isAiEnabled(settings)) {
    warnings.push("AI_ROUTER_URL must start with http:// or https://: AI replies are off.");
  }
  return warnings;
}
