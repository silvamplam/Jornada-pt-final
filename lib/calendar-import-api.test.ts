import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../app/api/admin/gestor/route.ts", import.meta.url);
const toolUrl = new URL("../app/admin/gestor/CalendarImportTool.tsx", import.meta.url);

test("o plano do servidor carrega o catálogo e nunca cria canais", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /broadcast_channels\?select=id,name&order=name\.asc&limit=500/);
  assert.match(source, /buildCalendarBroadcastChannelLookup\(broadcastChannels\)/);
  assert.match(source, /resolveCalendarBroadcastChannel\(broadcastChannelLookup, row\.broadcastChannelName\)/);
  assert.match(source, /CanalTV desconhecido/);
  assert.match(source, /CanalTV ambíguo no catálogo/);
  assert.doesNotMatch(source, /writeSupabaseAdmin(?:Returning)?[^\n]*broadcast_channels/);
  for (const hardcodedName of ["DAZN 1", "RTP1", "Sport TV 1", "Sport TV 2", "Sport TV 3", "Sport TV 7"]) {
    assert.doesNotMatch(source, new RegExp(hardcodedName.replace(/ /g, "\\s")));
  }
});

test("a identificação competitiva preserva o ID e rejeita zero lógico apenas como criação ou vários como ambiguidade", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /createCompetitiveIdentity\(seasonId, matchdayReference, homeTeamId, awayTeamId\)/);
  assert.match(source, /if \(existingForIdentity\.length > 1\)/);
  assert.match(source, /Existem vários jogos com a mesma identidade competitiva/);
  assert.match(source, /const existing = existingForIdentity\[0\] \?\? null/);
  assert.match(source, /const plannedAction = existing \? action\?\.action \?\? "keep" : "create"/);
  assert.match(source, /existingMatchId: existing\?\.id \?\? null/);
  assert.doesNotMatch(source, /delete[^\n]*existingMatchId|method:\s*"DELETE"[^\n]*matches/i);
});

test("novos jogos recebem Estádio e FK de CanalTV sem criar entidades paralelas", async () => {
  const source = await readFile(routeUrl, "utf8");
  const createBlock = source.match(/creates\.map\(\(write\) => \(\{([\s\S]*?)\}\)\)/)?.[1];
  assert.ok(createBlock);
  assert.match(createBlock, /venue: write\.row\.venue/);
  assert.match(createBlock, /broadcast_channel_id: write\.preview\.broadcastChannelId/);
  assert.match(createBlock, /status: "scheduled"/);
  assert.match(createBlock, /source_key: createCalendarSourceKey/);
});

test("cada jogo existente recebe um único PATCH estrutural e estritamente parcial", async () => {
  const source = await readFile(routeUrl, "utf8");
  const updateBlock = source.match(/for \(const update of updates\) \{([\s\S]*?)checkpoint\.updatedMatches \+= 1;\s*\}/)?.[1];
  assert.ok(updateBlock);
  assert.match(updateBlock, /Object\.keys\(update\.updatePatch\)\.length === 0/);
  assert.match(updateBlock, /method: "PATCH"/);
  assert.match(updateBlock, /body: JSON\.stringify\(update\.updatePatch\)/);
  assert.match(updateBlock, /matches\?id=eq\./);
  assert.match(updateBlock, /season_id=eq\./);
  assert.match(updateBlock, /matchday_id=eq\./);
  assert.match(updateBlock, /home_team_id=eq\./);
  assert.match(updateBlock, /away_team_id=eq\./);
  assert.doesNotMatch(updateBlock, /status=eq\.scheduled/);
  assert.doesNotMatch(updateBlock, /status\s*:|home_score|away_score|source_key|sync_status/);
  assert.equal((updateBlock.match(/method: "PATCH"/g) ?? []).length, 1);
});

test("preview e aplicação usam o mesmo plano reconstruído e fingerprints com os três campos", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /async function previewCalendarList[\s\S]*buildCalendarServerPlan\(formData\)/);
  assert.match(source, /async function applyCalendarMatchday[\s\S]*const plan = await buildCalendarServerPlan\(formData\)/);
  const fingerprintBlock = source.match(/const fingerprint = createCalendarFingerprint\(\{([\s\S]*?)\n\s*\}\);/)?.[1];
  assert.ok(fingerprintBlock);
  assert.match(fingerprintBlock, /scheduledDate/);
  assert.match(fingerprintBlock, /kickoffAt/);
  assert.match(fingerprintBlock, /venue/);
  assert.match(fingerprintBlock, /broadcastChannelId/);
  assert.match(fingerprintBlock, /broadcastChannelName/);
  assert.match(fingerprintBlock, /changes/);
});

test("o preview mantém o ecrã, apresenta Alterações e a aplicação conserva checkpoints e refresh", async () => {
  const source = await readFile(toolUrl, "utf8");
  assert.match(source, /Formato canónico/);
  assert.match(source, /CALENDAR_IMPORT_HEADER/);
  assert.match(source, /Células vazias de DataHora, Estádio e CanalTV preservam o valor existente/);
  assert.match(source, /<th>Alterações<\/th>/);
  assert.match(source, /change\.currentLabel/);
  assert.match(source, /change\.nextLabel/);
  assert.match(source, /Retomar jornadas pendentes/);
  assert.match(source, /calendar_checkpoints/);
  assert.match(source, /router\.refresh\(\)/);
  assert.doesNotMatch(source, /\/admin\/jogos-tv|window\.location/);
});
