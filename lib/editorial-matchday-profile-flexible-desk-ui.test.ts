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
const apply = readFileSync(
  "lib/editorial-matchday-live-layout-physical-apply.ts",
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

test("latest continua no estado físico e apresentação sem ser workspace navegável", () => {
  assert.match(state, /blocks: readonly MatchdayLiveLayoutBlock\[\]/);
  assert.match(state, /latestCompanionZoneId: LiveLayoutZoneId \| null/);
  assert.match(client, /latestZonePlacement/);
  assert.match(client, /resolveMatchdayLatestPlacement/);
  assert.match(apply, /physicalDesk\.current\.blocks\.map/);
  assert.match(apply, /physicalDesk\.current\.presentation\.latestZoneTitle/);
  assert.doesNotMatch(client, /setActiveWorkspaceKey\("latest"\)/);
  assert.doesNotMatch(client, /renderLatestBlockPanel/);
  assert.doesNotMatch(client, /movePhysicalDeskZone\(state, [^,]*latest/);
});

test("selection legacy esta retirado da superficie fisica da Mesa", () => {
  assert.doesNotMatch(client, /physicalDeskPlacementsOfType\(physicalDesk, "selection"\)/);
  assert.doesNotMatch(client, /placeInSelection/);
  assert.doesNotMatch(client, /renderEditorialSelectionPanel/);
  assert.doesNotMatch(client, /MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS/);
});

test("zona ativa mantém controlos acessíveis e contador sem rótulos visuais redundantes", () => {
  const zonePanel = body("renderZonePanel", "renderOpeningWorkspace");
  assert.match(zonePanel, /aria-label=\{`Título público de \$\{zoneLabel\}`\}/);
  assert.match(zonePanel, /aria-label=\{`Apresentação de \$\{zoneLabel\}`\}/);
  assert.doesNotMatch(zonePanel, /<span>Título público<\/span>/);
  assert.doesNotMatch(zonePanel, /<span>Apresentação<\/span>/);
  assert.match(zonePanel, /thematic-zone-editor-count/);
});

test("rail mantém Abertura e deriva zonas mais Destaque dos blocks físicos", () => {
  const rail = body("renderZoneRail", "undo");
  assert.match(client, /aria-label="Zonas da Mesa"/);
  assert.match(client, /railOrderBlocks\.map\(\(block\)/);
  assert.match(
    client,
    /block\.kind === "zone" \|\| block\.kind === "video"/,
  );
  assert.match(rail, /workspaceKeyForBlock\(block\)/);
  assert.match(rail, /blockLabel\(block\)/);
  assert.match(rail, /blockCount\(block\)/);
  assert.match(client, /Mostrar Abertura/);
  assert.match(client, /openingOccupied/);
  assert.doesNotMatch(rail, /latestZoneTitle|setActiveWorkspaceKey\("latest"\)|A acontecer agora/);
  assert.doesNotMatch(
    client,
    /thematic-zone-rail-note|Marque uma zona para alterar a ordem|A zona marcada move-se/,
  );
});

test("Página e blocos omite latest e video e numera continuamente apenas as zonas", () => {
  const start = client.indexOf(
    '<details className="thematic-global-tool" ref={pageStructureRef}>',
  );
  const end = client.indexOf(
    '<details className="thematic-global-tool thematic-video-tool">',
    start,
  );
  const pageStructure = client.slice(start, end);
  const listStart = pageStructure.indexOf('className="thematic-page-structure-list"');
  const listEnd = pageStructure.indexOf("{activeStructureEditorIsFaixa", listStart);
  const pageStructureList = pageStructure.slice(listStart, listEnd);

  assert.ok(start >= 0 && end > start && listStart >= 0 && listEnd > listStart);
  assert.match(client, /pageStructureBlocks = current\.blocks\.filter\([\s\S]*block\.kind === "zone"/);
  assert.match(pageStructureList, /pageStructureBlocks\.map\(\(block, index\) =>/);
  assert.match(pageStructureList, /String\(index \+ 1\)\.padStart\(2, "0"\)/);
  assert.doesNotMatch(pageStructureList, /latestZoneTitle|A acontecer agora|Editar Últimas|Destaque|highlight/);
  assert.doesNotMatch(pageStructure, /activeLatest|Editar Últimas/);
  assert.doesNotMatch(
    pageStructure,
    /moveSelectedRailBlock|selectedReorderBlockId|Subir item selecionado|Descer item selecionado/,
  );
});

test("Página e blocos abre um editor próprio e mínimo para a Faixa", () => {
  const start = client.indexOf(
    '<details className="thematic-global-tool" ref={pageStructureRef}>',
  );
  const end = client.indexOf(
    '<details className="thematic-global-tool thematic-video-tool">',
    start,
  );
  const pageStructure = client.slice(start, end);
  const editorStart = pageStructure.indexOf("{activeStructureEditorIsFaixa ? (");
  const editorEnd = pageStructure.indexOf(") : activeZone ? (", editorStart);
  const faixaEditor = pageStructure.slice(editorStart, editorEnd);

  assert.ok(editorStart >= 0 && editorEnd > editorStart);
  assert.match(pageStructure, /<span>Fixo<\/span>[\s\S]*?<strong>Faixa<\/strong>/);
  assert.match(pageStructure, /setActiveWorkspaceKey\("faixa"\)/);
  assert.match(faixaEditor, /aria-label="Editar Faixa"/);
  assert.match(faixaEditor, /<span>Título público<\/span>/);
  assert.match(faixaEditor, /defaultValue=\{current\.presentation\.faixaPublicTitle\}/);
  assert.match(faixaEditor, /maxLength=\{120\}/);
  assert.match(faixaEditor, /faixaPublicTitle: value/);
  assert.doesNotMatch(faixaEditor, /Layout|Apagar zona|capacity|changePhysicalDeskZone/);

  const rail = body("renderZoneRail", "undo");
  const reorderStart = rail.indexOf("railOrderBlocks.map((block)");
  const reorderEnd = rail.indexOf("thematic-secondary-workspaces", reorderStart);
  const reorder = rail.slice(reorderStart, reorderEnd);
  assert.match(client, /railOrderBlocks = current\.blocks\.filter\([\s\S]*block\.kind === "zone" \|\| block\.kind === "video"/);
  assert.doesNotMatch(reorder, /Faixa|faixa/);
});

test("A acontecer agora é um controlo global ao lado da classificação", () => {
  const actionsStart = client.indexOf('<div className="thematic-global-actions">');
  const actionsEnd = client.indexOf(
    'className={`thematic-desk-grid',
    actionsStart,
  );
  const actions = client.slice(actionsStart, actionsEnd);

  assert.ok(actionsStart >= 0 && actionsEnd > actionsStart);
  assert.match(actions, /<summary>Corrigir classificação<\/summary>[\s\S]*<summary>A acontecer agora<\/summary>/);
  assert.match(actions, /defaultValue=\{current\.presentation\.latestZoneTitle\}/);
  assert.match(actions, /changePhysicalDeskPresentation\(state, \{[\s\S]*latestZoneTitle: value/);
  assert.equal((actions.match(/<summary>A acontecer agora<\/summary>/g) ?? []).length, 1);
});

test("Mesa expõe uma única escolha Manchete, Ocultas ou Zona por UUID", () => {
  assert.match(client, /aria-label="Posição de A acontecer agora"/);
  assert.match(client, /<option value="headline">Manchete<\/option>/);
  assert.match(client, /<option value="hidden">Ocultas<\/option>/);
  assert.match(client, /<optgroup label="Zona física">/);
  assert.match(client, /value=\{`zone:\$\{zone\.id\}`\}/);
  assert.match(client, /changePhysicalDeskLatestPlacement\([\s\S]*\{ kind: "zone", zoneId: nextZone\.id \}/);
  assert.doesNotMatch(client, /option value="four_news"/);
});

test("estado legacy sem UUID exige escolha e delete do host falha fechado", () => {
  assert.match(client, /latestDestination\.kind === "legacy_incomplete"/);
  assert.match(client, /Sem associação válida — escolha uma posição/);
  assert.match(client, /current\.latestCompanionZoneId === activeZone\.id/);
  assert.match(client, /disabled=\{[\s\S]*current\.latestCompanionZoneId === activeZone\.id/);
  assert.match(state, /latest-companion-zone-associated/);
  assert.doesNotMatch(
    state,
    /latestCompanionZoneId:\s*current\.latestCompanionZoneId === zoneId\s*\? null/,
  );
});

test("Destaque abre o workspace atual e conserva placement e apresentação local", () => {
  const rail = body("renderZoneRail", "undo");
  const workspace = body("renderHighlightWorkspace", "renderCandidates");
  const secondaryStart = rail.indexOf('className="thematic-secondary-workspaces"');
  const secondary = rail.slice(secondaryStart);

  assert.ok(secondaryStart >= 0);
  assert.match(client, /if \(block\.kind === "video"\) return "Destaque"/);
  assert.match(client, /block\.kind === "zone" \? block\.zoneId : "highlight"/);
  assert.match(client, /activeWorkspaceKey === "highlight"\) return renderHighlightWorkspace\(\)/);
  assert.doesNotMatch(secondary, /Destaque|highlight/);
  assert.match(client, /physicalDeskPlacementsOfType\(physicalDesk, "video_highlight"\)/);
  assert.match(workspace, /videoModuleActive/);
  assert.match(workspace, /Título da zona de vídeos/);
  assert.match(workspace, /Título do Destaque/);
  assert.ok(
    workspace.indexOf("Título da zona de vídeos")
      < workspace.indexOf("Módulo"),
  );
  assert.ok(
    workspace.indexOf("Título do Destaque")
      < workspace.indexOf("Módulo"),
  );
  assert.match(workspace, /roundupVideoHeading: value/);
  assert.match(workspace, /videoHighlightSectionTitle: value/);
  assert.match(workspace, /<option value="active">Ativo<\/option>/);
  assert.match(workspace, /<option value="hidden">Oculto<\/option>/);
  assert.match(workspace, /placementType: "video_highlight", zoneId: null, slotPosition: 1/);
  assert.match(workspace, /Posição livre/);
  assert.match(workspace, /Retirar/);
  assert.doesNotMatch(workspace, /Apagar zona|changePhysicalDeskZone|visualFamily|capacity/);
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
  assert.match(client, /defaultValue=\{current\.presentation\.latestZoneTitle\}/);
});

test("Página e blocos mantém largura estável em todos os estados", () => {
  assert.match(client, /width: clamp\(660px,50vw,760px\)/);
  assert.doesNotMatch(client, /new-zone-open|zone-editor-open/);
});

test("A acontecer agora não introduz estado paralelo", () => {
  assert.match(client, /const latestDestination = resolveMatchdayLatestPlacement\(/);
  assert.match(client, /value=\{latestDestinationSelectValue\}/);
  assert.doesNotMatch(client, /useState[^\n]*(latest|Últimas|acontecer)/i);
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
