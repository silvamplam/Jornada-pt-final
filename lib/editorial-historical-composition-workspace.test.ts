import assert from "node:assert/strict";
import test from "node:test";

import {
  HISTORICAL_COMPOSITION_BLOCK_KEYS,
  HISTORICAL_COMPOSITION_DEFAULT_ZONE_TITLES,
  HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY,
  filterHistoricalCompositionReservoir,
  historicalCompositionClassificationCounts,
  historicalCompositionReservoirCounts,
  historicalCompositionSelectionCounts,
  initialHistoricalCompositionReservoirScope,
  moveHistoricalCompositionPiece,
  normalizeHistoricalCompositionBlockOrder,
  normalizeHistoricalCompositionZoneTitle,
  type HistoricalCompositionPlacementLocation,
} from "./editorial-historical-composition-workspace";

const articles = [
  { bankItemId: "a", label: "Benfica", title: "Águias vencem", naturalGroupKey: "benfica" },
  { bankItemId: "b", label: "Sporting", title: "Leões empatam", naturalGroupKey: "sporting" },
  { bankItemId: "c", label: "Liga", title: "Mercado fecha", naturalGroupKey: "outros" },
  { bankItemId: "d", label: "Benfica", title: "Mercado encarnado", naturalGroupKey: "benfica" },
] as const;

const liveBankArticles = [
  { bankItemId: "live-sporting", label: "Sporting", title: "Leões vencem o dérbi", naturalGroupKey: "sporting", historicalEligible: true, historicallySelected: true, fromLiveBank: true },
  { bankItemId: "live-benfica", label: "Benfica", title: "Águias preparam o clássico", naturalGroupKey: "benfica", historicalEligible: true, historicallySelected: false, fromLiveBank: true },
  { bankItemId: "all-sporting", label: "Sporting", title: "Mercado leonino", naturalGroupKey: "sporting", historicalEligible: true, historicallySelected: true, fromLiveBank: false },
  { bankItemId: "inherited-pending", label: "Sporting", title: "Herdada sem revalidação", naturalGroupKey: "sporting", historicalEligible: false, historicallySelected: false, fromLiveBank: true },
  { bankItemId: "inherited-revalidated", label: "Benfica", title: "Herdada já revalidada", naturalGroupKey: "benfica", historicalEligible: true, historicallySelected: false, fromLiveBank: true },
] as const;

test("o reservatório contém apenas peças livres e combina grupos por união com pesquisa por interseção", () => {
  const filtered = filterHistoricalCompositionReservoir(
    articles,
    new Set(["a"]),
    new Set(["benfica", "outros"]),
    "mercado",
  );

  assert.deepEqual(filtered.map((article) => article.bankItemId), ["c", "d"]);
  assert.deepEqual(
    filterHistoricalCompositionReservoir(articles, new Set(), new Set(["benfica"]), "")
      .map((article) => article.bankItemId),
    ["a", "d"],
  );
  assert.deepEqual(
    filterHistoricalCompositionReservoir(articles, new Set(["a"]), new Set(), "")
      .map((article) => article.bankItemId),
    ["b", "c", "d"],
  );
});

test("retirar uma peça devolve-a imediatamente ao grupo natural do reservatório", () => {
  const placed = new Set(["a"]);
  assert.deepEqual(
    filterHistoricalCompositionReservoir(articles, placed, new Set(["benfica"]), "")
      .map((article) => article.bankItemId),
    ["d"],
  );

  placed.delete("a");
  assert.deepEqual(
    filterHistoricalCompositionReservoir(articles, placed, new Set(["benfica"]), "")
      .map((article) => article.bankItemId),
    ["a", "d"],
  );
});

