import assert from "node:assert/strict";
import test from "node:test";

import {
  articleOutputClassificationDefault,
  articleOutputClassificationsComplete,
} from "./article-plan-classification";

type ClassificationKey =
  | "benfica"
  | "sporting"
  | "fc_porto"
  | "other_liga_clubs"
  | "outside_liga_other";

const source = (
  sourceId: string,
  classificationKey: ClassificationKey | null,
  classificationSource: "automatic" | "manual" | null = "manual",
) => ({ sourceId, classificationKey, classificationSource });

test("fontes realmente usadas homogéneas sugerem a classificação do output", () => {
  for (const classificationKey of [
    "benfica",
    "sporting",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
  ] as const) {
    assert.equal(
      articleOutputClassificationDefault(["a", "b", "c"], [
        source("a", classificationKey),
        source("b", classificationKey),
        source("c", classificationKey),
      ]),
      classificationKey,
    );
  }
});

test("fontes mistas ou com uma fonte por classificar não criam default", () => {
  assert.equal(articleOutputClassificationDefault(["a", "b"], [
    source("a", "benfica"),
    source("b", "sporting"),
  ]), null);
  assert.equal(articleOutputClassificationDefault(["a", "b"], [
    source("a", "fc_porto"),
    source("b", null, null),
  ]), null);
  assert.equal(articleOutputClassificationDefault([], []), null);
});

test("contexto misto não contamina o default das fontes efetivamente usadas", () => {
  const context = [
    source("benfica-1", "benfica"),
    source("benfica-2", "benfica"),
    source("sporting", "sporting"),
    source("porto", "fc_porto"),
  ];

  assert.equal(
    articleOutputClassificationDefault(["benfica-1", "benfica-2"], context),
    "benfica",
  );
  assert.equal(
    articleOutputClassificationDefault(["benfica-1", "sporting", "porto"], context),
    null,
  );
  assert.equal(
    articleOutputClassificationDefault(["sporting"], context),
    "sporting",
  );
});

test("N:N permite defaults e escolhas finais independentes por output", () => {
  const context = [
    source("benfica-1", "benfica"),
    source("benfica-2", "benfica"),
    source("sporting", "sporting"),
    source("porto", "fc_porto"),
  ];

  assert.equal(
    articleOutputClassificationDefault(["benfica-1", "benfica-2"], context),
    "benfica",
  );
  assert.equal(
    articleOutputClassificationDefault(["benfica-1", "sporting", "porto"], context),
    null,
  );
  assert.equal(
    articleOutputClassificationDefault(["benfica-1"], context),
    "benfica",
  );
  assert.equal(articleOutputClassificationsComplete(["01", "02", "03"], {
    "01": "benfica",
    "02": "other_liga_clubs",
    "03": "outside_liga_other",
  }), true);
});

test("classificação automática ou fonte ausente nunca cria default", () => {
  assert.equal(articleOutputClassificationDefault(["a"], [
    source("a", "benfica", "automatic"),
  ]), null);
  assert.equal(articleOutputClassificationDefault(["a", "missing"], [
    source("a", "benfica"),
  ]), null);
});

test("publicação só fica completa depois de todas as escolhas finais", () => {
  assert.equal(articleOutputClassificationsComplete(["01", "02"], {
    "01": "benfica",
  }), false);
  assert.equal(articleOutputClassificationsComplete(["01", "02"], {
    "01": "benfica",
    "02": "outside_liga_other",
  }), true);
});
