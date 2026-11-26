import { clipText } from "./clip_text.js";
import { extractFileNames } from "./extract_file_names.js";
import { extractPlainText } from "./extract_plain_text.js";
import { AskContext, RawMessageInput } from "./mention_types.js";
import { sanitizeName } from "./sanitize_name.js";

const MAX_QUESTION_CHARS = 1000;
const MAX_REPLIED_CHARS = 2000;

export function buildAskContext(
  message: RawMessageInput,
  replied: RawMessageInput | null = null,
  botId?: string
): AskContext | null {
  const question = clipText(
    extractPlainText(message.content, message.mentions, botId),
    MAX_QUESTION_CHARS
  );
  const askerFiles = extractFileNames(message.attachments);
  if (!question && !replied && askerFiles.length === 0) {
    return null;
  }

  const channelId = message.channelId?.trim() || `user:${message.authorId}`;
  const base: AskContext = {
    askerId: message.authorId,
    askerName: sanitizeName(message.authorName),
    channelId,
    question,
    repliedAuthor: null,
    repliedText: "",
    repliedFiles: [],
    askerFiles,
  };

  if (!replied) return base;

  const repliedPlain = extractPlainText(replied.content, replied.mentions, botId);
  return {
    ...base,
    repliedAuthor: sanitizeName(replied.authorName),
    repliedText: clipText(repliedPlain, MAX_REPLIED_CHARS),
    repliedFiles: extractFileNames(replied.attachments),
  };
}
