import { ClubInfo, ClubSnapshot, Period, StandingRow, SyncResult } from "../models.js";
import { iso, parseIso, periodStartDay } from "../timeutil.js";

interface ClubRecord {
  clubId: string;
  name: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

interface MemberRecord {
  clubId: string;
  trainerId: string;
  name: string;
  fans: number;
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  leftAt: string | null;
}

const HOUR_HISTORY_DAYS = 8;

export function hourMark(moment: Date): Date {
  const copy = new Date(moment.getTime());
  copy.setUTCMinutes(0, 0, 0);
  return copy;
}

export function computeGain(current: number, baseline: number | null): number {
  if (baseline === null) return 0;
  if (current < baseline) return current;
  return current - baseline;
}

/**
 * In-memory store preserving the exact gain, baseline, club transfer, and
 * hourly snapshot semantics of the original SQLite/Turso store.
 */
export class Store {
  private readonly clubs = new Map<string, ClubRecord>();
  // key: `${clubId}:${trainerId}`
  private readonly members = new Map<string, MemberRecord>();
  // key: `${clubId}:${trainerId}:${day}` -> fans
  private readonly daySnapshots = new Map<string, number>();
  // key: `${clubId}:${trainerId}:${hourIso}` -> fans
  private readonly hourSnapshots = new Map<string, number>();
  // key: discordId -> trainerId
  private readonly links = new Map<string, string>();
  private readonly filled = new Map<string, string>();

  private memberKey(clubId: string, trainerId: string): string {
    return `${clubId}:${trainerId}`;
  }

  private dayKey(clubId: string, trainerId: string, day: string): string {
    return `${clubId}:${trainerId}:${day}`;
  }

  private hourKey(clubId: string, trainerId: string, hourIso: string): string {
    return `${clubId}:${trainerId}:${hourIso}`;
  }

