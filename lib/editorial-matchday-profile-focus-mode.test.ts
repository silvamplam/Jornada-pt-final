import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const desk = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

test("a Mesa mantém activeWorkspaceKey como seletor do workspace ativo", () => {
  const workspaceTypeStart = desk.indexOf("type ActiveWorkspaceKey =");
  const workspaceTypeEnd = desk.indexOf("type SourceViewKey", workspaceTypeStart);
  const workspaceType = desk.slice(workspaceTypeStart, workspaceTypeEnd);

  assert.match(
    desk,
    /type ActiveWorkspaceKey =[\s\S]+"opening"[\s\S]+"latest"[\s\S]+"highlight"[\s\S]+EditorialProfileZoneKey;/,
  );
  assert.doesNotMatch(workspaceType, /"faixa"/);
  assert.match(
    desk,
    /const \[activeWorkspaceKey, setActiveWorkspaceKey\] =\s*useState<ActiveWorkspaceKey>\("opening"\)/,
  );
  assert.match(desk, /function renderActiveWorkspace\(\)/);
  assert.match(
    desk,
    /activeWorkspaceKey === "opening"[\s\S]*activeWorkspaceKey === "latest"[\s\S]*activeWorkspaceKey === "highlight"/,
  );
  assert.match(
    desk,
    /isZoneWorkspaceKey\(activeWorkspaceKey\)[\s\S]*renderZonePanel\(activeWorkspaceKey\)/,
  );
});

test("existe controlo local Fixar abertura, desligado por defeito", () => {
  assert.match(
    desk,
    /const \[openingPinned, setOpeningPinned\] = useState\(false\)/,
  );
  assert.match(
    desk,
    /<label className="thematic-opening-pin">[\s\S]*checked=\{openingPinned\}[\s\S]*setOpeningPinned\(event\.target\.checked\)[\s\S]*type="checkbox"[\s\S]*<span>Fixar abertura<\/span>/,
  );
});

test("a composição fixa a Abertura acima do workspace ativo sem a duplicar", () => {
  const workspaceStart = desk.indexOf(
    '<section className="thematic-panel thematic-workspace">',
  );
  const workspaceEnd = desk.indexOf("{renderSources()}", workspaceStart);
  const workspace = desk.slice(workspaceStart, workspaceEnd);

  assert.ok(workspaceStart >= 0 && workspaceEnd > workspaceStart);
  assert.match(
    workspace,
    /\{openingPinned && activeWorkspaceKey !== "opening"\s*\? renderOpeningWorkspace\(\)\s*:\s*null\}\s*\{renderActiveWorkspace\(\)\}/,
  );
  assert.equal(
    (workspace.match(/renderOpeningWorkspace\(\)/g) ?? []).length,
    1,
  );
  assert.equal(
    (workspace.match(/renderActiveWorkspace\(\)/g) ?? []).length,
    1,
  );
});

test("Fixar abertura não entra no draft, pending ou payload", () => {
  const currentDraftStart = desk.indexOf("function currentDraft(): WorkspaceDraft");
  const currentDraftEnd = desk.indexOf("function withWorkedIdentities", currentDraftStart);
  const currentDraft = desk.slice(currentDraftStart, currentDraftEnd);
  const pendingStart = desk.indexOf("const pending =");
  const pendingEnd = desk.indexOf("const zoneByKey", pendingStart);
  const pending = desk.slice(pendingStart, pendingEnd);
  const applyStart = desk.indexOf("async function applyChanges()");
  const payloadStart = desk.indexOf("body: JSON.stringify({", applyStart);
  const payloadEnd = desk.indexOf("const payload =", payloadStart);
  const payload = desk.slice(payloadStart, payloadEnd);

  assert.ok(currentDraftStart >= 0 && currentDraftEnd > currentDraftStart);
  assert.ok(pendingStart >= 0 && pendingEnd > pendingStart);
  assert.ok(applyStart >= 0);
  assert.ok(payloadStart >= 0 && payloadEnd > payloadStart);
  assert.match(currentDraft, /opening: editorState\.draftOpening/);
  assert.match(pending, /editorState\.draftOpening/);
  assert.match(payload, /opening: editorState\.draftOpening/);

  for (const editorialState of [currentDraft, pending, payload]) {
    assert.doesNotMatch(editorialState, /openingPinned|setOpeningPinned/);
  }
});

