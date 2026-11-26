import { FormEvent, KeyboardEvent, useCallback, useEffect, useState } from "react";
import { RefreshCw, Send, Trash2 } from "lucide-react";
import { ClientApiError, fetchChatContext, sendChatTest } from "../api";
import { formatGain, formatInt, formatUtcDateTime } from "../format";
import { ChatContextResponse, ChatTurnInput } from "../types";
import { AuthRequiredPanel } from "./AuthRequiredPanel";

interface ChatTestViewProps {
  apiKeyVersion: number;
  syncVersion: number;
  onOpenApiKeyModal: () => void;
}

interface ThreadEntry extends ChatTurnInput {
  id: string;
  model?: string;
  latencyMs?: number;
  contextSummary?: string;
}

const SAMPLE_PROMPTS = [
  "Who is leading Club 1 today?",
  "Summarize both clubs' top daily and weekly gainers.",
  "What did they mean in the replied message?",
];

export function ChatTestView({
  apiKeyVersion,
  syncVersion,
  onOpenApiKeyModal,
}: ChatTestViewProps) {
  const [contextData, setContextData] = useState<ChatContextResponse | null>(null);
  const [contextError, setContextError] = useState<ClientApiError | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);

  const [messages, setMessages] = useState<ThreadEntry[]>([]);
  const [prompt, setPrompt] = useState("");
  const [repliedText, setRepliedText] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<ClientApiError | null>(null);

  const loadContext = useCallback(async (lookupTrainerId?: string) => {
    setLoadingContext(true);
    setContextError(null);
    try {
      const data = await fetchChatContext(lookupTrainerId);
      setContextData(data);
    } catch (err) {
      if (err instanceof ClientApiError) {
        setContextError(err);
      } else {
        setContextError(new ClientApiError(500, "client_error", "Could not load AI chat context."));
      }
    } finally {
      setLoadingContext(false);
    }
  }, []);

  useEffect(() => {
    void loadContext(trainerId);
  }, [loadContext, apiKeyVersion, syncVersion, trainerId]);

  const submitMessage = async (textOverride?: string) => {
    const content = (textOverride ?? prompt).trim();
    if (!content || sending) return;

    setSendError(null);
    const userTurn: ThreadEntry = {
      id: `${Date.now()}-u-${Math.random().toString(36).slice(2, 7)}`,
      role: "user",
      content,
    };
    const nextThread = [...messages, userTurn];
    setMessages(nextThread);
    if (!textOverride) {
      setPrompt("");
    }
    setSending(true);

    try {
      const res = await sendChatTest({
        messages: nextThread.map(({ role, content: text }) => ({ role, content: text })),
        replied_text: repliedText.trim() || undefined,
        trainer_id: trainerId.trim() || undefined,
      });

      const assistantTurn: ThreadEntry = {
        id: `${Date.now()}-a-${Math.random().toString(36).slice(2, 7)}`,
        role: "assistant",
        content: res.reply,
        model: res.model,
        latencyMs: res.latency_ms,
        contextSummary: res.context_summary,
      };
      setMessages((prev) => [...prev, assistantTurn]);
      setContextData((prev) =>
        prev
          ? {
              ...prev,
              context: res.context,
              outage_remaining_seconds: 0,
            }
          : prev
      );
    } catch (err) {
      // Remove the unsent trailing turn if the server rejected it so the user can edit & retry.
      setMessages(messages);
      if (!textOverride) {
        setPrompt(content);
      }
      if (err instanceof ClientApiError) {
        setSendError(err);
      } else {
        setSendError(new ClientApiError(500, "client_error", "Chat request failed."));
      }
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitMessage();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitMessage();
    }
  };

  if (contextError) {
    return (
      <AuthRequiredPanel
        error={contextError}
        onOpenApiKeyModal={onOpenApiKeyModal}
        onRetry={() => void loadContext(trainerId)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">AI Chat Tester</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Test Lily&apos;s @mention replies with multi-turn thread memory, simulated reply context, and live club standings.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadContext(trainerId)}
          disabled={loadingContext}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingContext ? "animate-spin" : ""}`} />
          <span>Refresh Context</span>
        </button>
      </div>

      {contextData && !contextData.ai_enabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-xs text-amber-900">
          AI router is not configured on the server. Set <span className="font-mono">AI_ROUTER_URL</span> and{" "}
          <span className="font-mono">AI_ROUTER_API_KEY</span> in your environment to enable live replies. Live club context is still previewed below.
        </div>
      )}

      {contextData && contextData.outage_remaining_seconds > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-xs text-amber-900">
          AI router backoff active after an upstream error. Retry in about{" "}
          <span className="font-mono tabular-nums">{contextData.outage_remaining_seconds}s</span>.
        </div>
      )}

      {sendError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-xs text-rose-800">
          <span className="font-medium">{sendError.code}:</span> {sendError.message}
          {sendError.retryAfterSeconds ? ` (Retry after ${sendError.retryAfterSeconds}s)` : ""}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-900">Chat Thread</span>
              <span aria-hidden="true"> · </span>
              <span className="font-mono">model: {contextData?.model ?? "auto"}</span>
              {contextData && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono tabular-nums">
                    cooldown: {contextData.cooldown_seconds}s
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setSendError(null);
              }}
              disabled={messages.length === 0 || sending}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="chat-replied-text"
                className="block text-[11px] font-medium text-slate-600 mb-1"
              >
                Simulated replied-to message (optional)
              </label>
              <input
                id="chat-replied-text"
                type="text"
                value={repliedText}
                onChange={(e) => setRepliedText(e.target.value)}
                placeholder="e.g. Just hit 500k fans before reset!"
                maxLength={2000}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="chat-trainer-id"
                className="block text-[11px] font-medium text-slate-600 mb-1"
              >
                Simulate linked trainer ID (optional)
              </label>
              <input
                id="chat-trainer-id"
                type="text"
                value={trainerId}
                onChange={(e) => setTrainerId(e.target.value)}
                placeholder="Trainer ID from roster"
                maxLength={32}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 min-h-[320px] max-h-[480px] overflow-y-auto px-5 py-4 space-y-4">
            {messages.length === 0 ? (
              <div className="space-y-4 py-6">
                <p className="text-sm text-slate-600">
                  Start a multi-turn thread to verify Lily&apos;s answers against live club standings, or click a prompt below:
                </p>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_PROMPTS.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      disabled={sending || !contextData?.ai_enabled}
                      onClick={() => void submitMessage(sample)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "ml-6 border-blue-200 bg-blue-50/60 text-slate-900"
                      : "mr-6 border-slate-200 bg-slate-50 text-slate-900"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">
                      {msg.role === "user" ? "You" : "Lily"}
                    </span>
                    {msg.role === "assistant" && (
                      <span className="font-mono tabular-nums">
                        {msg.model ?? "auto"}
                        {msg.latencyMs !== undefined ? ` · ${msg.latencyMs}ms` : ""}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words leading-relaxed text-[13px]">
                    {msg.content}
                  </p>
                </div>
              ))
            )}

            {sending && (
              <div className="mr-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Waiting for AI router response...
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4">
            <div className="flex items-end gap-3">
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Lily about fan gains, standings, or anything in your thread..."
                maxLength={2000}
                className="min-h-[44px] flex-1 resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || !prompt.trim() || !contextData?.ai_enabled}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send</span>
              </button>
            </div>
          </form>
        </section>

        <aside className="rounded-xl border border-slate-200 bg-white p-5 space-y-5 self-start">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Live Club Context</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Data injected into Lily&apos;s prompt on every mention or chat test turn.
            </p>
            {contextData?.context.generated_at && (
              <p className="mt-1.5 font-mono text-[11px] text-slate-500 tabular-nums">
                Snapshot {formatUtcDateTime(contextData.context.generated_at)}
              </p>
            )}
          </div>

          {contextData?.context.linked_trainer && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <p className="font-semibold text-slate-900">
                Linked Trainer · {contextData.context.linked_trainer.name}
              </p>
              <p className="text-slate-600">
                {contextData.context.linked_trainer.club_label} ·{" "}
                <span className="font-mono tabular-nums">
                  {formatInt(contextData.context.linked_trainer.fans)} fans
                </span>
              </p>
              <p className="font-mono text-[11px] text-slate-700 tabular-nums">
                Daily:{" "}
                {contextData.context.linked_trainer.daily_gain !== null
                  ? `${formatGain(contextData.context.linked_trainer.daily_gain)} (#${contextData.context.linked_trainer.daily_rank})`
                  : "n/a"}
              </p>
            </div>
          )}

          {loadingContext && !contextData ? (
            <div className="space-y-3">
              <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />
              <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />
            </div>
          ) : (
            <div className="space-y-4">
              {contextData?.context.clubs.map((club) => (
                <div key={club.key} className="rounded-lg border border-slate-200 p-3.5 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      {club.name ? `${club.label} (${club.name})` : club.label}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {club.member_count} members
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                    Synced {formatUtcDateTime(club.last_synced_at)}
                  </p>
                  {club.top_daily.length === 0 ? (
                    <p className="text-xs text-slate-400">No synced daily leaders yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 pt-1 text-xs">
                      {club.top_daily.slice(0, 5).map((row) => (
                        <div
                          key={row.trainer_id}
                          className="flex items-center justify-between gap-2 py-1"
                        >
                          <span className="truncate text-slate-700">
                            <span className="font-mono text-slate-400 mr-1.5">#{row.rank}</span>
                            {row.name}
                          </span>
                          <span className="font-mono text-[11px] font-medium text-emerald-700 tabular-nums shrink-0">
                            {row.has_baseline ? formatGain(row.gain) : "+0*"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
