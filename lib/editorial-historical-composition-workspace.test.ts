import assert from "node:assert/strict";
import test from "node:test";

import {
  HISTORICAL_COMPOSITION_BLOCK_KEYS,
  HISTORICAL_COMPOSITION_DEFAULT_ZONE_TITLES,
  HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY,
  filterHistoricalCompositionReservoir,
  historicalCompositionClassificationCounts,
  historicalCompositionDecisionCounts,
  historicalCompositionEffectiveDecision,
  moveHistoricalCompositionPiece,
  normalizeHistoricalCompositionBlockOrder,
  normalizeHistoricalCompositionZoneTitle,
  type HistoricalCompositionPlacementLocation,
} from "./editorial-historical-composition-workspace";

const articles = [
  { bankItemId: "a", label: "Benfica", title: "Águias vencem", naturalGroupKey: "benfica", historicalDecision: "undecided" },
  { bankItemId: "b", label: "Sporting", title: "Leões empatam", naturalGroupKey: "sporting", historicalDecision: "undecided" },
  { bankItemId: "c", label: "Liga", title: "Mercado fecha", naturalGroupKey: "outros", historicalDecision: "undecided" },
  { bankItemId: "d", label: "Benfica", title: "Mercado encarnado", naturalGroupKey: "benfica", historicalDecision: "undecided" },
] as const;

const liveBankArticles = [
  { bankItemId: "live-sporting", label: "Sporting", title: "Leões vencem o dérbi", naturalGroupKey: "sporting", historicalEligible: true, historicalDecision: "selected" },
  { bankItemId: "live-benfica", label: "Benfica", title: "Águias preparam o clássico", naturalGroupKey: "benfica", historicalEligible: true, historicalDecision: "bank" },
  { bankItemId: "all-sporting", label: "Sporting", title: "Mercado leonino", naturalGroupKey: "sporting", historicalEligible: true, historicalDecision: "selected" },
  { bankItemId: "inherited-pending", label: "Sporting", title: "Herdada sem revalidação", naturalGroupKey: "sporting", historicalEligible: false, historicalDecision: "bank" },
  { bankItemId: "inherited-revalidated", label: "Benfica", title: "Herdada já revalidada", naturalGroupKey: "benfica", historicalEligible: true, historicalDecision: "bank" },
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
      historicalDecision: "undecided" as const,
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

test("o filtro editorial mapeia diretamente Sem decisão, Bank e Histórica", () => {
  const decisionArticles = [
    ...liveBankArticles,
    {
      bankItemId: "undecided-benfica",
      label: "Benfica",
      title: "Notícia por decidir",
      naturalGroupKey: "benfica",
      historicalEligible: true,
      historicalDecision: "undecided" as const,
    },
  ];

  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      decisionArticles,
      new Set(),
      new Set(),
      "",
      "undecided",
    ).map((article) => article.bankItemId),
    ["undecided-benfica"],
  );
  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      decisionArticles,
      new Set(),
      new Set(["benfica"]),
      "",
      "undecided",
    ).map((article) => article.bankItemId),
    ["undecided-benfica"],
  );
  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      decisionArticles,
      new Set(),
      new Set(),
      "",
      "bank",
    ).map((article) => article.bankItemId),
    ["live-benfica", "inherited-revalidated"],
  );
  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      decisionArticles,
      new Set(),
      new Set(),
      "",
      "selected",
    ).map((article) => article.bankItemId),
    ["live-sporting", "all-sporting"],
  );
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

test("estado editorial, classificação e pesquisa combinam por AND", () => {
  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      liveBankArticles,
      new Set(),
      new Set(["benfica"]),
      "clássico",
      "bank",
    ).map((article) => article.bankItemId),
    ["live-benfica"],
  );
  assert.deepEqual(
    filterHistoricalCompositionReservoir(
      liveBankArticles,
      new Set(),
      new Set(["sporting"]),
      "mercado",
      "selected",
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
      historicalDecision: "undecided" as const,
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

test("contagens facetadas usam o mesmo universo e somam ao total", () => {
  const decisionArticles = [
    ...liveBankArticles,
    {
      bankItemId: "undecided-sporting",
      label: "Sporting",
      title: "Mercado por decidir",
      naturalGroupKey: "sporting",
      historicalEligible: true,
      historicalDecision: "undecided" as const,
    },
  ];
  const selectedGroupKeys = new Set(["sporting"]);
  const counts = historicalCompositionDecisionCounts(
    decisionArticles,
    new Set(),
    selectedGroupKeys,
    "mercado",
  );
  const classificationCounts = historicalCompositionClassificationCounts(
    decisionArticles,
    new Set(),
    "mercado",
    "selected",
  );
  const selected = filterHistoricalCompositionReservoir(
    decisionArticles,
    new Set(),
    selectedGroupKeys,
    "mercado",
    "selected",
  );

  assert.deepEqual(counts, { all: 2, undecided: 1, bank: 0, selected: 1 });
  assert.equal(counts.all, counts.undecided + counts.bank + counts.selected);
  assert.deepEqual(selected.map((article) => article.bankItemId), ["all-sporting"]);
  assert.equal(classificationCounts.get("sporting"), selected.length);
});

test("a decisão explícita tem precedência sobre o fallback do Bank da Viva", () => {
  assert.equal(historicalCompositionEffectiveDecision(null, true), "bank");
  assert.equal(historicalCompositionEffectiveDecision(undefined, false), "undecided");
  assert.equal(historicalCompositionEffectiveDecision("undecided", true), "undecided");
  assert.equal(historicalCompositionEffectiveDecision("selected", true), "selected");
  assert.equal(historicalCompositionEffectiveDecision("bank", false), "bank");
});

test("um artigo originário do Bank mantém todas as transições explícitas após reload", () => {
  const fromLiveBank = true;
  let persistedDecision: "selected" | "bank" | "undecided" | null = null;

  assert.equal(historicalCompositionEffectiveDecision(persistedDecision, fromLiveBank), "bank");

  persistedDecision = "undecided";
  assert.equal(historicalCompositionEffectiveDecision(persistedDecision, fromLiveBank), "undecided");
  assert.equal(historicalCompositionEffectiveDecision(persistedDecision, fromLiveBank), "undecided");

  persistedDecision = "selected";
  assert.equal(historicalCompositionEffectiveDecision(persistedDecision, fromLiveBank), "selected");

  persistedDecision = "undecided";
  assert.equal(historicalCompositionEffectiveDecision(persistedDecision, fromLiveBank), "undecided");

  persistedDecision = "bank";
  assert.equal(historicalCompositionEffectiveDecision(persistedDecision, fromLiveBank), "bank");
});