test("drag de uma zona para a Abertura reutiliza os handlers e regras existentes", () => {
  const zoneStart = desk.indexOf("function renderZonePanel(");
  const zoneEnd = desk.indexOf("function renderEditorialSelectionPanel", zoneStart);
  const zoneRenderer = desk.slice(zoneStart, zoneEnd);
  const openingStart = desk.indexOf("function renderOpeningWorkspace()");
  const openingEnd = desk.indexOf("function renderHighlightWorkspace", openingStart);
  const openingRenderer = desk.slice(openingStart, openingEnd);
  const placementStart = desk.indexOf("function placeInOpening(");
  const placementEnd = desk.indexOf("function placeInZone(", placementStart);
  const openingPlacement = desk.slice(placementStart, placementEnd);

  assert.ok(zoneStart >= 0 && zoneEnd > zoneStart);
  assert.ok(openingStart >= 0 && openingEnd > openingStart);
  assert.ok(placementStart >= 0 && placementEnd > placementStart);
  assert.match(
    desk,
    /function dragStart[\s\S]*dataTransfer\.setData\("text\/plain", itemIdentity\)/,
  );
  assert.match(
    zoneRenderer,
    /cardFor\([\s\S]*kind: "zone"[\s\S]*zoneKey: zone\.key/,
  );
  assert.match(
    openingRenderer,
    /onDrop=\{\(event\) => \{[\s\S]*dragged\(event\)[\s\S]*placeInOpening\(itemIdentity, slot\)/,
  );
  assert.match(
    openingPlacement,
    /moveMatchdayEditorialProfileItemToOpening\([\s\S]*editorState\.draftOpening[\s\S]*sourceIdForIdentity\(itemIdentity\)[\s\S]*slot/,
  );
  assert.equal((desk.match(/function placeInOpening\(/g) ?? []).length, 1);
  assert.equal(
    (desk.match(/moveMatchdayEditorialProfileItemToOpening\(/g) ?? []).length,
    1,
  );
});

test("tabs derivam da ordem real, com Abertura fixa e sem Faixa", () => {
  const tabsStart = desk.indexOf('className="thematic-zone-tabs"');
  const tabsEnd = desk.indexOf("{renderActiveWorkspace()}", tabsStart);
  const tabs = desk.slice(tabsStart, tabsEnd);

  assert.ok(tabsStart >= 0 && tabsEnd > tabsStart);
  assert.match(tabs, /setActiveWorkspaceKey\("opening"\)/);
  assert.match(
    tabs,
    /editorState\.draftPageControls\.thematicBlockOrder\.map\(\(block\)/,
  );
  assert.match(tabs, /workspaceKeyForBlock\(block\)/);
  assert.doesNotMatch(tabs, /Faixa|setActiveWorkspaceKey\("faixa"\)/);
  assert.ok(
    tabs.indexOf('setActiveWorkspaceKey("opening")')
      < tabs.indexOf("thematicBlockOrder.map"),
  );
});

test("Página e blocos é recolhível, fechado por defeito e fecha ao escolher", () => {
  assert.match(
    desk,
    /<details className="thematic-global-tool" ref=\{pageStructureRef\}>\s*<summary>Página e blocos<\/summary>/,
  );
  assert.doesNotMatch(
    desk,
    /<details className="thematic-global-tool" ref=\{pageStructureRef\} open/,
  );
  assert.match(
    desk,
    /function activateWorkspaceFromStructure[\s\S]*pageStructureRef\.current\?\.removeAttribute\("open"\)/,
  );
  assert.match(desk, /onClick=\{activateFaixaFromStructure\}/);
});

test("os dois modos antigos e as três colunas deixaram de ser contrato visual", () => {
  assert.doesNotMatch(desk, />\s*Foco de zona\s*</);
  assert.doesNotMatch(desk, />\s*Mesa completa\s*</);
  assert.doesNotMatch(desk, /const \[deskView, setDeskView\]/);
  assert.doesNotMatch(desk, /const \[focusZone, setFocusZone\]/);
  assert.doesNotMatch(desk, /className="thematic-zone-column"/);
  assert.doesNotMatch(desk, /renderZonePanel\("benfica"\)/);
});

test("Abertura e zonas apresentam slots horizontais pela capacidade efetiva", () => {
  assert.match(desk, /MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS\.length/);
  assert.match(
    desk,
    /MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS\.map\(\(slot\)/,
  );
  assert.match(
    desk,
    /className=\{`thematic-slots thematic-slots-\$\{zone\.capacity\}`\}/,
  );
  assert.match(desk, /\.thematic-slots-4 \{ grid-template-columns: repeat\(4/);
  assert.match(desk, /\.thematic-slots-5 \{ grid-template-columns: repeat\(5/);
  assert.match(desk, /\.thematic-slots-6 \{ grid-template-columns: repeat\(6/);
});

test("a Faixa pode ser filtrada por várias zonas sem alterar o estado editorial", () => {
  assert.match(desk, /const \[faixaZoneFilters, setFaixaZoneFilters\] = useState</);
  assert.match(desk, /const faixaZoneFilterSet = useMemo\(/);
  assert.match(
    desk,
    /activeByIdentity\.get\(identity\(item\)\)\?\.classifiedZoneKey/,
  );
  assert.match(desk, /faixaZoneFilterSet\.size === 0/);
  assert.match(desk, /faixaZoneFilterSet\.has\(classifiedZoneKey\)/);
  assert.match(desk, /current\.includes\(zoneKey\)/);
  assert.match(desk, /\[\.\.\.current, zoneKey\]/);
  assert.match(desk, /aria-label="Filtrar fonte por zona natural"/);
  assert.match(
    desk,
    /activeSourceView === "available"[\s\S]*toggleReservoirZoneFilter\(zoneKey\)[\s\S]*toggleFaixaZoneFilter\(zoneKey\)/,
  );
});

test("pesquisa e zonas funcionam como filtros cumulativos da Faixa", () => {
  assert.match(desk, /const zoneMatches =/);
  assert.match(desk, /const queryMatches =/);
  assert.match(desk, /return zoneMatches && queryMatches;/);
});

test("filtros e vista das Fontes não entram no estado editorial", () => {
  const currentDraftStart = desk.indexOf("function currentDraft(): WorkspaceDraft");
  const currentDraftEnd = desk.indexOf("function commitDraft", currentDraftStart);
  const currentDraftBlock = desk.slice(currentDraftStart, currentDraftEnd);
  const pendingStart = desk.indexOf("const pending =");
  const pendingEnd = desk.indexOf("const zoneByKey", pendingStart);
  const pendingBlock = desk.slice(pendingStart, pendingEnd);

  assert.ok(currentDraftStart >= 0 && currentDraftEnd > currentDraftStart);
  assert.ok(pendingStart >= 0 && pendingEnd > pendingStart);
  assert.doesNotMatch(
    currentDraftBlock,
    /faixaZoneFilters|reservoirZoneFilters|activeSourceView/,
  );
  assert.doesNotMatch(
    pendingBlock,
    /faixaZoneFilters|reservoirZoneFilters|activeSourceView/,
  );
});

test("a Faixa permanece completa com paginação local e contador real", () => {
  assert.match(
    desk,
    /const visibleFaixa = filteredFaixa\.slice\(0, faixaVisibleCount\);/,
  );
  assert.match(desk, /visibleCount < filteredCount/);
  assert.match(
    desk,
    /setFaixaVisibleCount\(\(count\) => count \+ FAIXA_PAGE_SIZE\)/,
  );
  assert.match(desk, /Faixa \{reconcile\.faixaAfter\.length\}/);
  assert.doesNotMatch(desk, /primeiras 10|público: primeiras 10/);
});

test("Fontes alterna Novas, Banco e Faixa dentro de uma única toolbar", () => {
  assert.match(desk, /type SourceViewKey = "new" \| "available" \| "faixa"/);
  assert.match(desk, /aria-label="Fontes editoriais"/);
  assert.match(desk, /Novas \{newItems\.length\}/);
  assert.match(desk, /Banco \{reconcile\.bankAfter\.length\}/);
  assert.match(desk, /Faixa \{reconcile\.faixaAfter\.length\}/);
  assert.doesNotMatch(desk, /Disponíveis/);
  assert.equal(
    (desk.match(/<div className="thematic-sources-toolbar">/g) ?? []).length,
    1,
  );
  assert.equal(
    (desk.match(/<label className="thematic-reservoir-search">/g) ?? []).length,
    1,
  );
  assert.equal(
    (desk.match(/<div className="thematic-reservoir-filters"/g) ?? []).length,
    1,
  );
  const toolbarStart = desk.indexOf('<div className="thematic-sources-toolbar">');
  const toolbarEnd = desk.indexOf("</div>\n\n        <div", toolbarStart);
  const toolbar = desk.slice(toolbarStart, toolbarEnd);
  assert.match(toolbar, /Novas \{newItems\.length\}/);
  assert.match(toolbar, /Banco \{reconcile\.bankAfter\.length\}/);
  assert.match(toolbar, /Faixa \{reconcile\.faixaAfter\.length\}/);
  assert.match(toolbar, /Filtrar fonte por zona natural/);
  assert.match(toolbar, /thematic-reservoir-search/);
  assert.match(toolbar, /encontradas/);
  assert.match(
    desk,
    /const visibleSourceItems = activeSourceView === "new"[\s\S]*visibleNewItems[\s\S]*visibleReservoir[\s\S]*visibleFaixa/,
  );
  assert.match(desk, /reconcile\.bankAfter\.length/);
  assert.match(desk, /reconcile\.faixaAfter\.length/);
  assert.match(desk, /aria-label="Controlos de seleção"/);
  assert.match(desk, /\{selected\.size\} notícias selecionadas/);
  assert.match(desk, /Limpar marcação/);
  assert.match(
    desk,
    /\.thematic-sources-list \{ display: grid; grid-template-columns: repeat\(3/,
  );
});
