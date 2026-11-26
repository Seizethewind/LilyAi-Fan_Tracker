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
