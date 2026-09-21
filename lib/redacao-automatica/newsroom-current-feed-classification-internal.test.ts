import assert from "node:assert/strict";
import test from "node:test";

import {
  createCurrentFeedBatchClassifier,
  type CurrentFeedBatchClassificationDependencies,
  type CurrentFeedPersistedArticle,
} from "@/lib/redacao-automatica/newsroom-current-feed-classification-internal";
import {
  summarizeNewsroomCurrentFeedRun,
} from "@/lib/redacao-automatica/newsroom-current-feed-internal";

function id(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

const unclassified = { status: "unclassified", classification: null } as const;
const automatic = {
  status: "classified",
  classification: { classificationSource: "automatic" },
} as const;
const manual = {
  status: "classified",
  classification: { classificationSource: "manual" },
} as const;

function fakeDependencies(options: Readonly<{
  states?: readonly (typeof unclassified | typeof automatic | typeof manual)[];
  outsideCycleIds?: readonly string[];
  failCycleRead?: boolean;
  failPreparation?: boolean;
  failApply?: boolean;
}> = {}) {
  const calls = {
    validate: [] as string[][],
    states: [] as string[][],
    prepare: [] as string[][],
    apply: [] as string[],
  };
  const dependencies: CurrentFeedBatchClassificationDependencies = {
    async readCycleMembership(articleIds) {
      calls.validate.push([...articleIds]);
      if (options.failCycleRead) return { ok: false };
      const outside = new Set(options.outsideCycleIds ?? []);
      return {
        ok: true,
        value: {
          eligibleIds: articleIds.filter((articleId) => !outside.has(articleId)),
          outsideCycleIds: articleIds.filter((articleId) => outside.has(articleId)),
        },
      };
    },
    async readClassificationStates(articleIds) {
      calls.states.push([...articleIds]);
      return {
        ok: true,
        value: options.states ?? articleIds.map(() => unclassified),
      };
    },
    async prepareClassifications(articleIds) {
      calls.prepare.push([...articleIds]);
      return options.failPreparation
        ? { ok: false }
        : {
            ok: true,
            value: articleIds.map((newsroomArticleId) => ({
              newsroomArticleId,
              result: { classificationKey: "sporting" },
            })),
          };
    },
    async applyAutomatic(input) {
      calls.apply.push(input.newsroomArticleId);
      return options.failApply
        ? { ok: false }
        : {
            ok: true,
            value: { applied: true, state: automatic },
          };
    },
  };
  return { dependencies, calls };
}

test("preserva manual e automática e classifica created/unclassified em batch", async () => {
  const fake = fakeDependencies({ states: [manual, automatic, unclassified] });
  const classify = createCurrentFeedBatchClassifier(fake.dependencies);
  const articles: readonly CurrentFeedPersistedArticle[] = [
    { articleId: id(1), action: "created" },
    { articleId: id(2), action: "updated" },
    { articleId: id(3), action: "reused" },
    { articleId: id(4), action: "updated" },
  ];

  const result = await classify(articles);

  assert.deepEqual(fake.calls.validate, [[id(1), id(2), id(3), id(4)]]);
  assert.deepEqual(fake.calls.states, [[id(2), id(3), id(4)]]);
  assert.deepEqual(fake.calls.prepare, [[id(1), id(4)]]);
  assert.deepEqual(fake.calls.apply, [id(1), id(4)]);
  assert.equal(result.manualPreservedCount, 1);
  assert.equal(result.automaticPreservedCount, 1);
  assert.equal(result.classifiedCount, 2);
  assert.equal(result.failedCount, 0);
});

test("1, 10 e 30 artigos usam uma preparação batch por ciclo", async () => {
  for (const count of [1, 10, 30]) {
    const fake = fakeDependencies();
    const classify = createCurrentFeedBatchClassifier(fake.dependencies);
    const articles = Array.from({ length: count }, (_, index) => ({
      articleId: id(index + 1),
      action: "created" as const,
    }));

    const result = await classify(articles);

    assert.equal(fake.calls.validate.length, 1);
    assert.equal(fake.calls.states.length, 0);
    assert.equal(fake.calls.prepare.length, 1);
    assert.equal(fake.calls.prepare[0]?.length, count);
    assert.equal(fake.calls.apply.length, count);
    assert.equal(result.classifiedCount, count);
  }
});

test("estado dos artigos conhecidos é lido uma vez e evidence é preparada em batch", async () => {
  const fake = fakeDependencies();
  const classify = createCurrentFeedBatchClassifier(fake.dependencies);
  const articles = Array.from({ length: 30 }, (_, index) => ({
    articleId: id(index + 1),
    action: index % 2 === 0 ? "updated" as const : "reused" as const,
  }));

  await classify(articles);

  assert.equal(fake.calls.states.length, 1);
  assert.equal(fake.calls.states[0]?.length, 30);
  assert.equal(fake.calls.prepare.length, 1);
  assert.equal(fake.calls.prepare[0]?.length, 30);
});

test("batch misto ignora outside cycle e classifica os restantes em conjunto", async () => {
  const outsideId = id(1);
  const createdId = id(2);
  const reusedId = id(3);
  const fake = fakeDependencies({
    outsideCycleIds: [outsideId],
    states: [unclassified],
  });
  const classify = createCurrentFeedBatchClassifier(fake.dependencies);
  const persisted = [
    { articleId: outsideId, action: "reused" as const },
    { articleId: createdId, action: "created" as const },
    { articleId: reusedId, action: "reused" as const },
  ];
  const feedBefore = summarizeNewsroomCurrentFeedRun({
    requestedSourceCount: 1,
    successfulSourceCount: 1,
    actions: persisted.map((article) => article.action),
  });

  const result = await classify(persisted);
  const feedAfter = summarizeNewsroomCurrentFeedRun({
    requestedSourceCount: 1,
    successfulSourceCount: 1,
    actions: persisted.map((article) => article.action),
  });

  assert.deepEqual(fake.calls.validate, [[outsideId, createdId, reusedId]]);
  assert.deepEqual(fake.calls.states, [[reusedId]]);
  assert.deepEqual(fake.calls.prepare, [[createdId, reusedId]]);
  assert.deepEqual(fake.calls.apply, [createdId, reusedId]);
  assert.equal(result.outsideCycleCount, 1);
  assert.equal(result.classifiedCount, 2);
  assert.equal(result.failedCount, 0);
  assert.deepEqual(feedAfter, feedBefore);
  assert.equal(feedAfter.createdCount, 1);
  assert.equal(feedAfter.existingCount, 2);
});

test("batch totalmente fora do ciclo não classifica nem conta falhas", async () => {
  const articleIds = [id(1), id(2), id(3)];
  const fake = fakeDependencies({ outsideCycleIds: articleIds });
  const classify = createCurrentFeedBatchClassifier(fake.dependencies);

  const result = await classify(articleIds.map((articleId) => ({
    articleId,
    action: "reused" as const,
  })));

  assert.equal(fake.calls.validate.length, 1);
  assert.equal(fake.calls.states.length, 0);
  assert.equal(fake.calls.prepare.length, 0);
  assert.equal(fake.calls.apply.length, 0);
  assert.equal(result.outsideCycleCount, 3);
  assert.equal(result.failedCount, 0);
});

test("outside cycle não interfere com manual, automatic e unclassified", async () => {
  const outsideId = id(1);
  const manualId = id(2);
  const automaticId = id(3);
  const unclassifiedId = id(4);
  const fake = fakeDependencies({
    outsideCycleIds: [outsideId],
    states: [manual, automatic, unclassified],
  });
  const classify = createCurrentFeedBatchClassifier(fake.dependencies);

  const result = await classify([
    { articleId: outsideId, action: "reused" },
    { articleId: manualId, action: "reused" },
    { articleId: automaticId, action: "updated" },
    { articleId: unclassifiedId, action: "reused" },
  ]);

  assert.deepEqual(fake.calls.states, [[manualId, automaticId, unclassifiedId]]);
  assert.deepEqual(fake.calls.prepare, [[unclassifiedId]]);
  assert.deepEqual(fake.calls.apply, [unclassifiedId]);
  assert.equal(result.outsideCycleCount, 1);
  assert.equal(result.manualPreservedCount, 1);
  assert.equal(result.automaticPreservedCount, 1);
  assert.equal(result.classifiedCount, 1);
  assert.equal(result.failedCount, 0);
});

test("falha real da leitura do ciclo conta como falha e não como outside cycle", async () => {
  const fake = fakeDependencies({ failCycleRead: true });
  const classify = createCurrentFeedBatchClassifier(fake.dependencies);

  const result = await classify([
    { articleId: id(1), action: "created" },
    { articleId: id(2), action: "reused" },
  ]);

  assert.equal(fake.calls.validate.length, 1);
  assert.equal(fake.calls.states.length, 0);
  assert.equal(fake.calls.prepare.length, 0);
  assert.equal(result.outsideCycleCount, 0);
  assert.equal(result.failedCount, 2);
});

test("falha de classificação é best effort e não altera created/updated/reused", async () => {
  for (const action of ["created", "updated", "reused"] as const) {
    const fake = fakeDependencies({ failPreparation: true });
    const classify = createCurrentFeedBatchClassifier(fake.dependencies);
    const persisted = [{ articleId: id(1), action }] as const;
    const beforeClassification = summarizeNewsroomCurrentFeedRun({
      requestedSourceCount: 1,
      successfulSourceCount: 1,
      actions: [action],
    });

    const classification = await classify(persisted);
    const afterClassification = summarizeNewsroomCurrentFeedRun({
      requestedSourceCount: 1,
      successfulSourceCount: 1,
      actions: [action],
    });

    assert.deepEqual(afterClassification, beforeClassification);
    assert.equal(afterClassification.availableCount, 1);
    assert.equal(afterClassification.failedCount, 0);
    assert.equal(classification.failedCount, 1);
  }
});

test("manual que vence uma corrida no write continua preservada", async () => {
  const fake = fakeDependencies();
  fake.dependencies.applyAutomatic = async (input) => {
    fake.calls.apply.push(input.newsroomArticleId);
    return { ok: true, value: { applied: false, state: manual } };
  };
  const classify = createCurrentFeedBatchClassifier(fake.dependencies);

  const result = await classify([{ articleId: id(1), action: "created" }]);

  assert.equal(result.manualPreservedCount, 1);
  assert.equal(result.classifiedCount, 0);
  assert.equal(result.failedCount, 0);
});
