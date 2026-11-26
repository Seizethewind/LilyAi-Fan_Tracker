import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../dist/server/api.js";
import { ConfigError, loadSettings, validateForRuntime } from "../dist/server/config.js";
import {
  cmdFanGain,
  cmdFanGainHistory,
  cmdLeaderboard,
  cmdLink,
  cmdUnlink,
} from "../dist/server/commands.js";
import { buildSlashCommands } from "../dist/server/discord_bot.js";
import { displayWidth } from "../dist/server/formatting.js";
import { AiAssistant, LlmError, parseRetryAfter, stripThinkTags } from "../dist/server/llm.js";
import { SyncRunner } from "../dist/server/runner.js";
import { TrackerService, dropStaleDuplicates } from "../dist/server/services/tracker.js";
import { MemoryStore } from "../dist/server/storage/store.js";
import { gameDay, nextReset, periodStartDay } from "../dist/server/timeutil.js";

test("Render deployment requires both Turso credentials", () => {
  const missing = loadSettings({ RENDER: "true" });
  assert.throws(() => validateForRuntime(missing), ConfigError);

  const partial = loadSettings({ RENDER: "true", TURSO_DATABASE_URL: "libsql://db.turso.io" });
  assert.throws(() => validateForRuntime(partial), ConfigError);

  const valid = loadSettings({
    RENDER: "true",
    TURSO_DATABASE_URL: "libsql://db.turso.io",
    TURSO_AUTH_TOKEN: "token-123",
  });
  assert.doesNotThrow(() => validateForRuntime(valid));
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

test("Discord slash commands, formatting, and duplicate resolution", async () => {
  assert.equal(displayWidth("Alice"), 5);
  assert.equal(displayWidth("アリス"), 6);

  const deduped = dropStaleDuplicates({
    club1: {
      clubId: "c1",
      clubName: "Spica",
      members: [{ trainerId: "t1", name: "Alice", fans: 500, updated: "2026-11-04T12:00:00Z", history: [] }],
    },
    club2: {
      clubId: "c2",
      clubName: "Rigil",
      members: [{ trainerId: "t1", name: "Alice", fans: 400, updated: "2026-11-03T12:00:00Z", history: [] }],
    },
  });
  assert.equal(deduped.club1.members.length, 1);
  assert.equal(deduped.club2.members.length, 0);

  const store = new MemoryStore();
  await store.init();
  const now = new Date("2026-11-04T17:30:00Z");
  const source = {
    async fetchClub(clubId) {
      return {
        clubId,
        clubName: clubId === "974470619" ? "Spica" : "Rigil",
        members: [
          { trainerId: "1001", name: "Alice", fans: 500_000, updated: null, history: [["2026-11-05", 200_000]] },
          { trainerId: "1002", name: "Bob", fans: 350_000, updated: null, history: [["2026-11-05", 300_000]] },
        ],
      };
    },
  };

  const settings = loadSettings({});
  const slashDefs = buildSlashCommands(settings);
  assert.deepEqual(
    slashDefs.map((c) => c.name).sort(),
    ["fan_gain", "fan_gain_history", "leaderboard", "link", "unlink"]
  );

  const service = new TrackerService(store, source, settings.clubs, () => now);
  await service.syncAll();

  const linkRes = await cmdLink(service, "d1", "1001");
  assert.match(linkRes.content, /Linked your account/);

  const lbRes = await cmdLeaderboard(service, "both", "daily", 10);
  assert.equal(lbRes.embeds.length, 2);

  const fgRes = await cmdFanGain(service, "d1", null, null);
  assert.equal(fgRes.embeds.length, 1);
  assert.match(fgRes.embeds[0].title, /Alice/);

  const badHist = await cmdFanGainHistory(service, "d1", { club: "club1", targetDiscordId: "d1" });
  assert.match(badHist.content, /not both/i);

  const okHist = await cmdFanGainHistory(service, "d1", { club: "club1", day: "today" });
  assert.equal(okHist.embeds.length, 1);

  const unlinkRes = await cmdUnlink(service, "d1");
  assert.match(unlinkRes.content, /Unlinked/);
});

test("AI Assistant injects live club context, reply history, cooldown, and outage backoff", async () => {
  assert.equal(stripThinkTags("<think>hidden</think>Visible"), "Visible");
  assert.equal(parseRetryAfter("45"), 45);

  const store = new MemoryStore();
  await store.init();
  let nowMs = Date.parse("2026-11-04T17:30:00Z");
  const source = {
    async fetchClub(clubId) {
      return {
        clubId,
        clubName: clubId === "974470619" ? "Spica" : "Rigil",
        members: [
          { trainerId: "1001", name: "Alice", fans: 500_000, updated: null, history: [["2026-11-05", 200_000]] },
        ],
      };
    },
  };
  const settings = loadSettings({});
  const service = new TrackerService(store, source, settings.clubs, () => new Date(nowMs));
  await service.syncAll();
  await service.link("d1", "1001");

  let captured = null;
  let shouldFail = false;
  let providerCalls = 0;
  const assistant = new AiAssistant({
    provider: {
      async complete(messages) {
        providerCalls += 1;
        if (shouldFail) throw new LlmError("upstream 429", 429, 90);
        captured = messages;
        return { content: "<think>plan</think>Alice is #1 today.", model: "router-auto" };
      },
    },
    service,
    model: "router-auto",
    userCooldownSeconds: 10,
    clock: () => new Date(nowMs),
  });

  const ok = await assistant.answer({
    userKey: "d1",
    question: "Who leads Club 1?",
    history: [{ role: "user", author: "Bob", content: "Did we sync yet?" }],
    discordUserId: "d1",
  });
  assert.equal(ok.reply, "Alice is #1 today.");
  assert.equal(ok.unavailable, false);
  assert.ok(captured[0].content.includes("Spica"));
  assert.ok(captured[1].content.includes("Did we sync yet?"));

  const cooldown = await assistant.answer({ userKey: "d1", question: "Again?" });
  assert.equal(cooldown.cooldownRemaining, 10);
  assert.equal(providerCalls, 1);

  nowMs += 15_000;
  shouldFail = true;
  const outage = await assistant.answer({ userKey: "d1", question: "Test outage" });
  assert.equal(outage.unavailable, true);
  assert.equal(outage.retryAfterSeconds, 90);
  assert.equal(providerCalls, 2);

  nowMs += 10_000;
  const backoff = await assistant.answer({ userKey: "d2", question: "Blocked?" });
  assert.equal(backoff.unavailable, true);
  assert.equal(providerCalls, 2);
});

test("HTTP API enforces Bearer auth and serves chat context and test replies", async () => {
  const store = new MemoryStore();
  await store.init();
  const now = new Date("2026-11-04T17:30:00Z");
  const source = {
    async fetchClub(clubId) {
      return {
        clubId,
        clubName: clubId === "974470619" ? "Spica" : "Rigil",
        members: [
          { trainerId: "1001", name: "Alice", fans: 500_000, updated: null, history: [["2026-11-05", 200_000]] },
        ],
      };
    },
  };
  const settings = loadSettings({ API_READ_KEY: "read-secret", API_WRITE_KEY: "write-secret" });
  const service = new TrackerService(store, source, settings.clubs, () => now);
  await service.syncAll();
  const syncRunner = new SyncRunner(service, 300);
  const assistant = new AiAssistant({
    provider: {
      async complete() {
        return { content: "Spica leads today.", model: "test-model" };
      },
    },
    service,
    model: "test-model",
    userCooldownSeconds: 0,
  });

  const app = createApp({
    settings,
    service,
    syncRunner,
    discordStatus: () => ({ state: "disabled", latency_ms: null, error: null }),
    assistant,
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  try {
    const addr = server.address();
    const base = `http://127.0.0.1:${addr.port}`;

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);

    const unauth = await fetch(`${base}/api/v1/chat/context`);
    assert.equal(unauth.status, 401);

    const ctxRes = await fetch(`${base}/api/v1/chat/context`, {
      headers: { Authorization: "Bearer read-secret" },
    });
    assert.equal(ctxRes.status, 200);
    const ctxBody = await ctxRes.json();
    assert.equal(ctxBody.ai_enabled, true);
    assert.equal(ctxBody.context.clubs.length, 2);

    const chatRes = await fetch(`${base}/api/v1/chat`, {
      method: "POST",
      headers: {
        Authorization: "Bearer read-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "How is Spica doing?" }],
        replied_text: "Checking daily gains",
      }),
    });
    assert.equal(chatRes.status, 200);
    const chatBody = await chatRes.json();
    assert.equal(chatBody.reply, "Spica leads today.");
    assert.equal(chatBody.model, "test-model");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
