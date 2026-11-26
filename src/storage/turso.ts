import { ClubInfo, ClubSnapshot, Period, StandingRow, SyncResult } from "../models.js";
import { iso, parseIso, periodStartDay } from "../timeutil.js";
import { FanStore, HOUR_HISTORY_DAYS, HourRow, computeGain, hourMark } from "./store.js";

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

type SqlParam = string | number | boolean | null;
type Statement = [sql: string, params?: SqlParam[]];
type CellValue = string | number | null;
type Rows = CellValue[][];

interface TursoArg {
  type: "null" | "integer" | "float" | "text";
  value?: string | number;
}

function encodeArg(value: SqlParam): TursoArg {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "boolean") return { type: "integer", value: value ? "1" : "0" };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { type: "integer", value: String(value) } : { type: "float", value };
  }
  return { type: "text", value: String(value) };
}

function decodeCell(cell: { type?: string; value?: unknown }): CellValue {
  if (cell.type === "null") return null;
  if (cell.type === "integer") return Number.parseInt(String(cell.value), 10);
  if (cell.type === "float") return Number(cell.value);
  return cell.value === undefined || cell.value === null ? null : String(cell.value);
}

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS clubs (
    club_id TEXT PRIMARY KEY,
    name TEXT,
    last_synced_at TEXT,
    last_error TEXT,
    last_error_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    club_id TEXT NOT NULL,
    trainer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    fans INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    left_at TEXT,
    PRIMARY KEY (club_id, trainer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS day_snapshots (
    club_id TEXT NOT NULL,
    trainer_id TEXT NOT NULL,
    day TEXT NOT NULL,
    fans INTEGER NOT NULL,
    PRIMARY KEY (club_id, trainer_id, day)
  )`,
  `CREATE TABLE IF NOT EXISTS hour_snapshots (
    club_id TEXT NOT NULL,
    trainer_id TEXT NOT NULL,
    hour TEXT NOT NULL,
    fans INTEGER NOT NULL,
    PRIMARY KEY (club_id, trainer_id, hour)
  )`,
  `CREATE TABLE IF NOT EXISTS links (
    discord_id TEXT PRIMARY KEY,
    trainer_id TEXT NOT NULL,
    linked_at TEXT NOT NULL
  )`,
];

const STANDINGS_SQL = `
SELECT m.trainer_id, m.name, m.fans,
       (SELECT s.fans FROM day_snapshots s
         WHERE s.trainer_id = m.trainer_id AND s.day >= ?
         ORDER BY s.day ASC, (s.club_id = ?) DESC LIMIT 1) AS baseline
FROM members m
WHERE m.club_id = ? AND m.active = 1
`;

const HOUR_ROWS_SQL = `
SELECT h.trainer_id, h.hour, h.fans
FROM hour_snapshots h
JOIN members m ON m.trainer_id = h.trainer_id AND m.club_id = ? AND m.active = 1
WHERE h.hour >= ? AND h.hour <= ?
ORDER BY h.hour ASC
`;

const HISTORY_CHUNK = 200;

export class TursoStore implements FanStore {
  private readonly endpoint: string;
  private readonly authToken: string;
  private readonly timeoutMs: number;
  private readonly filled = new Map<string, string>();

  constructor(url: string, authToken: string, timeoutMs = 20_000) {
    let base = url.trim().replace(/\/+$/, "");
    if (base.startsWith("libsql://")) {
      base = "https://" + base.slice("libsql://".length);
    }
    if (!base.startsWith("https://") && !base.startsWith("http://")) {
      throw new DatabaseError("TURSO_DATABASE_URL must start with libsql:// or https://");
    }
    this.endpoint = `${base}/v2/pipeline`;
    this.authToken = authToken;
    this.timeoutMs = timeoutMs;
  }

  private async execute(sql: string, params: SqlParam[] = []): Promise<Rows> {
    const [rows] = await this.executeMany([[sql, params]]);
    return rows;
  }

  private async executeMany(statements: Statement[]): Promise<Rows[]> {
    if (statements.length === 0) return [];
    const body = {
      requests: [
        ...statements.map(([sql, params = []]) => ({
          type: "execute",
          stmt: { sql, args: params.map(encodeArg) },
        })),
        { type: "close" },
      ],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      throw new DatabaseError(`Turso request failed (${name})`);
    } finally {
      clearTimeout(timer);
    }

    if (response.status !== 200) {
      throw new DatabaseError(`Turso returned HTTP ${response.status}`);
    }

    let results: Array<{
      type?: string;
      error?: { message?: string };
      response?: { result?: { rows?: Array<Array<{ type?: string; value?: unknown }>> } };
    }>;
    try {
      const json = (await response.json()) as { results?: typeof results };
      if (!Array.isArray(json.results)) {
        throw new Error("missing results");
      }
      results = json.results;
    } catch {
      throw new DatabaseError("Turso returned an unreadable response");
    }

    const out: Rows[] = [];
    for (let i = 0; i < statements.length; i += 1) {
      const entry = results[i];
      if (!entry || entry.type !== "ok") {
        const message = entry?.error?.message ?? "unknown error";
        throw new DatabaseError(`Turso statement ${i + 1} failed: ${message}`);
      }
      const rows = entry.response?.result?.rows ?? [];
      out.push(rows.map((row) => row.map(decodeCell)));
    }
    return out;
  }

  async init(): Promise<void> {
    await this.executeMany(SCHEMA.map((sql) => [sql, []]));
  }

  async applySync(snapshot: ClubSnapshot, now: Date): Promise<SyncResult> {
    if (snapshot.members.length === 0) {
      throw new Error("refusing to apply an empty roster");
    }

    const deduped = new Map(snapshot.members.map((m) => [m.trainerId, m]));
    const today = periodStartDay("daily", now);
    const mark = hourMark(now);
    const hourIso = iso(mark);
    const stamp = iso(now);
    const clubId = snapshot.clubId;

    const [knownRows, todayRows, hourFound] = await this.executeMany([
      ["SELECT trainer_id, active FROM members WHERE club_id = ?", [clubId]],
      ["SELECT 1 FROM day_snapshots WHERE club_id = ? AND day = ? LIMIT 1", [clubId, today]],
      ["SELECT 1 FROM hour_snapshots WHERE club_id = ? AND hour = ? LIMIT 1", [clubId, hourIso]],
    ]);

    const known = new Map<string, boolean>();
    for (const [tid, active] of knownRows) {
      known.set(String(tid), Boolean(active));
    }
    const haveTodaySnapshot = todayRows.length > 0;
    const haveHourSnapshot = hourFound.length > 0;

    const present = Array.from(deduped.keys());
    const joined = present.filter((t) => !known.get(t));
    const left = Array.from(known.entries())
      .filter(([t, active]) => active && !deduped.has(t))
      .map(([t]) => t);

    const memberList = Array.from(deduped.values());
    const upsertValues: SqlParam[] = [];
    for (const m of memberList) {
      upsertValues.push(clubId, m.trainerId, m.name, m.fans, stamp, stamp);
    }

    const statements: Statement[] = [
      [
        `INSERT INTO members (club_id, trainer_id, name, fans, active, first_seen_at, last_seen_at, left_at)
         VALUES ${memberList.map(() => "(?, ?, ?, ?, 1, ?, ?, NULL)").join(", ")}
         ON CONFLICT(club_id, trainer_id) DO UPDATE SET
         name = excluded.name, fans = excluded.fans, active = 1,
         last_seen_at = excluded.last_seen_at, left_at = NULL`,
        upsertValues,
      ],
      [
        `UPDATE members SET active = 0, left_at = ? WHERE club_id = ? AND active = 1
         AND trainer_id NOT IN (${present.map(() => "?").join(", ")})`,
        [stamp, clubId, ...present],
      ],
    ];

    if (this.filled.get(clubId) !== today || joined.length > 0) {
      const days: Array<[string, string, string, number]> = [];
      for (const m of memberList) {
        for (const [day, fans] of m.history) {
          if (day <= today) {
            days.push([clubId, m.trainerId, day, fans]);
          }
        }
      }
      for (let i = 0; i < days.length; i += HISTORY_CHUNK) {
        const chunk = days.slice(i, i + HISTORY_CHUNK);
        statements.push([
          `INSERT OR IGNORE INTO day_snapshots (club_id, trainer_id, day, fans)
           VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}`,
          chunk.flat(),
        ]);
      }
    }

    if (!haveTodaySnapshot) {
      const snapValues: SqlParam[] = [];
      for (const m of memberList) {
        snapValues.push(clubId, m.trainerId, today, m.fans);
      }
      statements.push([
        `INSERT OR IGNORE INTO day_snapshots (club_id, trainer_id, day, fans)
         VALUES ${memberList.map(() => "(?, ?, ?, ?)").join(", ")}`,
        snapValues,
      ]);
    }

    if (!haveHourSnapshot) {
      const hourValues: SqlParam[] = [];
      for (const m of memberList) {
        hourValues.push(clubId, m.trainerId, hourIso, m.fans);
      }
      statements.push([
        `INSERT OR IGNORE INTO hour_snapshots (club_id, trainer_id, hour, fans)
         VALUES ${memberList.map(() => "(?, ?, ?, ?)").join(", ")}`,
        hourValues,
      ]);
      const cutoff = iso(new Date(mark.getTime() - HOUR_HISTORY_DAYS * 24 * 60 * 60 * 1000));
      statements.push(["DELETE FROM hour_snapshots WHERE club_id = ? AND hour < ?", [clubId, cutoff]]);
    }

    statements.push([
      `INSERT INTO clubs (club_id, name, last_synced_at, last_error, last_error_at)
       VALUES (?, ?, ?, NULL, NULL)
       ON CONFLICT(club_id) DO UPDATE SET name = COALESCE(excluded.name, clubs.name),
       last_synced_at = excluded.last_synced_at, last_error = NULL, last_error_at = NULL`,
      [clubId, snapshot.clubName, stamp],
    ]);

    await this.executeMany(statements);
    this.filled.set(clubId, today);

    return {
      clubId,
      memberCount: memberList.length,
      joined,
      left,
      tookDaySnapshot: !haveTodaySnapshot,
    };
  }

  async recordSyncError(clubId: string, message: string, now: Date): Promise<void> {
    await this.execute(
      `INSERT INTO clubs (club_id, last_error, last_error_at) VALUES (?, ?, ?)
       ON CONFLICT(club_id) DO UPDATE SET last_error = excluded.last_error,
       last_error_at = excluded.last_error_at`,
      [clubId, message.slice(0, 300), iso(now)]
    );
  }

  async clubInfo(clubId: string): Promise<ClubInfo> {
    const [clubRows, countRows] = await this.executeMany([
      ["SELECT name, last_synced_at, last_error FROM clubs WHERE club_id = ?", [clubId]],
      ["SELECT COUNT(*) FROM members WHERE club_id = ? AND active = 1", [clubId]],
    ]);
    const [name, synced, error] = clubRows[0] ?? [null, null, null];
    const count = Number(countRows[0]?.[0] ?? 0);
    return {
      clubId,
      name: name !== null ? String(name) : null,
      memberCount: count,
      lastSyncedAt: parseIso(synced !== null ? String(synced) : null),
      lastError: error !== null ? String(error) : null,
    };
  }

  async standings(clubId: string, period: Period, now: Date): Promise<StandingRow[]> {
    const startDay = periodStartDay(period, now);
    const rows = await this.execute(STANDINGS_SQL, [startDay, clubId, clubId]);
    const scored = rows.map(([tid, name, fansVal, baseVal]) => {
      const fans = Number(fansVal);
      const base = baseVal === null ? null : Number(baseVal);
      return {
        gain: computeGain(fans, base),
        fans,
        name: String(name),
        trainerId: String(tid),
        hasBaseline: base !== null,
      };
    });

    scored.sort((a, b) => {
      if (b.gain !== a.gain) return b.gain - a.gain;
      if (b.fans !== a.fans) return b.fans - a.fans;
      const nameCmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      if (nameCmp !== 0) return nameCmp;
      return a.trainerId.localeCompare(b.trainerId);
    });

    return scored.map((r, idx) => ({
      rank: idx + 1,
      trainerId: r.trainerId,
      name: r.name,
      fans: r.fans,
      gain: r.gain,
      hasBaseline: r.hasBaseline,
    }));
  }

  async hourRows(clubId: string, start: Date, end: Date): Promise<HourRow[]> {
    const rows = await this.execute(HOUR_ROWS_SQL, [clubId, iso(start), iso(end)]);
    const out: HourRow[] = [];
    for (const [tid, hourVal, fansVal] of rows) {
      const parsed = parseIso(String(hourVal));
      if (parsed) {
        out.push({ trainerId: String(tid), hour: parsed, fans: Number(fansVal) });
      }
    }
    return out;
  }

  async currentFans(clubId: string): Promise<Map<string, number>> {
    const rows = await this.execute(
      "SELECT trainer_id, fans FROM members WHERE club_id = ? AND active = 1",
      [clubId]
    );
    const map = new Map<string, number>();
    for (const [tid, fansVal] of rows) {
      map.set(String(tid), Number(fansVal));
    }
    return map;
  }

  async findActiveMember(trainerId: string): Promise<{ clubId: string; name: string; fans: number } | null> {
    const rows = await this.execute(
      `SELECT club_id, name, fans FROM members WHERE trainer_id = ? AND active = 1
       ORDER BY last_seen_at DESC LIMIT 1`,
      [trainerId]
    );
    if (rows.length === 0) return null;
    const [clubId, name, fans] = rows[0];
    return { clubId: String(clubId), name: String(name), fans: Number(fans) };
  }

  async setLink(discordId: string, trainerId: string, now: Date): Promise<string | null> {
    const previous = await this.getLink(discordId);
    await this.execute(
      `INSERT INTO links (discord_id, trainer_id, linked_at) VALUES (?, ?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET trainer_id = excluded.trainer_id,
       linked_at = excluded.linked_at`,
      [discordId, trainerId, iso(now)]
    );
    return previous;
  }

  async getLink(discordId: string): Promise<string | null> {
    const rows = await this.execute("SELECT trainer_id FROM links WHERE discord_id = ?", [discordId]);
    return rows.length > 0 && rows[0][0] !== null ? String(rows[0][0]) : null;
  }

  async removeLink(discordId: string): Promise<boolean> {
    const existing = await this.getLink(discordId);
    if (existing === null) return false;
    await this.execute("DELETE FROM links WHERE discord_id = ?", [discordId]);
    return true;
  }
}
