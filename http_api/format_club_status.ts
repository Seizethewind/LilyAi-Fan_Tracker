import { ClubConfig } from "../configuration/config_types.js";
import { ClubInfo } from "../domain_models/types.js";
import { formatIso } from "../time_boundaries/format_iso.js";
import { ClubStatusJson } from "./api_types.js";

export function formatClubStatus(club: ClubConfig, info: ClubInfo): ClubStatusJson {
  return {
    key: club.key,
    club_id: club.clubId,
    label: club.label,
    name: info.name,
    member_count: info.memberCount,
    last_synced_at: info.lastSyncedAt ? formatIso(info.lastSyncedAt) : null,
    last_error: info.lastError,
  };
}
