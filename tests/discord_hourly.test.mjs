import assert from "node:assert/strict";
import test from "node:test";

import { loadSettings } from "../dist/configuration/load_settings.js";
import { cmdFanGain } from "../dist/discord_commands/cmd_fan_gain.js";
import { cmdFanGainHistory } from "../dist/discord_commands/cmd_fan_gain_history.js";
import { cmdLeaderboard } from "../dist/discord_commands/cmd_leaderboard.js";
import { cmdLink } from "../dist/discord_commands/cmd_link.js";
import { cmdUnlink } from "../dist/discord_commands/cmd_unlink.js";
import { buildSlashCommands } from "../dist/discord_commands/slash_definitions.js";
import { displayWidth } from "../dist/discord_formatting/display_width.js";
import { MemoryStore } from "../dist/fan_storage/fan_store.js";
import { dropStaleDuplicates } from "../dist/fan_tracker/drop_stale_duplicates.js";
import { TrackerService } from "../dist/fan_tracker/tracker_service.js";

test("Discord slash commands, formatting, hourly math, and duplicate resolution", async () => {
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
  let now = new Date("2026-11-04T15:10:00Z");
  let aliceFans = 200_000;
  const source = {
    async fetchClub(clubId) {
      return {
        clubId,
        clubName: clubId === "974470619" ? "Spica" : "Rigil",
        members: [
          { trainerId: "1001", name: "Alice", fans: aliceFans, updated: null, history: [["2026-11-05", 200_000]] },
          { trainerId: "1002", name: "Bob", fans: 350_000, updated: null, history: [["2026-11-05", 350_000]] },
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

  now = new Date("2026-11-04T16:10:00Z");
  aliceFans = 500_000;
  await service.syncAll();

  const linkRes = await cmdLink(service, "d1", "1001");
  assert.match(linkRes.content ?? "", /Linked your account/);

  const lbRes = await cmdLeaderboard(service, "both", "daily", 10);
  assert.equal(lbRes.embeds?.length, 2);

  const fgRes = await cmdFanGain(service, "d1", null, null);
  assert.equal(fgRes.embeds?.length, 1);
  assert.match(fgRes.embeds?.[0]?.title ?? "", /Alice/);

  const badHist = await cmdFanGainHistory(service, "d1", { club: "club1", targetDiscordId: "d1" });
  assert.match(badHist.content ?? "", /not both/i);

  const okHist = await cmdFanGainHistory(service, "d1", { club: "club1", day: "today" });
  assert.equal(okHist.embeds?.length, 1);
  assert.match(okHist.embeds?.[0]?.description ?? "", /300,000/);

  const unlinkRes = await cmdUnlink(service, "d1");
  assert.match(unlinkRes.content ?? "", /Unlinked/);
});
