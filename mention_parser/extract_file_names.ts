import { AttachmentEntry } from "./mention_types.js";
import { sanitizeName } from "./sanitize_name.js";

const MAX_ATTACHMENT_NAMES = 5;

export function extractFileNames(attachments: AttachmentEntry[] = []): string[] {
  return attachments
    .slice(0, MAX_ATTACHMENT_NAMES)
    .map((a) => sanitizeName(a.filename, "file"));
}
