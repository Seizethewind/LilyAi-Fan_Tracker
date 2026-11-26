import { ClubSummary, StandingEntry } from "../api_client/frontend_types";

interface LeaderboardSummaryProps {
  club: ClubSummary;
  entries: StandingEntry[];
  resetsAt: string;
}

function formatSyncTime(isoText: string | null): string {
  if (!isoText) return "Not synced yet";
  const dt = new Date(isoText);
  return Number.isNaN(dt.getTime()) ? "Not synced yet" : dt.toLocaleString();
}

export function LeaderboardSummary({ club, entries, resetsAt }: LeaderboardSummaryProps) {
  const totalGain = entries.reduce((sum, row) => sum + row.gain, 0);
  const topMember = entries[0];
  const resetDate = new Date(resetsAt);
  const resetLabel = Number.isNaN(resetDate.getTime()) ? resetsAt : resetDate.toLocaleString();

  return (
    <div className="grid grid-cols-1 gap-4 border-b border-slate-200 pb-6 sm:grid-cols-3">
      <div>
        <div className="text-xs font-medium text-slate-500">Active Roster</div>
        <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
          {club.member_count.toLocaleString()}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Club ID {club.club_id} · Last sync {formatSyncTime(club.last_synced_at)}
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500">Tracked Period Gain</div>
        <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
          +{totalGain.toLocaleString()}
        </div>
        <div className="mt-1 text-xs text-slate-500">Resets {resetLabel}</div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500">Top Gainer</div>
        <div className="mt-1 truncate text-2xl font-semibold text-slate-900">
          {topMember ? topMember.name : "No data"}
        </div>
        <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
          {topMember ? `+${topMember.gain.toLocaleString()} fans` : "Sync clubs to populate"}
        </div>
      </div>
    </div>
  );
}
