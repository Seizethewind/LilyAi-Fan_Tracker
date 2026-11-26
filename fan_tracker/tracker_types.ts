import { ClubConfig } from "../configuration/config_types.js";
import { ClubInfo, Period, StandingRow } from "../domain_models/types.js";

export const MAX_TOP = 30;

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

export interface LinkResult {
  status: "linked" | "relinked" | "invalid" | "not_found" | "not_synced";
  trainerId?: string;
  trainerName?: string;
  clubLabel?: string;
}
