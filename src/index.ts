import { DiscordStatusPayload, createApp } from "./api.js";
import { ConfigError, Settings, loadSettings, validateForRuntime } from "./config.js";
import { SyncRunner, startSelfPing } from "./runner.js";
import { TrackerService } from "./services/tracker.js";
import { FanSource, SourceError, buildSource } from "./sources/umamoe.js";
import { Store } from "./storage/store.js";

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

function main(): void {
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

  const store = new Store();
  const source = createSafeSource(settings);
  const service = new TrackerService(store, source, settings.clubs);
  const syncRunner = new SyncRunner(service, settings.syncIntervalSeconds);

  const discordStatus = (): DiscordStatusPayload => {
    if (!settings.discordToken) {
      return { state: "disabled", latency_ms: null, error: null };
    }
    return {
      state: "disabled",
      latency_ms: null,
      error: "Discord gateway is disabled in the Node.js HTTP API runtime.",
    };
  };

  const app = createApp({
    settings,
    service,
    syncRunner,
    discordStatus,
  });

  const server = app.listen(settings.port, "0.0.0.0", () => {
    console.info(`LilyAi Fan Tracker API listening on http://0.0.0.0:${settings.port}`);
    syncRunner.start();
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
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
