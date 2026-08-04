import assert from "node:assert/strict";
import test from "node:test";

import {
  newsroomCurrentFeedIdentity,
  selectNewsroomCurrentFeedCandidates,
  summarizeNewsroomCurrentFeedPersistence,
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

test("exclui artigos já conhecidos sem impor limites editoriais", () => {
  const result = selectNewsroomCurrentFeedCandidates(
    [
      collection("record", ["https://record.example/a", "https://record.example/b"]),
      collection("abola", ["https://abola.example/a", "https://abola.example/b"]),
    ],
    new Set([newsroomCurrentFeedIdentity("record", "https://record.example/a")]),
  );

  assert.deepEqual(result.candidates, [
    { sourceCode: "record", articleUrl: "https://record.example/b" },
    { sourceCode: "abola", articleUrl: "https://abola.example/a" },
    { sourceCode: "abola", articleUrl: "https://abola.example/b" },
  ]);
  assert.equal(result.availableNewCount, 3);
  assert.equal(result.alreadyKnownCount, 1);
  assert.equal(result.truncated, false);
});

test("seleciona todos os candidatos novos descobertos", () => {
  const urls = Array.from({ length: 48 }, (_, index) => `https://record.example/${index + 1}`);
  const result = selectNewsroomCurrentFeedCandidates(
    [collection("record", urls)],
    new Set(),
  );

  assert.equal(result.candidates.length, 48);
  assert.equal(result.availableNewCount, 48);
  assert.equal(result.alreadyKnownCount, 0);
  assert.equal(result.truncated, false);
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
