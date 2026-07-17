import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import type { SourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import type { PageLoader } from "@/lib/redacao-automatica/page-loader";
import { evaluateSourceExecution } from "@/lib/redacao-automatica/source-registry";
import type {
  ArticleLinkCandidate,
  CollectionError,
  NormalizedDetectedArticle,
  OperationResult,
} from "@/lib/redacao-automatica/types";

export type ArticleExtractionDependencies = Readonly<{
  sourceProvider: SourceConfigurationProvider;
  adapterRegistry: AdapterRegistry;
  pageLoader: PageLoader;
}>;

function safeErrorUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return null;
  }
}

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

function articleServiceError(
  code: "unsupported_content" | "load_failed" | "parse_failed",
  sourceCode: string,
  url: string,
  recoverable: boolean,
  detail: string,
): CollectionError {
  return {
    code,
    stage: "article",
    sourceCode,
    url: safeErrorUrl(url),
    recoverable,
    detail,
  };
}

export async function extractArticleCandidate(
  candidate: ArticleLinkCandidate,
  dependencies: ArticleExtractionDependencies,
): Promise<OperationResult<NormalizedDetectedArticle, CollectionError>> {
  const sourceResult = await dependencies.sourceProvider.findByCode(
    candidate.sourceCode,
  );
  if (!sourceResult.ok) {
    return sourceResult;
  }

  const executionResult = evaluateSourceExecution(sourceResult.value);
  if (!executionResult.ok) {
    return executionResult;
  }

  const source = executionResult.value;
  const adapterResult = dependencies.adapterRegistry.resolve(
    source.adapterKey,
    source.code,
  );
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

  if (typeof adapter.extractArticle !== "function") {
    return {
      ok: false,
      error: articleServiceError(
        "unsupported_content",
        source.code,
        candidate.normalizedUrl,
        false,
        "O adaptador da fonte não suporta extração de artigos.",
      ),
    };
  }

  let loadedPageResult;
  try {
    loadedPageResult = await dependencies.pageLoader.load({
      sourceCode: source.code,
      url: candidate.normalizedUrl,
      purpose: "article",
    });
  } catch {
    return {
      ok: false,
      error: articleServiceError(
        "load_failed",
        source.code,
        candidate.normalizedUrl,
        true,
        "O carregamento do artigo falhou inesperadamente.",
      ),
    };
  }

  if (!loadedPageResult.ok) {
    return loadedPageResult;
  }

  try {
    return adapter.extractArticle({
      source,
      page: loadedPageResult.value,
      detectedAt: candidate.detectedAt,
    });
  } catch {
    return {
      ok: false,
      error: articleServiceError(
        "parse_failed",
        source.code,
        loadedPageResult.value.finalUrl,
        true,
        "A extração do artigo falhou inesperadamente.",
      ),
    };
  }
}
