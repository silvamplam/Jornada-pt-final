import { findRegisteredSource } from "@/lib/redacao-automatica/source-registry";
import type {
  ArticleBodyBlock,
  ArticleProcessingStatus,
  JsonObject,
  JsonValue,
  OperationResult,
} from "@/lib/redacao-automatica/types";

const ARTICLE_SELECT =
  "id,source_code,original_url,normalized_url,external_id,title,subtitle,summary,author,published_at,modified_at,detected_at,image_url,processing_status,first_detected_at,last_detected_at,created_at,updated_at";
const SNAPSHOT_SELECT =
  "id,article_id,content_hash,body,source_metadata,extracted_at,created_at";
const TIMESTAMPTZ_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const processingStatuses = new Set<ArticleProcessingStatus>([
  "detected",
  "normalized",
  "duplicate",
  "rejected",
  "ready_for_review",
  "failed",
]);

const inputKeys = ["article", "snapshot"] as const;
const articleInputKeys = [
  "sourceCode",
  "originalUrl",
  "normalizedUrl",
  "externalId",
  "title",
  "subtitle",
  "summary",
  "author",
  "publishedAt",
  "modifiedAt",
  "detectedAt",
  "imageUrl",
  "processingStatus",
] as const;
const snapshotInputKeys = [
  "contentHash",
  "body",
  "sourceMetadata",
  "extractedAt",
] as const;
const bodyBlockKeys = ["type", "text"] as const;

export type PersistNewsroomArticleInput = Readonly<{
  article: Readonly<{
    sourceCode: string;
    originalUrl: string;
    normalizedUrl: string;
    externalId: string | null;
    title: string;
    subtitle: string | null;
    summary: string | null;
    author: string | null;
    publishedAt: string | null;
    modifiedAt: string | null;
    detectedAt: string;
    imageUrl: string | null;
    processingStatus: ArticleProcessingStatus;
  }>;
  snapshot: Readonly<{
    contentHash: string;
    body: readonly ArticleBodyBlock[];
    sourceMetadata: JsonObject;
    extractedAt: string;
  }>;
}>;

export type NewsroomArticleWriteOutcome = Readonly<{
  id: string;
  action: "created" | "reused" | "updated";
}>;

export type NewsroomSnapshotWriteOutcome = Readonly<{
  id: string;
  action: "created" | "reused";
}>;

export type NewsroomPersistenceSuccess = Readonly<{
  complete: true;
  article: NewsroomArticleWriteOutcome;
  snapshot: NewsroomSnapshotWriteOutcome;
}>;

export type NewsroomPersistenceErrorCode =
  | "input_invalid"
  | "source_not_found"
  | "article_write_failed"
  | "snapshot_write_failed"
  | "persistence_conflict"
  | "persistence_unavailable";

export type NewsroomPersistenceError = Readonly<{
  code: NewsroomPersistenceErrorCode;
  stage: "validation" | "article" | "snapshot";
  message: string;
  article: NewsroomArticleWriteOutcome | null;
  operationIncomplete: boolean;
}>;

export type PersistNewsroomArticleResult = OperationResult<
  NewsroomPersistenceSuccess,
  NewsroomPersistenceError
>;

export interface NewsroomPersistenceTransport {
  isConfigured(): boolean;
  readRows<T>(path: string): Promise<T[]>;
  writeRows<T>(path: string, init: RequestInit): Promise<T[]>;
  isUnavailableError(error: unknown): boolean;
}

type NewsroomArticleRow = {
  id: string;
  source_code: string;
  original_url: string;
  normalized_url: string;
  external_id: string | null;
  title: string;
  subtitle: string | null;
  summary: string | null;
  author: string | null;
  published_at: string | null;
  modified_at: string | null;
  detected_at: string;
  image_url: string | null;
  processing_status: string;
  first_detected_at: string;
  last_detected_at: string;
  created_at: string;
  updated_at: string;
};

