import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PUBLIC_MATCH_STRIP_MAX_MATCH_IDS,
  PUBLIC_MATCH_STRIP_REFRESH_INTERVAL_MS,
  mergePublicMatchStripLiveUpdates,
  parsePublicMatchStripMatchIds,
  type PublicMatchStripLiveUpdate
} from "@/lib/public-match-strip-live-refresh";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

function update(
  id: string,
  overrides: Partial<PublicMatchStripLiveUpdate> = {}
): PublicMatchStripLiveUpdate {
  return {
    id,
    status: "scheduled",
    minute: null,
    live_started_at: null,
    live_base_minute: null,
    is_clock_running: false,
    home_score: null,
    away_score: null,
    ...overrides
  };
}

test("refresh publico usa intervalo controlado de 15 segundos", () => {
  assert.equal(PUBLIC_MATCH_STRIP_REFRESH_INTERVAL_MS, 15_000);
  assert.equal(PUBLIC_MATCH_STRIP_MAX_MATCH_IDS, 50);
});

test("ids publicos aceitam apenas UUID, removem repetidos e preservam ordem", () => {
  assert.deepEqual(
    parsePublicMatchStripMatchIds(`${firstId},invalid,${secondId},${firstId.toUpperCase()}`),
    [firstId, secondId]
  );
});

test("merge atualiza apenas estado dinamico e preserva dados editoriais", () => {
  const matches = [{
    ...update(firstId),
    scheduled_date: "2026-08-08",
    homeTeam: { name: "Casa" }
  }];

  const merged = mergePublicMatchStripLiveUpdates(matches, [update(firstId, {
    status: "live",
    minute: 31,
    live_started_at: "2026-08-08T20:31:00.000Z",
    live_base_minute: 30,
    is_clock_running: true,
    home_score: 1,
    away_score: 0
  })]);

  assert.notEqual(merged, matches);
  assert.equal(merged[0].status, "live");
  assert.equal(merged[0].home_score, 1);
  assert.equal(merged[0].scheduled_date, "2026-08-08");
  assert.deepEqual(merged[0].homeTeam, { name: "Casa" });
});

test("merge preserva referências quando a resposta não traz alterações", () => {
  const matches = [update(firstId, { status: "live", minute: 12 })];
  const merged = mergePublicMatchStripLiveUpdates(matches, [update(firstId, {
    status: "live",
    minute: 12
  })]);

  assert.equal(merged, matches);
  assert.equal(merged[0], matches[0]);
});

test("endpoint público devolve apenas estado dinâmico sem cache", async () => {
  const source = await readFile(
    new URL("../app/api/public/matches/live/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /Cache-Control": "no-store, max-age=0"/);
  assert.match(source, /matches\?select=id,status,minute,live_started_at,live_base_minute,is_clock_running,home_score,away_score/);
  assert.match(source, /id=in\.\(\$\{ids\.join\(","\)\}\)/);
  assert.doesNotMatch(source, /home_team_id|away_team_id|broadcast_channel_id/);
});
