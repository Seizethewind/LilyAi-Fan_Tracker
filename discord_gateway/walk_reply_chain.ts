import { Message } from "discord.js";

import { ChatMessage } from "../ai_chat/chat_types.js";
import { extractPlainText } from "../mention_parser/extract_plain_text.js";
import { MentionEntry, RawMessageInput } from "../mention_parser/mention_types.js";
import { sanitizeName } from "../mention_parser/sanitize_name.js";

const MAX_CHAIN_DEPTH = 6;

export function toRawMessageInput(msg: Message): RawMessageInput {
  const mentions: MentionEntry[] = [];
  for (const user of msg.mentions.users.values()) {
    mentions.push({ id: user.id, displayName: user.displayName ?? user.username, kind: "user" });
  }
  for (const role of msg.mentions.roles.values()) {
    mentions.push({ id: role.id, displayName: role.name, kind: "role" });
  }
  for (const ch of msg.mentions.channels.values()) {
    const chName = "name" in ch && typeof ch.name === "string" ? ch.name : "channel";
    mentions.push({ id: ch.id, displayName: chName, kind: "channel" });
  }

  return {
    content: msg.content,
    authorId: msg.author.id,
    authorName: msg.member?.displayName ?? msg.author.displayName ?? msg.author.username,
    channelId: msg.channelId,
    mentions,
    attachments: Array.from(msg.attachments.values()).map((a) => ({ filename: a.name })),
  };
}

export async function walkReplyChain(
  origin: Message,
  botId: string
): Promise<{ replied: RawMessageInput | null; chain: ChatMessage[] }> {
  const visited = new Set<string>([origin.id]);
  const collected: Array<{ role: "user" | "assistant"; author: string; text: string }> = [];
  let immediateReplied: RawMessageInput | null = null;
  let current: Message = origin;

  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth += 1) {
    const refId = current.reference?.messageId;
    if (!refId || visited.has(refId)) break;
    visited.add(refId);

    let parent: Message;
    try {
      parent = await current.fetchReference();
    } catch {
      break;
    }

    const raw = toRawMessageInput(parent);
    if (depth === 0) {
      immediateReplied = raw;
    } else {
      const plain = extractPlainText(raw.content, raw.mentions, botId);
      if (plain) {
        const isBot = parent.author.id === botId;
        collected.push({
          role: isBot ? "assistant" : "user",
          author: sanitizeName(raw.authorName),
          text: plain,
        });
      }
    }
    current = parent;
  }

  const chain: ChatMessage[] = collected.reverse().map((item) => ({
    role: item.role,
    content: item.role === "assistant" ? item.text : `${item.author}: ${item.text}`,
  }));

  return { replied: immediateReplied, chain };
}
