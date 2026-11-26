import {
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  Message,
  MessageFlags,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from "discord.js";
import { DiscordStatusPayload } from "./api.js";
import {
  CommandReply,
  cmdFanGain,
  cmdFanGainHistory,
  cmdLeaderboard,
  cmdLink,
  cmdUnlink,
} from "./commands.js";
import { Settings } from "./config.js";
import { AiAssistant, ChatTurn, MAX_CHAIN_HOPS } from "./llm.js";
import { TrackerService } from "./services/tracker.js";

const RECONNECT_MIN_SECONDS = 5;
const RECONNECT_MAX_SECONDS = 300;

export function buildSlashCommands(
  settings: Settings
): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  const clubChoices = [
    { name: settings.clubs[0].label, value: "club1" },
    { name: settings.clubs[1].label, value: "club2" },
    { name: "Both clubs", value: "both" },
  ] as const;

  const linkCmd = new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Discord account to your Umamusume trainer ID.")
    .addStringOption((opt) =>
      opt
        .setName("trainer_id")
        .setDescription("Your trainer ID as shown in the club roster")
        .setRequired(true)
    );

  const unlinkCmd = new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Unlink your Discord account from your trainer ID.");

  const leaderboardCmd = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the club fan-gain leaderboard.")
    .addStringOption((opt) =>
      opt
        .setName("club")
        .setDescription("Which club to show")
        .addChoices(...clubChoices)
    )
    .addStringOption((opt) =>
      opt
        .setName("period")
        .setDescription("Time period (resets 15:00 UTC)")
        .addChoices(
          { name: "Daily", value: "daily" },
          { name: "Weekly", value: "weekly" },
          { name: "Monthly", value: "monthly" }
        )
    )
    .addIntegerOption((opt) =>
      opt
        .setName("top")
        .setDescription("Number of trainers to show (1–30)")
        .setMinValue(1)
        .setMaxValue(30)
    );

  const fanGainCmd = new SlashCommandBuilder()
    .setName("fan_gain")
    .setDescription("Show daily, weekly, and monthly fan gains for a linked trainer.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Another Discord member (defaults to yourself)")
    );

  const fanGainHistoryCmd = new SlashCommandBuilder()
    .setName("fan_gain_history")
    .setDescription("Show hourly fan gain history since the 15:00 UTC reset.")
    .addStringOption((opt) =>
      opt
        .setName("club")
        .setDescription("Show hourly total for a club (do not combine with user)")
        .addChoices(...clubChoices)
    )
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Show hourly breakdown for a linked user (do not combine with club)")
    )
    .addStringOption((opt) =>
      opt
        .setName("day")
        .setDescription("Which game day to inspect")
        .addChoices(
          { name: "Today", value: "today" },
          { name: "Yesterday", value: "yesterday" }
        )
    );

  return [
    linkCmd.toJSON(),
    unlinkCmd.toJSON(),
    leaderboardCmd.toJSON(),
    fanGainCmd.toJSON(),
    fanGainHistoryCmd.toJSON(),
  ];
}

function stripBotMention(content: string, botId: string): string {
  const mentionPattern = new RegExp(`<@!?${botId}>`, "g");
  return content.replace(mentionPattern, " ").replace(/\s+/g, " ").trim();
}

function messageErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code?: unknown }).code ?? "");
  }
  return "";
}

function isDisallowedIntentsError(err: unknown): boolean {
  const code = messageErrorCode(err).toLowerCase();
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    code === "disallowedintents" ||
    code === "4014" ||
    msg.includes("disallowed intents") ||
    msg.includes("privileged intent")
  );
}

function isInvalidTokenError(err: unknown): boolean {
  const code = messageErrorCode(err).toLowerCase();
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    code === "tokeninvalid" ||
    code === "4004" ||
    msg.includes("invalid token") ||
    msg.includes("an invalid token was provided")
  );
}

export class DiscordRunner {
  private readonly settings: Settings;
  private readonly service: TrackerService;
  private readonly assistant: AiAssistant;
  private client: Client | null = null;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private state: "disabled" | "starting" | "ready" | "reconnecting" | "error" = "disabled";
  private errorMessage: string | null = null;
  private warnEmptyContentLogged = false;

  constructor(options: {
    settings: Settings;
    service: TrackerService;
    assistant: AiAssistant;
  }) {
    this.settings = options.settings;
    this.service = options.service;
    this.assistant = options.assistant;
    if (this.settings.discordToken) {
      this.state = "starting";
    }
  }

