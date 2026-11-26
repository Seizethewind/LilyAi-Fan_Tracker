import { APIEmbed } from "discord.js";
import { ClubConfig } from "./config.js";
import {
  cleanName,
  discordTs,
  formatFans,
  formatGain,
  formatGameDayTitle,
  freshnessLine,
  hourlyTable,
  leaderboardTable,
} from "./formatting.js";
import { DAYS, HourlyDay } from "./hourly.js";
import { PERIODS, Period } from "./models.js";
import { MAX_TOP, TrackerService } from "./services/tracker.js";

const COLOR_INFO = 0x2563eb;
const COLOR_OK = 0x059669;

export interface CommandReply {
  content?: string;
  embeds: APIEmbed[];
  ephemeral: boolean;
}

function textReply(content: string, ephemeral = true): CommandReply {
  return { content, embeds: [], ephemeral };
}

function resolveClubs(service: TrackerService, clubInput: string | null | undefined): ClubConfig[] | null {
  if (!clubInput || clubInput === "club1") {
    return [service.clubs[0]];
  }
  if (clubInput === "both") {
    return [...service.clubs];
  }
  const found = service.club(clubInput);
  return found ? [found] : null;
}

export async function cmdLink(
  service: TrackerService,
  discordId: string,
  rawTrainerId: string
): Promise<CommandReply> {
  const result = await service.link(discordId, rawTrainerId);

  if (result.status === "invalid") {
    return textReply(
      "That doesn't look like a valid trainer ID. Enter letters, numbers, or underscores only (spaces and dashes are ignored)."
    );
  }
  if (result.status === "not_synced") {
    return textReply(
      "Club rosters haven't synced yet. Wait a moment for the first sync to finish and try again."
    );
  }
  if (result.status === "not_found") {
    return textReply(
      "That trainer ID isn't on either configured club's active roster right now."
    );
  }

  const verb = result.status === "relinked" ? "Updated your link" : "Linked your account";
  const clubNote = result.clubLabel ? ` in **${result.clubLabel}**` : "";
  return textReply(
    `${verb} to **${cleanName(result.trainerName ?? result.trainerId ?? "")}** (\`${result.trainerId}\`)${clubNote}.`
  );
}

export async function cmdUnlink(
  service: TrackerService,
  discordId: string
): Promise<CommandReply> {
  const removed = await service.unlink(discordId);
  if (!removed) {
    return textReply("Your Discord account isn't linked to a trainer ID yet.");
  }
  return textReply("Unlinked your Discord account from your trainer ID.");
}

export async function cmdLeaderboard(
  service: TrackerService,
  clubInput: string | null | undefined,
  periodInput: string | null | undefined,
  topInput: number | null | undefined
): Promise<CommandReply> {
  const clubs = resolveClubs(service, clubInput);
  if (!clubs) {
    return textReply("Unknown club. Pick Club 1, Club 2, or Both clubs.");
  }

  const periodRaw = periodInput ?? "daily";
  if (!PERIODS.includes(periodRaw as Period)) {
    return textReply("Unknown period. Pick daily, weekly, or monthly.");
  }
  const period = periodRaw as Period;
  const top = Math.max(1, Math.min(topInput ?? MAX_TOP, MAX_TOP));

  const embeds: APIEmbed[] = [];
  for (const club of clubs) {
    const board = await service.leaderboard(club, period, top);
    const titleClub = board.info.name ? `${club.label} — ${cleanName(board.info.name)}` : club.label;
    const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);
    embeds.push({
      title: `${titleClub} · ${periodLabel} Fan Gain`,
      description: `${leaderboardTable(board.rows)}\n\nResets ${discordTs(board.resetsAt, "R")}`,
      color: COLOR_INFO,
      footer: { text: `Club ID ${club.clubId}` },
      fields: [
        {
          name: "Sync status",
          value: freshnessLine(board.info),
          inline: false,
        },
      ],
    });
  }

  return { embeds, ephemeral: false };
}

