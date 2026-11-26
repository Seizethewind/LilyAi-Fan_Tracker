import { Send } from "lucide-react";

interface MentionComposerProps {
  authorName: string;
  content: string;
  repliedAuthor: string;
  repliedContent: string;
  sending: boolean;
  onAuthorNameChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onRepliedAuthorChange: (value: string) => void;
  onRepliedContentChange: (value: string) => void;
  onInsertMention: () => void;
  onSubmit: () => void;
}

export function MentionComposer({
  authorName,
  content,
  repliedAuthor,
  repliedContent,
  sending,
  onAuthorNameChange,
  onContentChange,
  onRepliedAuthorChange,
  onRepliedContentChange,
  onInsertMention,
  onSubmit,
}: MentionComposerProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600">
          Your Name
          <input
            type="text"
            value={authorName}
            onChange={(e) => onAuthorNameChange(e.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Replied-To Author (Optional)
          <input
            type="text"
            value={repliedAuthor}
            onChange={(e) => onRepliedAuthorChange(e.target.value)}
            placeholder="Clubmate"
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </label>
      </div>

      <label className="block text-xs font-medium text-slate-600">
        Replied-To Message Context (Optional)
        <textarea
          rows={2}
          value={repliedContent}
          onChange={(e) => onRepliedContentChange(e.target.value)}
          placeholder="Paste a message you are replying to..."
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
        />
      </label>

      <label className="block text-xs font-medium text-slate-600">
        Mention Message
        <textarea
          rows={3}
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="Ask Lily a question (include <@lily-bot> to trigger @mention detection)..."
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onInsertMention}
          className="min-h-10 cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Insert @Lily Mention
        </button>

        <button
          type="submit"
          disabled={sending || !content.trim()}
          className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          <span>{sending ? "Sending..." : "Send Mention"}</span>
        </button>
      </div>
    </form>
  );
}
