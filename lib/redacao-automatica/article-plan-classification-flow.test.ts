import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { ArticlePlanClassificationEditor } from "../../app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_article-plan-classification";
import { ARTICLE_CLASSIFICATIONS, articleClassificationBadgeColors } from "../editorial-classifications";
import {
  articlePlanAssignedClassificationSourceIds, articleOutputClassificationDefault,
  articlePublicationClassificationDefault, articleOutputClassificationsComplete,
  parseArticlePlanClassificationDecision, resolveArticlePlanClassification,
  reconcileArticleOutputClassifications,
  type ArticlePlanClassificationSource, type ArticlePlanClassificationDecision,
} from "./article-plan-classification";
import {
  parseEditorialBatchTransferSourcePackage, preflightEditorialArticleBatchForSourcePackage,
} from "./editorial-batch-transfer";

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const planA = id(1), planB = id(2);
const sources: ArticlePlanClassificationSource[] = [
  { sourceId: id(11), classificationKey: "benfica", classificationSource: "manual" },
  { sourceId: id(12), classificationKey: "benfica", classificationSource: "manual" },
  { sourceId: id(13), classificationKey: "sporting", classificationSource: "manual" },
  { sourceId: id(14), classificationKey: "sporting", classificationSource: "manual" },
  { sourceId: id(15), classificationKey: "fc_porto", classificationSource: "automatic" },
  { sourceId: id(16), classificationKey: "benfica", classificationSource: null },
  { sourceId: id(17), classificationKey: null, classificationSource: "manual" },
];
const groups = [
  { articlePlanId: planA, outputId: planA, seedSourceIds: [id(11), id(12)] },
  { articlePlanId: planB, outputId: planB, seedSourceIds: [id(13), id(14)] },
];
function assigned(planId: string, groupList = groups) {
  return articlePlanAssignedClassificationSourceIds({ plan: { id: planId }, groups: groupList });
}

test("dois grupos da mesma Produção abrem o controlo real com Benfica e Sporting selecionados", () => {
  for (const [planId, expected] of [[planA, "benfica"], [planB, "sporting"]]) {
    const markup = renderToStaticMarkup(createElement(ArticlePlanClassificationEditor, {
      fieldPrefix: `plan:${planId}:`, persisted: { classificationKey: null },
      assignedSourceIds: assigned(planId), sources, disabled: false, onDecision() {},
    }));
    const $ = load(markup);
    assert.equal($("fieldset > div > label > input[type=radio]").length, 5);
    for (const classification of ARTICLE_CLASSIFICATIONS) {
      const colors = articleClassificationBadgeColors(classification.key);
      const style = $(`label[data-classification="${classification.key}"]`).attr("style");
      assert.ok(style?.includes(`--classification-accent:${colors.backgroundColor}`));
      assert.ok(style?.includes(`--classification-foreground:${colors.color}`));
    }
    assert.equal($("fieldset > button, fieldset > small").length, 0);
    assert.equal($("input[type=radio][checked]").length, 1);
    assert.equal($("input[type=radio][checked]").val(), expected);
    assert.equal($(`input[name='plan:${planId}:classification_key']`).val(), expected);
    assert.equal($(`input[name='plan:${planId}:classification_mode']`).val(), "suggested");
    assert.equal($("input[required]").length, 0);
  }
});

test("fontes mistas, não classificadas, ausentes, automáticas ou sem proveniência deixam vazio", () => {
  for (const ids of [[], [id(11), id(13)], [id(11), id(17)], [id(11), id(99)], [id(15)], [id(16)]]) {
    const decision = resolveArticlePlanClassification(null, ids, sources);
    assert.deepEqual(decision, { classificationKey: null, classificationMode: null });
    const $ = load(renderToStaticMarkup(createElement(ArticlePlanClassificationEditor, {
      fieldPrefix: "plan:test:", persisted: null, assignedSourceIds: ids, sources,
      disabled: false, onDecision() {},
    })));
    assert.equal($("input[type=radio][checked]").length, 0);
  }
  assert.equal(articleOutputClassificationDefault([id(11)], [{
    ...sources[0], classificationKey: "invalid" as never,
  }]), null);
});

