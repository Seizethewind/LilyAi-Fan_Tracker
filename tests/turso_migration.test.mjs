import assert from "node:assert/strict";
import test from "node:test";

import { TursoStore } from "../dist/fan_storage/turso_store.js";

// The tables as the Python version created them: hour_snapshots.hour and links.linked_at.
const LEGACY = [
  "CREATE TABLE hour_snapshots (club_id TEXT NOT NULL, trainer_id TEXT NOT NULL, hour TEXT NOT NULL, fans INTEGER NOT NULL, PRIMARY KEY (club_id, trainer_id, hour))",
  "CREATE TABLE links (discord_id TEXT PRIMARY KEY, trainer_id TEXT NOT NULL, linked_at TEXT NOT NULL)",
  "INSERT INTO hour_snapshots VALUES ('c1', 't1', '2026-11-26T01:00:00Z', 500)",
  "INSERT INTO links VALUES ('d1', 't1', '2026-11-22T00:00:00Z')",
];

test("a database made by the old version is migrated and keeps its rows", async () => {
  const store = new TursoStore(":memory:", "unused");
  for (const sql of LEGACY) await store.client.execute(sql);

  await store.init();
  await store.init(); // running again changes nothing

  const hours = await store.client.execute("SELECT hour_iso, fans FROM hour_snapshots WHERE club_id = 'c1'");
  assert.deepEqual(hours.rows.map((r) => [r.hour_iso, Number(r.fans)]), [["2026-11-26T01:00:00Z", 500]]);
  await store.client.execute("INSERT OR IGNORE INTO hour_snapshots (club_id, trainer_id, hour_iso, fans) VALUES ('c1', 't1', '2026-11-26T02:00:00Z', 510)");

  assert.equal(await store.getLink("d1"), "t1");
  assert.equal(await store.setLink("d2", "t2", new Date("2026-11-27T00:00:00Z")), null); // no linked_at needed
  assert.equal(await store.getLink("d2"), "t2");
});

test("a new database needs no migration", async () => {
  const store = new TursoStore(":memory:", "unused");
  await store.init();
  assert.equal(await store.setLink("d1", "t1", new Date()), null);
});
