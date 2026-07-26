import { createHash } from "node:crypto";

import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import type { SourceAdapter } from "@/lib/redacao-automatica/adapters/source-adapter";
import {
  normalizeText,
  normalizeUrl,
} from "@/lib/redacao-automatica/normalization";
import type {
  NewsroomPersistenceErrorCode,
  NewsroomArticleWriteOutcome,
  NewsroomSnapshotWriteOutcome,
  PersistNewsroomArticleInput,
  PersistNewsroomArticleResult,
} from "@/lib/redacao-automatica/newsroom-article-persistence";
import type { SourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import type {
  ArticleBodyBlock,
  ArticleProcessingStatus,
  JsonObject,
  JsonValue,
  LoadedPage,
  NormalizedDetectedArticle,
  OperationResult,
  SourceConfiguration,
} from "@/lib/redacao-automatica/types";

const TIMESTAMPTZ_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const INPUT_KEYS = ["sourceCode", "originalUrl", "html", "detectedAt"] as const;
const INPUT_KEYS_WITH_EXTRACTION = [...INPUT_KEYS, "extractedAt"] as const;
const PROCESSING_STATUSES = new Set<ArticleProcessingStatus>([
  "detected",
  "normalized",
  "duplicate",
  "rejected",
  "ready_for_review",
  "failed",
]);

export type IngestOfflineNewsroomArticleInput = Readonly<{
  sourceCode: string;
  originalUrl: string;
  html: string;
  detectedAt: string;
  extractedAt?: string;
}>;

export type OfflineNewsroomIngestionErrorCode =
  | "input_invalid"
  | "source_not_found"
  | "legal_hold"
  | "source_forbidden"
  | "offline_not_supported"
  | "adapter_unavailable"
  | "parsing_failed"
  | "normalized_article_invalid"
  | "persistence_failed";

export type OfflineNewsroomIngestionError = Readonly<{
  code: OfflineNewsroomIngestionErrorCode;
  stage:
    | "validation"
    | "configuration"
    | "parsing"
    | "normalization"
    | "persistence";
  message: string;
  sourceCode: string | null;
  persistenceCode: NewsroomPersistenceErrorCode | null;
  operationIncomplete: false;
}>;

export type OfflineNewsroomIngestionSuccess = Readonly<{
  complete: true;
  sourceCode: string;
  normalizedUrl: string;
  contentHash: string;
  article: NewsroomArticleWriteOutcome;
  snapshot: NewsroomSnapshotWriteOutcome;
}>;

export type IngestOfflineNewsroomArticleResult = OperationResult<
  OfflineNewsroomIngestionSuccess,
  OfflineNewsroomIngestionError
>;

type OfflineNewsroomIngestionFailure = Extract<
  IngestOfflineNewsroomArticleResult,
  { ok: false }
>;

export type OfflineNewsroomIngestionDependencies = Readonly<{
  sourceProvider: SourceConfigurationProvider;
  adapterRegistry: AdapterRegistry;
  persistArticle(
    input: PersistNewsroomArticleInput,
  ): Promise<PersistNewsroomArticleResult>;
}>;

type ValidatedInput = Readonly<{
  sourceCode: string;
  originalUrl: string;
  html: string;
  detectedAt: string;
  extractedAt: string;
}>;

export type LoadedNewsroomArticleIngestionInput = Readonly<{
  source: SourceConfiguration;
  adapter: SourceAdapter;
  page: LoadedPage;
  detectedAt: string;
  extractedAt: string;
  ingestionMode: "offline_local_html" | "http_manual_article";
  networkRequest: boolean;
}>;

export type LoadedNewsroomArticleIngestionSuccess = Readonly<{
  complete: true;
  sourceCode: string;
  normalizedUrl: string;
  contentHash: string;
  title: string;
  publishedAt: string | null;
  detectedAt: string;
  extractedAt: string;
  article: NewsroomArticleWriteOutcome;
  snapshot: NewsroomSnapshotWriteOutcome;
}>;

export type LoadedNewsroomArticleIngestionResult = OperationResult<
  LoadedNewsroomArticleIngestionSuccess,
  OfflineNewsroomIngestionError
>;

const ERROR_MESSAGES: Readonly<
  Record<OfflineNewsroomIngestionErrorCode, string>
> = {
  input_invalid: "Os dados fornecidos para a ingestão offline são inválidos.",
  source_not_found: "A fonte indicada não está registada.",
  legal_hold: "A fonte indicada está bloqueada por validação legal.",
  source_forbidden: "A fonte indicada não permite esta operação.",
  offline_not_supported: "A fonte não suporta ingestão offline de artigos.",
  adapter_unavailable: "O adaptador necessário não está disponível.",
  parsing_failed: "Não foi possível analisar o HTML local.",
  normalized_article_invalid: "O artigo normalizado é inválido.",
  persistence_failed: "Não foi possível persistir a ingestão.",
};

function failure(
  code: OfflineNewsroomIngestionErrorCode,
  stage: OfflineNewsroomIngestionError["stage"],
  sourceCode: string | null,
  persistenceCode: NewsroomPersistenceErrorCode | null = null,
): OfflineNewsroomIngestionFailure {
  return {
    ok: false,
    error: {
      code,
      stage,
      message: ERROR_MESSAGES[code],
      sourceCode,
      persistenceCode,
      operationIncomplete: false,
    },
  };
}

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

function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
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
    || !isSafeHttpUrl(value.originalUrl)
    || typeof value.html !== "string"
    || !value.html.trim()
    || !isTimestamp(value.detectedAt)
    || (
      hasExtractionTime
      && !isTimestamp(value.extractedAt)
    )
  ) {
    return null;
  }

  return {
    sourceCode,
    originalUrl: value.originalUrl,
    html: value.html,
    detectedAt: value.detectedAt,
    extractedAt: hasExtractionTime
      ? value.extractedAt as string
      : value.detectedAt,
  };
}

