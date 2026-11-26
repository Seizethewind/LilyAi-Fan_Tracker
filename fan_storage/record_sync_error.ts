import { formatIso } from "../time_boundaries/format_iso.js";
import { StoreState } from "./store_types.js";

export function recordSyncError(
  state: StoreState,
  clubId: string,
  message: string,
  now: Date
): void {
  const prev = state.clubs.get(clubId);
  state.clubs.set(clubId, {
    clubId,
    name: prev?.name ?? null,
    lastSyncedAt: prev?.lastSyncedAt ?? null,
    lastError: message.slice(0, 300),
    lastErrorAt: formatIso(now),
  });
}
