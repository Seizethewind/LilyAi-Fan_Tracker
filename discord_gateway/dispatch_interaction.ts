import { ChatInputCommandInteraction, MessageFlags } from "discord.js";

import { cmdFanGain } from "../discord_commands/cmd_fan_gain.js";
import { cmdFanGainHistory } from "../discord_commands/cmd_fan_gain_history.js";
import { cmdLeaderboard } from "../discord_commands/cmd_leaderboard.js";
import { cmdLink } from "../discord_commands/cmd_link.js";
import { cmdUnlink } from "../discord_commands/cmd_unlink.js";
import { CommandReply } from "../discord_commands/command_reply.js";
import { TrackerService } from "../fan_tracker/tracker_service.js";

async function runCommand(
  interaction: ChatInputCommandInteraction,
  service: TrackerService
): Promise<CommandReply> {
  const userId = interaction.user.id;
  switch (interaction.commandName) {
    case "link":
      return cmdLink(service, userId, interaction.options.getString("trainer_id", true));
    case "unlink":
      return cmdUnlink(service, userId);
    case "leaderboard":
      return cmdLeaderboard(
        service,
        interaction.options.getString("club") ?? "club1",
        interaction.options.getString("period") ?? "daily",
        interaction.options.getInteger("top") ?? 30
      );
    case "fan_gain":
      return cmdFanGain(
        service,
        userId,
        interaction.options.getUser("user")?.id ?? null,
        interaction.options.getString("trainer_id")
      );
    case "fan_gain_history": {
      const dayOpt = interaction.options.getString("day");
      return cmdFanGainHistory(service, userId, {
        club: interaction.options.getString("club"),
        targetDiscordId: interaction.options.getUser("user")?.id ?? null,
        day: dayOpt === "yesterday" ? "yesterday" : "today",
      });
    }
    default:
      return { content: "Unknown command.", ephemeral: true };
  }
}

export async function dispatchInteraction(
  interaction: ChatInputCommandInteraction,
  service: TrackerService
): Promise<void> {
  try {
    const reply = await runCommand(interaction, service);
    await interaction.reply({
      content: reply.content,
      embeds: reply.embeds,
      flags: reply.ephemeral ? MessageFlags.Ephemeral : undefined,
    });
  } catch (err) {
    console.error("Slash command failed:", err);
    const msg = "Something went wrong running that command.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}
