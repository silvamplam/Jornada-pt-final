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

test("a Mesa usa ActiveWorkspaceKey com LiveLayoutZoneId", () => {
  assert.match(client, /type ActiveWorkspaceKey =[\s\S]*LiveLayoutZoneId/);
  assert.match(client, /useState<ActiveWorkspaceKey>\("opening"\)/);
  assert.match(client, /isZoneWorkspaceKey\(activeWorkspaceKey\)/);
});

test("Fixar abertura continua local e desligado por defeito", () => {
  assert.match(client, /useState\(false\)/);
  assert.match(client, /checked=\{openingPinned\}/);
  assert.match(client, /setOpeningPinned\(event\.target\.checked\)/);
});

test("a composição fixa Abertura sem duplicar autoridade", () => {
  assert.match(
    client,
    /openingPinned && activeWorkspaceKey !== "opening" \? renderOpeningWorkspace\(\) : null/,
  );
  assert.match(client, /renderActiveWorkspace\(\)/);
  assert.equal((client.match(/function renderOpeningWorkspace/g) ?? []).length, 1);
});

test("Fixar abertura não entra no PhysicalDeskState nem no Apply", () => {
  assert.doesNotMatch(state, /openingPinned/);
  const applyStart = client.indexOf("async function applyChanges");
  const applyEnd = client.indexOf("\n  return (", applyStart);
  assert.ok(applyStart >= 0 && applyEnd > applyStart);
  assert.doesNotMatch(client.slice(applyStart, applyEnd), /openingPinned/);
});

test("drag para Abertura usa bankItemId e placement físico", () => {
  assert.match(client, /function placeInOpening\(bankItemId: string, slotPosition: number\)/);
  assert.match(client, /placementType: "opening", zoneId: null, slotPosition/);
  assert.match(client, /if \(bankItemId\) placeInOpening\(bankItemId, position\)/);
});

test("tabs derivam da ordem física e não tornam Faixa um workspace", () => {
  const start = client.indexOf('aria-label="Foco da Mesa"');
  const end = client.indexOf("</nav>", start);
  const tabs = client.slice(start, end);
  assert.match(tabs, /current\.blocks\.map/);
  assert.doesNotMatch(tabs, />Faixa/);
});

test("Página e blocos fecha ao escolher um workspace", () => {
  assert.match(client, /<details className="thematic-global-tool" ref=\{pageStructureRef\}>/);
  assert.match(client, /pageStructureRef\.current\?\.removeAttribute\("open"\)/);
  assert.match(client, /activateWorkspaceFromStructure\(workspaceKey\)/);
});

test("modos e colunas legacy não regressam", () => {
  assert.doesNotMatch(client, /thematic-zone-column|modo compacto|modo expandido/i);
  assert.doesNotMatch(client, /WorkspaceEditorState|zonesAfter/);
});

test("Abertura e zonas apresentam slots pela capacidade real", () => {
  assert.match(client, /MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS\.map/);
  assert.match(client, /physicalDeskZoneSlots\(physicalDesk, zoneId\)/);
  assert.match(client, /thematic-slots-\$\{zone\.capacity\}/);
});

test("tracking filtra por classificação sem a usar como zona viva", () => {
  assert.match(client, /bankItem\.classification\.key/);
  assert.match(client, /trackingClassFilter === "all" \|\| entry\.classifiedZoneKey === trackingClassFilter/);
  assert.doesNotMatch(client, /zoneId: bankItem\.classification/);
});

test("pesquisa e classe são filtros cumulativos", () => {
  assert.match(client, /normalizedTrackingQuery/);
  assert.match(client, /classTrackingEntries\.filter/);
  assert.match(client, /matchesTrackingQuery\(item\)/);
});

test("filtros de Fontes não entram no estado editorial físico", () => {
  assert.doesNotMatch(state, /trackingQuery|trackingClassFilter|bankOpen|VisibleCount/);
});

test("cada linha de tracking mantém paginação local", () => {
  assert.match(client, /trackingVisibleCounts\[state\]/);
  assert.match(client, /values\[state\] \+ TRACKING_PAGE_SIZE/);
  assert.match(client, /entries\.length/);
});

test("Tracking apresenta Novas Faixa Desalojadas e Banco separado", () => {
  assert.match(client, /TRACKING_STATES = \["NOVA", "FAIXA", "DESALOJADA"\]/);
  assert.match(client, /aria-label="Banco editorial"/);
  assert.match(client, /current\.explicitBankItemIds/);
  assert.match(client, /current\.displacedBankItemIds/);
});

test("Banco filtra independentemente pelas classes sem alterar classificação", () => {
  assert.match(client, /bankClassFilter/);
  assert.match(client, /setBankClassFilter\(zone\.key\)/);
  assert.doesNotMatch(state, /classification\s*:/);
});
