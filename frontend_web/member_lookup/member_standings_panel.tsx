import { MemberData, Period } from "../api_client/frontend_types";

interface MemberStandingsPanelProps {
  member: MemberData | null;
  loading: boolean;
  error: string | null;
}

const PERIOD_LABELS: ReadonlyArray<{ key: Period; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

export function MemberStandingsPanel({ member, loading, error }: MemberStandingsPanelProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-100" />
        <div className="h-24 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-900">Search for any active club trainer.</p>
        <p className="mt-1 text-xs text-slate-500">
          Enter a numeric trainer ID above or select a member row from the leaderboard.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-900">{member.name}</h2>
          <p className="mt-1 text-xs text-slate-500">
            Trainer ID <span className="font-mono">{member.trainer_id}</span> ·{" "}
            {member.club.name || member.club.label} · Roster of {member.roster_size}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium text-slate-500">Total Fans</div>
          <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {member.fans.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PERIOD_LABELS.map(({ key, label }) => {
          const stats = member.periods[key];
          return (
            <div key={key} className="rounded-lg bg-slate-50 p-4">
              <div className="text-xs font-medium text-slate-500">{label} Gain</div>
              <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {stats
                  ? stats.has_baseline
                    ? `+${stats.gain.toLocaleString()}`
                    : "Pending"
                  : "N/A"}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
                {stats ? `Rank #${stats.rank} of ${member.roster_size}` : "No data"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
