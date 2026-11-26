import { TrackerService } from "../fan_tracker/tracker_service.js";
import { CommandReply } from "./command_reply.js";

export async function cmdLink(
  service: TrackerService,
  discordUserId: string,
  rawTrainerId: string
): Promise<CommandReply> {
  const res = await service.link(discordUserId, rawTrainerId);

  if (res.status === "invalid") {
    return {
      content: "That trainer ID looks invalid. Enter the numeric viewer ID from uma.moe.",
      ephemeral: true,
    };
  }
  if (res.status === "not_synced") {
    return {
      content: "The clubs have not finished their first sync yet. Please try again shortly.",
      ephemeral: true,
    };
  }
  if (res.status === "not_found") {
    return {
      content: "I could not find that trainer ID on either active club roster right now.",
      ephemeral: true,
    };
  }

  const verb = res.status === "relinked" ? "Updated your link" : "Linked your account";
  return {
    content: `${verb} to **${res.trainerName}** (\`${res.trainerId}\`) in **${res.clubLabel ?? "your club"}**.`,
    ephemeral: true,
  };
}
