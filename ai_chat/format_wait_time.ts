function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export function formatWaitTime(seconds: number): string {
  const secs = Math.max(1, Math.ceil(seconds));
  if (secs < 60) return plural(secs, "second");
  const mins = Math.ceil(secs / 60);
  if (mins < 60) return plural(mins, "minute");
  return plural(Math.ceil(mins / 60), "hour");
}
