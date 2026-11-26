import { buildAskContext } from "../mention_parser/build_ask_context.js";
import { clipText } from "../mention_parser/clip_text.js";
import { isBotMentioned } from "../mention_parser/is_bot_mentioned.js";
import { AskContext, RawMessageInput } from "../mention_parser/mention_types.js";
import { buildChatMessages } from "./build_chat_messages.js";
import { ChatMemory } from "./chat_memory.js";
import { ChatCompletionClient, ChatMessage, ChatReply, RouterError } from "./chat_types.js";
import { formatWaitTime } from "./format_wait_time.js";
import { stripThinkTags } from "./strip_think_tags.js";

export const MENTION_HINT = "Mention me with a question, or reply to a message and mention me.";
const MAX_REPLY_CHARS = 1900;
const FALLBACK_WAIT_SECONDS = 60;

export class ChatAssistant {
  private readonly client: ChatCompletionClient;
  private readonly cooldownMs: number;
  private readonly fallbackWaitSeconds: number;
  private readonly clock: () => number;
  private readonly memory = new ChatMemory();
  private readonly lastAsk = new Map<string, number>();
  private downUntilMs = 0;

  constructor(
    client: ChatCompletionClient,
    cooldownSeconds = 10,
    fallbackWaitSeconds = FALLBACK_WAIT_SECONDS,
    clock: () => number = () => Date.now()
  ) {
    this.client = client;
    this.cooldownMs = cooldownSeconds * 1000;
    this.fallbackWaitSeconds = fallbackWaitSeconds;
    this.clock = clock;
  }

  async handleMention(
    message: RawMessageInput,
    replied: RawMessageInput | null = null,
    botId?: string,
    clubSummary?: string,
    replyChain?: ChatMessage[]
  ): Promise<ChatReply> {
    if (!isBotMentioned(message, botId)) {
      return { text: "", status: "not_mentioned" };
    }
    const ctx = buildAskContext(message, replied, botId);
    if (!ctx) {
      return { text: MENTION_HINT, status: "hint" };
    }
    return this.answer(ctx, clubSummary, replyChain);
  }

  async answer(
    ctx: AskContext,
    clubSummary?: string,
    replyChain?: ChatMessage[]
  ): Promise<ChatReply> {
    const now = this.clock();
    if (now < this.downUntilMs) {
      const waitSeconds = (this.downUntilMs - now) / 1000;
      return {
        text: `Lily can't answer right now. Please wait about ${formatWaitTime(waitSeconds)} before talking to me again.`,
        status: "unavailable",
        waitSeconds,
      };
    }

    const last = this.lastAsk.get(ctx.askerId);
    if (last !== undefined && now - last < this.cooldownMs) {
      const waitSeconds = (this.cooldownMs - (now - last)) / 1000;
      return {
        text: `One moment! You can ask me again in ${formatWaitTime(waitSeconds)}.`,
        status: "cooldown",
        waitSeconds,
      };
    }

    if (this.lastAsk.size > 1000) {
      for (const [uid, ts] of this.lastAsk.entries()) {
        if (now - ts >= this.cooldownMs) this.lastAsk.delete(uid);
      }
    }
    this.lastAsk.set(ctx.askerId, now);

    const history =
      replyChain && replyChain.length > 0 ? replyChain : this.memory.recent(ctx.channelId);
    const messages = buildChatMessages(ctx, history, clubSummary);

    try {
      const raw = await this.client.chat(messages);
      const cleaned = stripThinkTags(raw);
      if (!cleaned) {
        throw new RouterError("router returned no answer");
      }
      const replyText = clipText(cleaned, MAX_REPLY_CHARS);
      const userPrompt = messages[messages.length - 1]?.content ?? ctx.question;
      this.memory.record(ctx.channelId, userPrompt, replyText);
      return { text: replyText, status: "answered" };
    } catch (err) {
      const retryAfter = err instanceof RouterError ? err.retryAfter : null;
      const waitSeconds = retryAfter ?? this.fallbackWaitSeconds;
      this.downUntilMs = Math.max(this.downUntilMs, this.clock() + waitSeconds * 1000);
      console.warn("AI router unavailable:", err instanceof Error ? err.message : String(err));
      return {
        text: `Lily can't answer right now. Please wait about ${formatWaitTime(waitSeconds)} before talking to me again.`,
        status: "unavailable",
        waitSeconds,
      };
    }
  }
}