type NewsroomSnapshotRow = {
  id: string;
  article_id: string;
  content_hash: string;
  body: unknown;
  source_metadata: unknown;
  extracted_at: string;
  created_at: string;
};

type FailureStage = NewsroomPersistenceError["stage"];

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

function isRequiredText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isNullableText(value: unknown): value is string | null {
  return value === null || isRequiredText(value);
}

function isTimestamp(value: unknown): value is string {
  return (
    isRequiredText(value)
    && TIMESTAMPTZ_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
  );
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isHttpUrl(value: unknown, requireNormalized: boolean): value is string {
  if (!isRequiredText(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || Boolean(url.username)
      || Boolean(url.password)
    ) {
      return false;
    }

    return !requireNormalized || url.toString() === value;
  } catch {
    return false;
  }
}

function isJsonValue(value: unknown, ancestors = new Set<object>()): value is JsonValue {
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

  if (typeof value !== "object") {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors))
    : Object.values(value).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function isArticleBody(value: unknown): value is readonly ArticleBodyBlock[] {
  return (
    Array.isArray(value)
    && value.every((candidate) => {
      if (!isRecord(candidate) || !hasExactKeys(candidate, bodyBlockKeys)) {
        return false;
      }

      return (
        (candidate.type === "paragraph" || candidate.type === "heading")
        && isRequiredText(candidate.text)
      );
    })
  );
}

function isSourceMetadata(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value);
}

function isValidInput(value: unknown): value is PersistNewsroomArticleInput {
  if (!isRecord(value) || !hasExactKeys(value, inputKeys)) {
    return false;
  }

  const article = value.article;
  const snapshot = value.snapshot;
  if (
    !isRecord(article)
    || !hasExactKeys(article, articleInputKeys)
    || !isRecord(snapshot)
    || !hasExactKeys(snapshot, snapshotInputKeys)
  ) {
    return false;
  }

  return (
    isRequiredText(article.sourceCode)
    && isHttpUrl(article.originalUrl, false)
    && isHttpUrl(article.normalizedUrl, true)
    && isNullableText(article.externalId)
    && isRequiredText(article.title)
    && isNullableText(article.subtitle)
    && isNullableText(article.summary)
    && isNullableText(article.author)
    && isNullableTimestamp(article.publishedAt)
    && isNullableTimestamp(article.modifiedAt)
    && isTimestamp(article.detectedAt)
    && (article.imageUrl === null || isHttpUrl(article.imageUrl, false))
    && typeof article.processingStatus === "string"
    && processingStatuses.has(article.processingStatus as ArticleProcessingStatus)
    && isRequiredText(snapshot.contentHash)
    && isArticleBody(snapshot.body)
    && isSourceMetadata(snapshot.sourceMetadata)
    && isTimestamp(snapshot.extractedAt)
  );
}

function failure(
  code: NewsroomPersistenceErrorCode,
  stage: FailureStage,
  article: NewsroomArticleWriteOutcome | null = null,
): PersistNewsroomArticleResult {
  const messages: Record<NewsroomPersistenceErrorCode, string> = {
    input_invalid: "Os dados normalizados fornecidos são inválidos.",
    source_not_found: "A fonte indicada não está registada.",
    article_write_failed: "Não foi possível persistir o artigo.",
    snapshot_write_failed: "Não foi possível persistir o snapshot.",
    persistence_conflict: "A persistência encontrou um conflito não idempotente.",
    persistence_unavailable: "A persistência não está disponível neste momento.",
  };

  return {
    ok: false,
    error: {
      code,
      stage,
      message: messages[code],
      article,
      operationIncomplete: stage === "snapshot" && article !== null,
    },
  };
}

