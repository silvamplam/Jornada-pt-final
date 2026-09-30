import assert from "node:assert/strict";
import test from "node:test";

import type {
  EditorialDossierProductionLoad,
} from "@/lib/redacao-automatica/editorial-dossier-production-loader";
import {
  saveEditorialDossierWorkspaceBatchService,
  type SaveEditorialDossierWorkspaceBatchOutputInput,
} from "@/lib/redacao-automatica/editorial-dossier-workspace-batch-service-internal";

function id(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

const dossierId = id(1);
const sourceOneId = id(101);
const sourceTwoId = id(102);
const newsroomOneId = id(111);
const newsroomTwoId = id(112);
const contextOneId = id(201);
const contextTwoId = id(202);
const publishedArticleId = id(301);
const dossierImageId = id(401);

function productionAuthority(
  mode: "historical" | "contexts" = "historical",
): EditorialDossierProductionLoad {
  const sources = [
    {
      id: sourceOneId,
      newsroomArticleId: newsroomOneId,
      newsroomSnapshotId: id(121),
      sortOrder: 10,
      included: true,
      articleTitle: "Fonte um",
    },
    {
      id: sourceTwoId,
      newsroomArticleId: newsroomTwoId,
      newsroomSnapshotId: id(122),
      sortOrder: 20,
      included: true,
      articleTitle: "Fonte dois",
    },
  ];
  return {
    dossier: { id: dossierId, title: "Dossiê batch", sources },
    plans: [],
    workspace: {
      contextMode: mode,
      mesaContext: {
        workspaceContractVersion: mode === "contexts" ? 2 : 1,
        workspaceState: "active",
        selectionPayload: {
          sources: sources.map((source) => ({ newsroomArticleId: source.newsroomArticleId })),
        },
        materialRefs: [],
      },
      productionContexts: mode === "contexts"
        ? [
            {
              id: contextOneId,
              title: "Contexto um",
              sources: [{ dossierSourceId: sourceOneId }],
            },
            {
              id: contextTwoId,
              title: "Contexto dois",
              sources: [{ dossierSourceId: sourceTwoId }],
            },
          ]
        : [],
      publishedContexts: [{ id: publishedArticleId }],
    },
    parentThemeId: null,
    organizationReadable: true,
  } as unknown as EditorialDossierProductionLoad;
}

function output(
  priority: number,
  overrides: Partial<SaveEditorialDossierWorkspaceBatchOutputInput> = {},
): SaveEditorialDossierWorkspaceBatchOutputInput {
  return {
    clientKey: `output-${priority}`,
    articlePlanId: null,
    priority,
    articleKind: "news",
    lengthMode: "standard",
    editorialInstructions: `Orientação ${priority}`,
    destination: "new",
    updateTargetEditorialArticleId: null,
    imageChoice: { mode: "unselected" },
    productionContextId: null,
    classificationKey: null,
    ...overrides,
  };
}

const expectedState = "a".repeat(64);
function harness(mode: "historical" | "contexts" = "historical", failure?: string) {
  const calls: Array<{ input: import("./editorial-dossier-workspace-batch-service-internal").SaveEditorialDossierWorkspaceBatchInput; outputs: readonly import("./editorial-dossier-workspace-batch-service-internal").AtomicProductionOutput[] }> = [];
  let reads = 0;
  const save = saveEditorialDossierWorkspaceBatchService({
    async loadProduction() { reads++; return { ok: true, value: productionAuthority(mode) }; },
    async saveAtomic(input, outputs) {
      calls.push({ input, outputs });
      if (failure) throw new Error(failure);
      return { dossierId, outputCount: outputs.length, stateToken: "b".repeat(64),
        outputs: outputs.map(o => ({ clientKey: o.clientKey, priority: o.priority,
          articlePlanId: o.articlePlanId ?? id(1000+o.priority), created: !o.articlePlanId, materialized: false })) };
    },
  });
  return { calls, get reads() { return reads; },
    save: (outputs: readonly SaveEditorialDossierWorkspaceBatchOutputInput[], overrides = {}) => save({ dossierId,
      outputCount: outputs.length, expectedState, requestId: id(900), outputs, ...overrides }) };
}

test("1, 2, 6 e 30 artigos usam uma leitura e exatamente um write transacional", async () => {
  for (const count of [1, 2, 6, 30]) {
    const h = harness(); const result = await h.save(Array.from({length:count}, (_,i) => output(i+1)));
    assert.equal(result.ok, true); assert.equal(h.reads,1); assert.equal(h.calls.length,1);
    assert.equal(h.calls[0].outputs.length,count);
  }
});

test("imagens preparadas e escolhas diferentes seguem no mesmo pedido atómico", async () => {
  const h=harness();
  const result=await h.save([output(1,{imageChoice:{mode:"dossier_image",dossierImageId}, preparedImageDecisionKey:"decision-a", automaticImage:true}),
    output(2,{destination:"update",updateTargetEditorialArticleId:publishedArticleId,imageChoice:{mode:"preserve_published"}}), output(3)]);
  assert.equal(result.ok,true); assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].outputs[0].preparedImageDecisionKey,"decision-a");
  assert.deepEqual(h.calls[0].outputs.map(o=>o.imageChoice.mode),["dossier_image","preserve_published","unselected"]);
  assert.equal(h.calls[0].input.expectedState,expectedState);
  assert.equal(h.calls[0].input.requestId,id(900));
});

