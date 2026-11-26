import type { Client } from "discord.js";

import { ChatAssistant } from "../ai_chat/chat_assistant.js";
import { Settings } from "../configuration/config_types.js";
import { DiscordStatusInfo } from "../domain_models/types.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { dispatchInteraction } from "./dispatch_interaction.js";
import { handleDiscordMention } from "./handle_discord_mention.js";

export class DiscordBot {
  private readonly settings: Settings;
  private readonly service: TrackerService;
  private readonly assistant: ChatAssistant | null;
  private client: Client | null = null;
  private state: DiscordStatusInfo["state"] = "disabled";
  private lastError: string | null = null;

  constructor(settings: Settings, service: TrackerService, assistant: ChatAssistant | null) {
    this.settings = settings;
    this.service = service;
    this.assistant = assistant;
  }

  status(): DiscordStatusInfo {
    const ping = this.client?.ws.ping;
    return {
      state: this.state,
      latency_ms: typeof ping === "number" && ping >= 0 ? Math.round(ping) : null,
      error: this.lastError,
    };
  }

  async start(): Promise<void> {
    if (!this.settings.discordToken) {
      this.state = "disabled";
      return;
    }
    this.state = "starting";
    try {
      await this.connectClient(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/disallowed intent/i.test(msg)) {
        console.warn("Message Content intent is disabled; reconnecting without it.");
        await this.connectClient(false).catch((retryErr) => {
          this.state = "error";
          this.lastError = retryErr instanceof Error ? retryErr.message : String(retryErr);
        });
        return;
      }
      this.state = "error";
      this.lastError = msg;
      console.error("Discord connection error:", msg);
    }
  }

  private async connectClient(withMessageContent: boolean): Promise<void> {
    const { Client, Events, GatewayIntentBits } = await import("discord.js");
    const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
    if (withMessageContent) intents.push(GatewayIntentBits.MessageContent);

    const client = new Client({ intents });
    this.client = client;

    client.once(Events.ClientReady, async (readyClient) => {
      this.state = "ready";
      this.lastError = null;
      console.info(`Discord logged in as ${readyClient.user.tag}`);
      await this.registerCommands(readyClient.user.id);
    });

    client.on(Events.ShardReconnecting, () => {
      this.state = "reconnecting";
    });

    client.on(Events.ShardResume, () => {
      this.state = "ready";
      this.lastError = null;
    });

    client.on(Events.Error, (err) => {
      this.state = "error";
      this.lastError = err.message;
    });

    client.on(Events.InteractionCreate, (interaction) => {
      if (interaction.isChatInputCommand()) {
        void dispatchInteraction(interaction, this.service);
      }
    });

    client.on(Events.MessageCreate, (message) => {
      const botId = client.user?.id;
      if (botId) {
        void handleDiscordMention({
          message,
          botId,
          assistant: this.assistant,
          service: this.service,
        });
      }
    });

    await client.login(this.settings.discordToken!);
  }

  private async registerCommands(appId: string): Promise<void> {
    const [{ REST, Routes }, { buildSlashCommands }] = await Promise.all([
      import("discord.js"),
      import("../discord_commands/slash_definitions.js"),
    ]);
    const rest = new REST().setToken(this.settings.discordToken!);
    const body = buildSlashCommands(this.settings);
    try {
      if (this.settings.discordGuildId) {
        await rest.put(Routes.applicationGuildCommands(appId, this.settings.discordGuildId), {
          body,
        });
      } else {
        await rest.put(Routes.applicationCommands(appId), { body });
      }
    } catch (err) {
      console.warn("Could not register slash commands:", err instanceof Error ? err.message : String(err));
    }
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }
    this.state = "disabled";
  }
}
