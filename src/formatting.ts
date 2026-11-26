import { HourlyHistory } from "./hourly.js";
import { ClubInfo, StandingRow } from "./models.js";

const NAME_WIDTH = 16;

function isWideCodePoint(cp: number): boolean {
  return (
    cp >= 0x1100 &&
    (cp <= 0x115f ||
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x2fffd) ||
      (cp >= 0x30000 && cp <= 0x3fffd))
  );
}

export function cleanName(raw: string): string {
  return raw
    .replace(/[\r\n\t`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    width += isWideCodePoint(cp) ? 2 : 1;
  }
  return width;
}

export function fit(text: string, width: number): string {
  const cleaned = cleanName(text);
  if (displayWidth(cleaned) <= width) {
    return cleaned + " ".repeat(width - displayWidth(cleaned));
  }
  let out = "";
  let used = 0;
  for (const ch of cleaned) {
    const cp = ch.codePointAt(0) ?? 0;
    const w = isWideCodePoint(cp) ? 2 : 1;
    if (used + w > width - 1) break;
    out += ch;
    used += w;
  }
  out += "…";
  used += 1;
  return out + " ".repeat(Math.max(0, width - used));
}

export function padLeft(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

export function padRight(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

export function formatFans(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatGain(n: number): string {
  return `+${n.toLocaleString("en-US")}`;
}

export function discordTs(date: Date, style: "R" | "f" | "F" | "t" = "R"): string {
  const unix = Math.floor(date.getTime() / 1000);
  return `<t:${unix}:${style}>`;
}

export function freshnessLine(info: ClubInfo): string {
  const parts: string[] = [];
  if (info.lastSyncedAt) {
    parts.push(`Updated ${discordTs(info.lastSyncedAt, "R")}`);
  } else {
    parts.push("Not synced yet");
  }
  if (info.memberCount > 0) {
    parts.push(`${info.memberCount} members`);
  }
  if (info.lastError) {
    parts.push(`Last sync error: ${info.lastError}`);
  }
  return parts.join(" · ");
}

export function leaderboardTable(rows: readonly StandingRow[]): string {
  if (rows.length === 0) {
    return "No roster data yet.";
  }

  const lines: string[] = [];
  const header = `${padLeft("#", 2)}  ${padRight("Trainer", NAME_WIDTH)}  ${padLeft("Gain", 11)}  ${padLeft("Fans", 13)}`;
  lines.push(header);

  let anyNew = false;
  for (const row of rows) {
    const gainText = row.hasBaseline ? formatGain(row.gain) : "+0*";
    if (!row.hasBaseline) anyNew = true;
    lines.push(
      `${padLeft(String(row.rank), 2)}  ${fit(row.name, NAME_WIDTH)}  ${padLeft(gainText, 11)}  ${padLeft(formatFans(row.fans), 13)}`
    );
  }

  let block = `\`\`\`\n${lines.join("\n")}\n\`\`\``;
  if (anyNew) {
    block += "\n`*` Joined during this period — gain tracking begins next reset.";
  }
  return block;
}

function formatUtcHm(date: Date): string {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatGameDayTitle(date: Date): string {
  // Game day corresponds to JST date of dayStart (15:00 UTC -> +9h -> 00:00 JST next calendar date)
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const weekday = jst.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const day = String(jst.getUTCDate()).padStart(2, "0");
  const month = jst.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${weekday} ${day} ${month}`;
}

export function hourlyTable(history: HourlyHistory): string {
  if (history.lines.length === 0) {
    return "No hourly snapshots stored for this day yet.";
  }

  const timeCol = 11;
  const gainCol = 11;
  const totalCol = 13;

  const lines: string[] = [];
  lines.push(
    `${padRight("UTC", timeCol)} ${padLeft("This hour", gainCol)}  ${padLeft("Since reset", totalCol)}`
  );

  for (const line of history.lines) {
    let label = formatUtcHm(line.time);
    if (line.live) {
      label = `${label}*`;
    } else if (line.hours > 1) {
      label = `${label} (${line.hours}h)`;
    }
    lines.push(
      `${padRight(label, timeCol)} ${padLeft(formatGain(line.gain), gainCol)}  ${padLeft(formatGain(line.sinceReset), totalCol)}`
    );
  }

  lines.push(
    `${padRight("Total", timeCol)} ${padLeft("", gainCol)}  ${padLeft(formatGain(history.total), totalCol)}`
  );

  let out = `\`\`\`\n${lines.join("\n")}\n\`\`\``;
  if (history.startsLate && history.firstMark) {
    out += `\nHourly tracking began at ${formatUtcHm(history.firstMark)} UTC.`;
  }
  return out;
}
