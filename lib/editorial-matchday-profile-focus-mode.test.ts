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
  assert.match(client, /useState<ActiveWorkspaceKey>\([\s\S]*physicalDesk\.current\.blocks\.find/);
  assert.match(client, /isZoneWorkspaceKey\(activeWorkspaceKey\)/);
});

test("Abertura continua local, fechada por defeito e tem toggle claro", () => {
  assert.match(client, /const \[openingVisible, setOpeningVisible\] = useState\(false\)/);
  assert.match(client, /aria-expanded=\{openingVisible\}/);
  assert.match(client, /setOpeningVisible\(\(visible\) => !visible\)/);
  assert.match(client, /openingVisible \? "Fechar Abertura" : "Mostrar Abertura"/);
});

test("a composição empilha Abertura acima da zona sem duplicar autoridade", () => {
  assert.match(client, /\.thematic-workspace-stack \{ display: grid;/);
  assert.match(
    client,
    /openingVisible \? renderOpeningWorkspace\(\) : null[\s\S]*renderActiveWorkspace\(\)/,
  );
  assert.equal((client.match(/function renderOpeningWorkspace/g) ?? []).length, 1);
});

test("visibilidade da Abertura não entra no PhysicalDeskState nem no Apply", () => {
  assert.doesNotMatch(state, /openingVisible/);
  const applyStart = client.indexOf("async function applyChanges");
  const applyEnd = client.indexOf("\n  return (", applyStart);
  assert.ok(applyStart >= 0 && applyEnd > applyStart);
  assert.doesNotMatch(client.slice(applyStart, applyEnd), /openingVisible/);
});

test("drag para Abertura usa bankItemId e placement físico", () => {
  assert.match(client, /function placeInOpening\(bankItemId: string, slotPosition: number\)/);
  assert.match(client, /placementType: "opening", zoneId: null, slotPosition/);
  assert.match(client, /if \(bankItemId\) placeInOpening\(bankItemId, position\)/);
});

test("rail deriva zonas físicas e mantém Faixa como workspace próprio", () => {
  const start = client.indexOf('aria-label="Zonas da Mesa"');
  const end = client.indexOf("\n      </aside>", start);
  const rail = client.slice(start, end);
  assert.match(rail, /orderedZoneBlocks\.map/);
  assert.match(rail, /setActiveWorkspaceKey\("faixa"\)/);
  assert.match(client, /activeWorkspaceKey === "faixa"\) return renderFaixaWorkspace\(\)/);
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
  assert.match(client, /candidateClassFilter === "all"[\s\S]*entry\.classifiedZoneKey === candidateClassFilter/);
  assert.doesNotMatch(client, /zoneId: bankItem\.classification/);
});

test("pesquisa e classe são filtros cumulativos", () => {
  assert.match(client, /normalizedCandidateQuery/);
  assert.match(client, /classCandidateEntries\.filter/);
  assert.match(client, /matchesCandidateQuery\(item\)/);
});

test("filtros de Fontes não entram no estado editorial físico", () => {
  assert.doesNotMatch(
    state,
    /trackingQuery|trackingClassFilter|bankOpen|VisibleCount|candidateClassFilter|candidateQuery|activeCandidateUniverse|candidateVisibleCounts/,
  );
});

test("cada universo de candidatas mantém paginação local", () => {
  assert.match(client, /candidateVisibleCounts\[activeCandidateUniverse\]/);
  assert.match(client, /values\[activeCandidateUniverse\] \+ TRACKING_PAGE_SIZE/);
});

test("Candidatas apresenta uma barra única para Novas Desalojadas e Bank", () => {
  assert.match(client, /type CandidateUniverse = "new" \| "displaced" \| "bank"/);
  assert.match(client, /aria-label="Universo de candidatas"/);
  assert.match(client, /new: "Novas"/);
  assert.match(client, /displaced: "Desalojadas"/);
  assert.match(client, /bank: "Bank"/);
  assert.match(client, /current\.explicitBankItemIds/);
  assert.match(client, /current\.displacedBankItemIds/);
});

test("o mesmo filtro de classificação atravessa os três universos", () => {
  assert.match(client, /candidateClassFilter/);
  assert.match(client, /setCandidateClassFilter\(zone\.key\)/);
  assert.doesNotMatch(client, /bankClassFilter|trackingClassFilter/);
  assert.doesNotMatch(state, /classification\s*:/);
});
