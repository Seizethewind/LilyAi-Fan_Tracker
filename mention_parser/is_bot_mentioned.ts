import { RawMessageInput } from "./mention_types.js";

export function isBotMentioned(message: RawMessageInput, botId?: string): boolean {
  if (!botId) return true;
  if (message.mentions?.some((m) => (m.kind ?? "user") === "user" && m.id === botId)) {
    return true;
  }
  const escaped = botId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<@!?${escaped}>`).test(message.content ?? "");
}
