import assert from "node:assert/strict";
import test from "node:test";

import { ConfigError } from "../dist/configuration/config_types.js";
import { loadSettings } from "../dist/configuration/load_settings.js";
import { validateForRuntime } from "../dist/configuration/validate_for_runtime.js";
import { MemoryStore } from "../dist/fan_storage/fan_store.js";
import { initStore } from "../dist/fan_storage/init_store.js";
import { gameDay } from "../dist/time_boundaries/game_day.js";
import { nextReset } from "../dist/time_boundaries/next_reset.js";
import { periodStartDay } from "../dist/time_boundaries/period_start_day.js";

test("Render deployment requires both Turso credentials", () => {
  const missing = loadSettings({ RENDER: "true" });
  assert.throws(() => validateForRuntime(missing), ConfigError);

  const partial = loadSettings({ RENDER: "true", TURSO_DATABASE_URL: "libsql://db.turso.io" });
  assert.throws(() => validateForRuntime(partial), ConfigError);

  const valid = loadSettings({
    RENDER: "true",
    PORT: "10000",
    TURSO_DATABASE_URL: "libsql://db.turso.io",
    TURSO_AUTH_TOKEN: "token-123",
  });
  assert.doesNotThrow(() => validateForRuntime(valid));
  assert.equal(valid.port, 10000);
});

test("15:00 UTC reset boundaries and month-capped weeks", () => {
  const beforeReset = new Date("2026-11-01T14:59:00Z");
  const afterReset = new Date("2026-11-01T15:01:00Z");
  assert.equal(gameDay(beforeReset), "2026-11-01");
  assert.equal(gameDay(afterReset), "2026-11-02");
  assert.equal(periodStartDay("monthly", afterReset), "2026-11-01");
  assert.equal(periodStartDay("weekly", afterReset), "2026-11-02");
  assert.equal(nextReset("daily", beforeReset).toISOString(), "2026-11-01T15:00:00.000Z");
});

test("initStore falls back to MemoryStore locally when Turso is unreachable", async () => {
  const settings = loadSettings({
    TURSO_DATABASE_URL: "https://127.0.0.1:1",
    TURSO_AUTH_TOKEN: "invalid-token",
  });
  const store = await initStore(settings);
  assert.ok(store instanceof MemoryStore);
  await store.close();
});
