export interface ClubRecord {
  clubId: string;
  name: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface MemberRecord {
  clubId: string;
  trainerId: string;
  name: string;
  fans: number;
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  leftAt: string | null;
}

export interface StoreState {
  clubs: Map<string, ClubRecord>;
  members: Map<string, MemberRecord>;
  daySnapshots: Map<string, number>;
  hourSnapshots: Map<string, number>;
  links: Map<string, string>;
  filled: Map<string, string>;
}
