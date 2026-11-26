import { HourlyHistoryData } from "./frontend_types";

export async function fetchHourly(
  club: string,
  day: "today" | "yesterday"
): Promise<HourlyHistoryData> {
  const params = new URLSearchParams({ club, day });
  const res = await fetch(`/api/dashboard/hourly?${params.toString()}`);
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.error?.message ?? "Could not load hourly history.");
  }
  return payload as HourlyHistoryData;
}
