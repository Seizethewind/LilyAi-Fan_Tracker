import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { ClientApiError, fetchClubHourly, fetchMemberHourly } from "../api";
import { formatGain, formatUtcTime, normalizeTrainerInput } from "../format";
import { ClubHourlyResponse, ClubStatus, HourlyDay, MemberHourlyResponse } from "../types";
import { AuthRequiredPanel } from "./AuthRequiredPanel";

interface HourlyViewProps {
  clubs: ClubStatus[];
  apiKeyVersion: number;
  syncVersion: number;
  onOpenApiKeyModal: () => void;
}

function formatHourLabel(isoTime: string, hours: number, live: boolean): string {
  const dt = new Date(isoTime);
  if (Number.isNaN(dt.getTime())) return isoTime;
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  const base = `${hh}:${mm}`;
  if (live) return `${base}*`;
  return hours > 1 ? `${base} (${hours}h)` : base;
}

export function HourlyView({
  clubs,
  apiKeyVersion,
  syncVersion,
  onOpenApiKeyModal,
}: HourlyViewProps) {
  const [target, setTarget] = useState<string>("club1");
  const [day, setDay] = useState<HourlyDay>("today");
  const [trainerInput, setTrainerInput] = useState("");
  const [activeTrainerId, setActiveTrainerId] = useState("");
  const [data, setData] = useState<ClubHourlyResponse | MemberHourlyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ClientApiError | null>(null);

  const clubTabs = useMemo(() => {
    const base =
      clubs.length >= 2
        ? clubs.map((c) => ({ key: c.key, label: c.label }))
        : [
            { key: "club1", label: "Club 1" },
            { key: "club2", label: "Club 2" },
          ];
    return [...base, { key: "trainer", label: "Trainer ID" }];
  }, [clubs]);

  const loadData = useCallback(async () => {
    if (target === "trainer" && !activeTrainerId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result =
        target === "trainer"
          ? await fetchMemberHourly(activeTrainerId, day)
          : await fetchClubHourly(target, day);
      setData(result);
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError(err);
      } else {
        setError(new ClientApiError(500, "client_error", "Failed to load hourly history."));
      }
    } finally {
      setLoading(false);
    }
  }, [target, day, activeTrainerId]);

  useEffect(() => {
    void loadData();
  }, [loadData, apiKeyVersion, syncVersion]);

  const handleTrainerSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeTrainerInput(trainerInput.trim());
    if (cleaned) {
      setActiveTrainerId(cleaned);
    }
  };

  const maxLineGain = useMemo(() => {
    if (!data || data.lines.length === 0) return 1;
    return Math.max(1, ...data.lines.map((l) => l.gain));
  }, [data]);

  const memberName = data && "name" in data ? data.name : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Hourly Fan Gain</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Hour-by-hour progress captured at every UTC hour since the 15:00 UTC reset.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
            {clubTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTarget(tab.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  target === tab.key
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
            {(["today", "yesterday"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                  day === d
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {target === "trainer" && (
        <form onSubmit={handleTrainerSubmit} className="flex items-center gap-2.5 max-w-md">
          <input
            type="text"
            value={trainerInput}
            onChange={(e) => setTrainerInput(e.target.value)}
            placeholder="Enter trainer ID (spaces and hyphens ignored)"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            Load History
          </button>
        </form>
      )}

      {error ? (
        error.status === 404 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            {error.message}
          </div>
        ) : (
          <AuthRequiredPanel
            error={error}
            onOpenApiKeyModal={onOpenApiKeyModal}
            onRetry={() => void loadData()}
          />
        )
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-9 rounded bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : target === "trainer" && !activeTrainerId ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Clock className="mx-auto h-6 w-6 text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-900">Enter a trainer ID</p>
          <p className="mt-1 text-xs text-slate-500">
            Inspect hourly fan gain for any active member on either club roster.
          </p>
        </div>
      ) : data ? (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {memberName ? `${memberName} · ${data.club.label}` : data.club.name || data.club.label}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                <span>Game day </span>
                <span className="font-mono tabular-nums">{data.game_day}</span>
                {data.starts_late && data.first_mark && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span>Tracking began {formatUtcTime(data.first_mark)}</span>
                  </>
                )}
              </p>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-500">Total since reset</div>
              <div className="font-mono text-base font-semibold text-emerald-700 tabular-nums">
                {formatGain(data.total)}
              </div>
            </div>
          </div>

          {!data.counted ? (
            <div className="px-6 py-10 text-center text-sm text-slate-600">
              Joined during this game day, so hourly gains start counting from the next 15:00 UTC reset.
            </div>
          ) : data.lines.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No hourly data yet. Snapshots are recorded at every full UTC hour starting after the first sync.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 pl-5 pr-3 w-32">UTC</th>
                    <th className="py-2.5 px-3">Hourly Pace</th>
                    <th className="py-2.5 px-3 text-right w-36">This hour</th>
                    <th className="py-2.5 pl-3 pr-5 text-right w-40">Since reset</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {data.lines.map((line) => {
                    const widthPct = Math.max(2, Math.round((line.gain / maxLineGain) * 100));
                    return (
                      <tr key={line.time} className="h-10 hover:bg-slate-50 transition-colors">
                        <td className="pl-5 pr-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {formatHourLabel(line.time, line.hours, line.live)}
                        </td>
                        <td className="px-3">
                          <div className="h-2 w-full max-w-xs rounded bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded ${
                                line.live ? "bg-amber-500" : "bg-blue-600"
                              }`}
                              style={{ width: `${line.gain > 0 ? widthPct : 0}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                          {formatGain(line.gain)}
                        </td>
                        <td className="pl-3 pr-5 text-right font-mono text-xs font-medium text-emerald-700 tabular-nums">
                          {formatGain(line.since_reset)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data.lines.some((l) => l.live) && (
            <div className="border-t border-slate-200 bg-slate-50/50 px-5 py-2.5 text-xs text-slate-500">
              <span className="font-mono">*</span> indicates the hour still in progress, computed from the latest sync.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
