export interface TranscriptItem {
  id: string;
  authorName: string;
  prompt: string;
  repliedSnippet?: string;
  replyText: string;
  status: string;
}

interface ChatTranscriptProps {
  items: TranscriptItem[];
  error: string | null;
}

export function ChatTranscript({ items, error }: ChatTranscriptProps) {
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">No mention messages yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Send a message mentioning Lily to test reply-context parsing, cooldowns, and multi-turn channel memory.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs text-slate-500">
                <span className="font-medium text-slate-900">{item.authorName}</span> ·{" "}
                <span>Status: {item.status}</span>
              </div>
              {item.repliedSnippet && (
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Replying to: {item.repliedSnippet}
                </div>
              )}
              <p className="mt-2 text-sm text-slate-800">{item.prompt}</p>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="text-xs font-medium text-slate-500">Lily</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
                  {item.replyText || "(Ignored because the bot was not mentioned)"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
