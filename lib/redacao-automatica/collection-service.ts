import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import { deduplicateArticleCandidates } from "@/lib/redacao-automatica/candidate-deduplication";
import { normalizeUrl } from "@/lib/redacao-automatica/normalization";
import type { PageLoader } from "@/lib/redacao-automatica/page-loader";
import type { SourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import { evaluateSourceExecution } from "@/lib/redacao-automatica/source-registry";
import type {
  ArticleLinkCandidate,
  CollectionError,
  OperationResult,
  SourceCollectionSummary,
  SourceExecutionMode,
} from "@/lib/redacao-automatica/types";

export type CollectSourceInput = Readonly<{
  sourceCode: string;
  detectedAt: string;
  executionMode?: SourceExecutionMode;
}>;

export type CollectSourceDependencies = Readonly<{
  sourceProvider: SourceConfigurationProvider;
  adapterRegistry: AdapterRegistry;
  pageLoader: PageLoader;
  now: () => string;
}>;

function adapterSourceMismatchError(
  sourceCode: string,
  adapterSourceCode: string,
): CollectionError {
  return {
    code: "adapter_source_mismatch",
    stage: "configuration",
    sourceCode,
    url: null,
    recoverable: false,
    detail: `O adaptador resolvido pertence à fonte "${adapterSourceCode}" e não à fonte pedida.`,
  };
}

function missingListingUrlsError(sourceCode: string): CollectionError {
  return {
    code: "required_field_missing",
    stage: "listing",
    sourceCode,
    url: null,
    recoverable: false,
    detail: "A fonte não disponibilizou qualquer URL de listagem válida e autorizada.",
  };
}

export async function collectSource(
  input: CollectSourceInput,
  dependencies: CollectSourceDependencies,
): Promise<OperationResult<SourceCollectionSummary, CollectionError>> {
  const startedAt = dependencies.now();
  const sourceResult = await dependencies.sourceProvider.findByCode(input.sourceCode);

  if (!sourceResult.ok) {
    return sourceResult;
  }

  const executionMode = input.executionMode ?? "automatic";
  const executionResult = evaluateSourceExecution(
    sourceResult.value,
    executionMode,
  );
  if (!executionResult.ok) {
    return executionResult;
  }

  const source = executionResult.value;
  const adapterResult = dependencies.adapterRegistry.resolve(source.adapterKey, source.code);
  if (!adapterResult.ok) {
    return adapterResult;
  }

  const adapter = adapterResult.value;
  if (adapter.sourceCode !== source.code) {
    return {
      ok: false,
      error: adapterSourceMismatchError(source.code, adapter.sourceCode),
    };
  }

  const listingUrlResult = adapter.getListingUrls(source);
  if (!listingUrlResult.ok) {
    return listingUrlResult;
  }

  const errors: CollectionError[] = [];
  const listingUrls: string[] = [];
  const seenListingUrls = new Set<string>();

  for (const listingUrl of listingUrlResult.value) {
    const normalizedListingUrl = normalizeUrl({
      url: listingUrl,
      baseUrl: source.homepage,
      allowedDomain: source.domain,
      sourceCode: source.code,
    });

    if (!normalizedListingUrl.ok) {
      errors.push(normalizedListingUrl.error);
      continue;
    }

    if (seenListingUrls.has(normalizedListingUrl.value)) {
      continue;
    }

    seenListingUrls.add(normalizedListingUrl.value);
    listingUrls.push(normalizedListingUrl.value);
  }

  if (listingUrls.length === 0) {
    return {
      ok: false,
      error: missingListingUrlsError(source.code),
    };
  }

  const candidates: ArticleLinkCandidate[] = [];
  let loadedListingCount = 0;
  let discoveredCount = 0;
  let rejectedCount = 0;

  for (const listingUrl of listingUrls) {
    const loadedPageResult = await dependencies.pageLoader.load({
      sourceCode: source.code,
      url: listingUrl,
      purpose: "listing",
    });

    if (!loadedPageResult.ok) {
      errors.push(loadedPageResult.error);
      continue;
    }

    const loadedPage = loadedPageResult.value;
    const normalizedFinalUrl = normalizeUrl({
      url: loadedPage.finalUrl,
      allowedDomain: source.domain,
      sourceCode: source.code,
    });

    if (!normalizedFinalUrl.ok) {
      errors.push(normalizedFinalUrl.error);
      continue;
    }

    loadedListingCount += 1;
    const validatedPage = {
      ...loadedPage,
      finalUrl: normalizedFinalUrl.value,
    };

    const discoveredLinksResult = adapter.discoverArticleLinks({
      source,
      page: validatedPage,
    });

    if (!discoveredLinksResult.ok) {
      errors.push(discoveredLinksResult.error);
      continue;
    }

    discoveredCount += discoveredLinksResult.value.length;

    for (const discoveredLink of discoveredLinksResult.value) {
      const adapterNormalizedUrl = adapter.normalizeArticleUrl({
        source,
        url: discoveredLink.originalUrl,
        baseUrl: normalizedFinalUrl.value,
      });

      if (!adapterNormalizedUrl.ok) {
        rejectedCount += 1;
        errors.push(adapterNormalizedUrl.error);
        continue;
      }

      const normalizedArticleUrl = normalizeUrl({
        url: adapterNormalizedUrl.value,
        baseUrl: normalizedFinalUrl.value,
        allowedDomain: source.domain,
        sourceCode: source.code,
      });

      if (!normalizedArticleUrl.ok) {
        rejectedCount += 1;
        errors.push(normalizedArticleUrl.error);
        continue;
      }

      candidates.push({
        sourceCode: source.code,
        originalUrl: discoveredLink.originalUrl,
        normalizedUrl: normalizedArticleUrl.value,
        sourcePageUrl: normalizedFinalUrl.value,
        detectedAt: input.detectedAt,
        sourceMetadata: discoveredLink.sourceMetadata,
      });
    }
  }

  const deduplicatedCandidates = deduplicateArticleCandidates(candidates);
  const summary: SourceCollectionSummary = {
    sourceCode: source.code,
    startedAt,
    finishedAt: dependencies.now(),
    listingUrls,
    loadedListingCount,
    discoveredCount,
    acceptedCount: deduplicatedCandidates.candidates.length,
    duplicateCount: deduplicatedCandidates.duplicateCount,
    rejectedCount,
    candidates: deduplicatedCandidates.candidates,
    errors,
  };

  return { ok: true, value: summary };
}
