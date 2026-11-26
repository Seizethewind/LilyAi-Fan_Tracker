import { ClubConfig } from "../configuration/config_types.js";
import { ClubSnapshot } from "../domain_models/types.js";
import { FanSource } from "../umamoe_source/source_error.js";
import { findDoubtfulTrainers } from "./find_doubtful_trainers.js";

const LOOKUP_TTL_MS = 30 * 60 * 1000;

export async function placeTrainers(
  fetched: Record<string, ClubSnapshot>,
  source: FanSource,
  clubs: readonly ClubConfig[],
  where: Map<string, { clubId: string | null; askedAt: Date }>,
  now: Date
): Promise<Record<string, ClubSnapshot>> {
  if (!source.currentClub) return fetched;
  const ours = new Map<string, string>(clubs.map((c) => [c.clubId, c.key]));
  let result = fetched;

  for (const trainerId of findDoubtfulTrainers(result, now)) {
    let known = where.get(trainerId);
    if (!known || now.getTime() - known.askedAt.getTime() > LOOKUP_TTL_MS) {
      const clubId = await source.currentClub(trainerId);
      known = { clubId, askedAt: now };
      where.set(trainerId, known);
    }
    if (known.clubId === null) continue;
    const keep = ours.get(known.clubId);
    const next: Record<string, ClubSnapshot> = {};
    for (const [key, snap] of Object.entries(result)) {
      const hasTrainer = snap.members.some((m) => m.trainerId === trainerId);
      next[key] =
        key !== keep && hasTrainer
          ? { ...snap, members: snap.members.filter((m) => m.trainerId !== trainerId) }
          : snap;
    }
    result = next;
  }

  return result;
}