function databaseFailure(
  transport: NewsroomPersistenceTransport,
  error: unknown,
  fallbackCode: "article_write_failed" | "snapshot_write_failed",
  stage: "article" | "snapshot",
  article: NewsroomArticleWriteOutcome | null = null,
): PersistNewsroomArticleResult {
  return failure(
    transport.isUnavailableError(error) ? "persistence_unavailable" : fallbackCode,
    stage,
    article,
  );
}

function isArticleRow(value: unknown): value is NewsroomArticleRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isRequiredText(value.id)
    && isRequiredText(value.source_code)
    && isRequiredText(value.original_url)
    && isRequiredText(value.normalized_url)
    && isNullableText(value.external_id)
    && isRequiredText(value.title)
    && isNullableText(value.subtitle)
    && isNullableText(value.summary)
    && isNullableText(value.author)
    && isNullableTimestamp(value.published_at)
    && isNullableTimestamp(value.modified_at)
    && isTimestamp(value.detected_at)
    && (value.image_url === null || isHttpUrl(value.image_url, false))
    && typeof value.processing_status === "string"
    && isTimestamp(value.first_detected_at)
    && isTimestamp(value.last_detected_at)
    && isTimestamp(value.created_at)
    && isTimestamp(value.updated_at)
  );
}

function isSnapshotRow(value: unknown): value is NewsroomSnapshotRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isRequiredText(value.id)
    && isRequiredText(value.article_id)
    && isRequiredText(value.content_hash)
    && Array.isArray(value.body)
    && isRecord(value.source_metadata)
    && isTimestamp(value.extracted_at)
    && isTimestamp(value.created_at)
  );
}

function articleInsertBody(
  input: PersistNewsroomArticleInput,
): Record<string, unknown> {
  const { article } = input;
  return {
    source_code: article.sourceCode,
    original_url: article.originalUrl,
    normalized_url: article.normalizedUrl,
    external_id: article.externalId,
    title: article.title,
    subtitle: article.subtitle,
    summary: article.summary,
    author: article.author,
    published_at: article.publishedAt,
    modified_at: article.modifiedAt,
    detected_at: article.detectedAt,
    image_url: article.imageUrl,
    processing_status: article.processingStatus,
    first_detected_at: article.detectedAt,
    last_detected_at: article.detectedAt,
  };
}

function articleIdentityPath(input: PersistNewsroomArticleInput): string {
  return (
    `newsroom_articles?select=${ARTICLE_SELECT}`
    + `&source_code=eq.${encodeURIComponent(input.article.sourceCode)}`
    + `&normalized_url=eq.${encodeURIComponent(input.article.normalizedUrl)}`
    + "&limit=1"
  );
}

function setChangedValue(
  patch: Record<string, unknown>,
  key: string,
  currentValue: unknown,
  nextValue: unknown,
): void {
  if (currentValue !== nextValue) {
    patch[key] = nextValue;
  }
}

function articleMetadataPatch(
  existing: NewsroomArticleRow,
  input: PersistNewsroomArticleInput,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const { article } = input;

  if (existing.external_id === null && article.externalId !== null) {
    patch.external_id = article.externalId;
  }

  if (Date.parse(article.detectedAt) < Date.parse(existing.last_detected_at)) {
    return patch;
  }

  setChangedValue(patch, "title", existing.title, article.title);
  setChangedValue(patch, "subtitle", existing.subtitle, article.subtitle);
  setChangedValue(patch, "summary", existing.summary, article.summary);
  setChangedValue(patch, "author", existing.author, article.author);
  setChangedValue(patch, "published_at", existing.published_at, article.publishedAt);
  setChangedValue(patch, "modified_at", existing.modified_at, article.modifiedAt);
  setChangedValue(patch, "detected_at", existing.detected_at, article.detectedAt);
  setChangedValue(patch, "image_url", existing.image_url, article.imageUrl);
  setChangedValue(
    patch,
    "processing_status",
    existing.processing_status,
    article.processingStatus,
  );
  setChangedValue(
    patch,
    "last_detected_at",
    existing.last_detected_at,
    article.detectedAt,
  );
  return patch;
}

