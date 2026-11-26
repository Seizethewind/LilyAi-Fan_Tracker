export const DEFAULT_CLUB1_ID = "974470619";
export const DEFAULT_CLUB2_ID = "325938032";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface ClubConfig {
  key: string;
  clubId: string;
  label: string;
}

export interface Settings {
  clubs: readonly [ClubConfig, ClubConfig];
  discordToken: string | null;
  discordGuildId: string | null;
  tursoUrl: string | null;
  tursoToken: string | null;
  sqlitePath: string;
  umamoeApiKey: string | null;
  syncIntervalSeconds: number;
  selfPingUrl: string | null;
  selfPingIntervalSeconds: number;
  apiReadKey: string | null;
  apiWriteKey: string | null;
  corsOrigins: string[];
  port: number;
  onRender: boolean;
  aiRouterUrl: string | null;
  aiRouterApiKey: string | null;
  aiModel: string;
  aiUserCooldownSeconds: number;
}

function opt(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name];
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function intEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, minimum: number): number {
  const raw = opt(env, name);
  if (raw === null) return fallback;
  if (!/^-?\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be an integer`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < minimum) {
    throw new ConfigError(`${name} must be at least ${minimum}`);
  }
  return value;
}

export function aiEnabled(settings: Settings): boolean {
  const url = settings.aiRouterUrl;
  return Boolean(
    url &&
      settings.aiRouterApiKey &&
      (url.toLowerCase().startsWith("http://") || url.toLowerCase().startsWith("https://"))
  );
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const clubs: [ClubConfig, ClubConfig] = [
    {
      key: "club1",
      clubId: opt(env, "CLUB1_ID") ?? DEFAULT_CLUB1_ID,
      label: opt(env, "CLUB1_LABEL") ?? "Club 1",
    },
    {
      key: "club2",
      clubId: opt(env, "CLUB2_ID") ?? DEFAULT_CLUB2_ID,
      label: opt(env, "CLUB2_LABEL") ?? "Club 2",
    },
  ];

  if (clubs[0].clubId === clubs[1].clubId) {
    throw new ConfigError("CLUB1_ID and CLUB2_ID must be different");
  }

  const guildRaw = opt(env, "DISCORD_GUILD_ID");
  if (guildRaw !== null && !/^\d+$/.test(guildRaw)) {
    throw new ConfigError("DISCORD_GUILD_ID must be a numeric Discord server id");
  }

  let pingUrl = opt(env, "SELF_PING_URL");
  if (pingUrl === null) {
    const external = opt(env, "RENDER_EXTERNAL_URL");
    if (external) {
      pingUrl = `${external.replace(/\/+$/, "")}/health`;
    }
  }

  const corsRaw = opt(env, "CORS_ORIGINS") ?? "";
  const routerUrl = opt(env, "AI_ROUTER_URL");

  return {
    clubs,
    discordToken: opt(env, "DISCORD_TOKEN"),
    discordGuildId: guildRaw,
    tursoUrl: opt(env, "TURSO_DATABASE_URL"),
    tursoToken: opt(env, "TURSO_AUTH_TOKEN"),
    sqlitePath: opt(env, "SQLITE_PATH") ?? "fantracker.db",
    umamoeApiKey: opt(env, "UMAMOE_API_KEY"),
    syncIntervalSeconds: intEnv(env, "SYNC_INTERVAL_SECONDS", 300, 60),
    selfPingUrl: pingUrl,
    selfPingIntervalSeconds: intEnv(env, "SELF_PING_INTERVAL_SECONDS", 300, 30),
    apiReadKey: opt(env, "API_READ_KEY"),
    apiWriteKey: opt(env, "API_WRITE_KEY"),
    corsOrigins: corsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    port: intEnv(env, "PORT", 3000, 1),
    onRender: opt(env, "RENDER") !== null,
    aiRouterUrl: routerUrl ? routerUrl.replace(/\/+$/, "") || null : null,
    aiRouterApiKey: opt(env, "AI_ROUTER_API_KEY"),
    aiModel: opt(env, "AI_MODEL") ?? "auto",
    aiUserCooldownSeconds: intEnv(env, "AI_USER_COOLDOWN_SECONDS", 10, 0),
  };
}

export function validateForRuntime(settings: Settings): string[] {
  const warnings: string[] = [];
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
  } else if (settings.aiRouterUrl && !aiEnabled(settings)) {
    warnings.push("AI_ROUTER_URL must start with http:// or https://: AI replies are off.");
  }
  return warnings;
}
