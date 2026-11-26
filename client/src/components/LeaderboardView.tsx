import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { ClientApiError, fetchLeaderboard } from "../api";
import { formatCountdown, formatGain, formatInt, formatUtcTime } from "../format";
import { ClubStatus, LeaderboardEntry, LeaderboardResponse, Period } from "../types";
import { AuthRequiredPanel } from "./AuthRequiredPanel";

interface LeaderboardViewProps {
  clubs: ClubStatus[];
  selectedClub: string;
  onSelectClub: (club: string) => void;
  apiKeyVersion: number;
  syncVersion: number;
  onOpenApiKeyModal: () => void;
  onSyncNow: () => void;
  onInspectTrainer: (trainerId: string) => void;
}

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const TOP_OPTIONS = [10, 15, 30] as const;

function ClubTablePanel({
  board,
  filterQuery,
  onInspectTrainer,
  onSyncNow,
}: {
  board: LeaderboardResponse;
  filterQuery: string;
  onInspectTrainer: (trainerId: string) => void;
  onSyncNow: () => void;
}) {
  const normalizedFilter = filterQuery.trim().toLowerCase();
  const filteredEntries = useMemo(() => {
    if (!normalizedFilter) return board.entries;
    return board.entries.filter(
      (row) =>
        row.name.toLowerCase().includes(normalizedFilter) ||
        row.trainer_id.toLowerCase().includes(normalizedFilter)
    );
  }, [board.entries, normalizedFilter]);

  const clubTitle = board.club.name || board.club.label;

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{clubTitle}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            <span>{board.club.label}</span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">{board.club.club_id}</span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">{board.club.member_count} members</span>
          </p>
        </div>

        <div className="text-xs text-slate-500 font-mono tabular-nums">
          <span>Updated {formatUtcTime(board.club.last_synced_at)}</span>
          <span aria-hidden="true"> · </span>
          <span>Resets {formatCountdown(board.resets_at)}</span>
        </div>
      </div>

      {board.club.last_error && (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-xs text-rose-800">
          Sync error: {board.club.last_error}
        </div>
      )}

      {board.entries.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-900">No roster data synced yet</p>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            Configure <span className="font-mono">UMAMOE_API_KEY</span> on the server and trigger a sync to populate{" "}
            {board.club.label} standings.
          </p>
          <button
            type="button"
            onClick={onSyncNow}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Run Sync</span>
          </button>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-slate-500">
          No trainers matching "{filterQuery}" in the top {board.top}.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 pl-5 pr-3 w-14 text-right font-mono">#</th>
                <th className="py-2.5 px-3">Trainer</th>
                <th className="py-2.5 px-3 text-right">Current Fans</th>
                <th className="py-2.5 pl-3 pr-5 text-right">Period Gain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredEntries.map((entry: LeaderboardEntry) => (
                <tr
                  key={entry.trainer_id}
                  onClick={() => onInspectTrainer(entry.trainer_id)}
                  className="h-10 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <td className="pl-5 pr-3 text-right font-mono text-xs text-slate-500 tabular-nums">
                    {entry.rank}
                  </td>
                  <td className="px-3">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="font-medium text-slate-900 truncate max-w-[220px]">
                        {entry.name}
                      </span>
                      <span className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
                        {entry.trainer_id}
                      </span>
                      {!entry.has_baseline && (
                        <span className="text-xs text-amber-700 shrink-0">Join day</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 text-right font-mono text-xs text-slate-600 tabular-nums">
                    {formatInt(entry.fans)}
                  </td>
                  <td
                    className={`pl-3 pr-5 text-right font-mono text-xs font-medium tabular-nums ${
                      entry.gain > 0 ? "text-emerald-700" : "text-slate-500"
                    }`}
                  >
                    {formatGain(entry.gain)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function LeaderboardView({
  clubs,
  selectedClub,
  onSelectClub,
  apiKeyVersion,
  syncVersion,
  onOpenApiKeyModal,
  onSyncNow,
  onInspectTrainer,
}: LeaderboardViewProps) {
  const [period, setPeriod] = useState<Period>("daily");
  const [top, setTop] = useState<number>(30);
  const [filterQuery, setFilterQuery] = useState("");
  const [boards, setBoards] = useState<LeaderboardResponse[]>([]);
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
    return [...base, { key: "both", label: "Side-by-Side" }];
  }, [clubs]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const targetKeys =
        selectedClub === "both"
          ? clubTabs.filter((t) => t.key !== "both").map((t) => t.key)
          : [selectedClub];
      const results = await Promise.all(
        targetKeys.map((key) => fetchLeaderboard(key, period, top))
      );
      setBoards(results);
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError(err);
      } else {
        setError(new ClientApiError(500, "client_error", "Failed to load leaderboard."));
      }
    } finally {
      setLoading(false);
    }
  }, [selectedClub, period, top, clubTabs]);

  useEffect(() => {
    void loadData();
  }, [loadData, apiKeyVersion, syncVersion]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Club Leaderboards</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Period fan gains computed from the first sync of each 15:00 UTC game day.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
            {clubTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelectClub(tab.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  selectedClub === tab.key
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  period === opt.value
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
            {TOP_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTop(n)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                  top === n
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Top {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter by trainer name or ID..."
            aria-label="Filter trainers"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {error ? (
        <AuthRequiredPanel
          error={error}
          onOpenApiKeyModal={onOpenApiKeyModal}
          onRetry={() => void loadData()}
        />
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="h-5 w-40 rounded bg-slate-100 animate-pulse" />
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="flex h-10 items-center justify-between px-5">
                <div className="h-3.5 w-48 rounded bg-slate-100 animate-pulse" />
                <div className="h-3.5 w-24 rounded bg-slate-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={`grid gap-6 ${boards.length > 1 ? "xl:grid-cols-2" : "grid-cols-1"}`}>
          {boards.map((board) => (
            <ClubTablePanel
              key={board.club.key}
              board={board}
              filterQuery={filterQuery}
              onInspectTrainer={onInspectTrainer}
              onSyncNow={onSyncNow}
            />
          ))}
        </div>
      )}
    </div>
  );
}
