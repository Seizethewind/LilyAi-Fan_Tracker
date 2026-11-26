import { formatFanGainEmbed } from "../discord_formatting/format_fan_gain_embed.js";
import { normalizeTrainerId } from "../fan_tracker/normalize_trainer_id.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";
import { CommandReply } from "./command_reply.js";

export async function cmdFanGain(
  service: TrackerService,
  callerDiscordId: string,
  targetDiscordId: string | null,
  rawTrainerId: string | null
): Promise<CommandReply> {
  let trainerId = rawTrainerId ? normalizeTrainerId(rawTrainerId) : null;

  if (!trainerId) {
    const lookupDiscordId = targetDiscordId ?? callerDiscordId;
    trainerId = await service.linkedTrainer(lookupDiscordId);
    if (!trainerId) {
      const who = targetDiscordId && targetDiscordId !== callerDiscordId
        ? "That user has not linked a trainer ID yet."
        : "You have not linked a trainer ID yet. Run `/link <trainer_id>` first.";
      return { content: who, ephemeral: true };
    }
  }

  const standings = await service.allStandingsForTrainer(trainerId);
  const embed = formatFanGainEmbed(standings);
  if (!embed) {
    return {
      content: `Trainer \`${trainerId}\` is not on an active club roster right now.`,
      ephemeral: true,
    };
  }

  return { embeds: [embed] };
}
