import { ClubSnapshot, SourceMember } from "../domain_models/types.js";
import { extractCurrentFans } from "./extract_current_fans.js";
import { extractMonthHistory } from "./extract_month_history.js";
import { SourceError } from "./source_error.js";

export function parseCircleResponse(payload: unknown, clubId: string): ClubSnapshot {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new SourceError("uma.moe returned an unexpected response (not a JSON object)");
  }
  const obj = payload as Record<string, unknown>;
  const circle = obj.circle;
  const rows = obj.members;

  if (typeof circle !== "object" || circle === null || Array.isArray(circle) || !Array.isArray(rows)) {
    throw new SourceError("uma.moe response is missing 'circle' or 'members'");
  }

  const circleObj = circle as Record<string, unknown>;
  if (String(circleObj.circle_id) !== clubId) {
    throw new SourceError(`uma.moe returned circle ${String(circleObj.circle_id)} instead of ${clubId}`);
  }

  const members: SourceMember[] = [];
  const seen = new Set<string>();

  for (const rawRow of rows) {
    if (typeof rawRow !== "object" || rawRow === null || Array.isArray(rawRow)) {
      throw new SourceError("uma.moe member row has no numeric viewer_id");
    }
    const row = rawRow as Record<string, unknown>;
    if (typeof row.viewer_id !== "number" || !Number.isInteger(row.viewer_id)) {
      throw new SourceError("uma.moe member row has no numeric viewer_id");
    }
    const trainerId = String(row.viewer_id);
    if (seen.has(trainerId)) {
      throw new SourceError(`uma.moe listed trainer ${trainerId} twice`);
    }
    seen.add(trainerId);

    const fans = extractCurrentFans(row.daily_fans);
    if (fans === null) continue;

    const rawName = row.trainer_name;
    const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : trainerId;
    const stamp = row.last_updated;
    const updated = typeof stamp === "string" ? stamp : null;

    members.push({
      trainerId,
      name,
      fans,
      updated,
      history: extractMonthHistory(row),
    });
  }

  if (members.length === 0) {
    throw new SourceError("uma.moe has no fan totals for any member yet (new month?)");
  }

  const clubName =
    typeof circleObj.name === "string" && circleObj.name.trim() ? circleObj.name.trim() : null;

  return { clubId, members, clubName };
}
