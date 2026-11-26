import { ChatCompletionClient, ChatMessage, RouterError } from "./chat_types.js";
import { parseRetryAfter } from "./parse_retry_after.js";
import { stripThinkTags } from "./strip_think_tags.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export class RouterClient implements ChatCompletionClient {
  private readonly url: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(
    baseUrl: string,
    apiKey: string,
    model = "auto",
    timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    this.url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ model: this.model, messages }),
        signal: controller.signal,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      throw new RouterError(`request failed (${name})`);
    } finally {
      clearTimeout(timer);
    }

    if (response.status !== 200) {
      throw new RouterError(
        `router answered HTTP ${response.status}`,
        parseRetryAfter(response.headers.get("retry-after"))
      );
    }

    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new RouterError("router returned invalid JSON");
    }

    const choices = Array.isArray(data?.choices) ? data.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const msg = first?.message as Record<string, unknown> | undefined;
    const rawContent = typeof msg?.content === "string" ? msg.content : "";
    const text = stripThinkTags(rawContent);
    if (!text) {
      throw new RouterError("router returned no answer");
    }
    return text;
  }
}
