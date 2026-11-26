export interface MentionEntry {
  id: string;
  displayName?: string;
  kind?: "user" | "role" | "channel";
}

export interface AttachmentEntry {
  filename?: string;
}

export interface RawMessageInput {
  content?: string;
  authorId: string;
  authorName?: string;
  channelId?: string;
  mentions?: MentionEntry[];
  attachments?: AttachmentEntry[];
}

export interface AskContext {
  askerId: string;
  askerName: string;
  channelId: string;
  question: string;
  repliedAuthor: string | null;
  repliedText: string;
  repliedFiles: string[];
  askerFiles: string[];
}
