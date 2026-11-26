import { ClubInfo } from "../domain_models/types.js";
import { parseIso } from "../time_boundaries/parse_iso.js";
import { StoreState } from "./store_types.js";

export function readClubInfo(state: StoreState, clubId: string): ClubInfo {
  const club = state.clubs.get(clubId);
  let count = 0;
  for (const rec of state.members.values()) {
    if (rec.clubId === clubId && rec.active) {
      count += 1;
    }
  }
  return {
    clubId,
    name: club?.name ?? null,
    memberCount: count,
    lastSyncedAt: parseIso(club?.lastSyncedAt ?? null),
    lastError: club?.lastError ?? null,
  };
}