test("grupo é procurado pelo plan/output ID; contexto disponível não prova pertença", () => {
  assert.deepEqual(assigned(planA, [...groups].reverse()), [id(11), id(12)]);
  assert.equal(resolveArticlePlanClassification(null, assigned(planA), sources).classificationKey, "benfica");
  assert.deepEqual(assigned(id(90)), []);
  assert.deepEqual(articlePlanAssignedClassificationSourceIds({ plan: null, groups }), []);
  const technicalPlan = { id: planA, sources: [{ dossierSourceId: id(11) }] };
  assert.deepEqual(articlePlanAssignedClassificationSourceIds({ plan: technicalPlan }), []);
  assert.deepEqual(assigned(planA, [{ ...groups[0], outputId: planB }]), []);
  assert.deepEqual(articlePlanAssignedClassificationSourceIds({
    plan: { id: planB }, outputs: [
      { outputId: planA, focusSourceIds: [id(11)] },
      { outputId: planB, focusSourceIds: [id(13)] },
    ],
  }), [id(13)]);
});

test("reagrupar reavalia só sugestões; uma fonte continua a poder contribuir para vários artigos", () => {
  const previous = resolveArticlePlanClassification(null, assigned(planA), sources);
  assert.deepEqual(resolveArticlePlanClassification(previous, assigned(planB), sources), {
    classificationKey: "sporting", classificationMode: "suggested",
  });
  const shared = [...groups, { articlePlanId: id(3), outputId: id(3), seedSourceIds: [id(11)] }];
  assert.equal(resolveArticlePlanClassification(null, assigned(id(3), shared), sources).classificationKey, "benfica");
  assert.deepEqual(shared[0].seedSourceIds, [id(11), id(12)]);
});

test("escolha humana e limpeza prevalecem sobre sugestões, refresh de props e reabertura", () => {
  for (const choice of [
    { classificationKey: "fc_porto", classificationMode: "manual" },
    { classificationKey: null, classificationMode: "cleared" },
    { classificationKey: "benfica", classificationMode: "manual" },
  ] as const) {
    const staleProps = { classificationKey: "sporting", classificationMode: "suggested" } as const;
    assert.deepEqual(resolveArticlePlanClassification(staleProps, assigned(planB), sources, choice), choice);
    const reopened = JSON.parse(JSON.stringify(choice)) as ArticlePlanClassificationDecision;
    assert.deepEqual(resolveArticlePlanClassification(reopened, assigned(planB), sources), choice);
    const $ = load(renderToStaticMarkup(createElement(ArticlePlanClassificationEditor, {
      fieldPrefix: "plan:test:", persisted: reopened, assignedSourceIds: assigned(planB), sources,
      disabled: false, onDecision() {},
    })));
    assert.equal($("input[type=radio][checked]").val() ?? null, choice.classificationKey);
  }
  assert.equal(resolveArticlePlanClassification({ classificationKey: "fc_porto" }, assigned(planA), sources).classificationMode, "manual");
});

test("contrato distingue vazio, sugestão, escolha e limpeza e recusa pares incoerentes", () => {
  assert.deepEqual(parseArticlePlanClassificationDecision(null, null), { classificationKey: null, classificationMode: null });
  for (const [key, mode] of [[null, "manual"], [null, "suggested"], ["benfica", "cleared"], ["benfica", "unknown"]]) {
    assert.equal(parseArticlePlanClassificationDecision(key, mode), null);
  }
});

const transferInput = {
  year: "2026", month: "09", packageId: id(100),
  batchContract: { manifestVersion: 5, provenanceContract: "mesa-v2", workspaceContractVersion: 2,
    outputIds: [planA, planB], sourceIds: [id(11), id(13), id(15)],
    sourceIdsByOutput: { [planA]: [id(11), id(13), id(15)], [planB]: [id(11), id(13), id(15)] } },
  classificationsByOutputId: { [planA]: "benfica", [planB]: "fc_porto" },
  classificationModesByOutputId: { [planA]: "suggested", [planB]: "manual" },
};
function article(output: string, source: string) {
  return `[JORNADA_ARTIGO_V1]\nOUTPUT_ID\n${output}\nFONTES_UTILIZADAS\n${source}\nANTETÍTULO\nLiga\nTÍTULO\nArtigo de teste ${output}\nPÓS-TÍTULO\nContexto\nCORPO\nCorpo de teste.\n[/JORNADA_ARTIGO_V1]`;
}

