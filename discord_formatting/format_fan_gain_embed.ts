import { APIEmbed } from "discord.js";

import { PERIODS, Period } from "../domain_models/types.js";
import { Standing } from "../fan_tracker/tracker_types.js";

const LABELS: Record<Period, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function formatFanGainEmbed(
  standings: Partial<Record<Period, Standing>>
): APIEmbed | null {
  const first = PERIODS.map((p) => standings[p]).find((s) => s !== undefined);
  if (!first) return null;

  const clubTitle = first.info.name
    ? `${first.club.label} (${first.info.name})`
    : first.club.label;

  const fields = PERIODS.map((p) => {
    const s = standings[p];
    if (!s) {
      return { name: LABELS[p], value: "No data", inline: true };
    }
    const gainText = s.row.hasBaseline ? `+${s.row.gain.toLocaleString()}` : "Baseline pending";
    return {
      name: LABELS[p],
      value: `${gainText}\nRank #${s.row.rank} of ${s.rosterSize}`,
      inline: true,
    };
  });

  return {
    title: `${first.row.name} · Fan Gains`,
    description: `Club: **${clubTitle}**\nTotal Fans: **${first.row.fans.toLocaleString()}** · Trainer ID \`${first.row.trainerId}\``,
    fields,
    color: 0x2563eb,
  };
}
