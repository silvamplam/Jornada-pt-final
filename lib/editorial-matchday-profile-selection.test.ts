import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS,
  matchdayEditorialProfileSelectionBankItemByIdentity,
  parseMatchdayEditorialProfileSelectionDrag,
  promoteMatchdayEditorialProfileSelection,
  removeMatchdayEditorialProfileSelection,
  serializeMatchdayEditorialProfileSelectionDrag,
} from "@/lib/editorial-matchday-profile-selection";

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const selectionPanel = client.slice(
  client.indexOf("function renderEditorialSelectionPanel"),
  client.indexOf("\n  return (", client.indexOf("function renderEditorialSelectionPanel")),
);
const selectionCard = client.slice(
  client.indexOf("function EditorialSelectionCard"),
  client.indexOf("function Diagnostics", client.indexOf("function EditorialSelectionCard")),
);

test("Seleção expõe quatro posições canónicas", () => {
  assert.deepEqual(
    MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS,
    [1, 2, 3, 4],
  );
});

test("promover preserva overrides, Opening e colocação real", () => {
  const workspace = {
    overrides: [{ sourceId: "article-a", placementTarget: "zone" }],
    opening: { headline: "article-c" },
    faixa: ["article-b"],
    bank: ["article-d"],
    selection: [null, null, null, null] as readonly (string | null)[],
  };

  const nextSelection = promoteMatchdayEditorialProfileSelection(
    workspace.selection,
    1,
    "bank-a",
  );

  assert.deepEqual(nextSelection, ["bank-a", null, null, null]);
  assert.deepEqual(
    {
      overrides: workspace.overrides,
      opening: workspace.opening,
      faixa: workspace.faixa,
      bank: workspace.bank,
    },
    {
      overrides: [{ sourceId: "article-a", placementTarget: "zone" }],
      opening: { headline: "article-c" },
      faixa: ["article-b"],
      bank: ["article-d"],
    },
  );
});

test("Zona, Faixa, Abertura e Banco usam a mesma promoção não exclusiva", () => {
  const origins = ["zone", "faixa", "opening", "bank"] as const;

  for (const [index, origin] of origins.entries()) {
    const selection = promoteMatchdayEditorialProfileSelection(
      [null, null, null, null],
      (index + 1) as 1 | 2 | 3 | 4,
      `bank-${origin}`,
    );

    assert.equal(selection[index], `bank-${origin}`);
  }
});

test("substituir e remover afetam apenas a referência promocional", () => {
  assert.deepEqual(
    promoteMatchdayEditorialProfileSelection(
      ["bank-a", null, null, null],
      1,
      "bank-b",
    ),
    ["bank-b", null, null, null],
  );

  assert.deepEqual(
    removeMatchdayEditorialProfileSelection(
      ["bank-a", "bank-b", null, null],
      2,
    ),
    ["bank-a", null, null, null],
  );
});

test("reordenar move só a promoção e não cria cascata", () => {
  const drag = parseMatchdayEditorialProfileSelectionDrag(
    serializeMatchdayEditorialProfileSelectionDrag({
      bankItemId: "bank-a",
      sourcePosition: 1,
    }),
  );

  assert.deepEqual(drag, {
    bankItemId: "bank-a",
    sourcePosition: 1,
  });
  assert.deepEqual(
    promoteMatchdayEditorialProfileSelection(
      ["bank-a", null, "bank-b", null],
      3,
      drag!.bankItemId,
    ),
    [null, null, "bank-a", null],
  );
});

test("identidade de origem resolve o bank item id canónico", () => {
  const byIdentity =
    matchdayEditorialProfileSelectionBankItemByIdentity([
      {
        bankItemId: "bank-a",
        sourceType: "EDITORIAL_ARTICLE",
        sourceId: "Article-A",
      },
    ]);

  assert.equal(
    byIdentity.get("editorial_article\u0000article-a"),
    "bank-a",
  );
});

