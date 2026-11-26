export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatReply {
  text: string;
  status: "answered" | "hint" | "cooldown" | "unavailable" | "not_mentioned";
  waitSeconds?: number;
}

export class RouterError extends Error {
  readonly retryAfter: number | null;

  constructor(message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "RouterError";
    this.retryAfter = retryAfter;
  }
}

export interface ChatCompletionClient {
  chat(messages: ChatMessage[]): Promise<string>;
}
