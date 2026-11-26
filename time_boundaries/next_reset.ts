import { Period } from "../domain_models/types.js";
import { DAY_MS, JST_OFFSET_MS, jstDateParts } from "./jst_date_parts.js";

export function nextReset(period: Period, now: Date): Date {
  const { year, month, day, weekday } = jstDateParts(now);
  const todayUtc = Date.UTC(year, month - 1, day);
  const nextMonthUtc =
    month === 12 ? Date.UTC(year + 1, 0, 1) : Date.UTC(year, month, 1);

  let followingUtc: number;
  if (period === "daily") {
    followingUtc = todayUtc + DAY_MS;
  } else if (period === "weekly") {
    const nextMondayUtc = todayUtc - weekday * DAY_MS + 7 * DAY_MS;
    followingUtc = Math.min(nextMondayUtc, nextMonthUtc);
  } else if (period === "monthly") {
    followingUtc = nextMonthUtc;
  } else {
    throw new Error(`unknown period: ${String(period)}`);
  }

  return new Date(followingUtc - JST_OFFSET_MS);
}