test("pacote/output/Publicação usa FONTES_UTILIZADAS e conserva escolha por ID após reordenar texto", () => {
  const transferred = parseEditorialBatchTransferSourcePackage(JSON.stringify(transferInput));
  assert.ok(transferred);
  let current = {};
  for (const text of [
    `${article(planA, id(13))}\n${article(planB, id(11))}`,
    `${article(planB, id(11))}\n${article(planA, id(13))}`,
  ]) {
    const parsed = preflightEditorialArticleBatchForSourcePackage(text, transferred);
    assert.equal(parsed.ready, true, JSON.stringify(parsed.issues));
    const prepared = parsed.articles.map((output) => ({
      outputId: output.outputId!,
      classificationDefault: articlePublicationClassificationDefault({
        classificationKey: transferred.classificationsByOutputId?.[output.outputId!],
        classificationMode: transferred.classificationModesByOutputId?.[output.outputId!],
      }, articleOutputClassificationDefault(output.sourceIds, sources)),
      frozenClassificationKey: null,
    }));
    current = reconcileArticleOutputClassifications({
      outputIds: transferred.batchContract!.outputIds, choices: current, touched: new Set(), prepared,
      plannedKeys: transferred.classificationsByOutputId, plannedModes: transferred.classificationModesByOutputId,
    });
    assert.deepEqual(current, { [planA]: "sporting", [planB]: "fc_porto" });
  }
  assert.equal(articleOutputClassificationsComplete([planB, planA], current), true);
});

test("limpeza atravessa transferência e impede fallback; publicação permanece bloqueada", () => {
  const transferred = parseEditorialBatchTransferSourcePackage(JSON.stringify({
    ...transferInput, classificationsByOutputId: { [planB]: "fc_porto" },
    classificationModesByOutputId: { [planA]: "cleared", [planB]: "manual" },
  }));
  assert.ok(transferred);
  assert.equal(articlePublicationClassificationDefault({ classificationMode: "cleared" }, "sporting"), null);
  const choices = reconcileArticleOutputClassifications({
    outputIds: [planA, planB], choices: {}, touched: new Set(), prepared: [],
    plannedKeys: transferred.classificationsByOutputId, plannedModes: transferred.classificationModesByOutputId,
  });
  assert.equal(articleOutputClassificationsComplete([planA, planB], choices), false);
  assert.equal(articleOutputClassificationsComplete([planB], choices), true, "SEM ALTERAÇÃO não exige nem publica classificação");
  assert.equal(parseEditorialBatchTransferSourcePackage(JSON.stringify({
    ...transferInput, classificationModesByOutputId: { [planA]: "cleared" },
  })), null, "não aceita key juntamente com limpeza");
});

test("decisão final fica ligada ao output em novos defaults, mudanças de imagem e retries congelados", () => {
  const choices = { [planA]: "outside_liga_other" as const, [planB]: "sporting" as const };
  const input = { outputIds: [planB, planA], choices, touched: new Set([planA, planB]),
    prepared: [{ outputId: planA, classificationDefault: "benfica" as const, frozenClassificationKey: null }] };
  assert.deepEqual(reconcileArticleOutputClassifications(input), choices);
  assert.deepEqual(reconcileArticleOutputClassifications({ ...input, prepared: [] }), choices);
  assert.deepEqual(reconcileArticleOutputClassifications({ ...input, prepared: [
    { ...input.prepared[0], frozenClassificationKey: "fc_porto" },
  ] }), { [planA]: "fc_porto", [planB]: "sporting" });
  assert.deepEqual(reconcileArticleOutputClassifications({ ...input, prepared: [], frozen: { [planA]: "fc_porto" } }),
    { [planA]: "fc_porto", [planB]: "sporting" }, "revalidar imagens/preflight não perde a classificação já congelada");
  assert.equal(articlePublicationClassificationDefault({ classificationKey: "benfica", classificationMode: "suggested" }, null), null);
  assert.equal(articlePublicationClassificationDefault({ classificationKey: "benfica", classificationMode: "manual" }, null), "benfica");
});
