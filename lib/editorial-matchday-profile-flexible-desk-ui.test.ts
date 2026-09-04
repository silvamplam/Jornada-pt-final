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

function body(name: string, nextName: string) {
  const start = client.indexOf(`function ${name}`);
  const end = client.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start);
  return client.slice(start, end);
}

test("Mesa deriva capacidade da zona física em draft", () => {
  assert.match(client, /const slots = physicalDeskZoneSlots\(physicalDesk, zoneId\)/);
  assert.match(client, /thematic-slots-\$\{zone\.capacity\}/);
  assert.match(state, /editorialVisualFamilyCapacity\(visualFamily\)/);
});

test("cada zona expõe apresentação independente por LiveLayoutZoneId", () => {
  const zonePanel = body("renderZonePanel", "renderOpeningWorkspace");
  assert.match(zonePanel, /data-zone-id=\{zone\.id\}/);
  assert.match(zonePanel, /changePhysicalDeskZone\(state, zone\.id/);
  assert.match(zonePanel, /value=\{zone\.visualFamily\}/);
});

test("reduzir layout ocupado falha sem compactação", () => {
  assert.match(state, /zone-layout-shrink-occupied/);
  assert.match(state, /placement\.slotPosition > capacity/);
  assert.doesNotMatch(state, /compact/i);
});

test("Últimas continua um block físico ordenável", () => {
  assert.match(client, /block\.kind === "latest"/);
  assert.match(client, /movePhysicalDeskBlock\(state, block, "up"\)/);
  assert.match(client, /latestZonePlacement/);
});

test("quatro ao lado são placements na mesma autoridade física", () => {
  assert.match(client, /physicalDeskPlacementsOfType\(physicalDesk, "selection"\)/);
  assert.match(client, /placeInSelection\(bankItemId, position\)/);
  assert.doesNotMatch(client, /draftEditorialSelection|persistedEditorialSelection/);
});

test("zona ativa mantém título layout e contador", () => {
  const zonePanel = body("renderZonePanel", "renderOpeningWorkspace");
  assert.match(zonePanel, /Título público/);
  assert.match(zonePanel, /Apresentação/);
  assert.match(zonePanel, /thematic-zone-editor-count/);
});

test("tabs mantêm Abertura e derivam todos os blocks físicos", () => {
  assert.match(client, /Foco da Mesa/);
  assert.match(client, /current\.blocks\.map\(\(block\)/);
  assert.match(client, />Abertura \{openingOccupied\}</);
});

test("Últimas mantém título apresentação e contador", () => {
  const latest = body("renderEditorialSelectionPanel", "renderHighlightWorkspace");
  assert.match(latest, /Título público de Últimas/);
  assert.match(latest, /Apresentação de Últimas/);
  assert.match(latest, /editorialSelectionOccupied/);
});

test("quatro Últimas derivam as quatro posições sem numeração visual", () => {
  assert.match(client, /MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS\.map/);
  assert.match(client, /thematic-slots-4 thematic-editorial-selection/);
  assert.doesNotMatch(client, /thematic-slot-number/);
});

test("Destaque usa placement físico e apresentação local", () => {
  assert.match(client, /physicalDeskPlacementsOfType\(physicalDesk, "video_highlight"\)/);
  assert.match(client, /videoModuleActive/);
  assert.match(client, /placementType: "video_highlight"/);
});

test("zonas são variáveis e não existe CRUD neste corte", () => {
  assert.match(client, /current\.zones\.map\(\(zone\)/);
  assert.doesNotMatch(client, /Criar zona|Apagar zona|removePhysicalDeskZone|addPhysicalDeskZone/);
  assert.doesNotMatch(client, /zones\.length === 5|zones\.slice\(0, 5\)/);
});

test("preview mantém um único write HTTP de Apply", () => {
  const start = client.indexOf("async function applyChanges");
  const end = client.indexOf("\n  return (", start);
  assert.ok(start >= 0 && end > start);
  const apply = client.slice(start, end);
  assert.equal((apply.match(/fetch\(/g) ?? []).length, 1);
  assert.match(apply, /buildPhysicalDeskLegacyApplyProjection/);
  assert.match(apply, /body: JSON\.stringify\(projection\)/);
});

test("operações de zona não usam perfil estático como identidade", () => {
  const zonePanel = body("renderZonePanel", "renderOpeningWorkspace");
  assert.doesNotMatch(zonePanel, /profile\.zones|zone\.key|zoneKey/);
  assert.match(zonePanel, /zone\.id/);
});

test("Mover para zona respeita posição e zone_id escolhidos", () => {
  assert.match(
    client,
    /bulkMovePhysicalDeskItemsToZone\(state, selectedBankItemIds, destinationZoneId, effectiveZonePosition\)/,
  );
  assert.match(client, /setDestinationZoneId\(next\?\.id \?\? null\)/);
});
