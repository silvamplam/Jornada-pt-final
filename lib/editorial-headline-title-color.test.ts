import assert from "node:assert/strict";
import test from "node:test";

import {
  headlineTitleColorForClassification,
  type ArticleClassificationKey,
} from "./editorial-classifications";
import {
  synchronizeHistoricalHeadlineTitleColor,
} from "./editorial-historical-composition-workspace";

test("a paleta da Manchete tem uma única autoridade por classificação", () => {
  assert.equal(headlineTitleColorForClassification("benfica"), "#B4232C");
  assert.equal(headlineTitleColorForClassification("sporting"), "#146B3A");
  assert.equal(headlineTitleColorForClassification("fc_porto"), "#1E4F91");
  assert.equal(headlineTitleColorForClassification("other_liga_clubs"), "#10151B");
  assert.equal(headlineTitleColorForClassification("outside_liga_other"), "#10151B");
  assert.equal(headlineTitleColorForClassification(null), "#10151B");
});

test("o plano histórico sincroniza dominant_main e cor no mesmo estado", () => {
  type Card = Readonly<{ bankItemId: string | null; persistedId: string | null }>;
  type Plan = Readonly<{
    slots: Readonly<Record<string, Card | null>>;
    auxiliary: Readonly<Record<string, Card | null>>;
    settings: Readonly<{ headlineTitleColor: string; untouched: string }>;
  }>;

  const classifications = new Map<string, ArticleClassificationKey | null>([
    ["benfica", "benfica"],
    ["sporting", "sporting"],
    ["porto", "fc_porto"],
    ["liga", "other_liga_clubs"],
    ["outros", "outside_liga_other"],
    ["sem-classificacao", null],
  ]);
  const classify = (bankItemId: string) => classifications.get(bankItemId) ?? null;
  const initial: Plan = {
    slots: { dominant_main: null },
    auxiliary: {},
    settings: { headlineTitleColor: "#778899", untouched: "preservado" },
  };
  const place = (plan: Plan, bankItemId: string): Plan =>
    synchronizeHistoricalHeadlineTitleColor(
      plan,
      {
        ...plan,
        slots: {
          ...plan.slots,
          dominant_main: { bankItemId, persistedId: null },
        },
      },
      classify,
    );

  const benfica = place(initial, "benfica");
  const sporting = place(benfica, "sporting");
  const porto = place(sporting, "porto");

  assert.equal(benfica.slots.dominant_main?.bankItemId, "benfica");
  assert.equal(benfica.settings.headlineTitleColor, "#B4232C");
  assert.equal(sporting.settings.headlineTitleColor, "#146B3A");
  assert.equal(porto.settings.headlineTitleColor, "#1E4F91");
  assert.equal(place(porto, "liga").settings.headlineTitleColor, "#10151B");
  assert.equal(place(porto, "outros").settings.headlineTitleColor, "#10151B");
  assert.equal(place(porto, "sem-classificacao").settings.headlineTitleColor, "#10151B");
  assert.equal(porto.settings.untouched, "preservado");

  // O checkpoint anterior é simultaneamente o artigo e a cor a restaurar pelo Undo.
  assert.equal(sporting.slots.dominant_main?.bankItemId, "sporting");
  assert.equal(sporting.settings.headlineTitleColor, "#146B3A");
});

test("abrir um draft histórico não recalcula uma cor já guardada", () => {
  const loaded = {
    slots: {
      dominant_main: { bankItemId: "benfica", persistedId: "slot-1" },
    },
    auxiliary: {},
    settings: { headlineTitleColor: "#ABCDEF" },
  };

  const unchanged = synchronizeHistoricalHeadlineTitleColor(
    loaded,
    loaded,
    () => "benfica",
  );

  assert.equal(unchanged, loaded);
  assert.equal(unchanged.settings.headlineTitleColor, "#ABCDEF");
});
