import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAutomaticNewsroomArticleClassificationService,
  clearNewsroomArticleClassificationService,
  setManualNewsroomArticleClassificationService,
  type NewsroomArticleClassification,
  type NewsroomArticleClassificationErrorCode,
  type NewsroomArticleClassificationMutation,
  type NewsroomArticleClassificationTransport,
} from "@/lib/redacao-automatica/newsroom-article-classification-service-internal";

const SOURCE_ID = "93000000-0000-4000-8000-000000000001";

function fakeTransport() {
  const sources = new Map([[SOURCE_ID, { title: "Fonte canónica" }]]);
  const classifications = new Map<string, NewsroomArticleClassification>();
  const reviewStates = new Map([[SOURCE_ID, "working"]]);
  const usedStates = new Map([[SOURCE_ID, false]]);
  const snapshots = new Map([[SOURCE_ID, ["snapshot-1"]]]);
  const editorialArticles = new Map([["article-1", { title: "Artigo" }]]);
  const bankItems = new Map([["bank-1", { classificationKey: "sporting" }]]);
  const themes = new Map([["theme-1", { classificationKey: "benfica" }]]);
  let clock = 0;

  function timestamp(): string {
    clock += 1;
    return `2026-09-08T12:00:${String(clock).padStart(2, "0")}.000Z`;
  }

  function state(
    newsroomArticleId: string,
    applied: boolean,
    changed: boolean,
  ): NewsroomArticleClassificationMutation {
    const classification = classifications.get(newsroomArticleId);
    return {
      newsroomArticleId,
      state: classification
        ? { status: "classified", classification }
        : { status: "unclassified", classification: null },
      applied,
      changed,
    };
  }

  function ensureSource(newsroomArticleId: string): void {
    if (!sources.has(newsroomArticleId)) {
      throw new Error("newsroom_article_classification_source_not_found");
    }
  }

  const transport: NewsroomArticleClassificationTransport = {
    isConfigured: () => true,
    async applyAutomatic(newsroomArticleId, classificationKey) {
      ensureSource(newsroomArticleId);
      const existing = classifications.get(newsroomArticleId);
      if (existing?.classificationSource === "manual") {
        return state(newsroomArticleId, false, false);
      }
      if (
        existing?.classificationSource === "automatic"
        && existing.classificationKey === classificationKey
      ) {
        return state(newsroomArticleId, true, false);
      }

      const now = timestamp();
      classifications.set(newsroomArticleId, {
        newsroomArticleId,
        classificationKey,
        classificationSource: "automatic",
        classifiedAt: now,
        updatedAt: now,
      });
      return state(newsroomArticleId, true, true);
    },
    async setManual(newsroomArticleId, classificationKey) {
      ensureSource(newsroomArticleId);
      const existing = classifications.get(newsroomArticleId);
      if (
        existing?.classificationSource === "manual"
        && existing.classificationKey === classificationKey
      ) {
        return state(newsroomArticleId, true, false);
      }

      const now = timestamp();
      classifications.set(newsroomArticleId, {
        newsroomArticleId,
        classificationKey,
        classificationSource: "manual",
        classifiedAt: now,
        updatedAt: now,
      });
      return state(newsroomArticleId, true, true);
    },
    async clear(newsroomArticleId) {
      ensureSource(newsroomArticleId);
      const changed = classifications.delete(newsroomArticleId);
      return state(newsroomArticleId, true, changed);
    },
    classifyError(error): NewsroomArticleClassificationErrorCode {
      const message = error instanceof Error ? error.message : String(error);
      return message.includes("source_not_found")
        ? "source_not_found"
        : "persistence_failed";
    },
  };

  return {
    transport,
    sources,
    classifications,
    reviewStates,
    usedStates,
    snapshots,
    editorialArticles,
    bankItems,
    themes,
  };
}

test("uma fonte existe sem classificação e sem sexta chave", () => {
  const fake = fakeTransport();
  assert.equal(fake.sources.has(SOURCE_ID), true);
  assert.equal(fake.classifications.has(SOURCE_ID), false);
});

