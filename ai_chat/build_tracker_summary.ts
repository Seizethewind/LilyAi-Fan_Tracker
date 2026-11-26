import { TrackerService } from "../fan_tracker/tracker_service.js";
import { formatIso } from "../time_boundaries/format_iso.js";

export interface TrackerContextClub {
  key: string;
  club_id: string;
  label: string;
  name: string | null;
  member_count: number;
  last_synced_at: string | null;
  top_daily: Array<{ rank: number; name: string; gain: number }>;
}

export async function buildTrackerContext(
  service: TrackerService,
  discordUserId?: string
): Promise<{ clubs: TrackerContextClub[]; summaryText: string }> {
  const clubs: TrackerContextClub[] = [];
  const lines: string[] = [];

  for (const club of service.clubs) {
    const board = await service.leaderboard(club, "daily", 3);
    const syncedAt = board.info.lastSyncedAt ? formatIso(board.info.lastSyncedAt) : "not synced";
    const clubLabel = board.info.name ? `${club.label} (${board.info.name})` : club.label;
    const topDaily = board.rows.map((r) => ({ rank: r.rank, name: r.name, gain: r.gain }));

    clubs.push({
      key: club.key,
      club_id: club.clubId,
      label: club.label,
      name: board.info.name,
      member_count: board.info.memberCount,
      last_synced_at: board.info.lastSyncedAt ? formatIso(board.info.lastSyncedAt) : null,
      top_daily: topDaily,
    });

    const leadersText =
      topDaily.length > 0
        ? topDaily.map((r) => `#${r.rank} ${r.name} (+${r.gain.toLocaleString()})`).join(", ")
        : "no standings yet";
    lines.push(`${clubLabel}: ${board.info.memberCount} members, synced ${syncedAt}. Daily top: ${leadersText}`);
  }

  if (discordUserId) {
    const trainerId = await service.linkedTrainer(discordUserId);
    if (trainerId) {
      const standings = await service.allStandingsForTrainer(trainerId);
      const d = standings.daily;
      const w = standings.weekly;
      const m = standings.monthly;
      if (d) {
        lines.push(
          `Asker (${d.row.name}, ID ${trainerId} in ${d.club.label}): total ${d.row.fans.toLocaleString()} fans, ` +
            `daily +${d.row.gain.toLocaleString()} (#${d.row.rank}), ` +
            `weekly +${(w?.row.gain ?? 0).toLocaleString()}, ` +
            `monthly +${(m?.row.gain ?? 0).toLocaleString()}.`
        );
      }
    }
  }

  return { clubs, summaryText: lines.join("\n") };
}
