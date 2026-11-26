import { TrackerService } from "../fan_tracker/tracker_service.js";
import { CommandReply } from "./command_reply.js";

export async function cmdUnlink(
  service: TrackerService,
  discordUserId: string
): Promise<CommandReply> {
  const removed = await service.unlink(discordUserId);
  return {
    content: removed
      ? "Unlinked your Discord account from your trainer ID."
      : "Your Discord account is not linked to any trainer ID.",
    ephemeral: true,
  };
}
