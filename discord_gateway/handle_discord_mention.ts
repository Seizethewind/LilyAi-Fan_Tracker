import { Message } from "discord.js";

import { buildTrackerContext } from "../ai_chat/build_tracker_summary.js";
import { ChatAssistant } from "../ai_chat/chat_assistant.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { isBotMentioned } from "../mention_parser/is_bot_mentioned.js";
import { toRawMessageInput, walkReplyChain } from "./walk_reply_chain.js";

export async function handleDiscordMention(options: {
  message: Message;
  botId: string;
  assistant: ChatAssistant | null;
  service: TrackerService;
}): Promise<void> {
  const { message, botId, assistant, service } = options;
  if (message.author.bot) return;
  if (!assistant) return;

  const rawMsg = toRawMessageInput(message);
  if (!isBotMentioned(rawMsg, botId)) return;

  try {
    if ("sendTyping" in message.channel && typeof message.channel.sendTyping === "function") {
      await message.channel.sendTyping().catch(() => {});
    }
    const [{ replied, chain }, context] = await Promise.all([
      walkReplyChain(message, botId),
      buildTrackerContext(service, message.author.id),
    ]);
    const reply = await assistant.handleMention(
      rawMsg,
      replied,
      botId,
      context.summaryText,
      chain
    );
    if (reply.text) {
      await message.reply({
        content: reply.text,
        allowedMentions: { repliedUser: false },
      });
    }
  } catch (err) {
    console.warn("Discord mention reply failed:", err instanceof Error ? err.message : String(err));
  }
}
