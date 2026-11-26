export type Period = "daily" | "weekly" | "monthly";
export type HourlyDay = "today" | "yesterday";
export type NavSection = "leaderboards" | "hourly" | "trainer" | "ai_chat" | "status";

export interface ClubStatus {
  key: string;
  club_id: string;
  label: string;
  name: string | null;
  member_count: number;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface DiscordStatus {
  state: string;
  latency_ms: number | null;
  error: string | null;
}

export interface HealthResponse {
  status: string;
  version: string;
}

export interface StatusResponse {
  server: string;
  version: string;
  time: string;
  discord: DiscordStatus;
  clubs: ClubStatus[];
}

export interface LeaderboardEntry {
  rank: number;
  trainer_id: string;
  name: string;
  fans: number;
  gain: number;
  has_baseline: boolean;
}

export interface LeaderboardResponse {
  club: ClubStatus;
  period: Period;
  top: number;
  resets_at: string;
  entries: LeaderboardEntry[];
}

export interface PeriodStanding {
  gain: number;
  rank: number;
  has_baseline: boolean;
}

export interface MemberResponse {
  trainer_id: string;
  name: string;
  fans: number;
  club: ClubStatus;
  roster_size: number;
  periods: Partial<Record<Period, PeriodStanding>>;
}

export interface HourlyLineJson {
  time: string;
  hours: number;
  gain: number;
  since_reset: number;
  live: boolean;
}

export interface ClubHourlyResponse {
  club: ClubStatus;
  day: HourlyDay;
  game_day: string;
  day_start: string;
  day_end: string;
  first_mark: string | null;
  starts_late: boolean;
  counted: boolean;
  total: number;
  resets_at: string;
  lines: HourlyLineJson[];
}

export interface MemberHourlyResponse extends ClubHourlyResponse {
  trainer_id: string | null;
  name: string | null;
}

export interface SyncClubResult {
  club: string;
  ok: boolean;
  member_count: number | null;
  error: string | null;
}

export interface SyncResponse {
  results: SyncClubResult[];
}

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, { summary?: string }>>;
}

export interface ChatTurnInput {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContextClub {
  key: string;
  club_id: string;
  label: string;
  name: string | null;
  member_count: number;
  last_synced_at: string | null;
  last_error: string | null;
  top_daily: Array<{
    rank: number;
    trainer_id: string;
    name: string;
    gain: number;
    fans: number;
    has_baseline: boolean;
  }>;
}

export interface ChatLinkedTrainer {
  trainer_id: string;
  name: string;
  club_label: string;
  fans: number;
  daily_gain: number | null;
  daily_rank: number | null;
  weekly_gain: number | null;
  weekly_rank: number | null;
  monthly_gain: number | null;
  monthly_rank: number | null;
}

export interface ChatContextSnapshot {
  generated_at: string;
  clubs: ChatContextClub[];
  linked_trainer: ChatLinkedTrainer | null;
  summary_text: string;
}

export interface ChatContextResponse {
  ai_enabled: boolean;
  model: string;
  cooldown_seconds: number;
  outage_remaining_seconds: number;
  context: ChatContextSnapshot;
}

export interface ChatTestRequest {
  messages: ChatTurnInput[];
  replied_text?: string;
  trainer_id?: string;
}

export interface ChatTestResponse {
  reply: string;
  model: string;
  latency_ms: number;
  context_summary: string;
  context: ChatContextSnapshot;
}