test("mover entre zonas preserva identidade, não passa pelo banco e não sobrescreve um destino ocupado", () => {
  const source: HistoricalCompositionPlacementLocation = {
    kind: "slot",
    zoneKey: "opening",
    targetKey: "dominant_main",
  };
  const emptyTarget: HistoricalCompositionPlacementLocation = {
    kind: "slot",
    zoneKey: "zone_1",
    targetKey: "secondary_strong_1",
  };
  const occupiedTarget: HistoricalCompositionPlacementLocation = {
    kind: "slot",
    zoneKey: "zone_2",
    targetKey: "secondary_3",
  };
  const initial = {
    slots: {
      dominant_main: { bankItemId: "a" },
      secondary_strong_1: null,
      secondary_3: { bankItemId: "b" },
    },
    auxiliary: {},
  };

  const moved = moveHistoricalCompositionPiece(initial, source, emptyTarget);
  assert.equal(moved.changed, true);
  assert.equal(moved.occupied, false);
  assert.equal(moved.plan.slots.dominant_main, null);
  assert.deepEqual(moved.plan.slots.secondary_strong_1, { bankItemId: "a" });

  const rejected = moveHistoricalCompositionPiece(initial, source, occupiedTarget);
  assert.equal(rejected.changed, false);
  assert.equal(rejected.occupied, true);
  assert.equal(rejected.plan, initial);
});

test("mover entre zonas preserva settings e restantes propriedades do plano", () => {
  const source: HistoricalCompositionPlacementLocation = {
    kind: "slot",
    zoneKey: "opening",
    targetKey: "dominant_main",
  };
  const target: HistoricalCompositionPlacementLocation = {
    kind: "slot",
    zoneKey: "zone_1",
    targetKey: "secondary_strong_1",
  };

  const initial = {
    slots: {
      dominant_main: { bankItemId: "a" },
      secondary_strong_1: null,
    },
    auxiliary: {},
    settings: {
      headlineTitleColor: "#10151B",
      zone1Title: "Arbitragem e Reações",
      zone2Title: "Outros jogos da jornada",
      blockOrder: ["opening", "zone_1", "zone_2", "video", "beyond"],
    },
  };

  const moved = moveHistoricalCompositionPiece(initial, source, target);

  assert.equal(moved.changed, true);
  assert.deepEqual(moved.plan, {
    ...initial,
    slots: {
      dominant_main: null,
      secondary_strong_1: { bankItemId: "a" },
    },
  });
});
test("reordenar na mesma zona conserva a troca já existente", () => {
  const first: HistoricalCompositionPlacementLocation = {
    kind: "slot",
    zoneKey: "opening",
    targetKey: "dominant_main",
  };
  const second: HistoricalCompositionPlacementLocation = {
    kind: "slot",
    zoneKey: "opening",
    targetKey: "other_chronicle_1",
  };
  const swapped = moveHistoricalCompositionPiece(
    {
      slots: {
        dominant_main: { bankItemId: "a" },
        other_chronicle_1: { bankItemId: "b" },
      },
      auxiliary: {},
    },
    first,
    second,
  );

  assert.equal(swapped.changed, true);
  assert.equal(swapped.swapped, true);
  assert.equal(swapped.plan.slots.dominant_main?.bankItemId, "b");
  assert.equal(swapped.plan.slots.other_chronicle_1?.bankItemId, "a");
});

test("títulos e ordem inválidos usam fallbacks históricos sem regravar composições antigas", () => {
  assert.equal(
    normalizeHistoricalCompositionZoneTitle(null, HISTORICAL_COMPOSITION_DEFAULT_ZONE_TITLES.zone_1),
    "Arbitragem e Reações",
  );
  assert.equal(
    normalizeHistoricalCompositionZoneTitle("", HISTORICAL_COMPOSITION_DEFAULT_ZONE_TITLES.zone_2),
    "Outros jogos da jornada",
  );
  assert.deepEqual(normalizeHistoricalCompositionBlockOrder(null), HISTORICAL_COMPOSITION_BLOCK_KEYS);
  assert.deepEqual(
    normalizeHistoricalCompositionBlockOrder(["zone_2", "opening", "video", "zone_1", "beyond"]),
    ["zone_2", "opening", "video", "zone_1", "beyond"],
  );
  assert.deepEqual(
    normalizeHistoricalCompositionBlockOrder(["opening", "opening"]),
    HISTORICAL_COMPOSITION_BLOCK_KEYS,
  );
});

