import { StoreState } from "./store_types.js";

export function findBaseline(
  state: StoreState,
  trainerId: string,
  preferredClubId: string,
  startDay: string
): number | null {
  let bestDay: string | null = null;
  let bestClubMatch = false;
  let bestFans: number | null = null;

  for (const [key, fans] of state.daySnapshots.entries()) {
    const firstColon = key.indexOf(":");
    const secondColon = key.indexOf(":", firstColon + 1);
    const snapClubId = key.slice(0, firstColon);
    const snapTrainerId = key.slice(firstColon + 1, secondColon);
    const snapDay = key.slice(secondColon + 1);

    if (snapTrainerId !== trainerId || snapDay < startDay) continue;
    const clubMatch = snapClubId === preferredClubId;

    if (
      bestDay === null ||
      snapDay < bestDay ||
      (snapDay === bestDay && clubMatch && !bestClubMatch)
    ) {
      bestDay = snapDay;
      bestClubMatch = clubMatch;
      bestFans = fans;
    }
  }

  return bestFans;
}
