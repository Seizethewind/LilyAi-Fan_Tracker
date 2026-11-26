import { createApp } from "./api.js";
import { ConfigError, Settings, loadSettings, validateForRuntime } from "./config.js";
import { DiscordRunner } from "./discord_bot.js";
import { createAiAssistant } from "./llm.js";
import { SyncRunner, startSelfPing } from "./runner.js";
import { TrackerService } from "./services/tracker.js";
import { FanSource, SourceError, buildSource } from "./sources/umamoe.js";
import { FanStore, MemoryStore } from "./storage/store.js";
import { TursoStore } from "./storage/turso.js";

function createSafeSource(settings: Settings): FanSource {
  try {
    return buildSource(settings);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(reason);
    return {
      async fetchClub() {
        throw new SourceError(reason);
      },
    };
  }
}

async function createAndInitStore(settings: Settings): Promise<FanStore> {
  if (settings.tursoUrl && settings.tursoToken) {
    try {
      const turso = new TursoStore(settings.tursoUrl, settings.tursoToken);
      await turso.init();
      console.info("Storage: Turso HTTP");
      return turso;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (settings.onRender) {
        throw new Error(`Turso initialization failed on Render: ${reason}`);
      }
      console.warn(`Turso unavailable (${reason}); falling back to in-memory store.`);
    }
  } else if (settings.onRender) {
    throw new ConfigError("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required on Render.");
  }

  const memory = new MemoryStore();
  await memory.init();
  console.info("Storage: In-memory store");
  return memory;
}

async function main(): Promise<void> {
  let settings: Settings;
  try {
    settings = loadSettings();
    for (const warning of validateForRuntime(settings)) {
      console.warn(warning);
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Configuration error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const store = await createAndInitStore(settings);

  const source = createSafeSource(settings);
  const service = new TrackerService(store, source, settings.clubs);
  const syncRunner = new SyncRunner(service, settings.syncIntervalSeconds);
  const assistant = createAiAssistant(settings, service);
  const discordRunner = new DiscordRunner({ settings, service, assistant });

  const app = createApp({
    settings,
    service,
    syncRunner,
    discordStatus: () => discordRunner.status(),
    assistant,
  });

  const server = app.listen(settings.port, "0.0.0.0", () => {
    console.info(`LilyAi Fan Tracker listening on http://0.0.0.0:${settings.port}`);
    syncRunner.start();
    discordRunner.start();
  });

  let stopSelfPing: (() => void) | null = null;
  if (settings.selfPingUrl) {
    console.info(`Self-ping every ${settings.selfPingIntervalSeconds}s`);
    stopSelfPing = startSelfPing(settings.selfPingUrl, settings.selfPingIntervalSeconds);
  } else {
    console.info("Self-ping is off (no RENDER_EXTERNAL_URL or SELF_PING_URL).");
  }

  const shutdown = () => {
    syncRunner.stop();
    if (stopSelfPing) stopSelfPing();
    void discordRunner.close().finally(() => {
      server.close(() => {
        process.exit(0);
      });
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