function isJsonValue(
  value: unknown,
  ancestors = new Set<object>(),
): value is JsonValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object" || ancestors.has(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value)
    && prototype !== Object.prototype
    && prototype !== null
  ) {
    return false;
  }

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors))
    : Object.values(value).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value);
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? normalizeText(value) : undefined;
}

function nullableTimestamp(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  return isTimestamp(value) ? value : undefined;
}

function normalizeBody(value: unknown): readonly ArticleBodyBlock[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const body: ArticleBodyBlock[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate)
      || (candidate.type !== "paragraph" && candidate.type !== "heading")
      || typeof candidate.text !== "string"
    ) {
      return null;
    }

    const text = normalizeText(candidate.text);
    if (!text) {
      return null;
    }

    body.push({ type: candidate.type, text });
  }

  return body;
}

function safeImageUrl(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  if (!isSafeHttpUrl(value)) {
    return undefined;
  }

  const normalized = normalizeUrl({ url: value });
  return normalized.ok ? normalized.value : undefined;
}

function normalizeArticle(
  value: unknown,
  source: SourceConfiguration,
  adapter: SourceAdapter,
  input: Readonly<{
    originalUrl: string;
    detectedAt: string;
    extractedAt: string;
    ingestionMode: LoadedNewsroomArticleIngestionInput["ingestionMode"];
    networkRequest: boolean;
  }>,
): PersistNewsroomArticleInput | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = nullableText(value.title);
  const externalId = nullableText(value.externalId);
  const subtitle = nullableText(value.subtitle);
  const summary = nullableText(value.summary);
  const author = nullableText(value.author);
  const publishedAt = nullableTimestamp(value.publishedAt);
  const modifiedAt = nullableTimestamp(value.modifiedAt);
  const imageUrl = safeImageUrl(value.imageUrl);
  const body = normalizeBody(value.body);

  if (
    value.sourceCode !== source.code
    || value.originalUrl !== input.originalUrl
    || typeof value.normalizedUrl !== "string"
    || !title
    || externalId === undefined
    || subtitle === undefined
    || summary === undefined
    || author === undefined
    || publishedAt === undefined
    || modifiedAt === undefined
    || imageUrl === undefined
    || value.detectedAt !== input.detectedAt
    || typeof value.processingStatus !== "string"
    || !PROCESSING_STATUSES.has(
      value.processingStatus as ArticleProcessingStatus,
    )
    || !body
    || !isJsonObject(value.sourceMetadata)
  ) {
    return null;
  }

  const normalizedArticleUrl = adapter.normalizeArticleUrl({
    source,
    url: value.normalizedUrl,
    baseUrl: input.originalUrl,
  });
  if (!normalizedArticleUrl.ok) {
    return null;
  }

  const {
    loadedAt: ignoredLoadedAt,
    ...stableAdapterSourceMetadata
  } = value.sourceMetadata;
  void ignoredLoadedAt;

  const sourceMetadata: JsonObject = {
    ...stableAdapterSourceMetadata,
    ingestionMode: input.ingestionMode,
    networkRequest: input.networkRequest,
    sourceCode: source.code,
    adapterKey: adapter.key,
    originalUrl: input.originalUrl,
    normalizedUrl: normalizedArticleUrl.value,
  };

  const article = {
    sourceCode: source.code,
    originalUrl: input.originalUrl,
    normalizedUrl: normalizedArticleUrl.value,
    externalId,
    title,
    subtitle,
    summary,
    author,
    publishedAt,
    modifiedAt,
    detectedAt: input.detectedAt,
    imageUrl,
    processingStatus: value.processingStatus as ArticleProcessingStatus,
  } as const;

  const hashContent: JsonObject = {
    sourceCode: article.sourceCode,
    normalizedUrl: article.normalizedUrl,
    externalId: article.externalId,
    title: article.title,
    subtitle: article.subtitle,
    summary: article.summary,
    author: article.author,
    publishedAt: article.publishedAt,
    modifiedAt: article.modifiedAt,
    imageUrl: article.imageUrl,
    body: body.map((block) => ({
      type: block.type,
      text: block.text,
    })),
  };
  const contentHash = sha256CanonicalJson(hashContent);

  if (!SHA256_PATTERN.test(contentHash)) {
    return null;
  }

  return {
    article,
    snapshot: {
      contentHash,
      body,
      sourceMetadata,
      extractedAt: input.extractedAt,
    },
  };
}

