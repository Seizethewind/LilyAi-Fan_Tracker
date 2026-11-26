import { useCallback, useEffect, useState } from "react";

import { fetchLeaderboard } from "../api_client/fetch_leaderboard";
import { LeaderboardData, Period } from "../api_client/frontend_types";
import { ClubSelector } from "./club_selector";
import { LeaderboardSummary } from "./leaderboard_summary";
import { PeriodTabs } from "./period_tabs";
import { StandingsTable } from "./standings_table";

interface LeaderboardSectionProps {
  refreshSignal: number;
  onSelectTrainer: (trainerId: string) => void;
  onSync: () => void;
}

export function LeaderboardSection({
  refreshSignal,
  onSelectTrainer,
  onSync,
}: LeaderboardSectionProps) {
  const [selectedClub, setSelectedClub] = useState("club1");
  const [period, setPeriod] = useState<Period>("daily");
  const [filterText, setFilterText] = useState("");
  const [board, setBoard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBoard = useCallback(async (clubKey: string, p: Period) => {
    setLoading(true);
    setError(null);
    try {
      setBoard(await fetchLeaderboard(clubKey, p, 30));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard(selectedClub, period);
  }, [loadBoard, selectedClub, period, refreshSignal]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Club Fan Leaderboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Daily, weekly, and monthly club fan gains anchored to 15:00 UTC resets.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {board && (
            <ClubSelector
              clubs={board.clubs}
              selectedClub={selectedClub}
              onSelectClub={setSelectedClub}
            />
          )}
          <PeriodTabs period={period} onSelectPeriod={setPeriod} />
        </div>
      </div>

      {board && (
        <LeaderboardSummary
          club={board.club}
          entries={board.entries}
          resetsAt={board.resets_at}
        />
      )}

      <StandingsTable
        entries={board?.entries ?? []}
        filterText={filterText}
        onFilterChange={setFilterText}
        onSelectTrainer={onSelectTrainer}
        onSync={onSync}
        loading={loading}
        error={error}
      />
    </section>
  );
}
