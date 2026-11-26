import { APIEmbed } from "discord.js";

import { HourlyHistoryResult } from "../domain_models/types.js";
import { formatGameDayLabel } from "../time_boundaries/format_game_day_label.js";
import { padLeftDisplay, padRightDisplay } from "./pad_display.js";

export function formatHourlyEmbed(options: {
  subject: string;
  subtitle?: string;
  history: HourlyHistoryResult;
}): APIEmbed {
  const { subject, subtitle, history } = options;
  const dayLabel = formatGameDayLabel(history.gameDay);
  const title = `${subject} · Hourly fan gain · ${dayLabel}`;

  if (history.noBaselineForTrainer) {
    return {
      title,
      description: `${subtitle ? `${subtitle}\n` : ""}Joined during this game day—hourly gains start after the next 15:00 UTC reset.`,
      color: 0x2563eb,
    };
  }

  if (history.rows.length === 0) {
    return {
      title,
      description: `${subtitle ? `${subtitle}\n` : ""}No hourly snapshots recorded yet for this game day.`,
      color: 0x2563eb,
    };
  }

  const lines = history.rows.map((row) => {
    const timeCol = padRightDisplay(row.label, 10);
    const hourCol = padLeftDisplay(`+${row.thisHour.toLocaleString()}`, 11);
    const resetCol = padLeftDisplay(`+${row.sinceReset.toLocaleString()}`, 12);
    return `${timeCol} ${hourCol} ${resetCol}`;
  });

  const header = `${padRightDisplay("UTC", 10)} ${padLeftDisplay("This hour", 11)} ${padLeftDisplay("Since reset", 12)}`;
  const totalLine = `${padRightDisplay("Total", 10)} ${" ".repeat(11)} ${padLeftDisplay(`+${history.total.toLocaleString()}`, 12)}`;

  const parts: string[] = [];
  if (subtitle) parts.push(subtitle);
  parts.push("```", header, ...lines, totalLine, "```");
  if (history.startedLate && history.startedAtIso) {
    const dt = new Date(history.startedAtIso);
    const hh = String(dt.getUTCHours()).padStart(2, "0");
    const mm = String(dt.getUTCMinutes()).padStart(2, "0");
    parts.push(`Hourly tracking began at ${hh}:${mm} UTC.`);
  }

  return {
    title,
    description: parts.join("\n").slice(0, 4000),
    color: 0x2563eb,
  };
}