  status(): DiscordStatusPayload {
    const ping = this.client?.ws?.ping;
    const latency =
      this.state === "ready" && typeof ping === "number" && Number.isFinite(ping) && ping >= 0
        ? Math.round(ping)
        : null;
    return {
      state: this.state,
      latency_ms: latency,
      error: this.errorMessage,
    };
  }

  start(): void {
    if (!this.settings.discordToken) {
      this.state = "disabled";
      return;
    }
    this.stopped = false;
    void this.connectLoop(true);
  }

  private async connectLoop(allowMessageContent: boolean): Promise<void> {
    let delaySeconds = RECONNECT_MIN_SECONDS;
    let useMessageContent = allowMessageContent;

    while (!this.stopped) {
      try {
        this.state = this.errorMessage ? "reconnecting" : "starting";
        await this.connectOnce(useMessageContent);
        // Clean disconnect only happens when close() stops it.
        if (this.stopped) break;
        this.state = "reconnecting";
      } catch (err) {
        if (this.stopped) break;

        if (isInvalidTokenError(err)) {
          this.state = "error";
          this.errorMessage = "Discord rejected the login: check DISCORD_TOKEN.";
          console.error(this.errorMessage);
          return;
        }

        if (useMessageContent && isDisallowedIntentsError(err)) {
          console.warn(
            "Discord Message Content intent is disabled in the Developer Portal; retrying without it. Replies to @mentions work, though replied-to text may be empty."
          );
          useMessageContent = false;
          continue;
        }

        const reason = err instanceof Error ? err.message : String(err);
        this.state = "reconnecting";
        this.errorMessage = reason.slice(0, 200);
        console.warn(`Discord connection failed (${reason}); reconnecting in ${delaySeconds}s.`);
      }

      if (this.stopped) break;
      await new Promise<void>((resolve) => {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          resolve();
        }, delaySeconds * 1000);
        this.reconnectTimer.unref();
      });
      delaySeconds = Math.min(delaySeconds * 2, RECONNECT_MAX_SECONDS);
    }
  }

  private async connectOnce(withMessageContent: boolean): Promise<void> {
    const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
    if (withMessageContent) {
      intents.push(GatewayIntentBits.MessageContent);
    }

    const client = new Client({ intents });
    this.client = client;

    client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      void this.handleSlashCommand(interaction);
    });

    client.on(Events.MessageCreate, (message) => {
      void this.handleMessageCreate(message, client);
    });

    client.on(Events.Error, (err) => {
      console.warn("Discord client error:", err.message);
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      client.once(Events.ClientReady, async (readyClient) => {
        this.state = "ready";
        this.errorMessage = null;
        console.info(
          `Discord bot ready as ${readyClient.user.tag}${withMessageContent ? "" : " (no Message Content intent)"}`
        );
        try {
          await this.syncCommands(readyClient);
        } catch (err) {
          console.warn("Failed to sync Discord slash commands:", err);
        }
      });

      client.once("invalidated", () => {
        if (!settled) {
          settled = true;
          reject(new Error("Discord session invalidated"));
        }
      });

      client.on(Events.ShardDisconnect, (event) => {
        if (event.code === 4014) {
          const err = new Error("Disallowed intents (4014)");
          (err as { code?: number }).code = 4014;
          if (!settled) {
            settled = true;
            reject(err);
          }
          return;
        }
        if (event.code === 4004) {
          const err = new Error("Invalid token (4004)");
          (err as { code?: number }).code = 4004;
          if (!settled) {
            settled = true;
            reject(err);
          }
          return;
        }
        if (!this.stopped && !settled) {
          settled = true;
          reject(new Error(`Shard disconnected (code ${event.code})`));
        }
      });

      client.login(this.settings.discordToken ?? undefined).catch((err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      const pollStop = setInterval(() => {
        if (this.stopped && !settled) {
          clearInterval(pollStop);
          settled = true;
          resolve();
        }
      }, 500);
      pollStop.unref();
    }).finally(() => {
      client.destroy();
      if (this.client === client) {
        this.client = null;
      }
    });
  }

  private async syncCommands(client: Client<true>): Promise<void> {
    const body = buildSlashCommands(this.settings);
    if (this.settings.discordGuildId) {
      const guild = client.guilds.cache.get(this.settings.discordGuildId) ??
        (await client.guilds.fetch(this.settings.discordGuildId));
      await guild.commands.set(body);
      console.info(`Synced ${body.length} slash commands to guild ${this.settings.discordGuildId}`);
    } else {
      await client.application.commands.set(body);
      console.info(`Synced ${body.length} global slash commands`);
    }
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const alwaysEphemeral =
      interaction.commandName === "link" || interaction.commandName === "unlink";
    try {
      await interaction.deferReply({
        flags: alwaysEphemeral ? MessageFlags.Ephemeral : undefined,
      });

      let reply: CommandReply;
      switch (interaction.commandName) {
        case "link": {
          const trainerId = interaction.options.getString("trainer_id", true);
          reply = await cmdLink(this.service, interaction.user.id, trainerId);
          break;
        }
        case "unlink": {
          reply = await cmdUnlink(this.service, interaction.user.id);
          break;
        }
        case "leaderboard": {
          const club = interaction.options.getString("club");
          const period = interaction.options.getString("period");
          const top = interaction.options.getInteger("top");
          reply = await cmdLeaderboard(this.service, club, period, top);
          break;
        }
        case "fan_gain": {
          const user = interaction.options.getUser("user");
          reply = await cmdFanGain(
            this.service,
            interaction.user.id,
            user ? user.id : null,
            user ? user.displayName : null
          );
          break;
        }
        case "fan_gain_history": {
          const club = interaction.options.getString("club");
          const user = interaction.options.getUser("user");
          const day = interaction.options.getString("day");
          reply = await cmdFanGainHistory(this.service, interaction.user.id, {
            club,
            targetDiscordId: user ? user.id : null,
            targetDisplayName: user ? user.displayName : null,
            day,
          });
          break;
        }
        default:
          reply = { content: "Unknown command.", embeds: [], ephemeral: true };
      }

      await interaction.editReply({
        content: reply.content,
        embeds: reply.embeds,
        allowedMentions: { parse: [] },
      });
    } catch (err) {
      console.error(`Error handling /${interaction.commandName}:`, err);
      const fallback = "Something went wrong while running that command.";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: fallback, embeds: [] }).catch(() => {});
      } else {
        await interaction.reply({ content: fallback, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  }

  private async collectReplyChain(message: Message, botId: string): Promise<ChatTurn[]> {
    const chain: ChatTurn[] = [];
    let current = message;

    for (let hop = 0; hop < MAX_CHAIN_HOPS; hop += 1) {
      if (!current.reference?.messageId) break;
      try {
        const parent = await current.fetchReference();
        const isBot = parent.author.id === botId;
        const cleaned = stripBotMention(parent.content ?? "", botId);
        const attachments = [...parent.attachments.values()].map((a) => a.name).filter(Boolean);

        if (!cleaned && attachments.length === 0 && !this.warnEmptyContentLogged) {
          this.warnEmptyContentLogged = true;
          console.warn("Replied-to message had empty content (check Message Content intent).");
        }

        chain.push({
          role: isBot ? "assistant" : "user",
          author: parent.member?.displayName ?? parent.author.username,
          content: cleaned,
          attachments,
        });
        current = parent;
      } catch {
        break;
      }
    }

    return chain.reverse();
  }

  private async handleMessageCreate(message: Message, client: Client): Promise<void> {
    if (message.author.bot || !client.user) return;
    if (!message.mentions.users.has(client.user.id)) return;

    const botId = client.user.id;
    const question = stripBotMention(message.content ?? "", botId);
    const currentAttachments = [...message.attachments.values()].map((a) => a.name).filter(Boolean);
    const history = await this.collectReplyChain(message, botId);

    const questionWithAttachments =
      currentAttachments.length > 0 && question
        ? `${question} (attached: ${currentAttachments.join(", ")})`
        : currentAttachments.length > 0
          ? `Attached files: ${currentAttachments.join(", ")}`
          : question;

    if ("sendTyping" in message.channel && typeof message.channel.sendTyping === "function") {
      void message.channel.sendTyping().catch(() => {});
    }

    try {
      const result = await this.assistant.answer({
        userKey: message.author.id,
        question: questionWithAttachments,
        history,
        discordUserId: message.author.id,
        respectCooldown: true,
      });

      await message.reply({
        content: result.reply,
        allowedMentions: { repliedUser: false, parse: [] },
      });
    } catch (err) {
      console.error("Failed to reply to Discord mention:", err);
    }
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }
}
