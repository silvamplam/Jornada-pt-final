import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS,
  matchdayEditorialProfileSelectionBankItemByIdentity,
  parseMatchdayEditorialProfileSelectionDrag,
  prepareExclusiveMatchdayEditorialProfileSelection,
  prepareExclusiveMatchdayEditorialProfileSelectionState,
  promoteMatchdayEditorialProfileSelection,
  removeMatchdayEditorialProfileSelection,
  serializeMatchdayEditorialProfileSelectionDrag,
} from "@/lib/editorial-matchday-profile-selection";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const selectionPanelStart = client.indexOf(
  "function renderEditorialSelectionPanel",
);
const selectionPanelEnd = client.indexOf(
  "function activateWorkspaceFromStructure",
  selectionPanelStart,
);
const selectionPanel = client.slice(
  selectionPanelStart,
  selectionPanelEnd,
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

test("Zona, Faixa e Abertura deixam de coexistir ao entrar na Seleção sem criar Banco", () => {
  const profile = EDITORIAL_PROFILES.liga_portugal_v1;
  const activeItem = {
    sourceType: "editorial_article",
    sourceId: "article-a",
    sortOrder: 1,
    classifiedZoneKey: "benfica",
    actualityOrder: 1,
    label: "BENFICA",
    title: "Notícia A",
    subtitle: null,
    imageUrl: null,
    publishedAt: null,
    updatedAt: null,
  } as const;
  const candidate = {
    bankItemId: "bank-a",
    sourceType: "editorial_article",
    sourceId: "article-a",
  };
  const emptyOpening = {
    headline: null,
    highlight_1: null,
    highlight_2: null,
    highlight_3: null,
    context: null,
  } as const;
  const origins = [
    { overrides: [], opening: emptyOpening },
    {
      overrides: [{
        sourceType: "editorial_article",
        sourceId: "article-a",
        placementTarget: "faixa",
        zoneKey: null,
        sortOrder: null,
      }],
      opening: emptyOpening,
    },
    { overrides: [], opening: { ...emptyOpening, headline: "article-a" } },
  ] as const;

  for (const origin of origins) {
    const transition = prepareExclusiveMatchdayEditorialProfileSelection({
      profile,
      activeItems: [activeItem],
      overrides: origin.overrides,
      opening: origin.opening,
      selection: [null, null, null, null],
      candidates: [candidate],
      targetPosition: 1,
      bankItemId: "bank-a",
    });

    assert.deepEqual(transition.selection, ["bank-a", null, null, null]);
    assert.equal(Object.values(transition.opening).includes("article-a"), false);
    assert.deepEqual(transition.overrides, []);
    assert.equal(transition.workedIdentity, "editorial_article\u0000article-a");
  }
});

test("Seleção já persistida remove placements concorrentes sem os converter em Banco", () => {
  const profile = EDITORIAL_PROFILES.liga_portugal_v1;
  const activeItems = [
    {
      sourceType: "editorial_article",
      sourceId: "article-a",
      sortOrder: 1,
      classifiedZoneKey: "benfica",
      actualityOrder: 1,
      label: "BENFICA",
      title: "Notícia A",
      subtitle: null,
      imageUrl: null,
      publishedAt: null,
      updatedAt: null,
    },
    {
      sourceType: "editorial_article",
      sourceId: "article-b",
      sortOrder: 1,
      classifiedZoneKey: "sporting",
      actualityOrder: 1,
      label: "SPORTING",
      title: "Notícia B",
      subtitle: null,
      imageUrl: null,
      publishedAt: null,
      updatedAt: null,
    },
  ] as const;
  const transition = prepareExclusiveMatchdayEditorialProfileSelectionState({
    profile,
    activeItems,
    overrides: [{
      sourceType: "editorial_article",
      sourceId: "article-b",
      placementTarget: "zone",
      zoneKey: "sporting",
      sortOrder: 1,
    }],
    opening: {
      headline: "article-a",
      highlight_1: null,
      highlight_2: null,
      highlight_3: null,
      context: null,
    },
    selection: ["bank-a", "bank-b", null, null],
    candidates: [
      {
        bankItemId: "bank-a",
        sourceType: "editorial_article",
        sourceId: "article-a",
      },
      {
        bankItemId: "bank-b",
        sourceType: "editorial_article",
        sourceId: "article-b",
      },
    ],
  });

  assert.deepEqual(
    transition.selection,
    ["bank-a", "bank-b", null, null],
  );
  assert.equal(
    Object.values(transition.opening).some(
      (sourceId) => sourceId === "article-a" || sourceId === "article-b",
    ),
    false,
  );
  assert.deepEqual(transition.overrides, []);
  assert.equal("workedIdentities" in transition, false);
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

test("Mesa não mostra seletor de artigo nem catálogo textual da Seleção", () => {
  assert.doesNotMatch(selectionPanel, /Escolher artigo/u);
  assert.match(
    selectionPanel,
    /aria-label="Apresentação de Últimas"/u,
  );
  assert.doesNotMatch(
    selectionPanel,
    /editorialSelectionCandidates\.map[\s\S]*<option/u,
  );
});

test("quatro slots são drop targets da Seleção exclusiva", () => {
  assert.match(
    client,
    /MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS\.map/u,
  );
  assert.match(
    selectionPanel,
    /className="thematic-workspace-slot thematic-selection-slot"/u,
  );
  assert.match(
    selectionPanel,
    /onDrop=\{\(event\) =>[\s\S]*dropOnEditorialSelection/u,
  );
  assert.match(selectionCard, /Retirar da Seleção/u);
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

test("drop da Seleção usa a transição exclusiva", () => {
  const changeStart = client.indexOf("function changeEditorialSelection");
  const dropStart = client.indexOf("function dropOnEditorialSelection", changeStart);
  const end = client.indexOf("function changeVideoModuleActive", dropStart);
  const implementation = client.slice(changeStart, end);

  assert.ok(changeStart >= 0 && dropStart > changeStart && end > dropStart);
  assert.match(
    implementation,
    /prepareExclusiveMatchdayEditorialProfileSelection/u,
  );
  assert.match(
    implementation,
    /function dropOnEditorialSelection[\s\S]*changeEditorialSelection/u,
  );
  assert.match(implementation, /bankItemIdByIdentity/u);
});

test("Seleção legada é normalizada no carregamento sem criar uma nova decisão editorial", () => {
  assert.match(
    client,
    /prepareExclusiveMatchdayEditorialProfileSelectionState/u,
  );
  assert.match(
    client,
    /selectionBootstrapMatchdayRef/u,
  );

  const bootstrapStart = client.indexOf(
    "prepareExclusiveMatchdayEditorialProfileSelectionState({",
  );
  const bootstrapEnd = client.indexOf(
    "const reconcile = useMemo",
    bootstrapStart,
  );
  const bootstrap = client.slice(bootstrapStart, bootstrapEnd);

  assert.ok(bootstrapStart >= 0 && bootstrapEnd > bootstrapStart);
  assert.doesNotMatch(bootstrap, /withWorkedIdentities/u);
  assert.match(
    bootstrap,
    /A Seleção já existente foi preparada para colocação exclusiva/u,
  );
});

test("Seleção é o workspace de Últimas e as fontes ficam separadas", () => {
  const workspaceStart = client.indexOf(
    "function renderActiveWorkspace",
  );
  const workspaceEnd = client.indexOf(
    "\n  return (",
    workspaceStart,
  );
  const workspace = client.slice(
    workspaceStart,
    workspaceEnd,
  );

  assert.ok(workspaceStart >= 0 && workspaceEnd > workspaceStart);
  assert.match(
    workspace,
    /activeWorkspaceKey === "latest"[\s\S]*renderEditorialSelectionPanel\(\)/u,
  );

  const mainWorkspace = client.indexOf(
    'className="thematic-panel thematic-workspace"',
  );
  const sources = client.indexOf(
    "{renderSources()}",
    mainWorkspace,
  );

  assert.ok(mainWorkspace >= 0 && sources > mainWorkspace);
});

test("Seleção mantém uma única grelha administrativa responsiva", () => {
  assert.equal(
    client.match(
      /MATCHDAY_EDITORIAL_PROFILE_SELECTION_POSITIONS\.map/gu,
    )?.length,
    1,
  );
  assert.match(
    client,
    /\.thematic-slots-4 \{ grid-template-columns: repeat\(4,minmax\(0,1fr\)\); \}/u,
  );
  assert.match(
    client,
    /@media \(max-width: 760px\)[\s\S]*?\.thematic-slots-4[\s\S]*?grid-template-columns: 1fr/u,
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
  const workspaceStart = client.indexOf(
    "function renderActiveWorkspace",
  );
  const workspaceEnd = client.indexOf(
    "return null;",
    workspaceStart,
  );
  const workspace = client.slice(
    workspaceStart,
    workspaceEnd,
  );

  assert.ok(workspaceStart >= 0 && workspaceEnd > workspaceStart);
  assert.match(
    workspace,
    /activeWorkspaceKey === "latest"[\s\S]*renderEditorialSelectionPanel\(\)/u,
  );
  assert.doesNotMatch(
    workspace,
    /latestZonePlacement/u,
  );
});
