import assert from "node:assert/strict";
import test from "node:test";

import {
  isHistoricalBankItemEligible,
  isHistoricalInheritedBankItem,
} from "./editorial-historical-inherited-news";

test("notícia nativa da jornada continua elegível para a composição histórica", () => {
  const item = {
    continuity_source_matchday_id: null,
    continuity_revalidated_at: null,
  };

  assert.equal(isHistoricalInheritedBankItem(item), false);
  assert.equal(isHistoricalBankItemEligible(item), true);
});

test("notícia herdada fica fora da seleção histórica até haver revalidação", () => {
  const item = {
    continuity_source_matchday_id: "j05",
    continuity_revalidated_at: null,
  };

  assert.equal(isHistoricalInheritedBankItem(item), true);
  assert.equal(isHistoricalBankItemEligible(item), false);
});

test("revalidação torna a notícia herdada elegível apenas na jornada que a recebeu", () => {
  const item = {
    continuity_source_matchday_id: "j05",
    continuity_revalidated_at: "2026-09-17T08:00:00.000Z",
  };

  assert.equal(isHistoricalInheritedBankItem(item), true);
  assert.equal(isHistoricalBankItemEligible(item), true);
});