test("notícias herdadas não revalidadas ficam fora do reservatório normal", () => {
  const withContinuity = [
    ...articles,
    {
      bankItemId: "e",
      label: "Herdada",
      title: "Notícia da jornada anterior",
      naturalGroupKey: "outros",
      historicalEligible: false,
    },
  ];

  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      withContinuity,
      new Set(),
      new Set(),
      "",
    ).map((article) => article.bankItemId),
    ["a", "b", "c", "d"],
  );
});

test("Bank usa apenas identidade explícita, elegibilidade e disponibilidade", () => {
  const placed = new Set(["live-benfica"]);

  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      liveBankArticles,
      placed,
      new Set(),
      "",
      "in-bank",
    ).map((article) => article.bankItemId),
    ["live-sporting", "inherited-revalidated"],
  );
  assert.deepEqual(historicalCompositionReservoirCounts(liveBankArticles, placed), {
    all: 3,
    inBank: 2,
    outsideBank: 1,
  });
});

test("Todos mantém o universo elegível atual e exclui colocadas e herdadas pendentes", () => {
  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      liveBankArticles,
      new Set(["live-benfica"]),
      new Set(),
      "",
      "all",
    ).map((article) => article.bankItemId),
    ["live-sporting", "all-sporting", "inherited-revalidated"],
  );
});

test("pesquisa e classificação intersectam o Bank", () => {
  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      liveBankArticles,
      new Set(),
      new Set(["sporting"]),
      "dérbi",
      "in-bank",
    ).map((article) => article.bankItemId),
    ["live-sporting"],
  );
});

test("sem identidade explícita ou snapshot temático o âmbito inicial recua para Todos", () => {
  const withoutLiveBankIdentity = liveBankArticles.map((article) => ({
    ...article,
    fromLiveBank: false,
  }));

  assert.equal(
    initialHistoricalCompositionReservoirScope(withoutLiveBankIdentity, new Set()),
    "all",
  );
  assert.equal(
    initialHistoricalCompositionReservoirScope(liveBankArticles, new Set()),
    "in-bank",
  );
  assert.equal(
    initialHistoricalCompositionReservoirScope(
      liveBankArticles,
      new Set(["live-sporting", "live-benfica", "inherited-revalidated"]),
    ),
    "all",
  );
});

test("mudar o âmbito não altera a seleção editorial já feita", () => {
  const selected = new Set(["live-sporting", "all-sporting"]);
  const bank = filterHistoricalCompositionReservoir(
    liveBankArticles,
    new Set(),
    new Set(),
    "",
    "in-bank",
  );
  const all = filterHistoricalCompositionReservoir(
    liveBankArticles,
    new Set(),
    new Set(),
    "",
    "all",
  );

  assert.deepEqual([...selected], ["live-sporting", "all-sporting"]);
  assert.deepEqual(bank.map((article) => article.bankItemId), [
    "live-sporting",
    "live-benfica",
    "inherited-revalidated",
  ]);
  assert.deepEqual(all.map((article) => article.bankItemId), [
    "live-sporting",
    "live-benfica",
    "all-sporting",
    "inherited-revalidated",
  ]);
});

test("Todos, Bank e No Bank partem do mesmo universo recuperável", () => {
  const placed = new Set(["live-benfica"]);

  assert.deepEqual(
    filterHistoricalCompositionReservoir(liveBankArticles, placed, new Set(), "", "all")
      .map((article) => article.bankItemId),
    ["live-sporting", "all-sporting", "inherited-revalidated"],
  );
  assert.deepEqual(
    filterHistoricalCompositionReservoir(liveBankArticles, placed, new Set(), "", "in-bank")
      .map((article) => article.bankItemId),
    ["live-sporting", "inherited-revalidated"],
  );
  assert.deepEqual(
    filterHistoricalCompositionReservoir(liveBankArticles, placed, new Set(), "", "outside-bank")
      .map((article) => article.bankItemId),
    ["all-sporting"],
  );
});

