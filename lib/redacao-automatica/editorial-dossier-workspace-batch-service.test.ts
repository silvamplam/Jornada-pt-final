import assert from "node:assert/strict";
import test from "node:test";

import type {
  EditorialDossierArticlePlanState,
  SaveEditorialDossierArticlePlanInput,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-service-internal";
import type {
  EditorialDossierProductionLoad,
} from "@/lib/redacao-automatica/editorial-dossier-production-loader";
import type {
  SaveEditorialDossierArticlePlanStateInput,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service-internal";
import {
  saveEditorialDossierWorkspaceBatchService,
  type EditorialDossierWorkspaceBatchTransport,
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

function plan(
  articlePlanId: string,
  editorialArticleId: string | null = null,
): EditorialDossierArticlePlanState {
  return {
    id: articlePlanId,
    status: "planned",
    editorialArticleId,
    sources: [{ dossierSourceId: sourceOneId, sortOrder: 10 }],
  };
}

type HarnessOptions = Readonly<{
  mode?: "historical" | "contexts";
  initialPlans?: readonly EditorialDossierArticlePlanState[];
  failPlanAt?: number;
  failProductionAt?: number;
  synchronizeFailure?: boolean;
}>;

function harness(options: HarnessOptions = {}) {
  const counts = {
    productionLoads: 0,
    dossierStateReads: 0,
    planWrites: 0,
    productionStateWrites: 0,
    synchronizations: 0,
  };
  const events: string[] = [];
  const plans = new Map((options.initialPlans ?? []).map((item) => [item.id, item]));
  const savedPlans: Array<Readonly<{
    input: SaveEditorialDossierArticlePlanInput;
    productionContextId: string | null;
  }>> = [];
  const savedProductionStates: SaveEditorialDossierArticlePlanStateInput[] = [];
  const synchronizedPlanIds: string[][] = [];
  const priorityByPlanId = new Map<string, number>();

  const transport: EditorialDossierWorkspaceBatchTransport = {
    async loadProduction() {
      counts.productionLoads += 1;
      events.push("load-production");
      return { ok: true, value: productionAuthority(options.mode) };
    },
    async openArticlePlanSession() {
      counts.dossierStateReads += 1;
      events.push("read-dossier-state");
      return {
        ok: true,
        value: {
          findPlan(articlePlanId) {
            return plans.get(articlePlanId) ?? null;
          },
          async savePlan(input, productionContextId) {
            counts.planWrites += 1;
            events.push(`plan-${input.priority}`);
            savedPlans.push({ input, productionContextId });
            if (input.priority === options.failPlanAt) {
              return {
                ok: false,
                error: {
                  code: "article_plan_save_failed",
                  message: "Falhou o Article Plan.",
                },
              };
            }
            const articlePlanId = input.articlePlanId ?? id(1000 + input.priority);
            priorityByPlanId.set(articlePlanId, input.priority);
            plans.set(articlePlanId, {
              id: articlePlanId,
              status: input.status,
              editorialArticleId: null,
              sources: input.sources.map((source, index) => ({
                dossierSourceId: source.dossierSourceId,
                sortOrder: (index + 1) * 10,
              })),
            });
            return {
              ok: true,
              value: {
                dossierId,
                articlePlanId,
                created: input.articlePlanId === null,
                status: input.status,
                previousStatus: input.articlePlanId ? "planned" : null,
                sourceCount: input.sources.length,
              },
            };
          },
        },
      };
    },
    async saveProductionState(input) {
      counts.productionStateWrites += 1;
      events.push(`production-${priorityByPlanId.get(input.articlePlanId) ?? "unknown"}`);
      savedProductionStates.push(input);
      if (priorityByPlanId.get(input.articlePlanId) === options.failProductionAt) {
        return {
          ok: false,
          error: {
            code: "article_plan_state_save_failed",
            message: "Falhou o estado de produção.",
          },
        };
      }
      return {
        ok: true,
        value: {
          articlePlanId: input.articlePlanId,
          destination: input.destination,
          updateTargetEditorialArticleId: input.updateTargetEditorialArticleId,
          publishedContextCount: input.dossierPublishedContextIds.length,
          imageChoice: input.imageChoice,
          classificationKey: input.classificationKey,
        },
      };
    },
    async synchronizeOutputs(input) {
      counts.synchronizations += 1;
      events.push("synchronize");
      synchronizedPlanIds.push([...input.articlePlanIds]);
      return options.synchronizeFailure
        ? { ok: false, code: "mesa-shared-outputs-write-failed" }
        : {
            ok: true,
            outputCount: input.articlePlanIds.length,
            cancelledCount: 0,
          };
    },
  };

  return {
    save: saveEditorialDossierWorkspaceBatchService(transport),
    counts,
    savedPlans,
    savedProductionStates,
    synchronizedPlanIds,
    events,
  };
}

test("batch de 1, 2, 10 e 30 outputs mantém as leituras autoritativas constantes", async () => {
  for (const outputCount of [1, 2, 10, 30]) {
    const testHarness = harness();
    const result = await testHarness.save({
      dossierId,
      outputCount,
      outputs: Array.from({ length: outputCount }, (_, index) => output(index + 1)),
    });

    assert.equal(result.ok, true, `batch ${outputCount}`);
    assert.deepEqual(testHarness.counts, {
      productionLoads: 1,
      dossierStateReads: 1,
      planWrites: outputCount,
      productionStateWrites: outputCount,
      synchronizations: 1,
    });
    if (outputCount === 2) {
      assert.deepEqual(testHarness.events, [
        "load-production",
        "read-dossier-state",
        "plan-1",
        "production-1",
        "plan-2",
        "production-2",
        "synchronize",
      ]);
    }
  }
});

test("preserva NEW, UPDATE e escolhas de imagem válidas", async () => {
  const testHarness = harness();
  const result = await testHarness.save({
    dossierId,
    outputCount: 3,
    outputs: [
      output(1),
      output(2, {
        destination: "update",
        updateTargetEditorialArticleId: publishedArticleId,
        imageChoice: { mode: "dossier_image", dossierImageId },
      }),
      output(3, {
        destination: "update",
        updateTargetEditorialArticleId: publishedArticleId,
        imageChoice: { mode: "preserve_published" },
      }),
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    testHarness.savedProductionStates.map((state) => ({
      destination: state.destination,
      target: state.updateTargetEditorialArticleId,
      imageChoice: state.imageChoice,
    })),
    [
      { destination: "new", target: null, imageChoice: { mode: "unselected" } },
      {
        destination: "update",
        target: publishedArticleId,
        imageChoice: { mode: "dossier_image", dossierImageId },
      },
      {
        destination: "update",
        target: publishedArticleId,
        imageChoice: { mode: "preserve_published" },
      },
    ],
  );

  const invalidHarness = harness();
  const invalid = await invalidHarness.save({
    dossierId,
    outputCount: 1,
    outputs: [output(1, { imageChoice: { mode: "preserve_published" } })],
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalidHarness.counts.planWrites, 0);
  assert.equal(invalidHarness.counts.synchronizations, 0);
});

test("modo histórico usa todas as fontes e modo 2C mantém cada contexto isolado", async () => {
  const historical = harness({ mode: "historical" });
  assert.equal((await historical.save({
    dossierId,
    outputCount: 1,
    outputs: [output(1)],
  })).ok, true);
  assert.equal(historical.savedPlans[0]?.productionContextId, null);
  assert.deepEqual(
    historical.savedPlans[0]?.input.sources.map((source) => source.dossierSourceId),
    [sourceOneId, sourceTwoId],
  );

  const contexts = harness({ mode: "contexts" });
  assert.equal((await contexts.save({
    dossierId,
    outputCount: 2,
    outputs: [
      output(1, { productionContextId: contextOneId }),
      output(2, { productionContextId: contextTwoId }),
    ],
  })).ok, true);
  assert.deepEqual(
    contexts.savedPlans.map((saved) => ({
      context: saved.productionContextId,
      sources: saved.input.sources.map((source) => source.dossierSourceId),
    })),
    [
      { context: contextOneId, sources: [sourceOneId] },
      { context: contextTwoId, sources: [sourceTwoId] },
    ],
  );
});

test("planos existentes, novos e materializados mantêm a ordem final autoritativa", async () => {
  const existingPlanId = id(501);
  const materializedPlanId = id(502);
  const testHarness = harness({
    initialPlans: [plan(existingPlanId), plan(materializedPlanId, id(601))],
  });
  const result = await testHarness.save({
    dossierId,
    outputCount: 3,
    outputs: [
      output(1, { articlePlanId: existingPlanId }),
      output(2, { articlePlanId: materializedPlanId }),
      output(3),
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(testHarness.counts.planWrites, 2);
  assert.equal(testHarness.counts.productionStateWrites, 2);
  assert.deepEqual(testHarness.synchronizedPlanIds[0], [
    existingPlanId,
    materializedPlanId,
    id(1003),
  ]);
  if (result.ok) assert.equal(result.value.outputs[1]?.materialized, true);
});

test("redução, aumento e retry após persistência parcial entregam uma única lista final", async () => {
  const firstPlanId = id(511);
  const secondPlanId = id(512);
  const thirdPlanId = id(513);
  const initialPlans = [plan(firstPlanId), plan(secondPlanId), plan(thirdPlanId)];

  const reduced = harness({ initialPlans });
  assert.equal((await reduced.save({
    dossierId,
    outputCount: 2,
    outputs: [
      output(1, { articlePlanId: firstPlanId }),
      output(2, { articlePlanId: secondPlanId }),
    ],
  })).ok, true);
  assert.deepEqual(reduced.synchronizedPlanIds[0], [firstPlanId, secondPlanId]);

  const increased = harness({ initialPlans: [plan(firstPlanId)] });
  assert.equal((await increased.save({
    dossierId,
    outputCount: 3,
    outputs: [
      output(1, { articlePlanId: firstPlanId }),
      output(2),
      output(3),
    ],
  })).ok, true);
  assert.deepEqual(increased.synchronizedPlanIds[0], [firstPlanId, id(1002), id(1003)]);

  const interrupted = harness({ failProductionAt: 2 });
  const interruptedResult = await interrupted.save({
    dossierId,
    outputCount: 3,
    outputs: [output(1), output(2), output(3)],
  });
  assert.equal(interruptedResult.ok, false);
  assert.equal(interrupted.counts.synchronizations, 0);
  if (!interruptedResult.ok) {
    assert.deepEqual(
      interruptedResult.error.savedOutputs.map((saved) => saved.articlePlanId),
      [id(1001), id(1002)],
    );
  }

  const retry = harness({ initialPlans: [plan(id(1001)), plan(id(1002))] });
  assert.equal((await retry.save({
    dossierId,
    outputCount: 3,
    outputs: [
      output(1, { articlePlanId: id(1001) }),
      output(2, { articlePlanId: id(1002) }),
      output(3),
    ],
  })).ok, true);
  assert.equal(retry.counts.planWrites, 3);
  assert.deepEqual(retry.synchronizedPlanIds[0], [id(1001), id(1002), id(1003)]);
});

test("falha de Article Plan no primeiro, intermédio ou último output interrompe writes e sync", async () => {
  for (const failedPriority of [1, 2, 3]) {
    const testHarness = harness({ failPlanAt: failedPriority });
    const result = await testHarness.save({
      dossierId,
      outputCount: 3,
      outputs: [output(1), output(2), output(3)],
    });

    assert.equal(result.ok, false);
    assert.equal(testHarness.counts.planWrites, failedPriority);
    assert.equal(testHarness.counts.productionStateWrites, failedPriority - 1);
    assert.equal(testHarness.counts.synchronizations, 0);
    if (!result.ok) {
      assert.equal(result.error.stage, "article_plan");
      assert.equal(result.error.failedOutput?.priority, failedPriority);
      assert.equal(result.error.savedOutputs.length, failedPriority - 1);
      assert.equal(result.error.partialPersistence, failedPriority > 1);
    }
  }
});

test("falha de production state expõe o plano persistido e interrompe o batch", async () => {
  for (const failedPriority of [1, 2, 3]) {
    const testHarness = harness({ failProductionAt: failedPriority });
    const result = await testHarness.save({
      dossierId,
      outputCount: 3,
      outputs: [output(1), output(2), output(3)],
    });

    assert.equal(result.ok, false);
    assert.equal(testHarness.counts.planWrites, failedPriority);
    assert.equal(testHarness.counts.productionStateWrites, failedPriority);
    assert.equal(testHarness.counts.synchronizations, 0);
    if (!result.ok) {
      assert.equal(result.error.stage, "production_state");
      assert.equal(result.error.partialPersistence, true);
      assert.equal(result.error.articlePlanId, id(1000 + failedPriority));
      assert.equal(result.error.savedOutputs.length, failedPriority);
      assert.equal(
        result.error.savedOutputs.at(-1)?.articlePlanId,
        id(1000 + failedPriority),
      );
    }
  }
});

test("sincronização ocorre uma vez no sucesso e a falha mantém todos os IDs persistidos", async () => {
  const testHarness = harness({ synchronizeFailure: true });
  const result = await testHarness.save({
    dossierId,
    outputCount: 2,
    outputs: [output(1), output(2)],
  });

  assert.equal(result.ok, false);
  assert.equal(testHarness.counts.synchronizations, 1);
  if (!result.ok) {
    assert.equal(result.error.stage, "output_count");
    assert.equal(result.error.partialPersistence, true);
    assert.deepEqual(
      result.error.savedOutputs.map((saved) => saved.articlePlanId),
      [id(1001), id(1002)],
    );
  }
});
