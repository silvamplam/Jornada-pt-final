import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  confirmedProductionClassifications,
  productionClassificationNeedsSave,
  productionPackageDisabled,
} from "../../app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_production-package-state";
import type { ArticlePlanClassificationDecision } from "./article-plan-classification";

const existingKey = "existing-output";
const newKey = "output:draft:2";
const cards = [
  { key: existingKey, plan: { id: "existing-plan", classificationKey: null, classificationMode: null },
    assignedClassificationSourceIds: ["benfica-source"] },
  { key: newKey, plan: null, assignedClassificationSourceIds: [] },
] as const;
const sources = [
  { sourceId: "benfica-source", classificationKey: "benfica", classificationSource: "manual" },
] as const;
const savedOutputs = [
  { clientKey: existingKey, articlePlanId: "existing-plan" },
  { clientKey: newKey, articlePlanId: "new-plan" },
];

function requested(existingClassification: "fc_porto" | "sporting") {
  return [
    { clientKey: existingKey, classificationKey: existingClassification, classificationMode: "manual" },
    { clientKey: newKey, classificationKey: "sporting", classificationMode: "manual" },
  ];
}

test("save batch torna ambas as ações elegíveis para preparação sem refresh; nova edição volta a bloquear", () => {
  let confirmed: Record<string, ArticlePlanClassificationDecision> = {};
  let savedPlanIds: Record<string, string> = {};
  let dirty = true;
  let persistedOutputCount = 1;
  const disabled = () => productionPackageDisabled({
    saving: false,
    dirty,
    classificationNeedsSave: productionClassificationNeedsSave(cards, sources, confirmed),
    allPlansPersisted: cards.every((card) => Boolean(card.plan?.id || savedPlanIds[card.key])),
    persistedOutputCount,
    outputCount: 2,
  });

  assert.equal(disabled(), true, "a sugestão ainda não persistida bloqueia as ações");
  assert.equal(productionClassificationNeedsSave(cards, sources, confirmed), true);

  const firstSave = confirmedProductionClassifications(requested("fc_porto"), savedOutputs);
  assert.ok(firstSave, "o sucesso integral confirma as duas decisões por clientKey");
  confirmed = firstSave;
  savedPlanIds = { [existingKey]: "existing-plan", [newKey]: "new-plan" };
  persistedOutputCount = 2;
  dirty = false;
  assert.equal(disabled(), false, "descarregar e copiar podem iniciar a preparação sem refresh ou nova leitura");
  assert.equal(productionClassificationNeedsSave(cards, sources, confirmed), false,
    "os props antigos do plano existente e do novo continuam intactos");

  dirty = true;
  assert.equal(disabled(), true, "alterar novamente a classificação bloqueia as duas ações");
  const partialSave = confirmedProductionClassifications(requested("sporting"), [savedOutputs[0]]);
  assert.equal(partialSave, null, "uma resposta parcial não substitui o baseline confirmado");
  assert.deepEqual(confirmed, firstSave);
  assert.equal(disabled(), true);

  const secondSave = confirmedProductionClassifications(requested("sporting"), savedOutputs);
  assert.ok(secondSave);
  confirmed = secondSave;
  dirty = false;
  assert.equal(disabled(), false, "o segundo sucesso permite preparar novamente as duas ações");
  assert.deepEqual(confirmed[existingKey], { classificationKey: "sporting", classificationMode: "manual" });
  assert.deepEqual(confirmed[newKey], { classificationKey: "sporting", classificationMode: "manual" });
});


test("um output materializado não confirma uma classificação que o batch não regravou", () => {
  assert.deepEqual(confirmedProductionClassifications(requested("fc_porto"), [
    { ...savedOutputs[0], materialized: true }, savedOutputs[1],
  ]), { [newKey]: { classificationKey: "sporting", classificationMode: "manual" } });
});
test("o cliente usa a prontidão comum nos dois botões e só confirma o baseline após sucesso integral", () => {
  const client = readFileSync(join(process.cwd(),
    "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx"), "utf8");
  assert.match(client, /const packageDisabled = productionPackageDisabled\(/);
  assert.match(client, /disabled=\{packageDisabled\}/);
  assert.match(client, /onClick=\{downloadImages\} disabled=\{disabled \|\| !prepared\}/);
  assert.match(client, /onClick=\{copyPackage\} disabled=\{disabled \|\| preparationState\.kind !== "ready"\}/);
  assert.match(client, /catch \(error\) \{\s*setSavedPlanIds\(nextSavedPlanIds\);\s*setDirty\(true\)/);
  assert.ok(client.indexOf("setConfirmedClassifications(nextConfirmedClassifications)")
    > client.indexOf("|| !nextConfirmedClassifications"));
  assert.doesNotMatch(client, /router\.refresh\(|window\.location\.reload\(/);
});
