import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import { createAvailableAdapterRegistry } from "@/lib/redacao-automatica/available-adapter-registry";
import { collectSource } from "@/lib/redacao-automatica/collection-service";
import { ingestHttpNewsroomArticle } from "@/lib/redacao-automatica/http-newsroom-ingestion";
import {
  newsroomCurrentFeedIdentity,
  selectNewsroomCurrentFeedCandidates,
} from "@/lib/redacao-automatica/newsroom-current-feed-internal";
import { createHttpPageLoader } from "@/lib/redacao-automatica/page-loaders/http-page-loader";
import { registeredSourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import { listRegisteredSources } from "@/lib/redacao-automatica/source-registry";

const EXISTING_ARTICLE_PAGE_SIZE = 1000;
const INGESTION_CONCURRENCY = 4;

type ExistingArticleRow = Readonly<{
  source_code: string;
  original_url: string | null;
  normalized_url: string | null;
  processing_status: string;
}>;

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
        failedCount: number;
        hasMore: boolean;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "source_unavailable" | "collection_unavailable" | "archive_unavailable";
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

async function knownArticleIdentities(
  sourceCodes: readonly string[],
): Promise<ReadonlySet<string>> {
  const identities = new Set<string>();
  let offset = 0;
  const sourceFilter = sourceCodes.length > 0
    ? `&source_code=in.(${sourceCodes.map(encodeURIComponent).join(",")})`
    : "";

  while (true) {
    const rows = await fetchSupabaseAdminTable<ExistingArticleRow>(
      "newsroom_articles?select=source_code,original_url,normalized_url,processing_status"
      + sourceFilter
      + `&order=id.asc&offset=${offset}&limit=${EXISTING_ARTICLE_PAGE_SIZE}`,
    );

    for (const row of rows) {
      const url = row.normalized_url?.trim() || row.original_url?.trim();
      if (
        url
        && ["normalized", "ready_for_review"].includes(row.processing_status)
      ) {
        identities.add(newsroomCurrentFeedIdentity(row.source_code, url));
      }
    }

    if (rows.length < EXISTING_ARTICLE_PAGE_SIZE) {
      return identities;
    }
    offset += EXISTING_ARTICLE_PAGE_SIZE;
  }
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
): Promise<NewsroomCurrentFeedRefreshResult> {
  const normalizedSourceCode = requestedSourceCode?.trim().toLowerCase() || null;
  const sources = listRegisteredSources().filter((source) => (
    source.manualCollectionEnabled
    && Boolean(source.adapterKey?.trim())
    && source.operationalStatus !== "disabled"
    && source.operationalStatus !== "legal_hold"
    && (!normalizedSourceCode || source.code === normalizedSourceCode)
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
        executionMode: "manual",
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

  let knownIdentities: ReadonlySet<string>;
  try {
    knownIdentities = await knownArticleIdentities(sources.map((source) => source.code));
  } catch {
    return { ok: false, error: { code: "archive_unavailable" } };
  }

  const selection = selectNewsroomCurrentFeedCandidates(
    successfulCollections,
    knownIdentities,
  );
  const ingestionResults = await mapWithConcurrency(
    selection.candidates,
    INGESTION_CONCURRENCY,
    (candidate) => ingestHttpNewsroomArticle({
      sourceCode: candidate.sourceCode,
      articleUrl: candidate.articleUrl,
      detectedAt: timestamp,
      extractedAt: timestamp,
    }),
  );
  const availableCount = ingestionResults.filter((result) => result.ok).length;
  const failedCount = ingestionResults.length - availableCount;
  const partial = (
    successfulCollections.length < sources.length
    || failedCount > 0
  );
  const status: NewsroomCurrentFeedRefreshStatus = selection.candidates.length === 0
    ? successfulCollections.length < sources.length ? "partial" : "up_to_date"
    : partial ? "partial" : "updated";

  return {
    ok: true,
    value: {
      status,
      sourceCount: successfulCollections.length,
      discoveredCount: successfulCollections.reduce(
        (total, collection) => total + collection.acceptedCount,
        0,
      ),
      newCandidateCount: selection.availableNewCount,
      attemptedCount: selection.candidates.length,
      availableCount,
      failedCount,
      hasMore: false,
    },
  };
}
