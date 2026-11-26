import { useCallback, useEffect, useState } from "react";

import { fetchHourly } from "../api_client/fetch_hourly";
import { HourlyHistoryData } from "../api_client/frontend_types";
import { ClubSelector } from "../leaderboard_view/club_selector";
import { HourlyTable } from "./hourly_table";

interface HourlySectionProps {
  refreshSignal: number;
  onSync: () => void;
}

export function HourlySection({ refreshSignal, onSync }: HourlySectionProps) {
  const [selectedClub, setSelectedClub] = useState("club1");
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [data, setData] = useState<HourlyHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHourly = useCallback(async (clubKey: string, d: "today" | "yesterday") => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchHourly(clubKey, d));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load hourly history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHourly(selectedClub, day);
  }, [loadHourly, selectedClub, day, refreshSignal]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Hourly Fan Gain History
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Hour-by-hour UTC progression since the 15:00 UTC reset
            {data ? ` · Game day ${data.game_day}` : ""}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {data && (
            <ClubSelector
              clubs={data.clubs}
              selectedClub={selectedClub}
              onSelectClub={setSelectedClub}
            />
          )}
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(["today", "yesterday"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setDay(opt)}
                className={`min-h-9 cursor-pointer rounded-md px-3.5 py-1.5 text-sm font-medium capitalize whitespace-nowrap shrink-0 transition-colors ${
                  day === opt
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <HourlyTable
        rows={data?.rows ?? []}
        total={data?.total ?? 0}
        startedLate={data?.started_late ?? false}
        startedAt={data?.started_at ?? null}
        loading={loading}
        error={error}
        onSync={onSync}
      />
    </section>
  );
}
