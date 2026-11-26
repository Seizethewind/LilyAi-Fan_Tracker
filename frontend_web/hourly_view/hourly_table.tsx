import { HourlyRowItem } from "../api_client/frontend_types";

interface HourlyTableProps {
  rows: HourlyRowItem[];
  total: number;
  startedLate: boolean;
  startedAt: string | null;
  loading: boolean;
  error: string | null;
  onSync: () => void;
}

export function HourlyTable({
  rows,
  total,
  startedLate,
  startedAt,
  loading,
  error,
  onSync,
}: HourlyTableProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="h-10 animate-pulse rounded-md bg-slate-100" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-900">No hourly snapshots recorded yet.</p>
        <p className="mt-1 text-xs text-slate-500">
          Hourly totals populate automatically on the first sync inside each UTC hour.
        </p>
        <button
          type="button"
          onClick={onSync}
          className="mt-4 min-h-10 cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Sync Clubs
        </button>
      </div>
    );
  }

  const startedLabel = startedAt
    ? `${String(new Date(startedAt).getUTCHours()).padStart(2, "0")}:${String(
        new Date(startedAt).getUTCMinutes()
      ).padStart(2, "0")} UTC`
    : null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <th className="px-4 py-3">UTC Hour</th>
              <th className="px-4 py-3 text-right">This Hour</th>
              <th className="px-4 py-3 text-right">Since Reset</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.hour_iso} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-slate-700 tabular-nums">
                  {row.label}
                  {row.in_progress ? " (in progress)" : ""}
                </td>
                <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">
                  +{row.this_hour.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono font-medium text-slate-900 tabular-nums">
                  +{row.since_reset.toLocaleString()}
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
              <td className="px-4 py-3 text-slate-900">Total</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right font-mono text-slate-900 tabular-nums">
                +{total.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {startedLate && startedLabel && (
        <p className="text-xs text-slate-500">Hourly tracking began at {startedLabel}.</p>
      )}
    </div>
  );
}