  applySync(snapshot: ClubSnapshot, now: Date): SyncResult {
    if (snapshot.members.length === 0) {
      throw new Error("refusing to apply an empty roster");
    }

    const deduped = new Map(snapshot.members.map((m) => [m.trainerId, m]));
    const today = periodStartDay("daily", now);
    const mark = hourMark(now);
    const hourIso = iso(mark);
    const stamp = iso(now);
    const clubId = snapshot.clubId;

    const known = new Map<string, boolean>();
    for (const rec of this.members.values()) {
      if (rec.clubId === clubId) {
        known.set(rec.trainerId, rec.active);
      }
    }

    let haveTodaySnapshot = false;
    const todaySuffix = `:${today}`;
    for (const key of this.daySnapshots.keys()) {
      if (key.startsWith(`${clubId}:`) && key.endsWith(todaySuffix)) {
        haveTodaySnapshot = true;
        break;
      }
    }

    let haveHourSnapshot = false;
    const hourSuffix = `:${hourIso}`;
    for (const key of this.hourSnapshots.keys()) {
      if (key.startsWith(`${clubId}:`) && key.endsWith(hourSuffix)) {
        haveHourSnapshot = true;
        break;
      }
    }

    const joined: string[] = [];
    for (const trainerId of deduped.keys()) {
      if (!known.get(trainerId)) {
        joined.push(trainerId);
      }
    }

    const left: string[] = [];
    for (const [trainerId, active] of known.entries()) {
      if (active && !deduped.has(trainerId)) {
        left.push(trainerId);
      }
    }

    for (const member of deduped.values()) {
      const key = this.memberKey(clubId, member.trainerId);
      const existing = this.members.get(key);
      this.members.set(key, {
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

    for (const rec of this.members.values()) {
      if (rec.clubId === clubId && rec.active && !deduped.has(rec.trainerId)) {
        rec.active = false;
        rec.leftAt = stamp;
      }
    }

    if (this.filled.get(clubId) !== today || joined.length > 0) {
      for (const m of deduped.values()) {
        for (const [day, fans] of m.history) {
          if (day <= today) {
            const dk = this.dayKey(clubId, m.trainerId, day);
            if (!this.daySnapshots.has(dk)) {
              this.daySnapshots.set(dk, fans);
            }
          }
        }
      }
    }

    if (!haveTodaySnapshot) {
      for (const m of deduped.values()) {
        const dk = this.dayKey(clubId, m.trainerId, today);
        if (!this.daySnapshots.has(dk)) {
          this.daySnapshots.set(dk, m.fans);
        }
      }
    }

    if (!haveHourSnapshot) {
      for (const m of deduped.values()) {
        const hk = this.hourKey(clubId, m.trainerId, hourIso);
        if (!this.hourSnapshots.has(hk)) {
          this.hourSnapshots.set(hk, m.fans);
        }
      }
      const cutoff = iso(new Date(mark.getTime() - HOUR_HISTORY_DAYS * 24 * 60 * 60 * 1000));
      for (const key of this.hourSnapshots.keys()) {
        if (key.startsWith(`${clubId}:`)) {
          const parts = key.split(":");
          const storedHour = parts.slice(2).join(":");
          if (storedHour < cutoff) {
            this.hourSnapshots.delete(key);
          }
        }
      }
    }

    const prevClub = this.clubs.get(clubId);
    this.clubs.set(clubId, {
      clubId,
      name: snapshot.clubName ?? prevClub?.name ?? null,
      lastSyncedAt: stamp,
      lastError: null,
      lastErrorAt: null,
    });
    this.filled.set(clubId, today);

    return {
      clubId,
      memberCount: deduped.size,
      joined,
      left,
      tookDaySnapshot: !haveTodaySnapshot,
    };
  }

  recordSyncError(clubId: string, message: string, now: Date): void {
    const prev = this.clubs.get(clubId);
    this.clubs.set(clubId, {
      clubId,
      name: prev?.name ?? null,
      lastSyncedAt: prev?.lastSyncedAt ?? null,
      lastError: message.slice(0, 300),
      lastErrorAt: iso(now),
    });
  }

  clubInfo(clubId: string): ClubInfo {
    const club = this.clubs.get(clubId);
    let count = 0;
    for (const rec of this.members.values()) {
      if (rec.clubId === clubId && rec.active) {
        count += 1;
      }
    }
    return {
      clubId,
      name: club?.name ?? null,
      memberCount: count,
      lastSyncedAt: parseIso(club?.lastSyncedAt ?? null),
      lastError: club?.lastError ?? null,
    };
  }

  private findBaseline(trainerId: string, preferredClubId: string, startDay: string): number | null {
    let bestDay: string | null = null;
    let bestClubMatch = false;
    let bestFans: number | null = null;

    for (const [key, fans] of this.daySnapshots.entries()) {
      const firstColon = key.indexOf(":");
      const secondColon = key.indexOf(":", firstColon + 1);
      const snapClubId = key.slice(0, firstColon);
      const snapTrainerId = key.slice(firstColon + 1, secondColon);
      const snapDay = key.slice(secondColon + 1);

      if (snapTrainerId !== trainerId || snapDay < startDay) continue;
      const clubMatch = snapClubId === preferredClubId;

      if (
        bestDay === null ||
        snapDay < bestDay ||
        (snapDay === bestDay && clubMatch && !bestClubMatch)
      ) {
        bestDay = snapDay;
        bestClubMatch = clubMatch;
        bestFans = fans;
      }
    }

    return bestFans;
  }

  standings(clubId: string, period: Period, now: Date): StandingRow[] {
    const startDay = periodStartDay(period, now);
    const activeMembers: MemberRecord[] = [];
    for (const rec of this.members.values()) {
      if (rec.clubId === clubId && rec.active) {
        activeMembers.push(rec);
      }
    }

    const scored = activeMembers.map((m) => {
      const base = this.findBaseline(m.trainerId, clubId, startDay);
      const gain = computeGain(m.fans, base);
      return {
        gain,
        fans: m.fans,
        name: m.name,
        trainerId: m.trainerId,
        hasBaseline: base !== null,
      };
    });

    scored.sort((a, b) => {
      if (b.gain !== a.gain) return b.gain - a.gain;
      if (b.fans !== a.fans) return b.fans - a.fans;
      const nameCmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      if (nameCmp !== 0) return nameCmp;
      return a.trainerId.localeCompare(b.trainerId);
    });

    return scored.map((row, idx) => ({
      rank: idx + 1,
      trainerId: row.trainerId,
      name: row.name,
      fans: row.fans,
      gain: row.gain,
      hasBaseline: row.hasBaseline,
    }));
  }

  findActiveMember(trainerId: string): { clubId: string; name: string; fans: number } | null {
    let best: MemberRecord | null = null;
    for (const rec of this.members.values()) {
      if (rec.trainerId === trainerId && rec.active) {
        if (!best || rec.lastSeenAt > best.lastSeenAt) {
          best = rec;
        }
      }
    }
    if (!best) return null;
    return { clubId: best.clubId, name: best.name, fans: best.fans };
  }

  setLink(discordId: string, trainerId: string): string | null {
    const previous = this.links.get(discordId) ?? null;
    this.links.set(discordId, trainerId);
    return previous;
  }

  getLink(discordId: string): string | null {
    return this.links.get(discordId) ?? null;
  }

  removeLink(discordId: string): boolean {
    return this.links.delete(discordId);
  }
}
