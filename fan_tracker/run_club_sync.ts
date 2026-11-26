import { ClubConfig } from "../configuration/config_types.js";
import { ClubSnapshot, SyncOutcome } from "../domain_models/types.js";
import { StoreAdapter } from "../fan_storage/store_adapter.js";
import { FanSource, SourceError } from "../umamoe_source/source_error.js";
import { dropStaleDuplicates } from "./drop_stale_duplicates.js";
import { placeTrainers } from "./place_trainers.js";

export async function runClubSync(options: {
  clubs: readonly ClubConfig[];
  source: FanSource;
  store: StoreAdapter;
  where: Map<string, { clubId: string | null; askedAt: Date }>;
  clock: () => Date;
}): Promise<SyncOutcome[]> {
  const { clubs, source, store, where, clock } = options;
  let fetched: Record<string, ClubSnapshot> = {};
  const failed: Record<string, SyncOutcome> = {};

  const recordFailure = async (club: ClubConfig, message: string): Promise<SyncOutcome> => {
    await store.recordSyncError(club.clubId, message, clock());
    return { clubKey: club.key, ok: false, error: message, result: null };
  };

  for (const club of clubs) {
    try {
      const snapshot = await source.fetchClub(club.clubId);
      if (snapshot.clubId !== club.clubId) {
        throw new SourceError("the source returned a different club than requested");
      }
      fetched[club.key] = snapshot;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Sync of ${club.key} failed: ${msg}`);
      failed[club.key] = await recordFailure(club, msg);
    }
  }

  fetched = dropStaleDuplicates(await placeTrainers(fetched, source, clubs, where, clock()));
  const outcomes: SyncOutcome[] = [];

  for (const club of clubs) {
    if (failed[club.key]) {
      outcomes.push(failed[club.key]);
      continue;
    }
    try {
      const snapshot = fetched[club.key];
      if (!snapshot || snapshot.members.length === 0) {
        throw new SourceError("the source returned an empty roster; keeping the previous data");
      }
      const result = await store.applySync(snapshot, clock());
      outcomes.push({ clubKey: club.key, ok: true, error: null, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Sync of ${club.key} failed: ${msg}`);
      outcomes.push(await recordFailure(club, msg));
    }
  }

  return outcomes;
}