test("classificação combina por AND com Bank e No Bank", () => {
  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      liveBankArticles,
      new Set(),
      new Set(["sporting"]),
      "",
      "in-bank",
    ).map((article) => article.bankItemId),
    ["live-sporting"],
  );
  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      liveBankArticles,
      new Set(),
      new Set(["sporting"]),
      "",
      "outside-bank",
    ).map((article) => article.bankItemId),
    ["all-sporting"],
  );
});

test("Sem classificação representa apenas classifiedZoneKey ausente", () => {
  const withUnclassified = [
    ...liveBankArticles,
    {
      bankItemId: "unclassified",
      label: "Liga",
      title: "Notícia sem classificação",
      naturalGroupKey: null,
      historicalEligible: true,
      fromLiveBank: false,
    },
  ];

  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      withUnclassified,
      new Set(),
      new Set([HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY]),
      "",
      "all",
    ).map((article) => article.bankItemId),
    ["unclassified"],
  );
});

test("pesquisa e contagens facetadas usam o mesmo universo da lista", () => {
  const selectedClassification = new Set(["sporting"]);
  const result = filterHistoricalCompositionReservoir(
    liveBankArticles,
    new Set(),
    selectedClassification,
    "mercado",
    "outside-bank",
  );
  const bankCounts = historicalCompositionReservoirCounts(
    liveBankArticles,
    new Set(),
    selectedClassification,
    "mercado",
  );
  const classificationCounts = historicalCompositionClassificationCounts(
    liveBankArticles,
    new Set(),
    "mercado",
    "outside-bank",
  );

  assert.deepEqual(result.map((article) => article.bankItemId), ["all-sporting"]);
  assert.deepEqual(bankCounts, { all: 1, inBank: 0, outsideBank: 1 });
  assert.equal(classificationCounts.get("sporting"), result.length);
});

test("Histórica filtra selecionados e não selecionados no mesmo universo recuperável", () => {
  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      liveBankArticles,
      new Set(),
      new Set(),
      "",
      "all",
      "selected",
    ).map((article) => article.bankItemId),
    ["live-sporting", "all-sporting"],
  );
  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      liveBankArticles,
      new Set(),
      new Set(),
      "",
      "all",
      "unselected",
    ).map((article) => article.bankItemId),
    ["live-benfica", "inherited-revalidated"],
  );
});

test("classificação, Bank, Histórica e pesquisa combinam por AND", () => {
  const result = filterHistoricalCompositionReservoir(
    liveBankArticles,
    new Set(),
    new Set(["sporting"]),
    "dérbi",
    "in-bank",
    "selected",
  );

  assert.deepEqual(result.map((article) => article.bankItemId), ["live-sporting"]);
});

test("contagens da Histórica são facetadas a partir do universo da lista", () => {
  const selectedGroupKeys = new Set(["sporting"]);
  const counts = historicalCompositionSelectionCounts(
    liveBankArticles,
    new Set(),
    selectedGroupKeys,
    "",
    "all",
  );
  const selected = filterHistoricalCompositionReservoir(
    liveBankArticles,
    new Set(),
    selectedGroupKeys,
    "",
    "all",
    "selected",
  );
  const unselected = filterHistoricalCompositionReservoir(
    liveBankArticles,
    new Set(),
    selectedGroupKeys,
    "",
    "all",
    "unselected",
  );

  assert.deepEqual(counts, { all: 2, selected: 2, unselected: 0 });
  assert.equal(counts.selected, selected.length);
  assert.equal(counts.unselected, unselected.length);
});
