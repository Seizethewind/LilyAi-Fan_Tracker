import type { Client } from "@libsql/client";

async function columnNames(client: Client, table: string): Promise<string[]> {
  const res = await client.execute(`PRAGMA table_info(${table})`);
  return res.rows.map((r) => String(r.name));
}

// The Python version made these tables first, and `CREATE TABLE IF NOT EXISTS` never changes an existing one.
// Bring them to the current shape, keeping their rows. Safe to run on every start.
export async function migrateLegacyTables(client: Client): Promise<void> {
  const hours = await columnNames(client, "hour_snapshots");
  if (hours.includes("hour") && !hours.includes("hour_iso")) {
    await client.execute("ALTER TABLE hour_snapshots RENAME COLUMN hour TO hour_iso");
  }

  // The old links table has linked_at NOT NULL, which the current insert never sets.
  if ((await columnNames(client, "links")).includes("linked_at")) {
    await client.batch(
      [
        "DROP TABLE IF EXISTS links_new",
        "CREATE TABLE links_new (discord_id TEXT PRIMARY KEY, trainer_id TEXT NOT NULL)",
        "INSERT INTO links_new (discord_id, trainer_id) SELECT discord_id, trainer_id FROM links",
        "DROP TABLE links",
        "ALTER TABLE links_new RENAME TO links",
      ],
      "write",
    );
  }
}
