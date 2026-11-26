import { ClubConfig } from "../configuration/config_types.js";
import {
  ClubInfo,
  HourlyHistoryResult,
  PERIODS,
  Period,
  SyncOutcome,
} from "../domain_models/types.js";
import { StoreAdapter } from "../fan_storage/store_adapter.js";
import { nextReset } from "../time_boundaries/next_reset.js";
import { utcNow } from "../time_boundaries/utc_now.js";
import { FanSource } from "../umamoe_source/source_error.js";
import { normalizeTrainerId } from "./normalize_trainer_id.js";
import { runClubSync } from "./run_club_sync.js";
import { Leaderboard, LinkResult, MAX_TOP, Standing } from "./tracker_types.js";

const TRAINER_ID_RE = /^[A-Za-z0-9_]{1,32}$/;

export class TrackerService {
  readonly store: StoreAdapter;
  readonly source: FanSource;
  readonly clubs: readonly ClubConfig[];
  private readonly clock: () => Date;
  private readonly byKey = new Map<string, ClubConfig>();
  private readonly byId = new Map<string, ClubConfig>();
  private readonly where = new Map<string, { clubId: string | null; askedAt: Date }>();
  private syncing: Promise<SyncOutcome[]> | null = null;

  constructor(
    store: StoreAdapter,
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
    if (this.syncing) return this.syncing;
    this.syncing = runClubSync({
      clubs: this.clubs,
      source: this.source,
      store: this.store,
      where: this.where,
      clock: this.clock,
    }).finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  async clubInfos(): Promise<Array<readonly [ClubConfig, ClubInfo]>> {
    return Promise.all(
      this.clubs.map(async (club) => [club, await this.store.clubInfo(club.clubId)] as const)
    );
  }

  async leaderboard(club: ClubConfig, period: Period, top: number): Promise<Leaderboard> {
    const clampedTop = Math.max(1, Math.min(Math.trunc(top), MAX_TOP));
    const now = this.clock();
    const rows = (await this.store.standings(club.clubId, period, now)).slice(0, clampedTop);
    return {
      club,
      period,
      top: clampedTop,
      rows,
      info: await this.store.clubInfo(club.clubId),
      resetsAt: nextReset(period, now),
    };
  }

  async standingForTrainer(trainerId: string, period: Period): Promise<Standing | null> {
    const found = await this.store.findActiveMember(trainerId);
    if (!found) return null;
    const club = this.byId.get(found.clubId);
    if (!club) return null;
    const now = this.clock();
    const rows = await this.store.standings(club.clubId, period, now);
    const row = rows.find((r) => r.trainerId === trainerId);
    if (!row) return null;
    return {
      club,
      period,
      row,
      rosterSize: rows.length,
      info: await this.store.clubInfo(club.clubId),
      resetsAt: nextReset(period, now),
    };
  }

  async allStandingsForTrainer(trainerId: string): Promise<Partial<Record<Period, Standing>>> {
    const result: Partial<Record<Period, Standing>> = {};
    for (const p of PERIODS) {
      const standing = await this.standingForTrainer(trainerId, p);
      if (standing) result[p] = standing;
    }
    return result;
  }

  async hourlyClubHistory(club: ClubConfig, day: "today" | "yesterday"): Promise<HourlyHistoryResult> {
    return this.store.hourlyClubHistory(club.clubId, day, this.clock());
  }

  async hourlyTrainerHistory(
    trainerId: string,
    day: "today" | "yesterday"
  ): Promise<{ club: ClubConfig; name: string; history: HourlyHistoryResult } | null> {
    const found = await this.store.findActiveMember(trainerId);
    if (!found) return null;
    const club = this.byId.get(found.clubId);
    if (!club) return null;
    const history = await this.store.hourlyTrainerHistory(trainerId, day, this.clock());
    if (!history) return null;
    return { club, name: found.name, history };
  }

  async linkedTrainer(discordId: string): Promise<string | null> {
    return this.store.getLink(discordId);
  }

  async link(discordId: string, rawTrainerId: string): Promise<LinkResult> {
    const trainerId = normalizeTrainerId(rawTrainerId);
    if (!TRAINER_ID_RE.test(trainerId)) return { status: "invalid" };
    const found = await this.store.findActiveMember(trainerId);
    if (!found) {
      const infos = await this.clubInfos();
      const synced = infos.some(([, info]) => info.lastSyncedAt !== null);
      return { status: synced ? "not_found" : "not_synced" };
    }
    const previous = await this.store.setLink(discordId, trainerId);
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
