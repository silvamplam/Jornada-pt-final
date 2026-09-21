import assert from "node:assert/strict";
import test from "node:test";

import {
  selectNewsroomCurrentFeedCandidates,
  summarizeNewsroomCurrentFeedPersistence,
  summarizeNewsroomCurrentFeedRun,
} from "@/lib/redacao-automatica/newsroom-current-feed-internal";
import type { SourceCollectionSummary } from "@/lib/redacao-automatica/types";

function collection(sourceCode: string, urls: readonly string[]): SourceCollectionSummary {
  return {
    sourceCode,
    startedAt: "2026-07-31T08:00:00.000Z",
    finishedAt: "2026-07-31T08:00:01.000Z",
    listingUrls: [`https://${sourceCode}.example/`],
    loadedListingCount: 1,
    discoveredCount: urls.length,
    acceptedCount: urls.length,
    duplicateCount: 0,
    rejectedCount: 0,
    candidates: urls.map((url) => ({
      sourceCode,
      originalUrl: url,
      normalizedUrl: url,
      sourcePageUrl: `https://${sourceCode}.example/`,
      detectedAt: "2026-07-31T08:00:00.000Z",
      sourceMetadata: {},
    })),
    errors: [],
  };
}

test("deduplica apenas as listagens atuais e preserva Record e A Bola", () => {
  const result = selectNewsroomCurrentFeedCandidates([
    collection("record", [
      "https://record.example/a",
      "https://record.example/a",
      "https://record.example/b",
    ]),
    collection("abola", [
      "https://abola.example/a",
      "https://abola.example/b",
    ]),
  ]);

  assert.deepEqual(result.candidates, [
    { sourceCode: "record", articleUrl: "https://record.example/a" },
    { sourceCode: "record", articleUrl: "https://record.example/b" },
    { sourceCode: "abola", articleUrl: "https://abola.example/a" },
    { sourceCode: "abola", articleUrl: "https://abola.example/b" },
  ]);
  assert.equal(result.truncated, false);
});

test("seleciona todos os candidatos descobertos para reconsulta", () => {
  const urls = Array.from(
    { length: 48 },
    (_, index) => `https://record.example/${index + 1}`,
  );
  const result = selectNewsroomCurrentFeedCandidates([
    collection("record", urls),
  ]);

  assert.equal(result.candidates.length, 48);
  assert.equal(result.truncated, false);
});

test("seleção corrente não depende de arquivos com 10, 1.000 ou 10.000 artigos", () => {
  const current = [
    collection("record", ["https://record.example/a"]),
    collection("abola", ["https://abola.example/a"]),
  ];

  for (const historicalArchiveSize of [10, 1_000, 10_000]) {
    const result = selectNewsroomCurrentFeedCandidates(current);
    assert.equal(historicalArchiveSize >= 10, true);
    assert.equal(result.candidates.length, 2);
  }
});

test("separa novas, atualizadas e já existentes sem contar falhas", () => {
  const summary = summarizeNewsroomCurrentFeedPersistence([
    "created",
    "updated",
    "reused",
    "updated",
    null,
  ]);

  assert.deepEqual(summary, {
    createdCount: 1,
    updatedCount: 2,
    reusedCount: 1,
    availableCount: 4,
  });
});

test("usa o writer como autoridade para created, updated e reused", () => {
  const summary = summarizeNewsroomCurrentFeedRun({
    requestedSourceCount: 2,
    successfulSourceCount: 2,
    actions: ["created", "updated", "reused"],
  });

  assert.deepEqual(summary, {
    status: "updated",
    newCandidateCount: 1,
    attemptedCount: 3,
    availableCount: 3,
    createdCount: 1,
    updatedCount: 1,
    existingCount: 2,
    failedCount: 0,
  });
});

test("um artigo conhecido sem alteração fica reused e o feed up to date", () => {
  const summary = summarizeNewsroomCurrentFeedRun({
    requestedSourceCount: 2,
    successfulSourceCount: 2,
    actions: ["reused"],
  });

  assert.equal(summary.status, "up_to_date");
  assert.equal(summary.newCandidateCount, 0);
  assert.equal(summary.updatedCount, 0);
  assert.equal(summary.existingCount, 1);
});

test("falha parcial de fonte e de artigo mantém resultados persistidos", () => {
  const sourceFailure = summarizeNewsroomCurrentFeedRun({
    requestedSourceCount: 2,
    successfulSourceCount: 1,
    actions: ["created"],
  });
  const articleFailure = summarizeNewsroomCurrentFeedRun({
    requestedSourceCount: 2,
    successfulSourceCount: 2,
    actions: ["updated", null],
  });

  assert.equal(sourceFailure.status, "partial");
  assert.equal(sourceFailure.availableCount, 1);
  assert.equal(articleFailure.status, "partial");
  assert.equal(articleFailure.availableCount, 1);
  assert.equal(articleFailure.failedCount, 1);
});
