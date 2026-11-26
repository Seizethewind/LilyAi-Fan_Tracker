export function extractCurrentFans(dailyFans: unknown): number | null {
  if (!Array.isArray(dailyFans)) return null;
  let latest: number | null = null;
  for (const value of dailyFans) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      latest = value;
    }
  }
  return latest;
}
