import { Period, StandingRow } from "../domain_models/types.js";
import { periodStartDay } from "../time_boundaries/period_start_day.js";
import { computeGain } from "./compute_gain.js";
import { findBaseline } from "./find_baseline.js";
import { MemberRecord, StoreState } from "./store_types.js";

export function computeStandings(
  state: StoreState,
  clubId: string,
  period: Period,
  now: Date
): StandingRow[] {
  const startDay = periodStartDay(period, now);
  const activeMembers: MemberRecord[] = [];
  for (const rec of state.members.values()) {
    if (rec.clubId === clubId && rec.active) {
      activeMembers.push(rec);
    }
  }

  const scored = activeMembers.map((m) => {
    const base = findBaseline(state, m.trainerId, clubId, startDay);
    const gain = computeGain(m.fans, base);
    return {
      gain,
      fans: m.fans,
      name: m.name,
      trainerId: m.trainerId,
      hasBaseline: base !== null,
    };
  });

  scored.sort((a, b) => {
    if (b.gain !== a.gain) return b.gain - a.gain;
    if (b.fans !== a.fans) return b.fans - a.fans;
    const nameCmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    if (nameCmp !== 0) return nameCmp;
    return a.trainerId.localeCompare(b.trainerId);
  });

  return scored.map((row, idx) => ({
    rank: idx + 1,
    trainerId: row.trainerId,
    name: row.name,
    fans: row.fans,
    gain: row.gain,
    hasBaseline: row.hasBaseline,
  }));
}
