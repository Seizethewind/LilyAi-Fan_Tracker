import { ChatResponseData } from "./frontend_types";

export interface SendChatInput {
  authorId: string;
  authorName: string;
  channelId: string;
  content: string;
  botId?: string;
  repliedAuthor?: string;
  repliedContent?: string;
}

export async function sendChatMention(input: SendChatInput): Promise<ChatResponseData> {
  const body: Record<string, unknown> = {
    bot_id: input.botId?.trim() || "lily-bot",
    message: {
      author_id: input.authorId,
      author_name: input.authorName,
      channel_id: input.channelId,
      content: input.content,
    },
  };

  if (input.repliedContent?.trim()) {
    body.replied = {
      author_id: "replied-user",
      author_name: input.repliedAuthor?.trim() || "Clubmate",
      channel_id: input.channelId,
      content: input.repliedContent.trim(),
    };
  }

  const res = await fetch("/api/dashboard/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.error?.message ?? "Chat request failed.");
  }
  return payload as ChatResponseData;
}
