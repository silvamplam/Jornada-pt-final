import assert from "node:assert/strict";
import test from "node:test";

import {
  HISTORICAL_DYNAMIC_ZONE_LAYOUTS,
  historicalDynamicZoneCapacity,
  historicalDynamicZonePositions,
  isHistoricalDynamicZoneVisualFamily,
  normalizeHistoricalDynamicZoneTitle,
} from "./editorial-historical-composition-workspace";

test("as zonas históricas reutilizam as famílias visuais suportadas", () => {
  assert.deepEqual(
    Object.keys(HISTORICAL_DYNAMIC_ZONE_LAYOUTS),
    [
      "six_news",
      "five_news_balanced",
      "five_news_secondary",
      "four_news",
      "six_news_1_2_3",
      "five_news_column",
    ],
  );

  assert.equal(
    historicalDynamicZoneCapacity("six_news"),
    6,
  );

  assert.equal(
    historicalDynamicZoneCapacity("five_news_balanced"),
    5,
  );

  assert.equal(
    historicalDynamicZoneCapacity("five_news_secondary"),
    5,
  );

  assert.equal(
    historicalDynamicZoneCapacity("four_news"),
    4,
  );
  assert.equal(historicalDynamicZoneCapacity("six_news_1_2_3"), 6);
  assert.equal(isHistoricalDynamicZoneVisualFamily("six_news_1_2_3"), true);
  assert.deepEqual(
    historicalDynamicZonePositions("six_news_1_2_3").map((slot) => slot.label),
    ["Destaque horizontal", "Intermédia 1", "Intermédia 2", "Final 1", "Final 2", "Final 3"],
  );
});

test("cada família expõe apenas as posições compatíveis com a sua capacidade", () => {
  assert.equal(
    historicalDynamicZonePositions("six_news").length,
    6,
  );

  assert.equal(
    historicalDynamicZonePositions("five_news_balanced").length,
    5,
  );

  assert.equal(
    historicalDynamicZonePositions("five_news_secondary").length,
    5,
  );

  assert.equal(
    historicalDynamicZonePositions("four_news").length,
    4,
  );

  assert.equal(
    historicalDynamicZonePositions("six_news")[0]?.label,
    "Dominante",
  );
});

test("qualquer zona pode escolher independentemente qualquer família visual suportada", () => {
  assert.equal(
    isHistoricalDynamicZoneVisualFamily("six_news"),
    true,
  );

  assert.equal(
    isHistoricalDynamicZoneVisualFamily("five_news_balanced"),
    true,
  );

  assert.equal(
    isHistoricalDynamicZoneVisualFamily("five_news_secondary"),
    true,
  );

  assert.equal(
    isHistoricalDynamicZoneVisualFamily("four_news"),
    true,
  );

  assert.equal(
    isHistoricalDynamicZoneVisualFamily("layout_inventado"),
    false,
  );
});

test("o título da zona é editorial e não define a estrutura", () => {
  assert.equal(
    normalizeHistoricalDynamicZoneTitle("  FC Porto  "),
    "FC Porto",
  );

  assert.equal(
    normalizeHistoricalDynamicZoneTitle(""),
    "Nova zona",
  );

  assert.equal(
    normalizeHistoricalDynamicZoneTitle(null, "Zona editorial"),
    "Zona editorial",
  );
});
