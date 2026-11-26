const THINK_RE = /<think>[\s\S]*?<\/think>/gi;

export function stripThinkTags(content: string): string | null {
  const cleaned = content.replace(THINK_RE, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}
