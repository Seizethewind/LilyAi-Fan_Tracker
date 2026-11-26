import { useState } from "react";

import { sendChatMention } from "../api_client/send_chat_mention";
import { ChatTranscript, TranscriptItem } from "./chat_transcript";
import { MentionComposer } from "./mention_composer";

export function MentionChatSection() {
  const [authorName, setAuthorName] = useState("Trainer");
  const [content, setContent] = useState("<@lily-bot> What are our club standings?");
  const [repliedAuthor, setRepliedAuthor] = useState("");
  const [repliedContent, setRepliedContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await sendChatMention({
        authorId: "web-user-1",
        authorName: authorName.trim() || "Trainer",
        channelId: "web-dashboard",
        content,
        repliedAuthor,
        repliedContent,
      });
      setTranscript((prev) => [
        {
          id: `${Date.now()}-${prev.length}`,
          authorName: authorName.trim() || "Trainer",
          prompt: content,
          repliedSnippet: repliedContent.trim() || undefined,
          replyText: res.reply,
          status: res.status,
        },
        ...prev,
      ]);
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send mention.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Mention Chat</h1>
        <p className="mt-1 text-sm text-slate-600">
          Test Lily&apos;s @mention parsing, reply-message framing, cooldowns, and channel memory.
        </p>
      </div>
      <MentionComposer
        authorName={authorName}
        content={content}
        repliedAuthor={repliedAuthor}
        repliedContent={repliedContent}
        sending={sending}
        onAuthorNameChange={setAuthorName}
        onContentChange={setContent}
        onRepliedAuthorChange={setRepliedAuthor}
        onRepliedContentChange={setRepliedContent}
        onInsertMention={() =>
          setContent((prev) =>
            prev.includes("<@lily-bot>") ? prev : `<@lily-bot> ${prev}`.trim()
          )
        }
        onSubmit={() => void handleSend()}
      />
      <ChatTranscript items={transcript} error={error} />
    </section>
  );
}
