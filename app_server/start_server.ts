import { buildAssistant } from "../ai_chat/build_assistant.js";
import { startSelfPing } from "../background_sync/start_self_ping.js";
import { SyncRunner } from "../background_sync/sync_runner.js";
import { ConfigError, Settings } from "../configuration/config_types.js";
import { loadSettings } from "../configuration/load_settings.js";
import { validateForRuntime } from "../configuration/validate_for_runtime.js";
import { DiscordBot } from "../discord_gateway/discord_bot.js";
import { initStore } from "../fan_storage/init_store.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { attachFrontend } from "../frontend_hosting/attach_frontend.js";
import { createApiApp } from "../http_api/create_api_app.js";
import { buildSource } from "../umamoe_source/build_source.js";

async function startServer(): Promise<void> {
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

  const store = await initStore(settings);
  const source = buildSource(settings);
  const service = new TrackerService(store, source, settings.clubs);
  const syncRunner = new SyncRunner(service, settings.syncIntervalSeconds);
  const assistant = buildAssistant(settings);
  const discordBot = new DiscordBot(settings, service, assistant);

  const app = createApiApp({
    settings,
    service,
    syncRunner,
    discordStatus: () => discordBot.status(),
    assistant,
  });
  await attachFrontend(app);

  const server = app.listen(settings.port, "0.0.0.0", () => {
    console.info(`LilyAi Fan Tracker listening on http://0.0.0.0:${settings.port}`);
    syncRunner.start();
    void discordBot.start();
  });

  const stopSelfPing = settings.selfPingUrl
    ? startSelfPing(settings.selfPingUrl, settings.selfPingIntervalSeconds)
    : null;

  const shutdown = () => {
    syncRunner.stop();
    if (stopSelfPing) stopSelfPing();
    void discordBot.stop().finally(() => {
      void store.close().finally(() => {
        server.close(() => process.exit(0));
      });
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void startServer().catch((err) => {
  console.error("Failed to start LilyAi Fan Tracker:", err);
  process.exit(1);
});
