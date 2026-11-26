export interface DiscordStatusPayload {
  state: string;
  latency_ms: number | null;
  error: string | null;
}

export interface ClubStatusJson {
  key: string;
  club_id: string;
  label: string;
  name: string | null;
  member_count: number;
  last_synced_at: string | null;
  last_error: string | null;
}
