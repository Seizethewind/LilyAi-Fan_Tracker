import { APIEmbed } from "discord.js";

import { Leaderboard } from "../fan_tracker/tracker_types.js";
import { padLeftDisplay, padRightDisplay } from "./pad_display.js";

function truncateDisplay(name: string, maxLen = 16): string {
  return name.length <= maxLen ? name : `${name.slice(0, maxLen - 1)}…`;
}

export function formatLeaderboardEmbed(board: Leaderboard): APIEmbed {
  const titleName = board.info.name ? `${board.club.label} (${board.info.name})` : board.club.label;
  const periodTitle = board.period[0].toUpperCase() + board.period.slice(1);
  const resetUnix = Math.floor(board.resetsAt.getTime() / 1000);

  if (board.rows.length === 0) {
    return {
      title: `${titleName} · ${periodTitle} Leaderboard`,
      description: `No active members tracked yet.\nResets <t:${resetUnix}:R>.`,
      color: 0x2563eb,
    };
  }

  const lines = board.rows.map((r) => {
    const rank = padLeftDisplay(`#${r.rank}`, 3);
    const name = padRightDisplay(truncateDisplay(r.name), 16);
    const gain = padLeftDisplay(
      r.hasBaseline ? `+${r.gain.toLocaleString()}` : "pending",
      11
    );
    const total = padLeftDisplay(r.fans.toLocaleString(), 13);
    return `${rank}  ${name}  ${gain}  ${total}`;
  });

  const header = `${padLeftDisplay("#", 3)}  ${padRightDisplay("Trainer", 16)}  ${padLeftDisplay("Gain", 11)}  ${padLeftDisplay("Total Fans", 13)}`;
  const body = ["```", header, ...lines, "```", `Resets <t:${resetUnix}:R>`].join("\n");

  return {
    title: `${titleName} · ${periodTitle} Top ${board.rows.length}`,
    description: body.slice(0, 4000),
    color: 0x2563eb,
  };
}
