import { MemberRecord, StoreState } from "./store_types.js";

export function findActiveMember(
  state: StoreState,
  trainerId: string
): { clubId: string; name: string; fans: number } | null {
  let best: MemberRecord | null = null;
  for (const rec of state.members.values()) {
    if (rec.trainerId === trainerId && rec.active) {
      if (!best || rec.lastSeenAt > best.lastSeenAt) {
        best = rec;
      }
    }
  }
  if (!best) return null;
  return { clubId: best.clubId, name: best.name, fans: best.fans };
}
