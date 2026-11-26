import assert from "node:assert/strict";
import test from "node:test";

import { buildTrackerContext } from "../dist/ai_chat/build_tracker_summary.js";
import { ChatAssistant } from "../dist/ai_chat/chat_assistant.js";
import { parseRetryAfter } from "../dist/ai_chat/parse_retry_after.js";
import { stripThinkTags } from "../dist/ai_chat/strip_think_tags.js";
import { SyncRunner } from "../dist/background_sync/sync_runner.js";
import { loadSettings } from "../dist/configuration/load_settings.js";
import { MemoryStore } from "../dist/fan_storage/fan_store.js";
import { TrackerService } from "../dist/fan_tracker/tracker_service.js";
import { createApiApp } from "../dist/http_api/create_api_app.js";
import { ChatErrorLike } from "./helpers.mjs";

test("AI Assistant injects live club context, reply chain, cooldown, and outage backoff", async () => {
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
  let calls = 0;
  const assistant = new ChatAssistant(
    {
      async chat(messages) {
        calls += 1;
        if (shouldFail) throw new ChatErrorLike("upstream 429", 90);
        captured = messages;
        return "<think>plan</think>Alice is #1 today.";
      },
    },
    10,
    60,
    () => nowMs
  );

  const ctx = await buildTrackerContext(service, "d1");
  const ok = await assistant.handleMention(
    { authorId: "d1", authorName: "Alice", channelId: "c1", content: "<@bot> Who leads Club 1?" },
    null,
    "bot",
    ctx.summaryText,
    [{ role: "user", content: "Bob: Did we sync yet?" }]
  );
  assert.equal(ok.status, "answered");
  assert.equal(ok.text, "Alice is #1 today.");
  assert.ok(captured[0].content.includes("Spica"));
  assert.ok(captured[1].content.includes("Did we sync yet?"));

  const cooldown = await assistant.handleMention(
    { authorId: "d1", authorName: "Alice", channelId: "c1", content: "<@bot> Again?" },
    null,
    "bot",
    ctx.summaryText
  );
  assert.equal(cooldown.status, "cooldown");
  assert.equal(calls, 1);

  nowMs += 15_000;
  shouldFail = true;
  const outage = await assistant.handleMention(
    { authorId: "d1", authorName: "Alice", channelId: "c1", content: "<@bot> Test outage" },
    null,
    "bot",
    ctx.summaryText
  );
  assert.equal(outage.status, "unavailable");
  assert.equal(outage.waitSeconds, 90);
  assert.equal(calls, 2);

  nowMs += 10_000;
  const backoff = await assistant.handleMention(
    { authorId: "d2", authorName: "Bob", channelId: "c1", content: "<@bot> Blocked?" },
    null,
    "bot",
    ctx.summaryText
  );
  assert.equal(backoff.status, "unavailable");
  assert.equal(calls, 2);
});

test("HTTP API enforces Bearer auth and serves chat context, hourly, and chat replies", async () => {
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
  const assistant = new ChatAssistant(
    { async chat() { return "Spica leads today."; } },
    0
  );

  const app = createApiApp({
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
        bot_id: "lily-bot",
        message: { author_id: "u1", author_name: "Alice", content: "<@lily-bot> How is Spica doing?" },
      }),
    });
    assert.equal(chatRes.status, 200);
    const chatBody = await chatRes.json();
    assert.equal(chatBody.reply, "Spica leads today.");

    const hourlyRes = await fetch(`${base}/api/dashboard/hourly?club=club1&day=today`);
    assert.equal(hourlyRes.status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
