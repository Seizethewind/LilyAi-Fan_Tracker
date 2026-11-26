import { FormEvent, useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { ClientApiError, fetchMember, fetchMemberHourly } from "../api";
import { formatGain, formatInt, formatUtcTime, normalizeTrainerInput } from "../format";
import { MemberHourlyResponse, MemberResponse, Period } from "../types";
import { AuthRequiredPanel } from "./AuthRequiredPanel";

interface TrainerViewProps {
  initialTrainerId: string;
  apiKeyVersion: number;
  syncVersion: number;
  onOpenApiKeyModal: () => void;
}

const PERIOD_LABELS: Array<{ key: Period; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

export function TrainerView({
  initialTrainerId,
  apiKeyVersion,
  syncVersion,
  onOpenApiKeyModal,
}: TrainerViewProps) {
  const [input, setInput] = useState(initialTrainerId);
  const [queryId, setQueryId] = useState(initialTrainerId);
  const [member, setMember] = useState<MemberResponse | null>(null);
  const [hourly, setHourly] = useState<MemberHourlyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClientApiError | null>(null);

  useEffect(() => {
    if (initialTrainerId) {
      setInput(initialTrainerId);
      setQueryId(initialTrainerId);
    }
  }, [initialTrainerId]);

  const loadTrainer = useCallback(async (trainerId: string) => {
    if (!trainerId) {
      setMember(null);
      setHourly(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [m, h] = await Promise.all([
        fetchMember(trainerId),
        fetchMemberHourly(trainerId, "today"),
      ]);
      setMember(m);
      setHourly(h);
    } catch (err) {
      setMember(null);
      setHourly(null);
      if (err instanceof ClientApiError) {
        setError(err);
      } else {
        setError(new ClientApiError(500, "client_error", "Failed to look up trainer."));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrainer(queryId);
  }, [queryId, loadTrainer, apiKeyVersion, syncVersion]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeTrainerInput(input.trim());
    if (cleaned) {
      setQueryId(cleaned);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Trainer Lookup</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Inspect daily, weekly, and monthly club rank and fan gain for any active member.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2.5 max-w-lg">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste trainer ID (e.g. 123 456 789 012)"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
        >
          Look Up
        </button>
      </form>

      {error ? (
        error.status === 404 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            {error.message}
          </div>
        ) : (
          <AuthRequiredPanel
            error={error}
            onOpenApiKeyModal={onOpenApiKeyModal}
            onRetry={() => void loadTrainer(queryId)}
          />
        )
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="h-6 w-56 rounded bg-slate-100 animate-pulse" />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="h-20 rounded bg-slate-100 animate-pulse" />
            <div className="h-20 rounded bg-slate-100 animate-pulse" />
            <div className="h-20 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
      ) : !queryId ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-900">Search by trainer ID</p>
          <p className="mt-1 text-xs text-slate-500">
            Spaces and dashes are removed automatically, or click any trainer row on the Leaderboards tab.
          </p>
        </div>
      ) : member ? (
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{member.name}</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  <span className="font-mono tabular-nums">{member.trainer_id}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{member.club.name || member.club.label}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono tabular-nums">{member.roster_size} members</span>
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Current Total Fans</div>
                <div className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {formatInt(member.fans)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {PERIOD_LABELS.map(({ key, label }) => {
                const standing = member.periods[key];
                return (
                  <div key={key} className="border-t sm:border-t-0 sm:border-r last:border-r-0 border-slate-200 pt-3 sm:pt-0 sm:pr-4">
                    <div className="text-xs font-medium text-slate-500">{label}</div>
                    {standing ? (
                      <>
                        <div className="mt-1 font-mono text-lg font-semibold text-emerald-700 tabular-nums">
                          {formatGain(standing.gain)}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-600 font-mono tabular-nums">
                          Rank #{standing.rank} of {member.roster_size}
                          {!standing.has_baseline ? " · Join day" : ""}
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 text-xs text-slate-400">Unavailable</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {hourly && (
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-baseline justify-between border-b border-slate-200 px-5 py-3.5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Today's Hourly Progress ({hourly.game_day})
                </h3>
                <span className="font-mono text-xs font-medium text-emerald-700 tabular-nums">
                  {formatGain(hourly.total)}
                </span>
              </div>

              {!hourly.counted ? (
                <div className="px-5 py-6 text-xs text-slate-500">
                  Joined during this game day; hourly gains begin after the next 15:00 UTC reset.
                </div>
              ) : hourly.lines.length === 0 ? (
                <div className="px-5 py-6 text-xs text-slate-500">
                  No hourly snapshots recorded yet today.
                </div>
              ) : (
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                      <th className="py-2 pl-5 pr-3">UTC</th>
                      <th className="py-2 px-3 text-right">This hour</th>
                      <th className="py-2 pl-3 pr-5 text-right">Since reset</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                    {hourly.lines.map((line) => (
                      <tr key={line.time} className="h-9">
                        <td className="pl-5 pr-3 text-slate-700">
                          {formatUtcTime(line.time)}
                          {line.live ? "*" : line.hours > 1 ? ` (${line.hours}h)` : ""}
                        </td>
                        <td className="px-3 text-right text-slate-700">{formatGain(line.gain)}</td>
                        <td className="pl-3 pr-5 text-right font-medium text-emerald-700">
                          {formatGain(line.since_reset)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
