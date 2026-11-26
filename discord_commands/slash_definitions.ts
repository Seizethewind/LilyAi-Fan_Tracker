import { SlashCommandBuilder } from "discord.js";

import { Settings } from "../configuration/config_types.js";

export function buildSlashCommands(settings: Settings) {
  const [c1, c2] = settings.clubs;

  const link = new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Discord account to your uma.moe trainer ID")
    .addStringOption((opt) =>
      opt.setName("trainer_id").setDescription("Your trainer / viewer ID").setRequired(true)
    );

  const unlink = new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Remove your linked trainer ID");

  const leaderboard = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View club fan gain standings")
    .addStringOption((opt) =>
      opt
        .setName("club")
        .setDescription("Which club to show")
        .addChoices(
          { name: c1.label, value: c1.key },
          { name: c2.label, value: c2.key },
          { name: "Both clubs", value: "both" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("period")
        .setDescription("Timeframe")
        .addChoices(
          { name: "Daily", value: "daily" },
          { name: "Weekly", value: "weekly" },
          { name: "Monthly", value: "monthly" }
        )
    )
    .addIntegerOption((opt) =>
      opt.setName("top").setDescription("How many members to list (1-30)").setMinValue(1).setMaxValue(30)
    );

  const fanGain = new SlashCommandBuilder()
    .setName("fan_gain")
    .setDescription("Check daily, weekly, and monthly fan gains for yourself or another user")
    .addUserOption((opt) => opt.setName("user").setDescription("Discord user to inspect"))
    .addStringOption((opt) => opt.setName("trainer_id").setDescription("Or specify a trainer ID"));

  const fanGainHistory = new SlashCommandBuilder()
    .setName("fan_gain_history")
    .setDescription("Show hour-by-hour fan gains since the 15:00 UTC reset")
    .addStringOption((opt) =>
      opt
        .setName("club")
        .setDescription("Club to inspect")
        .addChoices(
          { name: c1.label, value: c1.key },
          { name: c2.label, value: c2.key },
          { name: "Both clubs", value: "both" }
        )
    )
    .addUserOption((opt) => opt.setName("user").setDescription("Linked user to inspect"))
    .addStringOption((opt) =>
      opt
        .setName("day")
        .setDescription("Game day")
        .addChoices({ name: "Today", value: "today" }, { name: "Yesterday", value: "yesterday" })
    );

  return [link, unlink, leaderboard, fanGain, fanGainHistory].map((c) => c.toJSON());
}
