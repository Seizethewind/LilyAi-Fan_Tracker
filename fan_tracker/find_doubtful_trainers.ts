import { ClubSnapshot } from "../domain_models/types.js";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function isStale(updated: string | null, now: Date): boolean {
  if (!updated) return false;
  const dt = new Date(updated);
  if (Number.isNaN(dt.getTime())) return false;
  return now.getTime() - dt.getTime() > STALE_AFTER_MS;
}

export function findDoubtfulTrainers(
  snapshots: Record<string, ClubSnapshot>,
  now: Date
): string[] {
  const listed = new Map<string, number>();
  const stale = new Set<string>();
  for (const snapshot of Object.values(snapshots)) {
    for (const member of snapshot.members) {
      listed.set(member.trainerId, (listed.get(member.trainerId) ?? 0) + 1);
      if (isStale(member.updated, now)) {
        stale.add(member.trainerId);
      }
    }
  }
  return Array.from(listed.entries())
    .filter(([t, n]) => n > 1 || stale.has(t))
    .map(([t]) => t)
    .sort();
}