test("2C conserva fontes de cada contexto, classificação e identidade do plano", async () => {
  const h=harness("contexts");
  assert.equal((await h.save([output(1,{articlePlanId:id(501),productionContextId:contextOneId,classificationKey:"benfica",classificationMode:"manual"}),
    output(2,{productionContextId:contextTwoId,classificationKey:null,classificationMode:"cleared"})])).ok,true);
  assert.deepEqual(h.calls[0].outputs.map(o=>o.sourceIds),[[sourceOneId],[sourceTwoId]]);
  assert.deepEqual(h.calls[0].outputs.map(o=>o.imageSourceIds),[[],[]]); // technical pools cannot authorize automatic selection
  assert.equal(h.calls[0].outputs[0].articlePlanId,id(501));
  assert.deepEqual(h.calls[0].outputs.map(o=>o.classificationMode),["manual","cleared"]);
});

test("todo o batch é derivado antes do único RPC; artigo inválido não escreve nada", async () => {
  const h=harness("contexts");
  const result=await h.save([output(1,{productionContextId:contextOneId}),output(2,{productionContextId:id(999)})]);
  assert.equal(result.ok,false); assert.equal(h.calls.length,0);
});

test("rejeições de imagem, plano, estado e OCC nunca devolvem persistência parcial", async () => {
  for(const code of ["image-decision-source-conflict","editorial_dossier_article_plan_kind_invalid","production_workspace_article_plan_classification_invalid","production-batch-stale-state"]) {
    const h=harness("historical",code); const result=await h.save([output(1),output(2),output(3)]);
    assert.equal(result.ok,false); if(result.ok) throw Error("unexpected success");
    assert.equal(result.error.partialPersistence,false); assert.deepEqual(result.error.savedOutputs,[]);
    assert.equal(h.calls.length,1); assert.equal(result.error.code,code.includes("stale")?"stale_state":"production_batch_failed");
  }
});

test("token/request ID obrigatórios, duplicate IDs e decisão sem seleção são recusados antes de ler/escrever", async () => {
  for(const overrides of [{expectedState:""},{requestId:""},{expectedState:"old"}]) {
    const h=harness(); assert.equal((await h.save([output(1)],overrides)).ok,false); assert.equal(h.reads,0);
  }
  const h=harness();
  assert.equal((await h.save([output(1,{preparedImageDecisionKey:"unexpected"})])).ok,false);
  assert.equal((await h.save([output(1,{articlePlanId:id(800)}),output(2,{articlePlanId:id(800)})])).ok,false);
  assert.equal(h.calls.length,0);
});

test("retry mantém pedido e payload estáveis; a idempotência é decidida pelo RPC", async () => {
  const h=harness(); const outputs=[output(1),output(2)];
  await h.save(outputs); await h.save(outputs);
  assert.deepEqual(h.calls[0],h.calls[1]);
});
