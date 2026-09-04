import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const state = readFileSync(
  "lib/editorial-matchday-live-layout-desk-state.ts",
  "utf8",
);

test("colocação exclusiva tem uma única coleção física de placements", () => {
  assert.match(state, /placements: readonly PhysicalDeskPlacement\[\]/);
  assert.match(state, /function withPlacement/);
  assert.match(state, /withoutBankItem\(current\.placements, bankItemId\)/);
  assert.doesNotMatch(client, /prepareExclusivePlacementTransition/);
});

test("operação em lote usa helpers físicos e LiveLayoutZoneId", () => {
  assert.match(client, /bulkMovePhysicalDeskItemsToZone\(state, selectedBankItemIds, destinationZoneId/);
  assert.match(client, /bulkMovePhysicalDeskItemsToFaixa\(state, selectedBankItemIds, faixaPosition\)/);
  assert.match(client, /bulkMovePhysicalDeskItemsToBank\(state, selectedBankItemIds\)/);
  assert.match(client, /useState<LiveLayoutZoneId \| null>/);
});

test("Seleção editorial participa no mesmo history físico", () => {
  assert.match(client, /placeInSelection\(bankItemId, position\)/);
  assert.match(state, /placementType: "opening" \| "faixa" \| "selection" \| "video_highlight"/);
  assert.match(state, /history: \[\.\.\.state\.history, state\.current\]/);
  assert.match(client, /undoPhysicalDeskState/);
  assert.doesNotMatch(client, /WorkspaceDraft|draftEditorialSelection/);
});

test("alterar Seleção fica local até ao Apply", () => {
  const start = client.indexOf("function placeInSelection");
  const end = client.indexOf("function placeAtFaixaTop", start);
  assert.ok(start >= 0 && end > start);
  const body = client.slice(start, end);
  assert.match(body, /movePhysicalDeskItemToSlot/);
  assert.doesNotMatch(body, /fetch\(/);
});

test("UI separa operação em lote de Seleção editorial", () => {
  assert.match(client, /className="thematic-bulk-context"/);
  assert.match(client, /selected\.size > 0/);
  assert.match(client, /aria-label="Quatro ao lado das Últimas"/);
  assert.match(client, /Limpar marcação/);
});

test("movimentos não consultam classificação para escolher destinos", () => {
  const start = state.indexOf("function withPlacement");
  const end = state.indexOf("export function movePhysicalDeskItemToSlot", start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(state.slice(start, end), /classification|classifiedZoneKey/);
  assert.match(state, /displacedBankItemIds/);
});
