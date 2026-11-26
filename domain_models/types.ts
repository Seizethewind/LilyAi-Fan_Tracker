export const VERSION = "0.1.0";

export const PERIODS = ["daily", "weekly", "monthly"] as const;
export type Period = (typeof PERIODS)[number];

export interface SourceMember {
  trainerId: string;
  name: string;
  fans: number;
  updated: string | null;
  history: ReadonlyArray<readonly [string, number]>;
}

export interface ClubSnapshot {
  clubId: string;
  members: SourceMember[];
  clubName: string | null;
}

export interface SyncResult {
  clubId: string;
  memberCount: number;
  joined: string[];
  left: string[];
  tookDaySnapshot: boolean;
}

export interface SyncOutcome {
  clubKey: string;
  ok: boolean;
  error: string | null;
  result: SyncResult | null;
}

export interface StandingRow {
  rank: number;
  trainerId: string;
  name: string;
  fans: number;
  gain: number;
  hasBaseline: boolean;
}

export interface ClubInfo {
  clubId: string;
  name: string | null;
  memberCount: number;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

export interface HourlyRow {
  hourIso: string;
  label: string;
  thisHour: number;
  sinceReset: number;
  inProgress: boolean;
  gapHours: number;
}

export interface HourlyHistoryResult {
  gameDay: string;
  startedAtIso: string | null;
  startedLate: boolean;
  rows: HourlyRow[];
  total: number;
  noBaselineForTrainer: boolean;
}

export interface DiscordStatusInfo {
  state: "disabled" | "starting" | "ready" | "reconnecting" | "error";
  latency_ms: number | null;
  error: string | null;
}
