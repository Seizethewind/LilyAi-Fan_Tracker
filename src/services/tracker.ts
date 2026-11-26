import { ClubConfig } from "../config.js";
import { HourlyDay, HourlyHistory, buildHistory } from "../hourly.js";
import { ClubInfo, ClubSnapshot, Period, PERIODS, StandingRow, SyncOutcome } from "../models.js";
import { FanSource, SourceError } from "../sources/umamoe.js";
import { FanStore } from "../storage/store.js";
import { nextReset, utcNow } from "../timeutil.js";

export const MAX_TOP = 30;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const LOOKUP_TTL_MS = 30 * 60 * 1000;
const TRAINER_ID_RE = /^[A-Za-z0-9_]{1,32}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeTrainerId(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

export function dropStaleDuplicates(
  snapshots: Record<string, ClubSnapshot>
): Record<string, ClubSnapshot> {
  const best = new Map<string, { stamp: string; clubs: string[] }>();

  for (const [key, snapshot] of Object.entries(snapshots)) {
    for (const member of snapshot.members) {
      const stamp = member.updated ?? "";
      const top = best.get(member.trainerId);
      if (!top || stamp > top.stamp) {
        best.set(member.trainerId, { stamp, clubs: [key] });
      } else if (stamp === top.stamp) {
        top.clubs.push(key);
      }
    }
  }

  const out: Record<string, ClubSnapshot> = {};
  for (const [key, snapshot] of Object.entries(snapshots)) {
    out[key] = {
      ...snapshot,
      members: snapshot.members.filter((m) => best.get(m.trainerId)?.clubs.includes(key)),
    };
  }
  return out;
}

function isStale(updated: string | null, now: Date): boolean {
  if (!updated) return false;
  const dt = new Date(updated);
  if (Number.isNaN(dt.getTime())) return false;
  return now.getTime() - dt.getTime() > STALE_AFTER_MS;
}

export function doubtfulTrainers(
  snapshots: Record<string, ClubSnapshot>,
  now: Date
): string[] {
  const listed = new Map<string, number>();
  const stale = new Set<string>();
  for (const snapshot of Object.values(snapshots)) {
    for (const member of snapshot.members) {
      listed.set(member.trainerId, (listed.get(member.trainerId) ?? 0) + 1);
      if (isStale(member.updated, now)) {
        stale.add(member.trainerId);
      }
    }
  }
  return Array.from(listed.entries())
    .filter(([t, n]) => n > 1 || stale.has(t))
    .map(([t]) => t)
    .sort();
}

export interface Leaderboard {
  club: ClubConfig;
  period: Period;
  top: number;
  rows: StandingRow[];
  info: ClubInfo;
  resetsAt: Date;
}

export interface Standing {
  club: ClubConfig;
  period: Period;
  row: StandingRow;
  rosterSize: number;
  info: ClubInfo;
  resetsAt: Date;
}

export interface HourlyView {
  club: ClubConfig;
  day: HourlyDay;
  history: HourlyHistory;
  info: ClubInfo;
  resetsAt: Date;
  trainerId: string | null;
  trainerName: string | null;
}

export interface LinkResult {
  status: "linked" | "relinked" | "invalid" | "not_found" | "not_synced";
  trainerId?: string;
  trainerName?: string;
  clubLabel?: string;
}

export class TrackerService {
  readonly store: FanStore;
  readonly source: FanSource;
  readonly clubs: readonly ClubConfig[];
  private readonly clock: () => Date;
  private readonly byKey = new Map<string, ClubConfig>();
  private readonly byId = new Map<string, ClubConfig>();
  private readonly where = new Map<string, { clubId: string | null; askedAt: Date }>();
  private syncing: Promise<SyncOutcome[]> | null = null;

  constructor(
    store: FanStore,
    source: FanSource,
    clubs: readonly ClubConfig[],
    clock: () => Date = utcNow
  ) {
    this.store = store;
    this.source = source;
    this.clubs = clubs;
    this.clock = clock;
    for (const club of clubs) {
      this.byKey.set(club.key, club);
      this.byId.set(club.clubId, club);
    }
  }

  club(keyOrId: string): ClubConfig | undefined {
    return this.byKey.get(keyOrId) ?? this.byId.get(keyOrId);
  }

  async syncAll(): Promise<SyncOutcome[]> {
    if (this.syncing) {
      return this.syncing;
    }
    this.syncing = this.doSyncAll().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async fetchClub(club: ClubConfig): Promise<ClubSnapshot> {
    const snapshot = await this.source.fetchClub(club.clubId);
    if (snapshot.clubId !== club.clubId) {
      throw new SourceError("the source returned a different club than requested");
    }
    return snapshot;
  }

  private async placeTrainers(
    fetched: Record<string, ClubSnapshot>
  ): Promise<Record<string, ClubSnapshot>> {
    if (!this.source.currentClub) return fetched;
    const now = this.clock();
    const ours = new Map<string, string>(this.clubs.map((c) => [c.clubId, c.key]));
    let result = fetched;

    for (const trainerId of doubtfulTrainers(result, now)) {
      let known = this.where.get(trainerId);
      if (!known || now.getTime() - known.askedAt.getTime() > LOOKUP_TTL_MS) {
        const clubId = await this.source.currentClub(trainerId);
        known = { clubId, askedAt: now };
        this.where.set(trainerId, known);
      }
      const clubId = known.clubId;
      if (clubId === null) continue;
      const keep = ours.get(clubId);
      const next: Record<string, ClubSnapshot> = {};
      for (const [key, snap] of Object.entries(result)) {
        const hasTrainer = snap.members.some((m) => m.trainerId === trainerId);
        if (key !== keep && hasTrainer) {
          next[key] = {
            ...snap,
            members: snap.members.filter((m) => m.trainerId !== trainerId),
          };
        } else {
          next[key] = snap;
        }
      }
      result = next;
    }

    return result;
  }

  private async doSyncAll(): Promise<SyncOutcome[]> {
    let fetched: Record<string, ClubSnapshot> = {};
    const failed: Record<string, SyncOutcome> = {};

    for (const club of this.clubs) {
      try {
        fetched[club.key] = await this.fetchClub(club);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Sync of ${club.key} failed: ${msg}`);
        failed[club.key] = await this.recordFailure(club, msg);
      }
    }

    fetched = dropStaleDuplicates(await this.placeTrainers(fetched));
    const outcomes: SyncOutcome[] = [];

    for (const club of this.clubs) {
      if (failed[club.key]) {
        outcomes.push(failed[club.key]);
        continue;
      }
      try {
        const snapshot = fetched[club.key];
        if (!snapshot || snapshot.members.length === 0) {
          throw new SourceError("the source returned an empty roster; keeping the previous data");
        }
        const result = await this.store.applySync(snapshot, this.clock());
        outcomes.push({ clubKey: club.key, ok: true, error: null, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Sync of ${club.key} failed: ${msg}`);
        outcomes.push(await this.recordFailure(club, msg));
      }
    }

    return outcomes;
  }

  private async recordFailure(club: ClubConfig, message: string): Promise<SyncOutcome> {
    try {
      await this.store.recordSyncError(club.clubId, message, this.clock());
    } catch (err) {
      console.error(`Could not record sync error for ${club.key}`, err);
    }
    return { clubKey: club.key, ok: false, error: message, result: null };
  }

  async clubInfos(): Promise<Array<readonly [ClubConfig, ClubInfo]>> {
    const infos = await Promise.all(this.clubs.map((c) => this.store.clubInfo(c.clubId)));
    return this.clubs.map((club, i) => [club, infos[i]] as const);
  }

  async leaderboard(club: ClubConfig, period: Period, top: number): Promise<Leaderboard> {
    const clampedTop = Math.max(1, Math.min(Math.trunc(top), MAX_TOP));
    const now = this.clock();
    const [allRows, info] = await Promise.all([
      this.store.standings(club.clubId, period, now),
      this.store.clubInfo(club.clubId),
    ]);
    return {
      club,
      period,
      top: clampedTop,
      rows: allRows.slice(0, clampedTop),
      info,
      resetsAt: nextReset(period, now),
    };
  }

  async standingForTrainer(trainerId: string, period: Period): Promise<Standing | null> {
    const normalized = normalizeTrainerId(trainerId);
    const found = await this.store.findActiveMember(normalized);
    if (!found) return null;
    const club = this.byId.get(found.clubId);
    if (!club) return null;
    const now = this.clock();
    const [rows, info] = await Promise.all([
      this.store.standings(club.clubId, period, now),
      this.store.clubInfo(club.clubId),
    ]);
    const row = rows.find((r) => r.trainerId === normalized);
    if (!row) return null;
    return {
      club,
      period,
      row,
      rosterSize: rows.length,
      info,
      resetsAt: nextReset(period, now),
    };
  }

  async allStandingsForTrainer(trainerId: string): Promise<Partial<Record<Period, Standing>>> {
    const normalized = normalizeTrainerId(trainerId);
    const found = await this.store.findActiveMember(normalized);
    if (!found) return {};
    const club = this.byId.get(found.clubId);
    if (!club) return {};
    const now = this.clock();
    const info = await this.store.clubInfo(club.clubId);
    const result: Partial<Record<Period, Standing>> = {};
    await Promise.all(
      PERIODS.map(async (p) => {
        const rows = await this.store.standings(club.clubId, p, now);
        const row = rows.find((r) => r.trainerId === normalized);
        if (row) {
          result[p] = {
            club,
            period: p,
            row,
            rosterSize: rows.length,
            info,
            resetsAt: nextReset(p, now),
          };
        }
      })
    );
    return result;
  }

  async fanGainHistory(club: ClubConfig, day: HourlyDay = "today"): Promise<HourlyView> {
    return this.buildHourlyView(club, day, null, null);
  }

  async trainerFanGainHistory(
    trainerId: string,
    day: HourlyDay = "today"
  ): Promise<HourlyView | null> {
    const normalized = normalizeTrainerId(trainerId);
    const found = await this.store.findActiveMember(normalized);
    if (!found) return null;
    const club = this.byId.get(found.clubId);
    if (!club) return null;
    return this.buildHourlyView(club, day, normalized, found.name);
  }

  private async buildHourlyView(
    club: ClubConfig,
    day: HourlyDay,
    trainerId: string | null,
    trainerName: string | null
  ): Promise<HourlyView> {
    const now = this.clock();
    const resetsAt = nextReset("daily", now);
    const todayStart = new Date(resetsAt.getTime() - DAY_MS);
    const info = await this.store.clubInfo(club.clubId);

    const start = day === "yesterday" ? new Date(todayStart.getTime() - DAY_MS) : todayStart;
    const end = day === "yesterday" ? todayStart : resetsAt;
    const current = day === "yesterday" ? null : await this.store.currentFans(club.clubId);
    const liveTime = day === "yesterday" ? end : info.lastSyncedAt ?? now;

    const rows = await this.store.hourRows(club.clubId, start, end);
    const history = buildHistory(rows, current, start, end, liveTime, trainerId ?? undefined);

    return {
      club,
      day,
      history,
      info,
      resetsAt,
      trainerId,
      trainerName,
    };
  }

  async link(discordId: string, rawTrainerId: string): Promise<LinkResult> {
    const trainerId = normalizeTrainerId(rawTrainerId);
    if (!TRAINER_ID_RE.test(trainerId)) {
      return { status: "invalid" };
    }
    const found = await this.store.findActiveMember(trainerId);
    if (!found) {
      const infos = await this.clubInfos();
      const synced = infos.some(([, info]) => info.lastSyncedAt !== null);
      return { status: synced ? "not_found" : "not_synced" };
    }
    const previous = await this.store.setLink(discordId, trainerId, this.clock());
    const club = this.byId.get(found.clubId);
    return {
      status: previous && previous !== trainerId ? "relinked" : "linked",
      trainerId,
      trainerName: found.name,
      clubLabel: club?.label,
    };
  }

  async unlink(discordId: string): Promise<boolean> {
    return this.store.removeLink(discordId);
  }
}
