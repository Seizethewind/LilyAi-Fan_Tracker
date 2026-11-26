import { Period } from "./models.js";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function utcNow(): Date {
  return new Date();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Returns the JST calendar date parts { year, month (1-12), day (1-31), weekday (0=Mon..6=Sun) }
 * corresponding to `moment` shifted by +9 hours (15:00 UTC reset = 00:00 JST).
 */
function jstDateParts(moment: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const jst = new Date(moment.getTime() + JST_OFFSET_MS);
  const utcDay = jst.getUTCDay(); // 0=Sun..6=Sat
  const weekday = (utcDay + 6) % 7; // 0=Mon..6=Sun
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
    weekday,
  };
}

export function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Game-day date string (YYYY-MM-DD in JST) that contains `now`.
 */
export function gameDay(now: Date): string {
  const { year, month, day } = jstDateParts(now);
  return formatYmd(year, month, day);
}

function firstOfNextMonthUtc(year: number, month: number): Date {
  if (month === 12) {
    return new Date(Date.UTC(year + 1, 0, 1));
  }
  return new Date(Date.UTC(year, month, 1));
}

/**
 * First game day (YYYY-MM-DD) of the period that contains `now`.
 */
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

/**
 * The UTC Date when the current period ends and the next one begins (15:00 UTC).
 */
export function nextReset(period: Period, now: Date): Date {
  const { year, month, day, weekday } = jstDateParts(now);
  const todayUtc = Date.UTC(year, month - 1, day);
  let followingUtc: number;

  if (period === "daily") {
    followingUtc = todayUtc + DAY_MS;
  } else if (period === "weekly") {
    const nextMondayUtc = todayUtc - weekday * DAY_MS + 7 * DAY_MS;
    const nextMonthUtc = firstOfNextMonthUtc(year, month).getTime();
    followingUtc = Math.min(nextMondayUtc, nextMonthUtc);
  } else if (period === "monthly") {
    followingUtc = firstOfNextMonthUtc(year, month).getTime();
  } else {
    throw new Error(`unknown period: ${String(period)}`);
  }

  // Convert JST midnight at `followingUtc` back to UTC by subtracting 9h.
  return new Date(followingUtc - JST_OFFSET_MS);
}

export function iso(moment: Date): string {
  return moment.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function parseIso(text: string | null | undefined): Date | null {
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
