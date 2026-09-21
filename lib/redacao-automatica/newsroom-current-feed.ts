import "server-only";

import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import { createAvailableAdapterRegistry } from "@/lib/redacao-automatica/available-adapter-registry";
import { collectSource } from "@/lib/redacao-automatica/collection-service";
import { ingestHttpNewsroomCurrentFeedArticle } from "@/lib/redacao-automatica/http-newsroom-ingestion";
import {
  classifyNewsroomCurrentFeedArticles,
} from "@/lib/redacao-automatica/newsroom-current-feed-classification";
import {
  selectNewsroomCurrentFeedCandidates,
  summarizeNewsroomCurrentFeedRun,
} from "@/lib/redacao-automatica/newsroom-current-feed-internal";
import { createHttpPageLoader } from "@/lib/redacao-automatica/page-loaders/http-page-loader";
import { registeredSourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import { evaluateSourceExecution, listRegisteredSources } from "@/lib/redacao-automatica/source-registry";
import type { SourceExecutionMode } from "@/lib/redacao-automatica/types";

const INGESTION_CONCURRENCY = 4;

export type NewsroomCurrentFeedRefreshStatus =
  | "updated"
  | "up_to_date"
  | "partial";

export type NewsroomCurrentFeedRefreshResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        status: NewsroomCurrentFeedRefreshStatus;
        sourceCount: number;
        discoveredCount: number;
        newCandidateCount: number;
        attemptedCount: number;
        availableCount: number;
        createdCount: number;
        updatedCount: number;
        existingCount: number;
        failedCount: number;
        classificationFailedCount: number;
        hasMore: boolean;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "source_unavailable" | "collection_unavailable";
      }>;
    }>;

function availableAdapterRegistry(): AdapterRegistry {
  const registryResult = createAvailableAdapterRegistry();
  if (registryResult.ok) {
    return registryResult.value;
  }

  return {
    resolve() {
      return registryResult;
    },
    keys() {
      return [];
    },
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), values.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export async function refreshNewsroomCurrentFeed(
  requestedSourceCode?: string | null,
  executionMode: SourceExecutionMode = "manual",
): Promise<NewsroomCurrentFeedRefreshResult> {
  const normalizedSourceCode = requestedSourceCode?.trim().toLowerCase() || null;
  const sources = listRegisteredSources().filter((source) => (
    (!normalizedSourceCode || source.code === normalizedSourceCode)
    && evaluateSourceExecution(source, executionMode).ok
  ));

  if (sources.length === 0) {
    return { ok: false, error: { code: "source_unavailable" } };
  }

  const timestamp = new Date().toISOString();
  const adapterRegistry = availableAdapterRegistry();
  const pageLoader = createHttpPageLoader();
  const collections = await Promise.all(sources.map(async (source) => ({
    source,
    result: await collectSource(
      {
        sourceCode: source.code,
        detectedAt: timestamp,
        executionMode,
      },
      {
        sourceProvider: registeredSourceConfigurationProvider,
        adapterRegistry,
        pageLoader,
        now: () => new Date().toISOString(),
      },
    ),
  })));
  const successfulCollections = collections.flatMap(({ result }) => (
    result.ok ? [result.value] : []
  ));

  if (successfulCollections.length === 0) {
    return { ok: false, error: { code: "collection_unavailable" } };
  }

  const selection = selectNewsroomCurrentFeedCandidates(successfulCollections);
  const ingestionResults = await mapWithConcurrency(
    selection.candidates,
    INGESTION_CONCURRENCY,
    (candidate) => ingestHttpNewsroomCurrentFeedArticle({
      sourceCode: candidate.sourceCode,
      articleUrl: candidate.articleUrl,
      detectedAt: timestamp,
      extractedAt: timestamp,
      executionMode,
    }),
  );
  const persistedArticles = ingestionResults.flatMap((result) => (
    result.ok
      ? [{
          articleId: result.value.article.id,
          action: result.value.article.action,
        }]
      : []
  ));
  const classificationFailedCount = await classifyNewsroomCurrentFeedArticles(
    persistedArticles,
  ).then(
    (summary) => summary.failedCount,
    () => persistedArticles.length,
  );
  const runSummary = summarizeNewsroomCurrentFeedRun({
    requestedSourceCount: sources.length,
    successfulSourceCount: successfulCollections.length,
    actions: ingestionResults.map((result) => (
      result.ok ? result.value.article.action : null
    )),
  });

  return {
    ok: true,
    value: {
      status: runSummary.status,
      sourceCount: successfulCollections.length,
      discoveredCount: successfulCollections.reduce(
        (total, collection) => total + collection.acceptedCount,
        0,
      ),
      newCandidateCount: runSummary.newCandidateCount,
      attemptedCount: runSummary.attemptedCount,
      availableCount: runSummary.availableCount,
      createdCount: runSummary.createdCount,
      updatedCount: runSummary.updatedCount,
      existingCount: runSummary.existingCount,
      failedCount: runSummary.failedCount,
      classificationFailedCount,
      hasMore: false,
    },
  };
}
