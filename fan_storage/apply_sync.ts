import { ClubSnapshot, SyncResult } from "../domain_models/types.js";
import { formatIso } from "../time_boundaries/format_iso.js";
import { periodStartDay } from "../time_boundaries/period_start_day.js";
import { hourMark } from "./hour_mark.js";
import { StoreState } from "./store_types.js";

const HOUR_HISTORY_DAYS = 8;

export function applySync(state: StoreState, snapshot: ClubSnapshot, now: Date): SyncResult {
  if (snapshot.members.length === 0) {
    throw new Error("refusing to apply an empty roster");
  }

  const deduped = new Map(snapshot.members.map((m) => [m.trainerId, m]));
  const today = periodStartDay("daily", now);
  const mark = hourMark(now);
  const hourIso = formatIso(mark);
  const stamp = formatIso(now);
  const clubId = snapshot.clubId;

  const known = new Map<string, boolean>();
  for (const rec of state.members.values()) {
    if (rec.clubId === clubId) {
      known.set(rec.trainerId, rec.active);
    }
  }

  const todaySuffix = `:${today}`;
  let haveTodaySnapshot = false;
  for (const key of state.daySnapshots.keys()) {
    if (key.startsWith(`${clubId}:`) && key.endsWith(todaySuffix)) {
      haveTodaySnapshot = true;
      break;
    }
  }

  const hourSuffix = `:${hourIso}`;
  let haveHourSnapshot = false;
  for (const key of state.hourSnapshots.keys()) {
    if (key.startsWith(`${clubId}:`) && key.endsWith(hourSuffix)) {
      haveHourSnapshot = true;
      break;
    }
  }

  const joined: string[] = [];
  for (const trainerId of deduped.keys()) {
    if (!known.get(trainerId)) joined.push(trainerId);
  }

  const left: string[] = [];
  for (const [trainerId, active] of known.entries()) {
    if (active && !deduped.has(trainerId)) left.push(trainerId);
  }

  for (const member of deduped.values()) {
    const key = `${clubId}:${member.trainerId}`;
    const existing = state.members.get(key);
    state.members.set(key, {
      clubId,
      trainerId: member.trainerId,
      name: member.name,
      fans: member.fans,
      active: true,
      firstSeenAt: existing ? existing.firstSeenAt : stamp,
      lastSeenAt: stamp,
      leftAt: null,
    });
  }

  for (const rec of state.members.values()) {
    if (rec.clubId === clubId && rec.active && !deduped.has(rec.trainerId)) {
      rec.active = false;
      rec.leftAt = stamp;
    }
  }

  if (state.filled.get(clubId) !== today || joined.length > 0) {
    for (const m of deduped.values()) {
      for (const [day, fans] of m.history) {
        if (day <= today) {
          const dk = `${clubId}:${m.trainerId}:${day}`;
          if (!state.daySnapshots.has(dk)) state.daySnapshots.set(dk, fans);
        }
      }
    }
  }

  if (!haveTodaySnapshot) {
    for (const m of deduped.values()) {
      const dk = `${clubId}:${m.trainerId}:${today}`;
      if (!state.daySnapshots.has(dk)) state.daySnapshots.set(dk, m.fans);
    }
  }

  if (!haveHourSnapshot) {
    for (const m of deduped.values()) {
      const hk = `${clubId}:${m.trainerId}:${hourIso}`;
      if (!state.hourSnapshots.has(hk)) state.hourSnapshots.set(hk, m.fans);
    }
    const cutoff = formatIso(new Date(mark.getTime() - HOUR_HISTORY_DAYS * 24 * 60 * 60 * 1000));
    for (const key of state.hourSnapshots.keys()) {
      if (key.startsWith(`${clubId}:`)) {
        const storedHour = key.split(":").slice(2).join(":");
        if (storedHour < cutoff) state.hourSnapshots.delete(key);
      }
    }
  }

  const prevClub = state.clubs.get(clubId);
  state.clubs.set(clubId, {
    clubId,
    name: snapshot.clubName ?? prevClub?.name ?? null,
    lastSyncedAt: stamp,
    lastError: null,
    lastErrorAt: null,
  });
  state.filled.set(clubId, today);

  return {
    clubId,
    memberCount: deduped.size,
    joined,
    left,
    tookDaySnapshot: !haveTodaySnapshot,
  };
}
