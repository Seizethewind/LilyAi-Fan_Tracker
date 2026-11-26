import { computeGain } from "./storage/store.js";

export const DAYS = ["today", "yesterday"] as const;
export type HourlyDay = (typeof DAYS)[number];

export interface HourRowInput {
  trainerId: string;
  hour: Date;
  fans: number;
}

export interface HourLine {
  time: Date;
  hours: number;
  gain: number;
  sinceReset: number;
  live: boolean;
}

export interface HourlyHistory {
  dayStart: Date;
  dayEnd: Date;
  lines: HourLine[];
  firstMark: Date | null;
  counted: boolean;
  total: number;
  startsLate: boolean;
}

/**
 * Pure hourly fan gain history builder matching fantracker/hourly.py.
 *
 * - Only current members appear.
 * - Only members present at the first stored hour of the day are counted.
 * - Missed hours carry the full gap on the next stored mark (`hours > 1`).
 * - When `current` is provided (for `today`), appends a live in-progress row (`live: true, hours: 0`).
 */
export function buildHistory(
  rows: readonly HourRowInput[],
  current: ReadonlyMap<string, number> | null,
  dayStart: Date,
  dayEnd: Date,
  liveTime: Date,
  only?: string
): HourlyHistory {
  const byMember = new Map<string, Map<number, number>>();
  const markSet = new Set<number>();

  for (const row of rows) {
    const ts = row.hour.getTime();
    let perMember = byMember.get(row.trainerId);
    if (!perMember) {
      perMember = new Map<number, number>();
      byMember.set(row.trainerId, perMember);
    }
    perMember.set(ts, row.fans);
    markSet.add(ts);
  }

  const marks = Array.from(markSet).sort((a, b) => a - b);
  if (marks.length === 0) {
    return {
      dayStart,
      dayEnd,
      lines: [],
      firstMark: null,
      counted: true,
      total: 0,
      startsLate: false,
    };
  }

  const firstTs = marks[0];
  const firstMark = new Date(firstTs);
  const startsLate = firstMark.getTime() > dayStart.getTime();

  let previous = new Map<string, number>();
  for (const [trainerId, perMember] of byMember.entries()) {
    const val = perMember.get(firstTs);
    if (val !== undefined) {
      previous.set(trainerId, val);
    }
  }

  if (only !== undefined) {
    const onlyStart = previous.get(only);
    if (onlyStart === undefined) {
      return {
        dayStart,
        dayEnd,
        lines: [],
        firstMark,
        counted: false,
        total: 0,
        startsLate,
      };
    }
    previous = new Map([[only, onlyStart]]);
  }

  const lines: HourLine[] = [];
  let running = 0;
  let lastMarkTs = firstTs;

  for (const markTs of marks.slice(1)) {
    let gain = 0;
    for (const [trainerId, prevFans] of previous.entries()) {
      const fans = byMember.get(trainerId)?.get(markTs);
      if (fans === undefined) continue;
      gain += computeGain(fans, prevFans);
      previous.set(trainerId, fans);
    }
    running += gain;
    const hours = Math.max(1, Math.round((markTs - lastMarkTs) / 3_600_000));
    lines.push({
      time: new Date(markTs),
      hours,
      gain,
      sinceReset: running,
      live: false,
    });
    lastMarkTs = markTs;
  }

  if (current !== null) {
    let liveGain = 0;
    for (const [trainerId, before] of previous.entries()) {
      const nowFans = current.get(trainerId);
      if (nowFans !== undefined) {
        liveGain += computeGain(nowFans, before);
      }
    }
    running += liveGain;
    lines.push({
      time: liveTime,
      hours: 0,
      gain: liveGain,
      sinceReset: running,
      live: true,
    });
  }

  return {
    dayStart,
    dayEnd,
    lines,
    firstMark,
    counted: true,
    total: lines.length > 0 ? lines[lines.length - 1].sinceReset : 0,
    startsLate,
  };
}
