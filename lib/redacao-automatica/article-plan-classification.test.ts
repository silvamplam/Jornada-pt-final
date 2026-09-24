import assert from "node:assert/strict";
import test from "node:test";

import {
  articlePlanClassificationDefault,
} from "./article-plan-classification";

test("fontes homogéneas sugerem a classificação do Article Plan", () => {
  for (const classificationKey of [
    "benfica",
    "sporting",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
  ] as const) {
    assert.equal(
      articlePlanClassificationDefault([
        { classificationKey },
        { classificationKey },
        { classificationKey },
      ]),
      classificationKey,
    );
  }
});

test("fontes mistas ou com uma fonte por classificar não criam default", () => {
  assert.equal(articlePlanClassificationDefault([
    { classificationKey: "benfica" },
    { classificationKey: "sporting" },
  ]), null);
  assert.equal(articlePlanClassificationDefault([
    { classificationKey: "fc_porto" },
    { classificationKey: null },
  ]), null);
  assert.equal(articlePlanClassificationDefault([]), null);
});
