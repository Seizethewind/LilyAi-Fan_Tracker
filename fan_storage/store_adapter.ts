import {
  ClubInfo,
  ClubSnapshot,
  HourlyHistoryResult,
  Period,
  StandingRow,
  SyncResult,
} from "../domain_models/types.js";

export interface StoreAdapter {
  init(): Promise<void>;
  applySync(snapshot: ClubSnapshot, now: Date): Promise<SyncResult>;
  recordSyncError(clubId: string, message: string, now: Date): Promise<void>;
  clubInfo(clubId: string): Promise<ClubInfo>;
  standings(clubId: string, period: Period, now: Date): Promise<StandingRow[]>;
  findActiveMember(
    trainerId: string
  ): Promise<{ clubId: string; name: string; fans: number } | null>;
  hourlyClubHistory(
    clubId: string,
    day: "today" | "yesterday",
    now: Date
  ): Promise<HourlyHistoryResult>;
  hourlyTrainerHistory(
    trainerId: string,
    day: "today" | "yesterday",
    now: Date
  ): Promise<HourlyHistoryResult | null>;
  setLink(discordId: string, trainerId: string): Promise<string | null>;
  getLink(discordId: string): Promise<string | null>;
  removeLink(discordId: string): Promise<boolean>;
  close(): Promise<void>;
}
