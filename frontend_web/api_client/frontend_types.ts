export type Period = "daily" | "weekly" | "monthly";
export type ActiveView = "leaderboard" | "hourly" | "member" | "chat";

export interface ClubSummary {
  key: string;
  club_id: string;
  label: string;
  name: string | null;
  member_count: number;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface StandingEntry {
  rank: number;
  trainer_id: string;
  name: string;
  fans: number;
  gain: number;
  has_baseline: boolean;
}

export interface LeaderboardData {
  clubs: ClubSummary[];
  club: ClubSummary;
  period: Period;
  top: number;
  resets_at: string;
  entries: StandingEntry[];
}

export interface HourlyRowItem {
  hour_iso: string;
  label: string;
  this_hour: number;
  since_reset: number;
  in_progress: boolean;
  gap_hours: number;
}

export interface HourlyHistoryData {
  clubs: ClubSummary[];
  club: ClubSummary;
  day: "today" | "yesterday";
  game_day: string;
  started_at: string | null;
  started_late: boolean;
  total: number;
  rows: HourlyRowItem[];
}

export interface MemberPeriodData {
  gain: number;
  rank: number;
  has_baseline: boolean;
}

export interface MemberData {
  trainer_id: string;
  name: string;
  fans: number;
  club: ClubSummary;
  roster_size: number;
  periods: Partial<Record<Period, MemberPeriodData>>;
}

export interface ChatResponseData {
  status: "answered" | "hint" | "cooldown" | "unavailable" | "not_mentioned";
  reply: string;
  wait_seconds: number | null;
}

export interface SyncClubResult {
  club: string;
  ok: boolean;
  member_count: number | null;
  error: string | null;
}
