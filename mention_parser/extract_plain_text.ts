import { MentionEntry } from "./mention_types.js";
import { sanitizeName } from "./sanitize_name.js";

const TOKEN_RE = /<(@!?|@&|#)(\d+)>/g;

export function extractPlainText(
  content: string | undefined,
  mentions: MentionEntry[] = [],
  botId?: string
): string {
  const users = new Map<string, string>();
  const roles = new Map<string, string>();
  const channels = new Map<string, string>();

  for (const m of mentions) {
    if (m.kind === "role") roles.set(m.id, m.displayName ?? "role");
    else if (m.kind === "channel") channels.set(m.id, m.displayName ?? "channel");
    else users.set(m.id, m.displayName ?? "someone");
  }

  const replaced = (content ?? "").replace(TOKEN_RE, (_full, prefix: string, id: string) => {
    if (prefix.startsWith("@") && prefix !== "@&") {
      if (botId && id === botId) return "";
      return `@${sanitizeName(users.get(id))}`;
    }
    if (prefix === "@&") {
      return `@${sanitizeName(roles.get(id), "role")}`;
    }
    return `#${sanitizeName(channels.get(id), "channel")}`;
  });

  return replaced.replace(/\s+/g, " ").trim();
}