test("Mesa não mostra dropdowns nem catálogo textual da Seleção", () => {
  assert.doesNotMatch(selectionPanel, /Escolher artigo/u);
  assert.doesNotMatch(selectionPanel, /<select/u);
  assert.doesNotMatch(selectionPanel, /<option/u);
});

test("quatro slots são drop targets promocionais", () => {
  assert.match(
    client,
    /MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS\.map/u,
  );
  assert.match(client, /className="thematic-zone-slot thematic-selection-slot"/u);
  assert.match(client, /onDrop=\{\(event\) =>[\s\S]*dropOnEditorialSelection/u);
  assert.match(client, /Retirar da Seleção/u);
});

test("cartão da Seleção usa menu compacto com uma única ação própria", () => {
  assert.match(
    client,
    /\.thematic-selection-card \{ width: 100%; grid-template-columns: 50px minmax\(0,1fr\) 24px; \}/u,
  );
  assert.match(selectionCard, /className="thematic-card-menu"/u);
  assert.match(selectionCard, />\s*···\s*<\/summary>/u);
  assert.match(selectionCard, /Retirar da Seleção/u);
  assert.doesNotMatch(selectionCard, /thematic-selection-remove/u);
  assert.doesNotMatch(
    selectionCard,
    /Mover para Faixa|Mover para Banco|Devolver ao automático|Fixar nesta posição|Proteger na zona/u,
  );
});

test("drop promocional não usa transição de placement exclusivo", () => {
  const start = client.indexOf("function dropOnEditorialSelection");
  const end = client.indexOf("function changeVideoModuleActive", start);
  const implementation = client.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(implementation, /prepareExclusivePlacementTransition/u);
  assert.doesNotMatch(implementation, /draftOverrides|draftOpening/u);
  assert.match(implementation, /bankItemIdByIdentity/u);
});

test("painel fica sob FC Porto e separado do Banco na Mesa completa", () => {
  const fullDeskStart = client.indexOf('{deskView === "full"');
  const columnMarker = '<div className="thematic-zone-column">';
  const leftStart = client.indexOf(columnMarker, fullDeskStart);
  const centerStart = client.indexOf(columnMarker, leftStart + 1);
  const rightStart = client.indexOf(columnMarker, centerStart + 1);
  const fullDeskEnd = client.indexOf("</section>", rightStart);
  const rightColumn = client.slice(rightStart, fullDeskEnd);

  assert.match(
    rightColumn,
    /renderZonePanel\("fc_porto"\)[\s\S]*!selectionPinnedForDrag[\s\S]*renderEditorialSelectionPanel\(false\)/u,
  );
  assert.doesNotMatch(rightColumn, /Banco explícito|thematic-bank-panel/u);
});

test("pin da Seleção é local, momentâneo e começa desligado", () => {
  assert.match(
    client,
    /const \[selectionPinnedForDrag, setSelectionPinnedForDrag\] = useState\(false\)/u,
  );
  assert.match(selectionPanel, /Fixar para arrastar/u);

  const pinLines = client
    .split("\n")
    .filter((line) => line.includes("selectionPinnedForDrag"));

  assert.equal(
    pinLines.some((line) => /sessionStorage|localStorage/u.test(line)),
    false,
  );

  const currentDraft = client.slice(
    client.indexOf("function currentDraft"),
    client.indexOf("function commitDraft"),
  );
  const applyChanges = client.slice(
    client.indexOf("async function applyChanges"),
    client.indexOf("function renderZonePanel"),
  );

  assert.doesNotMatch(currentDraft, /selectionPinnedForDrag/u);
  assert.doesNotMatch(applyChanges, /selectionPinnedForDrag/u);
});

test("pin alterna uma única instância funcional entre coluna e dock sticky", () => {
  const dockStart = client.indexOf("{selectionPinnedForDrag ? (");
  const deskViewStart = client.indexOf(
    'aria-label="Vista de trabalho da Mesa"',
    dockStart,
  );
  const dock = client.slice(dockStart, deskViewStart);

  assert.ok(dockStart >= 0 && deskViewStart > dockStart);
  assert.match(dock, /className="thematic-selection-dock"/u);
  assert.doesNotMatch(dock, /style=\{\{ top:/u);
  assert.match(dock, /renderEditorialSelectionPanel\(true\)/u);
  assert.match(
    client,
    /!selectionPinnedForDrag[\s\S]*renderEditorialSelectionPanel\(false\)/u,
  );
  assert.equal(
    client.match(/MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS\.map/gu)?.length,
    1,
  );
});

test("pin troca deterministicamente o proprietário do sticky principal", () => {
  assert.match(
    client,
    /\.thematic-opening-panel \{ position: sticky; top: 8px; z-index: 18;/u,
  );
  assert.match(
    client,
    /\.thematic-opening-panel\.thematic-opening-panel-static \{ position: static; \}/u,
  );
  assert.match(
    client,
    /className=\{`thematic-panel thematic-opening-panel\$\{selectionPinnedForDrag \? " thematic-opening-panel-static" : ""\}`\}/u,
  );
  assert.match(
    client,
    /\.thematic-selection-dock \{ position: sticky; top: 8px; z-index: 18;/u,
  );
  assert.doesNotMatch(client, /ResizeObserver|selectionDockTop|openingPanelRef/u);
});

test("dock sticky conserva os quatro slots responsivos", () => {
  assert.match(
    client,
    /\.thematic-selection-dock \.thematic-editorial-selection \{ grid-template-columns: repeat\(4,minmax\(0,1fr\)\)/u,
  );
  assert.match(
    client,
    /@media \(max-width: 1250px\)[\s\S]*?\.thematic-selection-dock \.thematic-editorial-selection \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/u,
  );
});

test("modo fixado é compacto e sobrevive à alternância de vista", () => {
  assert.match(
    selectionPanel,
    /!compactPinned \? \([\s\S]*className="thematic-public-title"/u,
  );
  assert.match(
    selectionPanel,
    /!compactPinned \? \([\s\S]*className="thematic-latest-body"/u,
  );

  const viewControlsStart = client.indexOf('aria-label="Escolher vista da Mesa"');
  const viewControlsEnd = client.indexOf("</section>", viewControlsStart);
  const viewControls = client.slice(viewControlsStart, viewControlsEnd);

  assert.doesNotMatch(viewControls, /setSelectionPinnedForDrag/u);
  assert.match(viewControls, /setDeskView\("focus"\)/u);
  assert.match(viewControls, /setDeskView\("full"\)/u);
  assert.match(
    client,
    /selectionPinnedForDrag[\s\S]*?"\.thematic-selection-dock"[\s\S]*?: "\.thematic-opening-panel"/u,
  );
  assert.match(
    client,
    /\[deskView, deskViewPreferenceReady, focusZone, selectionPinnedForDrag\]/u,
  );
});

test("posição administrativa não altera ordem ou contrato público", () => {
  const start = client.indexOf("function renderEditorialSelectionPanel");
  const end = client.indexOf("return (", start);
  const implementation = client.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(implementation, /moveContentBlock|thematicBlockOrder\s*:/u);
  assert.match(client, /latestZoneTitle: value/u);
  assert.match(client, /latestZonePlacement === "four_news"/u);
  assert.doesNotMatch(client, /Últimas[^\n]*draggable/u);
});

test("top, four_news e hidden não condicionam a montagem administrativa", () => {
  const fullDesk = client.slice(
    client.indexOf('{deskView === "full"'),
    client.indexOf("<article\n          className={`thematic-panel", client.indexOf('{deskView === "full"')),
  );

  assert.match(
    fullDesk,
    /!selectionPinnedForDrag[\s\S]*renderEditorialSelectionPanel\(false\)/u,
  );
  assert.doesNotMatch(
    fullDesk,
    /latestZonePlacement\s*===\s*"four_news"[\s\S]*!selectionPinnedForDrag[\s\S]*renderEditorialSelectionPanel\(false\)/u,
  );
});
