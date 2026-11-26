const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatGameDayLabel(ymd: string): string {
  const [yStr, mStr, dStr] = ymd.split("-");
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const d = Number.parseInt(dStr, 10);
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAYS[dt.getUTCDay()] ?? "";
  const month = MONTHS[dt.getUTCMonth()] ?? "";
  const dayNum = String(dt.getUTCDate()).padStart(2, "0");
  return `${weekday} ${dayNum} ${month}`;
}
