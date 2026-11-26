import { ChatMessage } from "./chat_types.js";

const DEFAULT_MAX_TURNS = 4;
const DEFAULT_MAX_CHANNELS = 200;

export class ChatMemory {
  private readonly channels = new Map<string, ChatMessage[]>();
  private readonly maxMessages: number;
  private readonly maxChannels: number;

  constructor(maxTurns = DEFAULT_MAX_TURNS, maxChannels = DEFAULT_MAX_CHANNELS) {
    this.maxMessages = maxTurns * 2;
    this.maxChannels = maxChannels;
  }

  recent(channelId: string): ChatMessage[] {
    return [...(this.channels.get(channelId) ?? [])];
  }

  record(channelId: string, userContent: string, assistantContent: string): void {
    const history = this.channels.get(channelId) ?? [];
    history.push(
      { role: "user", content: userContent },
      { role: "assistant", content: assistantContent }
    );
    const trimmed = history.slice(-this.maxMessages);
    this.channels.delete(channelId);
    this.channels.set(channelId, trimmed);

    if (this.channels.size > this.maxChannels) {
      const oldestKey = this.channels.keys().next().value;
      if (oldestKey !== undefined) this.channels.delete(oldestKey);
    }
  }
}
