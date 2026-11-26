import { Search } from "lucide-react";

import { StandingEntry } from "../api_client/frontend_types";

interface StandingsTableProps {
  entries: StandingEntry[];
  filterText: string;
  onFilterChange: (value: string) => void;
  onSelectTrainer: (trainerId: string) => void;
  onSync: () => void;
  loading: boolean;
  error: string | null;
}

export function StandingsTable({
  entries,
  filterText,
  onFilterChange,
  onSelectTrainer,
  onSync,
  loading,
  error,
}: StandingsTableProps) {
  const query = filterText.trim().toLowerCase();
  const filtered = query
    ? entries.filter(
        (e) =>
          e.name.toLowerCase().includes(query) || e.trainer_id.toLowerCase().includes(query)
      )
    : entries;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-lg font-semibold text-slate-900">Member Standings</h2>
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filterText}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="Filter by trainer name or ID"
            aria-label="Filter standings by trainer name or ID"
            className="min-h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-10 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">
            {entries.length === 0
              ? "No club standings recorded yet."
              : "No members match that filter."}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {entries.length === 0
              ? "Run a club sync once your uma.moe API key is configured to populate member totals."
              : "Clear the search input to view all active club members."}
          </p>
          {entries.length === 0 && (
            <button
              type="button"
              onClick={onSync}
              className="mt-4 min-h-10 cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Sync Clubs
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Trainer</th>
                <th className="px-4 py-3">Trainer ID</th>
                <th className="px-4 py-3 text-right">Period Gain</th>
                <th className="px-4 py-3 text-right">Total Fans</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => (
                <tr
                  key={row.trainer_id}
                  onClick={() => onSelectTrainer(row.trainer_id)}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-slate-600 tabular-nums">
                    #{row.rank}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums">
                    {row.trainer_id}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-emerald-700 tabular-nums">
                    {row.has_baseline ? `+${row.gain.toLocaleString()}` : "Baseline pending"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 tabular-nums">
                    {row.fans.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
