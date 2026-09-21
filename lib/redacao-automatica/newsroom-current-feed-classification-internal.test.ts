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
    async validateCycle(articleIds) {
      calls.validate.push([...articleIds]);
      return { ok: true };
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
