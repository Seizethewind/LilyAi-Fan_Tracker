import {
  ClubInfo,
  ClubSnapshot,
  HourlyHistoryResult,
  Period,
  StandingRow,
  SyncResult,
} from "../domain_models/types.js";
import { applySync } from "./apply_sync.js";
import { buildHourlyRows, HourSnapshotPoint } from "./build_hourly_rows.js";
import { computeStandings } from "./compute_standings.js";
import { findActiveMember } from "./find_active_member.js";
import { readClubInfo } from "./read_club_info.js";
import { recordSyncError } from "./record_sync_error.js";
import { StoreAdapter } from "./store_adapter.js";
import { StoreState } from "./store_types.js";

export class MemoryStore implements StoreAdapter {
  private readonly state: StoreState = {
    clubs: new Map(),
    members: new Map(),
    daySnapshots: new Map(),
    hourSnapshots: new Map(),
    links: new Map(),
    filled: new Map(),
  };

  async init(): Promise<void> {}

  async applySync(snapshot: ClubSnapshot, now: Date): Promise<SyncResult> {
    return applySync(this.state, snapshot, now);
  }

  async recordSyncError(clubId: string, message: string, now: Date): Promise<void> {
    recordSyncError(this.state, clubId, message, now);
  }

  async clubInfo(clubId: string): Promise<ClubInfo> {
    return readClubInfo(this.state, clubId);
  }

  async standings(clubId: string, period: Period, now: Date): Promise<StandingRow[]> {
    return computeStandings(this.state, clubId, period, now);
  }

  async findActiveMember(
    trainerId: string
  ): Promise<{ clubId: string; name: string; fans: number } | null> {
    return findActiveMember(this.state, trainerId);
  }

  private collectSnapshots(trainerIds: Set<string>): HourSnapshotPoint[] {
    const out: HourSnapshotPoint[] = [];
    for (const [key, fans] of this.state.hourSnapshots.entries()) {
      const firstColon = key.indexOf(":");
      const secondColon = key.indexOf(":", firstColon + 1);
      const trainerId = key.slice(firstColon + 1, secondColon);
      if (!trainerIds.has(trainerId)) continue;
      out.push({
        trainerId,
        hourIso: key.slice(secondColon + 1),
        fans,
      });
    }
    return out;
  }

  async hourlyClubHistory(
    clubId: string,
    day: "today" | "yesterday",
    now: Date
  ): Promise<HourlyHistoryResult> {
    const roster = Array.from(this.state.members.values())
      .filter((m) => m.clubId === clubId && m.active)
      .map((m) => ({ trainerId: m.trainerId, fans: m.fans }));
    const idSet = new Set(roster.map((r) => r.trainerId));
    return buildHourlyRows({ day, now, roster, snapshots: this.collectSnapshots(idSet) });
  }

  async hourlyTrainerHistory(
    trainerId: string,
    day: "today" | "yesterday",
    now: Date
  ): Promise<HourlyHistoryResult | null> {
    const member = findActiveMember(this.state, trainerId);
    if (!member) return null;
    const roster = [{ trainerId, fans: member.fans }];
    return buildHourlyRows({
      day,
      now,
      roster,
      snapshots: this.collectSnapshots(new Set([trainerId])),
      singleTrainerId: trainerId,
    });
  }

  async setLink(discordId: string, trainerId: string): Promise<string | null> {
    const previous = this.state.links.get(discordId) ?? null;
    this.state.links.set(discordId, trainerId);
    return previous;
  }

  async getLink(discordId: string): Promise<string | null> {
    return this.state.links.get(discordId) ?? null;
  }

  async removeLink(discordId: string): Promise<boolean> {
    return this.state.links.delete(discordId);
  }

  async close(): Promise<void> {}
}

export { MemoryStore as FanStore };