export async function cmdFanGain(
  service: TrackerService,
  callerDiscordId: string,
  targetDiscordId: string | null,
  targetDisplayName: string | null
): Promise<CommandReply> {
  const lookupDiscordId = targetDiscordId ?? callerDiscordId;
  const isSelf = lookupDiscordId === callerDiscordId;

  const trainerId = await service.store.getLink(lookupDiscordId);
  if (!trainerId) {
    if (isSelf) {
      return textReply("You aren't linked yet. Run `/link <trainer_id>` first.");
    }
    const who = targetDisplayName ? `**${cleanName(targetDisplayName)}**` : "That user";
    return textReply(`${who} hasn't linked a trainer ID with \`/link\` yet.`);
  }

  const standings = await service.allStandingsForTrainer(trainerId);
  const first = PERIODS.map((p) => standings[p]).find((s) => s !== undefined);
  if (!first) {
    return textReply(
      `Trainer \`${trainerId}\` isn't on an active club roster right now.`
    );
  }

  const fields = PERIODS.map((period) => {
    const s = standings[period];
    const label = period.charAt(0).toUpperCase() + period.slice(1);
    if (!s) {
      return { name: label, value: "No data", inline: true };
    }
    const gainText = s.row.hasBaseline ? formatGain(s.row.gain) : "+0 (new)";
    return {
      name: `${label} (resets ${discordTs(s.resetsAt, "R")})`,
      value: `**${gainText}**\nRank #${s.row.rank} of ${s.rosterSize}`,
      inline: true,
    };
  });

  const clubName = first.info.name
    ? `${first.club.label} (${cleanName(first.info.name)})`
    : first.club.label;

  const embed: APIEmbed = {
    title: `${cleanName(first.row.name)} · Fan Gains`,
    description: `**Club:** ${clubName}\n**Total fans:** ${formatFans(first.row.fans)}\n${freshnessLine(first.info)}`,
    color: COLOR_OK,
    fields,
    footer: { text: `Trainer ID ${first.row.trainerId}` },
  };

  return { embeds: [embed], ephemeral: false };
}

export async function cmdFanGainHistory(
  service: TrackerService,
  callerDiscordId: string,
  options: {
    club?: string | null;
    targetDiscordId?: string | null;
    targetDisplayName?: string | null;
    day?: string | null;
  }
): Promise<CommandReply> {
  if (options.club && options.targetDiscordId) {
    return textReply("Pick a club or a user, not both.");
  }

  const rawDay = options.day ?? "today";
  if (!DAYS.includes(rawDay as HourlyDay)) {
    return textReply("Invalid day. Pick today or yesterday.");
  }
  const day = rawDay as HourlyDay;

  if (options.club) {
    const clubs = resolveClubs(service, options.club);
    if (!clubs) {
      return textReply("Unknown club. Pick Club 1, Club 2, or Both clubs.");
    }

    const embeds: APIEmbed[] = [];
    for (const club of clubs) {
      const view = await service.fanGainHistory(club, day);
      const dayTitle = formatGameDayTitle(view.history.dayStart);
      const titleClub = view.info.name
        ? `${club.label} (${cleanName(view.info.name)})`
        : club.label;
      embeds.push({
        title: `${titleClub} · Hourly fan gain · ${dayTitle}`,
        description: `${hourlyTable(view.history)}\n\n${freshnessLine(view.info)}`,
        color: COLOR_INFO,
        footer: { text: `Resets daily at 15:00 UTC · Club ID ${club.clubId}` },
      });
    }
    return { embeds, ephemeral: false };
  }

  const lookupDiscordId = options.targetDiscordId ?? callerDiscordId;
  const isSelf = lookupDiscordId === callerDiscordId;
  const trainerId = await service.store.getLink(lookupDiscordId);
  if (!trainerId) {
    if (isSelf) {
      return textReply(
        "You aren't linked yet. Run `/link <trainer_id>` first, or pick a `club` option."
      );
    }
    const who = options.targetDisplayName
      ? `**${cleanName(options.targetDisplayName)}**`
      : "That user";
    return textReply(`${who} hasn't linked a trainer ID with \`/link\` yet.`);
  }

  const view = await service.trainerFanGainHistory(trainerId, day);
  if (!view) {
    return textReply(
      `Trainer \`${trainerId}\` isn't on an active club roster right now.`
    );
  }

  const dayTitle = formatGameDayTitle(view.history.dayStart);
  const clubLabel = view.info.name
    ? `${view.club.label} (${cleanName(view.info.name)})`
    : view.club.label;

  let body: string;
  if (!view.history.counted) {
    body =
      "No hourly baseline for this trainer today (joined after the first stored hour of the day). Hourly gains begin next game day.";
  } else {
    body = hourlyTable(view.history);
  }

  const embed: APIEmbed = {
    title: `${cleanName(view.trainerName ?? trainerId)} · Hourly fan gain · ${dayTitle}`,
    description: `**Club:** ${clubLabel}\n${body}\n\n${freshnessLine(view.info)}`,
    color: COLOR_OK,
    footer: { text: `Resets daily at 15:00 UTC · Trainer ID ${trainerId}` },
  };

  return { embeds: [embed], ephemeral: false };
}