function offlineLoadedPage(
  input: ValidatedInput,
  normalizedUrl: string,
): LoadedPage {
  return {
    requestedUrl: input.originalUrl,
    finalUrl: normalizedUrl,
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: input.html,
    loadedAt: input.extractedAt,
    redirectCount: 0,
    byteLength: Buffer.byteLength(input.html, "utf8"),
  };
}

export function canonicalizeJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  }

  const objectValue = value as JsonObject;
  return `{${Object.keys(objectValue)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalizeJson(objectValue[key])}`,
    )
    .join(",")}}`;
}

export function sha256CanonicalJson(value: JsonValue): string {
  return createHash("sha256")
    .update(canonicalizeJson(value), "utf8")
    .digest("hex");
}

export async function ingestLoadedNewsroomArticle(
  input: LoadedNewsroomArticleIngestionInput,
  persistArticle: OfflineNewsroomIngestionDependencies["persistArticle"],
): Promise<LoadedNewsroomArticleIngestionResult> {
  const {
    source,
    adapter,
    page,
  } = input;

  let parsedResult;
  try {
    parsedResult = adapter.extractArticle?.({
      source,
      page,
      detectedAt: input.detectedAt,
    });
  } catch {
    return failure("parsing_failed", "parsing", source.code);
  }

  if (!parsedResult) {
    return failure("offline_not_supported", "configuration", source.code);
  }

  if (!parsedResult.ok) {
    return failure(
      parsedResult.error.code === "required_field_missing"
        ? "normalized_article_invalid"
        : "parsing_failed",
      parsedResult.error.code === "required_field_missing"
        ? "normalization"
        : "parsing",
      source.code,
    );
  }

  const persistenceInput = normalizeArticle(
    parsedResult.value,
    source,
    adapter,
    {
      originalUrl: page.requestedUrl,
      detectedAt: input.detectedAt,
      extractedAt: input.extractedAt,
      ingestionMode: input.ingestionMode,
      networkRequest: input.networkRequest,
    },
  );
  if (!persistenceInput) {
    return failure(
      "normalized_article_invalid",
      "normalization",
      source.code,
    );
  }

  let persisted;
  try {
    persisted = await persistArticle(persistenceInput);
  } catch {
    return failure("persistence_failed", "persistence", source.code);
  }

  if (!persisted.ok) {
    return failure(
      "persistence_failed",
      "persistence",
      source.code,
      persisted.error.code,
    );
  }

  return {
    ok: true,
    value: {
      complete: true,
      sourceCode: source.code,
      normalizedUrl: persistenceInput.article.normalizedUrl,
      contentHash: persistenceInput.snapshot.contentHash,
      title: persistenceInput.article.title,
      publishedAt: persistenceInput.article.publishedAt,
      detectedAt: persistenceInput.article.detectedAt,
      extractedAt: persistenceInput.snapshot.extractedAt,
      article: persisted.value.article,
      snapshot: persisted.value.snapshot,
    },
  };
}

export function createOfflineNewsroomIngestion(
  dependencies: OfflineNewsroomIngestionDependencies,
): (
  input: IngestOfflineNewsroomArticleInput,
) => Promise<IngestOfflineNewsroomArticleResult> {
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
      return failure(
        "source_not_found",
        "configuration",
        input.sourceCode,
      );
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

    const source = sourceResult.value;
    if (source.operationalStatus === "legal_hold") {
      return failure("legal_hold", "configuration", source.code);
    }
    if (source.operationalStatus === "disabled") {
      return failure("source_forbidden", "configuration", source.code);
    }

    if (!source.adapterKey?.trim()) {
      return failure(
        "offline_not_supported",
        "configuration",
        source.code,
      );
    }

    let adapterResult;
    try {
      adapterResult = dependencies.adapterRegistry.resolve(
        source.adapterKey,
        source.code,
      );
    } catch {
      return failure(
        "adapter_unavailable",
        "configuration",
        source.code,
      );
    }

    if (!adapterResult.ok) {
      return failure(
        "adapter_unavailable",
        "configuration",
        source.code,
      );
    }

    const adapter = adapterResult.value;
    if (adapter.sourceCode !== source.code) {
      return failure(
        "adapter_unavailable",
        "configuration",
        source.code,
      );
    }
    if (typeof adapter.extractArticle !== "function") {
      return failure(
        "offline_not_supported",
        "configuration",
        source.code,
      );
    }

    let inputUrlResult;
    try {
      inputUrlResult = adapter.normalizeArticleUrl({
        source,
        url: input.originalUrl,
        baseUrl: input.originalUrl,
      });
    } catch {
      return failure("input_invalid", "validation", source.code);
    }
    if (!inputUrlResult.ok) {
      return failure("input_invalid", "validation", source.code);
    }

    const ingested = await ingestLoadedNewsroomArticle(
      {
        source,
        adapter,
        page: offlineLoadedPage(input, inputUrlResult.value),
        detectedAt: input.detectedAt,
        extractedAt: input.extractedAt,
        ingestionMode: "offline_local_html",
        networkRequest: false,
      },
      dependencies.persistArticle,
    );
    if (!ingested.ok) {
      return ingested;
    }

    return {
      ok: true,
      value: {
        complete: true,
        sourceCode: ingested.value.sourceCode,
        normalizedUrl: ingested.value.normalizedUrl,
        contentHash: ingested.value.contentHash,
        article: ingested.value.article,
        snapshot: ingested.value.snapshot,
      },
    };
  };
}
