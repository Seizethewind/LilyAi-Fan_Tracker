import { ClubSnapshot } from "../domain_models/types.js";

export function dropStaleDuplicates(
  snapshots: Record<string, ClubSnapshot>
): Record<string, ClubSnapshot> {
  const best = new Map<string, { stamp: string; clubs: string[] }>();

  for (const [key, snapshot] of Object.entries(snapshots)) {
    for (const member of snapshot.members) {
      const stamp = member.updated ?? "";
      const top = best.get(member.trainerId);
      if (!top || stamp > top.stamp) {
        best.set(member.trainerId, { stamp, clubs: [key] });
      } else if (stamp === top.stamp) {
        top.clubs.push(key);
      }
    }
  }

  const out: Record<string, ClubSnapshot> = {};
  for (const [key, snapshot] of Object.entries(snapshots)) {
    out[key] = {
      ...snapshot,
      members: snapshot.members.filter((m) => best.get(m.trainerId)?.clubs.includes(key)),
    };
  }
  return out;
}
