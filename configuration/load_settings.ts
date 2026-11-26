import {
  ClubConfig,
  ConfigError,
  DEFAULT_CLUB1_ID,
  DEFAULT_CLUB2_ID,
  Settings,
} from "./config_types.js";
import { readEnvInt } from "./read_env_int.js";
import { readEnvOption } from "./read_env_option.js";
import { readPortArg } from "./read_port_arg.js";

export function loadSettings(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv
): Settings {
  const clubs: [ClubConfig, ClubConfig] = [
    {
      key: "club1",
      clubId: readEnvOption(env, "CLUB1_ID") ?? DEFAULT_CLUB1_ID,
      label: readEnvOption(env, "CLUB1_LABEL") ?? "Club 1",
    },
    {
      key: "club2",
      clubId: readEnvOption(env, "CLUB2_ID") ?? DEFAULT_CLUB2_ID,
      label: readEnvOption(env, "CLUB2_LABEL") ?? "Club 2",
    },
  ];

  if (clubs[0].clubId === clubs[1].clubId) {
    throw new ConfigError("CLUB1_ID and CLUB2_ID must be different");
  }

  const guildRaw = readEnvOption(env, "DISCORD_GUILD_ID");
  if (guildRaw !== null && !/^\d+$/.test(guildRaw)) {
    throw new ConfigError("DISCORD_GUILD_ID must be a numeric Discord server id");
  }

  let pingUrl = readEnvOption(env, "SELF_PING_URL");
  if (pingUrl === null) {
    const external = readEnvOption(env, "RENDER_EXTERNAL_URL");
    if (external) {
      pingUrl = `${external.replace(/\/+$/, "")}/health`;
    }
  }

  const corsRaw = readEnvOption(env, "CORS_ORIGINS") ?? "";
  const routerUrl = readEnvOption(env, "AI_ROUTER_URL");

  const nginxPort = readEnvOption(env, "NGINX_PORT");
  const rawPort = readEnvOption(env, "PORT");
  const useDefaultAppPort =
    readEnvOption(env, "DEFAULT_APP_PORT") !== null &&
    nginxPort !== null &&
    rawPort === nginxPort;
  const resolvedPort =
    readPortArg(argv) ??
    (useDefaultAppPort
      ? readEnvInt(env, "DEFAULT_APP_PORT", 3000, 1)
      : readEnvInt(env, "PORT", 3000, 1));

  return {
    clubs,
    discordToken: readEnvOption(env, "DISCORD_TOKEN"),
    discordGuildId: guildRaw,
    tursoUrl: readEnvOption(env, "TURSO_DATABASE_URL"),
    tursoToken: readEnvOption(env, "TURSO_AUTH_TOKEN"),
    umamoeApiKey: readEnvOption(env, "UMAMOE_API_KEY"),
    syncIntervalSeconds: readEnvInt(env, "SYNC_INTERVAL_SECONDS", 300, 60),
    selfPingUrl: pingUrl,
    selfPingIntervalSeconds: readEnvInt(env, "SELF_PING_INTERVAL_SECONDS", 300, 30),
    apiReadKey: readEnvOption(env, "API_READ_KEY"),
    apiWriteKey: readEnvOption(env, "API_WRITE_KEY"),
    corsOrigins: corsRaw.split(",").map((s) => s.trim()).filter(Boolean),
    port: resolvedPort,
    onRender: readEnvOption(env, "RENDER") !== null,
    aiRouterUrl: routerUrl ? routerUrl.replace(/\/+$/, "") || null : null,
    aiRouterApiKey: readEnvOption(env, "AI_ROUTER_API_KEY"),
    aiModel: readEnvOption(env, "AI_MODEL") ?? "auto",
    aiUserCooldownSeconds: readEnvInt(env, "AI_USER_COOLDOWN_SECONDS", 10, 0),
  };
}
