import { formatLeaderboardEmbed } from "../discord_formatting/format_leaderboard_embed.js";
import { PERIODS, Period } from "../domain_models/types.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { MAX_TOP } from "../fan_tracker/tracker_types.js";
import { CommandReply } from "./command_reply.js";

export async function cmdLeaderboard(
  service: TrackerService,
  clubChoice = "club1",
  periodChoice: string = "daily",
  topChoice = MAX_TOP
): Promise<CommandReply> {
  if (!PERIODS.includes(periodChoice as Period)) {
    return { content: "Period must be daily, weekly, or monthly.", ephemeral: true };
  }
  const period = periodChoice as Period;
  const targets =
    clubChoice === "both"
      ? [...service.clubs]
      : [service.club(clubChoice)].filter((c): c is NonNullable<typeof c> => Boolean(c));

  if (targets.length === 0) {
    return { content: `Unknown club '${clubChoice}'.`, ephemeral: true };
  }

  const boards = await Promise.all(
    targets.map((club) => service.leaderboard(club, period, topChoice))
  );
  return { embeds: boards.map(formatLeaderboardEmbed) };
}
