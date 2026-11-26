import { Client, InStatement } from "@libsql/client";

import { ClubSnapshot, SyncResult } from "../domain_models/types.js";
import { formatIso } from "../time_boundaries/format_iso.js";
import { periodStartDay } from "../time_boundaries/period_start_day.js";
import { hourMark } from "./hour_mark.js";

const HOUR_HISTORY_DAYS = 8;

export async function tursoApplySync(
  client: Client,
  filled: Map<string, string>,
  snapshot: ClubSnapshot,
  now: Date
): Promise<SyncResult> {
  if (snapshot.members.length === 0) throw new Error("refusing to apply an empty roster");
  const deduped = new Map(snapshot.members.map((m) => [m.trainerId, m]));
  const today = periodStartDay("daily", now);
  const mark = hourMark(now);
  const hourIso = formatIso(mark);
  const stamp = formatIso(now);
  const clubId = snapshot.clubId;

  const existingRows = await client.execute({
    sql: "SELECT trainer_id, active FROM members WHERE club_id = ?",
    args: [clubId],
  });
  const known = new Map<string, boolean>();
  for (const r of existingRows.rows) {
    known.set(String(r.trainer_id), Number(r.active) === 1);
  }

  const dayCheck = await client.execute({
    sql: "SELECT 1 FROM day_snapshots WHERE club_id = ? AND day = ? LIMIT 1",
    args: [clubId, today],
  });
  const haveToday = dayCheck.rows.length > 0;

  const hourCheck = await client.execute({
    sql: "SELECT 1 FROM hour_snapshots WHERE club_id = ? AND hour_iso = ? LIMIT 1",
    args: [clubId, hourIso],
  });
  const haveHour = hourCheck.rows.length > 0;

  const joined = Array.from(deduped.keys()).filter((id) => !known.get(id));
  const left = Array.from(known.entries())
    .filter(([id, active]) => active && !deduped.has(id))
    .map(([id]) => id);

  const stmts: InStatement[] = [];
  for (const m of deduped.values()) {
    stmts.push({
      sql: `INSERT INTO members (club_id, trainer_id, name, fans, active, first_seen_at, last_seen_at, left_at)
            VALUES (?, ?, ?, ?, 1, ?, ?, NULL)
            ON CONFLICT(club_id, trainer_id) DO UPDATE SET
              name = excluded.name, fans = excluded.fans, active = 1,
              last_seen_at = excluded.last_seen_at, left_at = NULL`,
      args: [clubId, m.trainerId, m.name, m.fans, stamp, stamp],
    });
  }
  for (const id of left) {
    stmts.push({
      sql: "UPDATE members SET active = 0, left_at = ? WHERE club_id = ? AND trainer_id = ?",
      args: [stamp, clubId, id],
    });
  }
  if (filled.get(clubId) !== today || joined.length > 0) {
    for (const m of deduped.values()) {
      for (const [day, fans] of m.history) {
        if (day <= today) {
          stmts.push({
            sql: "INSERT OR IGNORE INTO day_snapshots (club_id, trainer_id, day, fans) VALUES (?, ?, ?, ?)",
            args: [clubId, m.trainerId, day, fans],
          });
        }
      }
    }
  }
  if (!haveToday) {
    for (const m of deduped.values()) {
      stmts.push({
        sql: "INSERT OR IGNORE INTO day_snapshots (club_id, trainer_id, day, fans) VALUES (?, ?, ?, ?)",
        args: [clubId, m.trainerId, today, m.fans],
      });
    }
  }
  if (!haveHour) {
    for (const m of deduped.values()) {
      stmts.push({
        sql: "INSERT OR IGNORE INTO hour_snapshots (club_id, trainer_id, hour_iso, fans) VALUES (?, ?, ?, ?)",
        args: [clubId, m.trainerId, hourIso, m.fans],
      });
    }
    const cutoff = formatIso(new Date(mark.getTime() - HOUR_HISTORY_DAYS * 86_400_000));
    stmts.push({
      sql: "DELETE FROM hour_snapshots WHERE club_id = ? AND hour_iso < ?",
      args: [clubId, cutoff],
    });
  }
  stmts.push({
    sql: `INSERT INTO clubs (club_id, name, last_synced_at, last_error, last_error_at)
          VALUES (?, ?, ?, NULL, NULL)
          ON CONFLICT(club_id) DO UPDATE SET
            name = COALESCE(excluded.name, clubs.name),
            last_synced_at = excluded.last_synced_at,
            last_error = NULL, last_error_at = NULL`,
    args: [clubId, snapshot.clubName, stamp],
  });
  await client.batch(stmts, "write");
  filled.set(clubId, today);
  return { clubId, memberCount: deduped.size, joined, left, tookDaySnapshot: !haveToday };
}
