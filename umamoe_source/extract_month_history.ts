import { formatYmd } from "../time_boundaries/format_ymd.js";

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function extractMonthHistory(
  row: Record<string, unknown>
): Array<readonly [string, number]> {
  const values = row.daily_fans;
  const year = row.year;
  const month = row.month;
  if (!Array.isArray(values) || !isInt(year) || !isInt(month) || month < 1 || month > 12) {
    return [];
  }

  const known: Array<readonly [number, number]> = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (isInt(v) && v !== 0) {
      known.push([i, Math.abs(v)]);
    }
  }

  if (known.length <= 1) return [];
  const out: Array<readonly [string, number]> = [];
  for (const [i, v] of known.slice(0, -1)) {
    const dt = new Date(Date.UTC(year, month - 1, 1 + i + 1));
    out.push([formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()), v]);
  }
  return out;
}
