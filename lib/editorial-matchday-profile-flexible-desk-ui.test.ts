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

test("reduzir layout desaloja overflow sem compactação", () => {
  assert.match(state, /const overflowPlacements = current\.placements/);
  assert.match(state, /placement\.slotPosition > capacity/);
  assert.match(state, /displacedBankItemIds: uniqueSorted/);
  assert.doesNotMatch(state, /zone-layout-shrink-occupied/);
  assert.doesNotMatch(state, /compact/i);
});

test("Últimas continua um block físico ordenável", () => {
  assert.match(client, /block\.kind === "latest"/);
  assert.match(client, /movePhysicalDeskBlock\(state, block, "up"\)/);
  assert.match(client, /latestZonePlacement/);
});

test("selection legacy esta retirado da superficie fisica da Mesa", () => {
  assert.doesNotMatch(client, /physicalDeskPlacementsOfType\(physicalDesk, "selection"\)/);
  assert.doesNotMatch(client, /placeInSelection/);
  assert.doesNotMatch(client, /renderEditorialSelectionPanel/);
  assert.doesNotMatch(client, /MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS/);
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

test("Ultimas abrem como bloco de apresentacao sem pseudo-zona", () => {
  const latest = body("renderLatestBlockPanel", "renderHighlightWorkspace");
  const activeWorkspace = body("renderActiveWorkspace", "undo");

  assert.match(latest, /data-latest-block="presentation"/);
  assert.match(latest, /latestDestination\.kind === "zone"/);
  assert.match(latest, /Zona associada:/);
  assert.doesNotMatch(latest, /editorialSelectionOccupied|selectionPlacements/);

  assert.match(
    activeWorkspace,
    /activeWorkspaceKey === "latest"\) return renderLatestBlockPanel\(\)/,
  );
  assert.doesNotMatch(activeWorkspace, /renderEditorialSelectionPanel/);
});

test("Ultimas associam uma zona fisica por zone_id sem posicoes legacy", () => {
  const latest = body("renderLatestBlockPanel", "renderHighlightWorkspace");
  assert.match(latest, /latestDestination\.zoneId/);
  assert.match(latest, /zoneById\.get\(latestDestination\.zoneId/);
  assert.doesNotMatch(latest, /MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS/);
});

test("Mesa expõe uma única escolha Manchete, Ocultas ou Zona por UUID", () => {
  assert.match(client, /aria-label="Posição das Últimas"/);
  assert.match(client, /<option value="headline">Manchete<\/option>/);
  assert.match(client, /<option value="hidden">Ocultas<\/option>/);
  assert.match(client, /<optgroup label="Zona física">/);
  assert.match(client, /value=\{`zone:\$\{zone\.id\}`\}/);
  assert.doesNotMatch(client, /option value="four_news"/);
});

test("estado legacy sem UUID exige escolha e delete do host falha fechado", () => {
  assert.match(client, /latestDestination\.kind === "legacy_incomplete"/);
  assert.match(client, /Sem associação válida — escolha uma posição/);
  assert.match(state, /latest-companion-zone-associated/);
  assert.doesNotMatch(
    state,
    /latestCompanionZoneId:\s*current\.latestCompanionZoneId === zoneId\s*\? null/,
  );
});

test("Destaque usa placement físico e apresentação local", () => {
  assert.match(client, /physicalDeskPlacementsOfType\(physicalDesk, "video_highlight"\)/);
  assert.match(client, /videoModuleActive/);
  assert.match(client, /placementType: "video_highlight"/);
});

test("zonas são variáveis e CRUD usa operações físicas", () => {
  assert.match(client, /createPhysicalDeskZone/);
  assert.match(client, /deletePhysicalDeskZone/);
  assert.match(client, /\+ Nova zona/);
  assert.match(client, /Apagar zona/);
  assert.doesNotMatch(client, /zones\.length === 5|zones\.slice\(0, 5\)/);
});

test("zona física pode existir sem título público", () => {
  assert.doesNotMatch(
    client,
    /mutationBlocked \|\| !newZoneTitle\.trim\(\)/,
  );

  const start = client.indexOf(
    '<details className="thematic-global-tool" ref={pageStructureRef}>',
  );
  const end = client.indexOf(
    '<details className="thematic-global-tool thematic-video-tool">',
    start,
  );

  assert.ok(start >= 0 && end > start);

  const pageStructure = client.slice(start, end);

  assert.doesNotMatch(
    pageStructure,
    /if \(!value\) \{[\s\S]*?event\.currentTarget\.value = activeStructureTitle/,
  );

  assert.match(client, /Zona sem título/);
  assert.match(client, /current\.presentation\.latestZoneTitle \|\| "Últimas"/);
});

test("Página e blocos mantém largura estável em todos os estados", () => {
  assert.match(client, /width: clamp\(660px,50vw,760px\)/);
  assert.doesNotMatch(client, /new-zone-open|zone-editor-open/);
});

test("Últimas abre no editor estrutural sem deixar de ser block físico", () => {
  const start = client.indexOf(
    '<details className="thematic-global-tool" ref={pageStructureRef}>',
  );
  const end = client.indexOf(
    '<details className="thematic-global-tool thematic-video-tool">',
    start,
  );

  assert.ok(start >= 0 && end > start);

  const pageStructure = client.slice(start, end);

  assert.match(
    pageStructure,
    /block\.kind === "zone" \|\| block\.kind === "latest"/,
  );
  assert.match(pageStructure, /setActiveWorkspaceKey\(workspaceKey\)/);
  assert.match(pageStructure, /activeLatest/);
  assert.match(pageStructure, /latestZoneTitle: value/);
});

test("apagar zona usa confirmação inline e nunca window.confirm", () => {
  assert.match(client, /thematic-page-delete-confirm/);
  assert.doesNotMatch(client, /window\.confirm/);
});

test("preview mantém um único write HTTP de Apply", () => {
  const start = client.indexOf("async function applyChanges");
  const end = client.indexOf("\n  return (", start);
  assert.ok(start >= 0 && end > start);
  const apply = client.slice(start, end);
  assert.equal((apply.match(/fetch\(/g) ?? []).length, 1);
  assert.match(apply, /buildPhysicalDeskApplyPayload/);
  assert.match(apply, /body: JSON\.stringify\(payload\)/);
  assert.doesNotMatch(apply, /LegacyApplyProjection|compatibilityReconcile/);
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
