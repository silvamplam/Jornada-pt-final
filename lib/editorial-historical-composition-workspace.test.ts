import assert from "node:assert/strict";
import test from "node:test";

import {
  HISTORICAL_COMPOSITION_BLOCK_KEYS,
  HISTORICAL_COMPOSITION_DEFAULT_ZONE_TITLES,
  filterHistoricalCompositionReservoir,
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
