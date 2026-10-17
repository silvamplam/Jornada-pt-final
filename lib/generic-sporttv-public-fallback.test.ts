import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  isSportTvBroadcastChannel,
  publicBroadcastChannelDisplayName,
  resolveBroadcastChannelLogoPresentation,
} from "@/lib/public-broadcast-channel-logo";

test("SportTV genérico é apenas apresentado como Sport TV 1", () => {
  assert.equal(publicBroadcastChannelDisplayName("SportTV"), "Sport TV 1");
  assert.equal(publicBroadcastChannelDisplayName("Sport TV"), "Sport TV 1");
  assert.equal(publicBroadcastChannelDisplayName("Sport TV 2"), "Sport TV 2");
  assert.equal(publicBroadcastChannelDisplayName("BTV"), "BTV");
  assert.equal(isSportTvBroadcastChannel("SportTV"), true);

  assert.deepEqual(
    resolveBroadcastChannelLogoPresentation("SportTV", null),
    { kind: "fallback", name: "Sport TV 1" },
  );
});

test("backfill guarda SportTV genérico e fica limitado à Jornada 09 da Liga 2026/27", () => {
  const migration = readFileSync(path.join(
    process.cwd(),
    "supabase/migrations/20261017131500_generic_sporttv_public_fallback.sql",
  ), "utf8");

  assert.match(migration, /values\s*\(\s*'SportTV'/i);
  assert.doesNotMatch(migration, /set\s+broadcast_channel_id\s*=\s*[^;]*Sport TV 1/i);
  assert.match(migration, /competition\.slug\s*=\s*'liga-portugal'/i);
  assert.match(migration, /season\.label\s*=\s*'2026\/27'/i);
  assert.match(migration, /matchday\.number\s*=\s*9/i);
  assert.match(migration, /match_row\.broadcast_channel_id\s+is\s+null/i);
  assert.match(migration, /lower\(coalesce\(match_row\.status,\s*''\)\)\s*=\s*'scheduled'/i);
});
