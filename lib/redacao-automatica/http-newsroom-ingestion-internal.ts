import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import { normalizeText } from "@/lib/redacao-automatica/normalization";
import {
  ingestLoadedNewsroomArticle,
  type OfflineNewsroomIngestionError,
} from "@/lib/redacao-automatica/offline-newsroom-ingestion-internal";
import type {
  NewsroomArticleWriteOutcome,
  NewsroomPersistenceErrorCode,
  NewsroomSnapshotWriteOutcome,
  PersistNewsroomArticleInput,
  PersistNewsroomArticleResult,
} from "@/lib/redacao-automatica/newsroom-article-persistence";
import type { PageLoader } from "@/lib/redacao-automatica/page-loader";
import type { HttpPageLoaderPolicy } from "@/lib/redacao-automatica/page-loaders/http-page-loader-policy";
import type { SourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import type {
  CollectionError,
  CollectionErrorCode,
  OperationResult,
  SourceConfiguration,
  SourceExecutionMode,
} from "@/lib/redacao-automatica/types";

const TIMESTAMPTZ_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const INPUT_KEYS = [
  "sourceCode",
  "articleUrl",
  "detectedAt",
] as const;
const INPUT_KEYS_WITH_EXTRACTION = [...INPUT_KEYS, "extractedAt"] as const;

export type IngestHttpNewsroomArticleInput = Readonly<{
  sourceCode: string;
  articleUrl: string;
  detectedAt: string;
  extractedAt?: string;
}>;

export type HttpNewsroomIngestionErrorCode =
  | CollectionErrorCode
  | "input_invalid"
  | "adapter_unavailable"
  | "normalized_article_invalid"
  | "parsing_failed"
  | "persistence_failed";

export type HttpNewsroomIngestionError = Readonly<{
  code: HttpNewsroomIngestionErrorCode;
  stage:
    | "validation"
    | "configuration"
    | "loading"
    | "parsing"
    | "normalization"
    | "persistence";
  message: string;
  sourceCode: string | null;
  persistenceCode: NewsroomPersistenceErrorCode | null;
  statusCode?: number;
  operationIncomplete: false;
}>;

export type HttpNewsroomIngestionSuccess = Readonly<{
  complete: true;
  sourceCode: string;
  executionMode: "manual";
  ingestionMode: "http_manual_article";
  originalUrl: string;
  finalUrl: string;
  normalizedUrl: string;
  contentHash: string;
  title: string;
  publishedAt: string | null;
  detectedAt: string;
  extractedAt: string;
  loadedAt: string;
  statusCode: number;
  redirectCount: number;
  byteLength: number;
  article: NewsroomArticleWriteOutcome;
  snapshot: NewsroomSnapshotWriteOutcome;
}>;

export type IngestHttpNewsroomArticleResult = OperationResult<
  HttpNewsroomIngestionSuccess,
  HttpNewsroomIngestionError
>;

export type HttpNewsroomIngestionDependencies = Readonly<{
  sourceProvider: SourceConfigurationProvider;
  evaluateExecution(
    source: SourceConfiguration,
    executionMode: SourceExecutionMode,
  ): OperationResult<SourceConfiguration, CollectionError>;
  resolvePolicy(sourceCode: string): HttpPageLoaderPolicy | null;
  adapterRegistry: AdapterRegistry;
  pageLoader: PageLoader;
  persistArticle(
    input: PersistNewsroomArticleInput,
  ): Promise<PersistNewsroomArticleResult>;
}>;

type ValidatedInput = Readonly<{
  sourceCode: string;
  articleUrl: string;
  detectedAt: string;
  extractedAt: string;
}>;

const ERROR_MESSAGES: Readonly<
  Record<HttpNewsroomIngestionErrorCode, string>
> = {
  input_invalid: "Os dados fornecidos para a ingestao HTTP sao invalidos.",
  source_not_found: "A fonte indicada nao esta registada.",
  source_inactive: "A fonte indicada nao permite execucao manual.",
  legal_hold: "A fonte indicada esta bloqueada por validacao legal.",
  source_forbidden: "A fonte ou finalidade indicada nao esta autorizada.",
  adapter_missing: "O adaptador necessario nao esta disponivel.",
  adapter_source_mismatch: "O adaptador nao corresponde a fonte indicada.",
  invalid_adapter_key: "O adaptador necessario nao esta disponivel.",
  duplicate_adapter_key: "O registo de adaptadores e invalido.",
  adapter_unavailable: "O adaptador necessario nao esta disponivel.",
  invalid_url: "A URL de artigo indicada nao e valida.",
  domain_not_allowed: "A URL nao pertence a um dominio autorizado.",
  private_network_blocked: "A URL foi bloqueada pela politica de rede.",
  dns_resolution_failed: "Nao foi possivel validar o destino HTTP.",
  redirect_blocked: "O redirecionamento HTTP foi bloqueado.",
  timeout: "O carregamento HTTP excedeu o tempo permitido.",
  http_error: "A fonte devolveu uma resposta HTTP nao aceite.",
  response_too_large: "A resposta HTTP excedeu o limite permitido.",
  load_failed: "Nao foi possivel carregar o artigo.",
  unsupported_content: "A resposta nao contem HTML suportado.",
  parse_failed: "Nao foi possivel extrair o artigo.",
  required_field_missing: "O artigo extraido nao contem os campos obrigatorios.",
  duplicate: "O artigo ja foi processado.",
  normalized_article_invalid: "O artigo normalizado e invalido.",
  parsing_failed: "Nao foi possivel extrair o artigo.",
  persistence_failed: "Nao foi possivel persistir a ingestao.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string"
    && value === value.trim()
    && TIMESTAMPTZ_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
  );
}

function isArticleUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:")
      && !url.username
      && !url.password
      && Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function validateInput(value: unknown): ValidatedInput | null {
  if (!isRecord(value)) {
    return null;
  }

  const hasExtractionTime = Object.hasOwn(value, "extractedAt");
  if (
    !hasExactKeys(
      value,
      hasExtractionTime ? INPUT_KEYS_WITH_EXTRACTION : INPUT_KEYS,
    )
  ) {
    return null;
  }

  const sourceCode = normalizeText(
    typeof value.sourceCode === "string" ? value.sourceCode : null,
  );
  if (
    !sourceCode
    || !isArticleUrl(value.articleUrl)
    || !isTimestamp(value.detectedAt)
    || (hasExtractionTime && !isTimestamp(value.extractedAt))
  ) {
    return null;
  }

  return {
    sourceCode,
    articleUrl: value.articleUrl,
    detectedAt: value.detectedAt,
    extractedAt: hasExtractionTime
      ? value.extractedAt as string
      : value.detectedAt,
  };
}

function failure(
  code: HttpNewsroomIngestionErrorCode,
  stage: HttpNewsroomIngestionError["stage"],
  sourceCode: string | null,
  persistenceCode: NewsroomPersistenceErrorCode | null = null,
  statusCode?: number,
): IngestHttpNewsroomArticleResult {
  return {
    ok: false,
    error: {
      code,
      stage,
      message: ERROR_MESSAGES[code],
      sourceCode,
      persistenceCode,
      ...(statusCode === undefined ? {} : { statusCode }),
      operationIncomplete: false,
    },
  };
}

function commonFailure(
  error: OfflineNewsroomIngestionError,
): IngestHttpNewsroomArticleResult {
  return failure(
    error.code === "offline_not_supported"
      ? "adapter_unavailable"
      : error.code,
    error.stage,
    error.sourceCode,
    error.persistenceCode,
  );
}

export function createHttpNewsroomIngestion(
  dependencies: HttpNewsroomIngestionDependencies,
): (
  input: IngestHttpNewsroomArticleInput,
) => Promise<IngestHttpNewsroomArticleResult> {
  return async (rawInput) => {
    const input = validateInput(rawInput);
    if (!input) {
      return failure("input_invalid", "validation", null);
    }

    let sourceResult;
    try {
      sourceResult = await dependencies.sourceProvider.findByCode(
        input.sourceCode,
      );
    } catch {
      return failure("source_not_found", "configuration", input.sourceCode);
    }
    if (!sourceResult.ok) {
      return failure(
        sourceResult.error.code === "source_not_found"
          ? "source_not_found"
          : "source_forbidden",
        "configuration",
        input.sourceCode,
      );
    }

    let executionResult;
    try {
      executionResult = dependencies.evaluateExecution(
        sourceResult.value,
        "manual",
      );
    } catch {
      return failure("source_forbidden", "configuration", input.sourceCode);
    }
    if (!executionResult.ok) {
      return failure(
        executionResult.error.code,
        "configuration",
        executionResult.error.sourceCode,
      );
    }
    const source = executionResult.value;

    let policy: HttpPageLoaderPolicy | null;
    try {
      policy = dependencies.resolvePolicy(source.code);
    } catch {
      return failure("source_forbidden", "configuration", source.code);
    }
    if (
      !policy
      || policy.sourceCode !== source.code
      || !policy.allowedPurposes.includes("article")
    ) {
      return failure("source_forbidden", "configuration", source.code);
    }

    let adapterResult;
    try {
      adapterResult = dependencies.adapterRegistry.resolve(
        source.adapterKey,
        source.code,
      );
    } catch {
      return failure("adapter_unavailable", "configuration", source.code);
    }
    if (
      !adapterResult.ok
      || adapterResult.value.sourceCode !== source.code
      || typeof adapterResult.value.extractArticle !== "function"
    ) {
      return failure("adapter_unavailable", "configuration", source.code);
    }
    const adapter = adapterResult.value;

    let loadedPageResult;
    try {
      loadedPageResult = await dependencies.pageLoader.load({
        sourceCode: source.code,
        url: input.articleUrl,
        purpose: "article",
      });
    } catch {
      return failure("load_failed", "loading", source.code);
    }
    if (!loadedPageResult.ok) {
      return failure(
        loadedPageResult.error.code,
        "loading",
        source.code,
        null,
        loadedPageResult.error.statusCode,
      );
    }
    const page = loadedPageResult.value;

    const ingested = await ingestLoadedNewsroomArticle(
      {
        source,
        adapter,
        page,
        detectedAt: input.detectedAt,
        extractedAt: input.extractedAt,
        ingestionMode: "http_manual_article",
        networkRequest: true,
      },
      dependencies.persistArticle,
    );
    if (!ingested.ok) {
      return commonFailure(ingested.error);
    }

    return {
      ok: true,
      value: {
        complete: true,
        sourceCode: ingested.value.sourceCode,
        executionMode: "manual",
        ingestionMode: "http_manual_article",
        originalUrl: input.articleUrl,
        finalUrl: page.finalUrl,
        normalizedUrl: ingested.value.normalizedUrl,
        contentHash: ingested.value.contentHash,
        title: ingested.value.title,
        publishedAt: ingested.value.publishedAt,
        detectedAt: ingested.value.detectedAt,
        extractedAt: ingested.value.extractedAt,
        loadedAt: page.loadedAt,
        statusCode: page.statusCode,
        redirectCount: page.redirectCount,
        byteLength: page.byteLength,
        article: ingested.value.article,
        snapshot: ingested.value.snapshot,
      },
    };
  };
}