test("automatic cria a classificação quando ainda não existe", async () => {
  const fake = fakeTransport();
  const result = await applyAutomaticNewsroomArticleClassificationService(
    fake.transport,
  )({ newsroomArticleId: SOURCE_ID, classificationKey: "benfica" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.applied, true);
  assert.equal(result.value.changed, true);
  assert.equal(result.value.state.status, "classified");
  assert.equal(
    result.value.state.classification?.classificationSource,
    "automatic",
  );
});

test("automatic repetido com a mesma chave é idempotente", async () => {
  const fake = fakeTransport();
  const apply = applyAutomaticNewsroomArticleClassificationService(
    fake.transport,
  );
  await apply({ newsroomArticleId: SOURCE_ID, classificationKey: "benfica" });
  const before = structuredClone(fake.classifications.get(SOURCE_ID));
  const repeated = await apply({
    newsroomArticleId: SOURCE_ID,
    classificationKey: "benfica",
  });

  assert.equal(repeated.ok && repeated.value.applied, true);
  assert.equal(repeated.ok && repeated.value.changed, false);
  assert.deepEqual(fake.classifications.get(SOURCE_ID), before);
});

test("automatic pode substituir uma classificação automatic", async () => {
  const fake = fakeTransport();
  const apply = applyAutomaticNewsroomArticleClassificationService(
    fake.transport,
  );
  await apply({ newsroomArticleId: SOURCE_ID, classificationKey: "benfica" });
  const replaced = await apply({
    newsroomArticleId: SOURCE_ID,
    classificationKey: "sporting",
  });

  assert.equal(replaced.ok && replaced.value.changed, true);
  assert.equal(
    fake.classifications.get(SOURCE_ID)?.classificationKey,
    "sporting",
  );
  assert.equal(
    fake.classifications.get(SOURCE_ID)?.classificationSource,
    "automatic",
  );
});

test("automatic não substitui nem rebaixa uma classificação manual", async () => {
  const fake = fakeTransport();
  await setManualNewsroomArticleClassificationService(fake.transport)({
    newsroomArticleId: SOURCE_ID,
    classificationKey: "fc_porto",
  });
  const before = structuredClone(fake.classifications.get(SOURCE_ID));
  const attempted = await applyAutomaticNewsroomArticleClassificationService(
    fake.transport,
  )({
    newsroomArticleId: SOURCE_ID,
    classificationKey: "outside_liga_other",
  });

  assert.equal(attempted.ok && attempted.value.applied, false);
  assert.equal(attempted.ok && attempted.value.changed, false);
  assert.deepEqual(fake.classifications.get(SOURCE_ID), before);
});

test("manual substitui automatic mesmo quando a chave é igual", async () => {
  const fake = fakeTransport();
  await applyAutomaticNewsroomArticleClassificationService(fake.transport)({
    newsroomArticleId: SOURCE_ID,
    classificationKey: "benfica",
  });
  const corrected = await setManualNewsroomArticleClassificationService(
    fake.transport,
  )({ newsroomArticleId: SOURCE_ID, classificationKey: "benfica" });

  assert.equal(corrected.ok && corrected.value.changed, true);
  assert.equal(
    fake.classifications.get(SOURCE_ID)?.classificationSource,
    "manual",
  );
});

test("manual pode substituir manual e a repetição exata é idempotente", async () => {
  const fake = fakeTransport();
  const setManual = setManualNewsroomArticleClassificationService(
    fake.transport,
  );
  await setManual({ newsroomArticleId: SOURCE_ID, classificationKey: "benfica" });
  const replacement = await setManual({
    newsroomArticleId: SOURCE_ID,
    classificationKey: "other_liga_clubs",
  });
  const before = structuredClone(fake.classifications.get(SOURCE_ID));
  const repeated = await setManual({
    newsroomArticleId: SOURCE_ID,
    classificationKey: "other_liga_clubs",
  });

  assert.equal(replacement.ok && replacement.value.changed, true);
  assert.equal(repeated.ok && repeated.value.changed, false);
  assert.deepEqual(fake.classifications.get(SOURCE_ID), before);
});

test("clear remove a linha, deixa por classificar e é idempotente", async () => {
  const fake = fakeTransport();
  await setManualNewsroomArticleClassificationService(fake.transport)({
    newsroomArticleId: SOURCE_ID,
    classificationKey: "benfica",
  });
  const clear = clearNewsroomArticleClassificationService(fake.transport);
  const removed = await clear({ newsroomArticleId: SOURCE_ID });
  const absent = await clear({ newsroomArticleId: SOURCE_ID });

  assert.equal(removed.ok && removed.value.changed, true);
  assert.equal(removed.ok && removed.value.state.status, "unclassified");
  assert.equal(absent.ok && absent.value.changed, false);
  assert.equal(absent.ok && absent.value.state.status, "unclassified");
  assert.equal(fake.classifications.has(SOURCE_ID), false);
});

test("outside_liga_other só é guardado quando pedido explicitamente", async () => {
  const fake = fakeTransport();
  const clear = clearNewsroomArticleClassificationService(fake.transport);
  const absent = await clear({ newsroomArticleId: SOURCE_ID });
  assert.equal(absent.ok && absent.value.state.status, "unclassified");
  assert.equal(fake.classifications.has(SOURCE_ID), false);

  await applyAutomaticNewsroomArticleClassificationService(fake.transport)({
    newsroomArticleId: SOURCE_ID,
    classificationKey: "outside_liga_other",
  });
  assert.equal(
    fake.classifications.get(SOURCE_ID)?.classificationKey,
    "outside_liga_other",
  );
});

test("classificação inválida é rejeitada antes do transporte", async () => {
  const fake = fakeTransport();
  const result = await setManualNewsroomArticleClassificationService(
    fake.transport,
  )({ newsroomArticleId: SOURCE_ID, classificationKey: "unclassified" });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_request");
  assert.equal(fake.classifications.size, 0);
});

test("classificar não altera revisão, uso, snapshots, artigos, Bank ou Temas", async () => {
  const fake = fakeTransport();
  const before = structuredClone({
    sources: [...fake.sources],
    reviewStates: [...fake.reviewStates],
    usedStates: [...fake.usedStates],
    snapshots: [...fake.snapshots],
    editorialArticles: [...fake.editorialArticles],
    bankItems: [...fake.bankItems],
    themes: [...fake.themes],
  });

  await applyAutomaticNewsroomArticleClassificationService(fake.transport)({
    newsroomArticleId: SOURCE_ID,
    classificationKey: "sporting",
  });
  await setManualNewsroomArticleClassificationService(fake.transport)({
    newsroomArticleId: SOURCE_ID,
    classificationKey: "fc_porto",
  });

  assert.deepEqual({
    sources: [...fake.sources],
    reviewStates: [...fake.reviewStates],
    usedStates: [...fake.usedStates],
    snapshots: [...fake.snapshots],
    editorialArticles: [...fake.editorialArticles],
    bankItems: [...fake.bankItems],
    themes: [...fake.themes],
  }, before);
});

test("fonte inexistente devolve erro determinístico", async () => {
  const fake = fakeTransport();
  const result = await applyAutomaticNewsroomArticleClassificationService(
    fake.transport,
  )({
    newsroomArticleId: "93000000-0000-4000-8000-000000000099",
    classificationKey: "benfica",
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "source_not_found");
});
