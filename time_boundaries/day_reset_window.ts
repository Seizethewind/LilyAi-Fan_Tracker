import { DAY_MS, JST_OFFSET_MS, jstDateParts } from "./jst_date_parts.js";
import { formatYmd } from "./format_ymd.js";

export interface DayResetWindow {
  day: "today" | "yesterday";
  gameDay: string;
  startUtc: Date;
  endUtc: Date;
}

export function dayResetWindow(day: "today" | "yesterday", now: Date): DayResetWindow {
  const { year, month, day: d } = jstDateParts(now);
  const todayUtc = Date.UTC(year, month - 1, d);
  const targetUtc = day === "yesterday" ? todayUtc - DAY_MS : todayUtc;
  const targetDate = new Date(targetUtc);
  const gameDayStr = formatYmd(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth() + 1,
    targetDate.getUTCDate()
  );

  // Game day YYYY-MM-DD in JST starts at (YYYY-MM-DD - 1) 15:00 UTC.
  const startUtc = new Date(targetUtc - DAY_MS - JST_OFFSET_MS);
  const endUtc = day === "yesterday" ? new Date(targetUtc - JST_OFFSET_MS) : now;
  return { day, gameDay: gameDayStr, startUtc, endUtc };
}
