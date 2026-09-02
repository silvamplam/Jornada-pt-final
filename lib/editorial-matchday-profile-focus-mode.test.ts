import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const desk = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

test("a Mesa mantém activeWorkspaceKey como seletor do workspace ativo", () => {
  const workspaceTypeStart = desk.indexOf("type ActiveWorkspaceKey =");
  const workspaceTypeEnd = desk.indexOf("type AgendaTvPreviewStatus", workspaceTypeStart);
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

test("o tracking seleciona uma classe contextual sem alterar o estado editorial", () => {
  assert.match(desk, /const \[trackingZoneKey, setTrackingZoneKey\] = useState</);
  assert.match(desk, /aria-label="Escolher classe contextual"/);
  assert.match(desk, /profile\.zones\.map\(\(zone\)/);
  assert.match(desk, /trackingItem\.classifiedZoneKey === trackingZoneKey/);
  assert.match(desk, /setTrackingZoneKey\(zone\.key\)/);
});

test("pesquisa e classe funcionam como filtros cumulativos do tracking", () => {
  assert.match(desk, /const normalizedTrackingQuery = trackingQuery/);
  assert.match(
    desk,
    /trackingItem\.classifiedZoneKey === trackingZoneKey[\s\S]*!normalizedTrackingQuery/,
  );
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
    /trackingZoneKey|trackingQuery|trackingVisibleCounts/,
  );
  assert.doesNotMatch(
    pendingBlock,
    /trackingZoneKey|trackingQuery|trackingVisibleCounts/,
  );
});

test("cada linha de tracking mantém paginação local e contador real", () => {
  assert.match(
    desk,
    /const visibleEntries = entries\.slice\(0, trackingVisibleCounts\[state\]\);/,
  );
  assert.match(desk, /visibleEntries\.length < entries\.length/);
  assert.match(
    desk,
    /\[state\]: current\[state\] \+ TRACKING_PAGE_SIZE/,
  );
  assert.match(desk, /<span>\{entries\.length\}<\/span>/);
});

test("Tracking apresenta Novas, Faixa e Desalojadas em simultâneo sem linha Banco", () => {
  assert.match(desk, /TRACKING_STATES = \["NOVA", "FAIXA", "DESALOJADA"\]/);
  assert.match(desk, /aria-label="Tracking editorial por classe"/);
  assert.match(desk, /data-tracking-state=\{state\}/);
  assert.match(desk, /\? "Novas"[\s\S]*\? "Faixa"[\s\S]*: "Desalojadas"/);
  assert.doesNotMatch(desk, /type SourceViewKey|activeSourceView/);
  assert.equal(
    (desk.match(/<div className="thematic-sources-toolbar">/g) ?? []).length,
    1,
  );
  assert.equal(
    (desk.match(/<label className="thematic-reservoir-search">/g) ?? []).length,
    1,
  );
  const toolbarStart = desk.indexOf('<div className="thematic-sources-toolbar">');
  const toolbarEnd = desk.indexOf('<div className="thematic-tracking-rows">', toolbarStart);
  const toolbar = desk.slice(toolbarStart, toolbarEnd);
  assert.doesNotMatch(toolbar, />\s*Banco(?:\s|\{)/);
  assert.match(toolbar, /thematic-reservoir-search/);
  assert.match(toolbar, /em tracking/);
  assert.match(desk, /aria-label="Controlos de seleção"/);
  assert.match(desk, /\{selected\.size\} notícias selecionadas/);
  assert.match(desk, /Limpar marcação/);
  assert.match(
    desk,
    /\.thematic-sources-list \{ display: grid; grid-template-columns: repeat\(3/,
  );
});
