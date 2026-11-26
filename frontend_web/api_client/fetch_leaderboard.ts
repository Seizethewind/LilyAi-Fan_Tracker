import { LeaderboardData, Period } from "./frontend_types";

export async function fetchLeaderboard(
  club: string,
  period: Period,
  top = 30
): Promise<LeaderboardData> {
  const params = new URLSearchParams({ club, period, top: String(top) });
  const res = await fetch(`/api/dashboard/leaderboard?${params.toString()}`);
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.error?.message ?? "Could not load leaderboard.");
  }
  return payload as LeaderboardData;
}
