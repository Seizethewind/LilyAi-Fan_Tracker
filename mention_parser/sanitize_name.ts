import { clipText } from "./clip_text.js";

const MAX_NAME_CHARS = 40;

export function sanitizeName(name: string | undefined, fallback = "someone"): string {
  const cleaned = String(name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? clipText(cleaned, MAX_NAME_CHARS) : fallback;
}
