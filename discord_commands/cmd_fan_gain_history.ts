import { formatHourlyEmbed } from "../discord_formatting/format_hourly_embed.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { CommandReply } from "./command_reply.js";

export interface FanGainHistoryOptions {
  club?: string | null;
  targetDiscordId?: string | null;
  day?: "today" | "yesterday" | null;
}

export async function cmdFanGainHistory(
  service: TrackerService,
  callerDiscordId: string,
  opts: FanGainHistoryOptions = {}
): Promise<CommandReply> {
  const day = opts.day === "yesterday" ? "yesterday" : "today";
  const clubOpt = opts.club ?? null;
  const userOpt = opts.targetDiscordId ?? null;

  if (clubOpt && userOpt) {
    return { content: "Pick a club or a user, not both.", ephemeral: true };
  }

  if (clubOpt) {
    const targets =
      clubOpt === "both"
        ? [...service.clubs]
        : [service.club(clubOpt)].filter((c): c is NonNullable<typeof c> => Boolean(c));
    if (targets.length === 0) {
      return { content: `Unknown club '${clubOpt}'.`, ephemeral: true };
    }

    const embeds = await Promise.all(
      targets.map(async (club) => {
        const [info, history] = await Promise.all([
          service.store.clubInfo(club.clubId),
          service.hourlyClubHistory(club, day),
        ]);
        return formatHourlyEmbed({
          subject: info.name ? `${club.label} (${info.name})` : club.label,
          history,
        });
      })
    );
    return { embeds };
  }

  const lookupDiscordId = userOpt ?? callerDiscordId;
  const trainerId = await service.linkedTrainer(lookupDiscordId);
  if (!trainerId) {
    const msg = userOpt && userOpt !== callerDiscordId
      ? "That user has not linked a trainer ID yet."
      : "You have not linked a trainer ID yet, or pass a `club` option.";
    return { content: msg, ephemeral: true };
  }

  const res = await service.hourlyTrainerHistory(trainerId, day);
  if (!res) {
    return { content: "That trainer is not on an active club roster right now.", ephemeral: true };
  }

  return {
    embeds: [
      formatHourlyEmbed({
        subject: res.name,
        subtitle: `Club: **${res.club.label}**`,
        history: res.history,
      }),
    ],
  };
}
