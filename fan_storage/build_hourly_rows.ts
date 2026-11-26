import { HourlyHistoryResult, HourlyRow } from "../domain_models/types.js";
import { dayResetWindow } from "../time_boundaries/day_reset_window.js";
import { formatIso } from "../time_boundaries/format_iso.js";
import { computeGain } from "./compute_gain.js";

export interface HourSnapshotPoint {
  trainerId: string;
  hourIso: string;
  fans: number;
}

export interface ActiveRosterEntry {
  trainerId: string;
  fans: number;
}

function formatUtcHm(iso: string): string {
  const dt = new Date(iso);
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function buildHourlyRows(options: {
  day: "today" | "yesterday";
  now: Date;
  roster: ActiveRosterEntry[];
  snapshots: HourSnapshotPoint[];
  singleTrainerId?: string;
}): HourlyHistoryResult {
  const { day, now, roster, snapshots, singleTrainerId } = options;
  const { gameDay, startUtc, endUtc } = dayResetWindow(day, now);
  const startIso = formatIso(startUtc);
  const endIso = formatIso(endUtc);

  const byHour = new Map<string, Map<string, number>>();
  for (const snap of snapshots) {
    if (snap.hourIso < startIso || snap.hourIso > endIso) continue;
    let map = byHour.get(snap.hourIso);
    if (!map) {
      map = new Map<string, number>();
      byHour.set(snap.hourIso, map);
    }
    map.set(snap.trainerId, snap.fans);
  }

  const hours = Array.from(byHour.keys()).sort();
  if (hours.length === 0) {
    return {
      gameDay,
      startedAtIso: null,
      startedLate: false,
      rows: [],
      total: 0,
      noBaselineForTrainer: Boolean(singleTrainerId),
    };
  }

  const baseHour = hours[0];
  const baseMap = byHour.get(baseHour)!;
  const startedLate = baseHour > startIso;
  const activeSet = roster.filter((m) => baseMap.has(m.trainerId));

  if (singleTrainerId && !activeSet.some((m) => m.trainerId === singleTrainerId)) {
    return {
      gameDay,
      startedAtIso: baseHour,
      startedLate,
      rows: [],
      total: 0,
      noBaselineForTrainer: true,
    };
  }

  const prevTotals = new Map<string, number>();
  for (const m of activeSet) {
    prevTotals.set(m.trainerId, baseMap.get(m.trainerId)!);
  }

  const rows: HourlyRow[] = [];
  let running = 0;

  for (let i = 1; i < hours.length; i += 1) {
    const hIso = hours[i];
    const hMap = byHour.get(hIso)!;
    const prevHourMs = Date.parse(hours[i - 1]);
    const currHourMs = Date.parse(hIso);
    const gapHours = Math.max(1, Math.round((currHourMs - prevHourMs) / 3_600_000));

    let delta = 0;
    for (const m of activeSet) {
      const currentVal = hMap.get(m.trainerId);
      if (currentVal === undefined) continue;
      const prevVal = prevTotals.get(m.trainerId) ?? null;
      delta += computeGain(currentVal, prevVal);
      prevTotals.set(m.trainerId, currentVal);
    }

    running += delta;
    const labelBase = formatUtcHm(hIso);
    rows.push({
      hourIso: hIso,
      label: gapHours > 1 ? `${labelBase} (${gapHours}h)` : labelBase,
      thisHour: delta,
      sinceReset: running,
      inProgress: false,
      gapHours,
    });
  }

  if (day === "today" && now.getTime() >= Date.parse(hours[hours.length - 1])) {
    let liveDelta = 0;
    for (const m of activeSet) {
      const prevVal = prevTotals.get(m.trainerId) ?? null;
      liveDelta += computeGain(m.fans, prevVal);
    }
    running += liveDelta;
    rows.push({
      hourIso: formatIso(now),
      label: `${formatUtcHm(formatIso(now))}*`,
      thisHour: liveDelta,
      sinceReset: running,
      inProgress: true,
      gapHours: 1,
    });
  }

  return {
    gameDay,
    startedAtIso: baseHour,
    startedLate,
    rows,
    total: running,
    noBaselineForTrainer: false,
  };
}