async function persistArticle(
  input: PersistNewsroomArticleInput,
  transport: NewsroomPersistenceTransport,
): Promise<
  OperationResult<NewsroomArticleWriteOutcome, NewsroomPersistenceError>
> {
  let insertedRows: NewsroomArticleRow[];
  try {
    insertedRows = await transport.writeRows<NewsroomArticleRow>(
      `newsroom_articles?on_conflict=source_code,normalized_url&select=${ARTICLE_SELECT}`,
      {
        method: "POST",
        headers: {
          Prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify(articleInsertBody(input)),
      },
    );
  } catch (error) {
    return databaseFailure(
      transport,
      error,
      "article_write_failed",
      "article",
    ) as OperationResult<never, NewsroomPersistenceError>;
  }

  if (insertedRows.length > 1) {
    return failure(
      "persistence_conflict",
      "article",
    ) as OperationResult<never, NewsroomPersistenceError>;
  }

  if (insertedRows.length === 1) {
    const inserted = insertedRows[0];
    if (
      !isArticleRow(inserted)
      || inserted.source_code !== input.article.sourceCode
      || inserted.normalized_url !== input.article.normalizedUrl
    ) {
      return failure(
        "article_write_failed",
        "article",
      ) as OperationResult<never, NewsroomPersistenceError>;
    }

    return {
      ok: true,
      value: {
        id: inserted.id,
        action: "created",
      },
    };
  }

  let existingRows: NewsroomArticleRow[];
  try {
    existingRows = await transport.readRows<NewsroomArticleRow>(
      articleIdentityPath(input),
    );
  } catch (error) {
    return databaseFailure(
      transport,
      error,
      "article_write_failed",
      "article",
    ) as OperationResult<never, NewsroomPersistenceError>;
  }

  const existing = existingRows[0];
  if (
    existingRows.length !== 1
    || !isArticleRow(existing)
    || existing.source_code !== input.article.sourceCode
    || existing.normalized_url !== input.article.normalizedUrl
  ) {
    return failure(
      "persistence_conflict",
      "article",
    ) as OperationResult<never, NewsroomPersistenceError>;
  }

  if (
    existing.external_id !== null
    && input.article.externalId !== null
    && existing.external_id !== input.article.externalId
  ) {
    return failure(
      "persistence_conflict",
      "article",
    ) as OperationResult<never, NewsroomPersistenceError>;
  }

  const patch = articleMetadataPatch(existing, input);
  if (Object.keys(patch).length === 0) {
    return {
      ok: true,
      value: {
        id: existing.id,
        action: "reused",
      },
    };
  }

  let updatedRows: NewsroomArticleRow[];
  try {
    updatedRows = await transport.writeRows<NewsroomArticleRow>(
      `newsroom_articles?select=${ARTICLE_SELECT}`
      + `&id=eq.${encodeURIComponent(existing.id)}`
      + `&source_code=eq.${encodeURIComponent(existing.source_code)}`
      + `&normalized_url=eq.${encodeURIComponent(existing.normalized_url)}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(patch),
      },
    );
  } catch (error) {
    return databaseFailure(
      transport,
      error,
      "article_write_failed",
      "article",
    ) as OperationResult<never, NewsroomPersistenceError>;
  }

  const updated = updatedRows[0];
  if (
    updatedRows.length !== 1
    || !isArticleRow(updated)
    || updated.id !== existing.id
    || updated.source_code !== existing.source_code
    || updated.normalized_url !== existing.normalized_url
  ) {
    return failure(
      "persistence_conflict",
      "article",
    ) as OperationResult<never, NewsroomPersistenceError>;
  }

  return {
    ok: true,
    value: {
      id: updated.id,
      action: "updated",
    },
  };
}

function snapshotIdentityPath(
  articleId: string,
  contentHash: string,
): string {
  return (
    `newsroom_article_snapshots?select=${SNAPSHOT_SELECT}`
    + `&article_id=eq.${encodeURIComponent(articleId)}`
    + `&content_hash=eq.${encodeURIComponent(contentHash)}`
    + "&limit=1"
  );
}

async function persistSnapshot(
  input: PersistNewsroomArticleInput,
  article: NewsroomArticleWriteOutcome,
  transport: NewsroomPersistenceTransport,
): Promise<
  OperationResult<NewsroomSnapshotWriteOutcome, NewsroomPersistenceError>
> {
  let insertedRows: NewsroomSnapshotRow[];
  try {
    insertedRows = await transport.writeRows<NewsroomSnapshotRow>(
      `newsroom_article_snapshots?on_conflict=article_id,content_hash&select=${SNAPSHOT_SELECT}`,
      {
        method: "POST",
        headers: {
          Prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify({
          article_id: article.id,
          content_hash: input.snapshot.contentHash,
          body: input.snapshot.body,
          source_metadata: input.snapshot.sourceMetadata,
          extracted_at: input.snapshot.extractedAt,
        }),
      },
    );
  } catch (error) {
    return databaseFailure(
      transport,
      error,
      "snapshot_write_failed",
      "snapshot",
      article,
    ) as OperationResult<never, NewsroomPersistenceError>;
  }

  if (insertedRows.length > 1) {
    return failure(
      "persistence_conflict",
      "snapshot",
      article,
    ) as OperationResult<never, NewsroomPersistenceError>;
  }

  if (insertedRows.length === 1) {
    const inserted = insertedRows[0];
    if (
      !isSnapshotRow(inserted)
      || inserted.article_id !== article.id
      || inserted.content_hash !== input.snapshot.contentHash
    ) {
      return failure(
        "snapshot_write_failed",
        "snapshot",
        article,
      ) as OperationResult<never, NewsroomPersistenceError>;
    }

    return {
      ok: true,
      value: {
        id: inserted.id,
        action: "created",
      },
    };
  }

  let existingRows: NewsroomSnapshotRow[];
  try {
    existingRows = await transport.readRows<NewsroomSnapshotRow>(
      snapshotIdentityPath(article.id, input.snapshot.contentHash),
    );
  } catch (error) {
    return databaseFailure(
      transport,
      error,
      "snapshot_write_failed",
      "snapshot",
      article,
    ) as OperationResult<never, NewsroomPersistenceError>;
  }

  const existing = existingRows[0];
  if (
    existingRows.length !== 1
    || !isSnapshotRow(existing)
    || existing.article_id !== article.id
    || existing.content_hash !== input.snapshot.contentHash
  ) {
    return failure(
      "persistence_conflict",
      "snapshot",
      article,
    ) as OperationResult<never, NewsroomPersistenceError>;
  }

  return {
    ok: true,
    value: {
      id: existing.id,
      action: "reused",
    },
  };
}

export function createNewsroomArticlePersistence(
  transport: NewsroomPersistenceTransport,
): (
  input: PersistNewsroomArticleInput,
) => Promise<PersistNewsroomArticleResult> {
  return async (input) => {
    if (!isValidInput(input)) {
      return failure("input_invalid", "validation");
    }

    if (!findRegisteredSource(input.article.sourceCode)) {
      return failure("source_not_found", "validation");
    }

    if (!transport.isConfigured()) {
      return failure("persistence_unavailable", "article");
    }

    const articleResult = await persistArticle(input, transport);
    if (!articleResult.ok) {
      return articleResult;
    }

    const snapshotResult = await persistSnapshot(
      input,
      articleResult.value,
      transport,
    );
    if (!snapshotResult.ok) {
      return snapshotResult;
    }

    return {
      ok: true,
      value: {
        complete: true,
        article: articleResult.value,
        snapshot: snapshotResult.value,
      },
    };
  };
}
