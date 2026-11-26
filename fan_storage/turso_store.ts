import { Client, createClient } from "@libsql/client";

import {
  ClubInfo,
  ClubSnapshot,
  HourlyHistoryResult,
  Period,
  StandingRow,
  SyncResult,
} from "../domain_models/types.js";
import { dayResetWindow } from "../time_boundaries/day_reset_window.js";
import { formatIso } from "../time_boundaries/format_iso.js";
import { parseIso } from "../time_boundaries/parse_iso.js";
import { periodStartDay } from "../time_boundaries/period_start_day.js";
import { buildHourlyRows, HourSnapshotPoint } from "./build_hourly_rows.js";
import { computeGain } from "./compute_gain.js";
import { StoreAdapter } from "./store_adapter.js";
import { tursoApplySync } from "./turso_apply_sync.js";
import { migrateLegacyTables } from "./turso_migrate.js";
import { TURSO_SCHEMA_STATEMENTS } from "./turso_schema.js";

export class TursoStore implements StoreAdapter {
  private readonly client: Client;
  private readonly filled = new Map<string, string>();

  constructor(url: string, authToken: string) {
    this.client = createClient({ url, authToken });
  }

  async init(): Promise<void> {
    for (const sql of TURSO_SCHEMA_STATEMENTS) {
      await this.client.execute(sql);
    }
    await migrateLegacyTables(this.client);
  }

  async applySync(snapshot: ClubSnapshot, now: Date): Promise<SyncResult> {
    return tursoApplySync(this.client, this.filled, snapshot, now);
  }

  async recordSyncError(clubId: string, message: string, now: Date): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO clubs (club_id, name, last_synced_at, last_error, last_error_at)
            VALUES (?, NULL, NULL, ?, ?)
            ON CONFLICT(club_id) DO UPDATE SET
              last_error = excluded.last_error, last_error_at = excluded.last_error_at`,
      args: [clubId, message.slice(0, 300), formatIso(now)],
    });
  }

  async clubInfo(clubId: string): Promise<ClubInfo> {
    const clubRes = await this.client.execute({
      sql: "SELECT name, last_synced_at, last_error FROM clubs WHERE club_id = ?",
      args: [clubId],
    });
    const countRes = await this.client.execute({
      sql: "SELECT COUNT(*) AS cnt FROM members WHERE club_id = ? AND active = 1",
      args: [clubId],
    });
    const row = clubRes.rows[0];
    return {
      clubId,
      name: row?.name ? String(row.name) : null,
      memberCount: Number(countRes.rows[0]?.cnt ?? 0),
      lastSyncedAt: parseIso(row?.last_synced_at ? String(row.last_synced_at) : null),
      lastError: row?.last_error ? String(row.last_error) : null,
    };
  }

  async standings(clubId: string, period: Period, now: Date): Promise<StandingRow[]> {
    const startDay = periodStartDay(period, now);
    const res = await this.client.execute({
      sql: `SELECT m.trainer_id, m.name, m.fans,
              (SELECT d.fans FROM day_snapshots d
               WHERE d.trainer_id = m.trainer_id AND d.day >= ?
               ORDER BY d.day ASC, (d.club_id = m.club_id) DESC LIMIT 1) AS base_fans
            FROM members m WHERE m.club_id = ? AND m.active = 1`,
      args: [startDay, clubId],
    });
    const scored = res.rows.map((r) => {
      const fans = Number(r.fans);
      const base = r.base_fans === null || r.base_fans === undefined ? null : Number(r.base_fans);
      return {
        trainerId: String(r.trainer_id),
        name: String(r.name),
        fans,
        gain: computeGain(fans, base),
        hasBaseline: base !== null,
      };
    });
    scored.sort((a, b) =>
      b.gain - a.gain || b.fans - a.fans ||
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
      a.trainerId.localeCompare(b.trainerId)
    );
    return scored.map((r, i) => ({ rank: i + 1, ...r }));
  }

  async findActiveMember(trainerId: string) {
    const res = await this.client.execute({
      sql: "SELECT club_id, name, fans FROM members WHERE trainer_id = ? AND active = 1 ORDER BY last_seen_at DESC LIMIT 1",
      args: [trainerId],
    });
    const r = res.rows[0];
    return r ? { clubId: String(r.club_id), name: String(r.name), fans: Number(r.fans) } : null;
  }

  async hourlyClubHistory(clubId: string, day: "today" | "yesterday", now: Date): Promise<HourlyHistoryResult> {
    const { startUtc, endUtc } = dayResetWindow(day, now);
    const rosterRes = await this.client.execute({
      sql: "SELECT trainer_id, fans FROM members WHERE club_id = ? AND active = 1",
      args: [clubId],
    });
    const roster = rosterRes.rows.map((r) => ({ trainerId: String(r.trainer_id), fans: Number(r.fans) }));
    const snapRes = await this.client.execute({
      sql: "SELECT trainer_id, hour_iso, fans FROM hour_snapshots WHERE hour_iso >= ? AND hour_iso <= ?",
      args: [formatIso(startUtc), formatIso(endUtc)],
    });
    const snapshots: HourSnapshotPoint[] = snapRes.rows.map((r) => ({
      trainerId: String(r.trainer_id),
      hourIso: String(r.hour_iso),
      fans: Number(r.fans),
    }));
    return buildHourlyRows({ day, now, roster, snapshots });
  }

  async hourlyTrainerHistory(trainerId: string, day: "today" | "yesterday", now: Date): Promise<HourlyHistoryResult | null> {
    const found = await this.findActiveMember(trainerId);
    if (!found) return null;
    const { startUtc, endUtc } = dayResetWindow(day, now);
    const snapRes = await this.client.execute({
      sql: "SELECT trainer_id, hour_iso, fans FROM hour_snapshots WHERE trainer_id = ? AND hour_iso >= ? AND hour_iso <= ?",
      args: [trainerId, formatIso(startUtc), formatIso(endUtc)],
    });
    const snapshots: HourSnapshotPoint[] = snapRes.rows.map((r) => ({
      trainerId: String(r.trainer_id),
      hourIso: String(r.hour_iso),
      fans: Number(r.fans),
    }));
    return buildHourlyRows({ day, now, roster: [{ trainerId, fans: found.fans }], snapshots, singleTrainerId: trainerId });
  }

  async setLink(discordId: string, trainerId: string): Promise<string | null> {
    const prev = await this.getLink(discordId);
    await this.client.execute({
      sql: "INSERT INTO links (discord_id, trainer_id) VALUES (?, ?) ON CONFLICT(discord_id) DO UPDATE SET trainer_id = excluded.trainer_id",
      args: [discordId, trainerId],
    });
    return prev;
  }

  async getLink(discordId: string): Promise<string | null> {
    const res = await this.client.execute({ sql: "SELECT trainer_id FROM links WHERE discord_id = ?", args: [discordId] });
    return res.rows[0]?.trainer_id ? String(res.rows[0].trainer_id) : null;
  }

  async removeLink(discordId: string): Promise<boolean> {
    const res = await this.client.execute({ sql: "DELETE FROM links WHERE discord_id = ?", args: [discordId] });
    return res.rowsAffected > 0;
  }

  async close(): Promise<void> { this.client.close(); }
}
