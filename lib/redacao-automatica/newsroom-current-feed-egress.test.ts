import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createCurrentFeedBatchClassifier,
  type CurrentFeedBatchClassificationDependencies,
} from "@/lib/redacao-automatica/newsroom-current-feed-classification-internal";
import {
  selectNewsroomCurrentFeedCandidates,
} from "@/lib/redacao-automatica/newsroom-current-feed-internal";
import type { SourceCollectionSummary } from "@/lib/redacao-automatica/types";

const feedPath = "lib/redacao-automatica/newsroom-current-feed.ts";

function collection(): SourceCollectionSummary {
  return {
    sourceCode: "record",
    startedAt: "2026-09-21T08:00:00.000Z",
    finishedAt: "2026-09-21T08:00:01.000Z",
    listingUrls: ["https://record.example/"],
    loadedListingCount: 1,
    discoveredCount: 2,
    acceptedCount: 2,
    duplicateCount: 0,
    rejectedCount: 0,
    candidates: ["a", "b"].map((slug) => ({
      sourceCode: "record",
      originalUrl: `https://record.example/${slug}`,
      normalizedUrl: `https://record.example/${slug}`,
      sourcePageUrl: "https://record.example/",
      detectedAt: "2026-09-21T08:00:00.000Z",
      sourceMetadata: {},
    })),
    errors: [],
  };
}

function id(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

test("arquivo de 10, 1.000 ou 10.000 artigos causa zero leituras globais", () => {
  const feed = readFileSync(feedPath, "utf8");
  const currentListings = [collection()];

  for (const archiveSize of [10, 1_000, 10_000]) {
    const selection = selectNewsroomCurrentFeedCandidates(currentListings);
    assert.equal(selection.candidates.length, 2, `archive=${archiveSize}`);
  }

  assert.doesNotMatch(feed, /fetchSupabaseAdminTable/);
  assert.doesNotMatch(feed, /knownArticleIdentities/);
  assert.doesNotMatch(feed, /newsroom_articles[\s\S]*source_code=in\./);
  assert.doesNotMatch(feed, /offset=\$\{offset\}/);
});

test("1, 10 ou 30 candidatos usam reads batch e apenas writes lineares", async () => {
  for (const count of [1, 10, 30]) {
    const calls = { cycle: 0, states: 0, prepare: 0, writes: 0 };
    const dependencies: CurrentFeedBatchClassificationDependencies = {
      async validateCycle() {
        calls.cycle += 1;
        return { ok: true };
      },
      async readClassificationStates(articleIds) {
        calls.states += 1;
        return {
          ok: true,
          value: articleIds.map(() => ({
            status: "unclassified" as const,
            classification: null,
          })),
        };
      },
      async prepareClassifications(articleIds) {
        calls.prepare += 1;
        return {
          ok: true,
          value: articleIds.map((newsroomArticleId) => ({
            newsroomArticleId,
            result: { classificationKey: "sporting" },
          })),
        };
      },
      async applyAutomatic() {
        calls.writes += 1;
        return {
          ok: true,
          value: {
            applied: true,
            state: {
              status: "classified" as const,
              classification: { classificationSource: "automatic" as const },
            },
          },
        };
      },
    };
    const classify = createCurrentFeedBatchClassifier(dependencies);

    await classify(Array.from({ length: count }, (_, index) => ({
      articleId: id(index + 1),
      action: "reused" as const,
    })));

    assert.deepEqual(calls, {
      cycle: 1,
      states: 1,
      prepare: 1,
      writes: count,
    });
  }
});
