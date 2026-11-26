import { Period } from "../domain_models/types.js";
import { formatYmd } from "./format_ymd.js";
import { DAY_MS, jstDateParts } from "./jst_date_parts.js";

export function periodStartDay(period: Period, now: Date): string {
  const { year, month, day, weekday } = jstDateParts(now);
  if (period === "daily") {
    return formatYmd(year, month, day);
  }
  if (period === "monthly") {
    return formatYmd(year, month, 1);
  }
  if (period === "weekly") {
    const todayUtc = Date.UTC(year, month - 1, day);
    const mondayUtc = todayUtc - weekday * DAY_MS;
    const monthStartUtc = Date.UTC(year, month - 1, 1);
    const start = new Date(Math.max(mondayUtc, monthStartUtc));
    return formatYmd(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate());
  }
  throw new Error(`unknown period: ${String(period)}`);
}
