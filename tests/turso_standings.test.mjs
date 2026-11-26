import assert from "node:assert/strict";
import test from "node:test";

import { TursoStore } from "../dist/fan_storage/turso_store.js";

const member = (fans) => ({ trainerId: "10", name: "x", fans, updated: null, history: [] });
const snap = (clubId, fans) => ({ clubId, clubName: clubId, members: [member(fans)] });

test("Turso standings work for every period", async () => {
  const store = new TursoStore(":memory:", "unused");
  await store.init();
  await store.applySync(snap("1", 100), new Date("2026-11-27T00:00:00Z"));
  await store.applySync(snap("1", 175), new Date("2026-11-27T00:05:00Z"));

  for (const period of ["daily", "weekly", "monthly"]) {
    const [row] = await store.standings("1", period, new Date("2026-11-27T00:30:00Z"));
    assert.equal(row.gain, 75);
  }
});

test("Turso standings prefer the current club's baseline on the same day", async () => {
  const store = new TursoStore(":memory:", "unused");
  await store.init();
  await store.applySync(snap("1", 100), new Date("2026-11-27T00:00:00Z"));
  await store.applySync(snap("2", 140), new Date("2026-11-27T00:05:00Z"));
  await store.applySync(snap("2", 200), new Date("2026-11-27T00:10:00Z"));

  const [row] = await store.standings("2", "daily", new Date("2026-11-27T00:30:00Z"));
  assert.equal(row.gain, 60);
});
