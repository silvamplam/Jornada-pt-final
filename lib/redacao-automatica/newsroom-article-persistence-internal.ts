import { findRegisteredSource } from "@/lib/redacao-automatica/source-registry";
import type {
  ArticleBodyBlock,
  ArticleProcessingStatus,
  JsonObject,
  JsonValue,
  OperationResult,
} from "@/lib/redacao-automatica/types";

export const NEWSROOM_PERSISTENCE_RPC_NAME =
  "newsroom_persist_article_snapshot";

const TIMESTAMPTZ_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
const rpcResultKeys = [
  "article_id",
  "snapshot_id",
  "article_action",
  "snapshot_action",
] as const;

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

export type NewsroomPersistenceRpcArguments = Readonly<{
  p_source_code: string;
  p_original_url: string;
  p_normalized_url: string;
  p_external_id: string | null;
  p_title: string;
  p_subtitle: string | null;
  p_summary: string | null;
  p_author: string | null;
  p_published_at: string | null;
  p_modified_at: string | null;
  p_detected_at: string;
  p_image_url: string | null;
  p_processing_status: ArticleProcessingStatus;
  p_content_hash: string;
  p_body: readonly ArticleBodyBlock[];
  p_source_metadata: JsonObject;
  p_extracted_at: string;
}>;

export interface NewsroomPersistenceTransport {
  isConfigured(): boolean;
  executeRpc(
    functionName: string,
    argumentsValue: NewsroomPersistenceRpcArguments,
  ): Promise<unknown>;
}

type NewsroomPersistenceRpcRow = Readonly<{
  article_id: string;
  snapshot_id: string;
  article_action: NewsroomArticleWriteOutcome["action"];
  snapshot_action: NewsroomSnapshotWriteOutcome["action"];
}>;

type ControlledRpcError = Readonly<{
  code: "input_invalid" | "source_not_found" | "persistence_conflict";
  detail: string | null;
}>;

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

  if (typeof value !== "object") {
    return false;
  }

  if (ancestors.has(value)) {
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
    && processingStatuses.has(
      article.processingStatus as ArticleProcessingStatus,
    )
    && isRequiredText(snapshot.contentHash)
    && isArticleBody(snapshot.body)
    && isSourceMetadata(snapshot.sourceMetadata)
    && isTimestamp(snapshot.extractedAt)
  );
}

function failure(
  code: NewsroomPersistenceErrorCode,
  stage: NewsroomPersistenceError["stage"],
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
      article: null,
      operationIncomplete: false,
    },
  };
}

function rpcArguments(
  input: PersistNewsroomArticleInput,
): NewsroomPersistenceRpcArguments {
  return {
    p_source_code: input.article.sourceCode,
    p_original_url: input.article.originalUrl,
    p_normalized_url: input.article.normalizedUrl,
    p_external_id: input.article.externalId,
    p_title: input.article.title,
    p_subtitle: input.article.subtitle,
    p_summary: input.article.summary,
    p_author: input.article.author,
    p_published_at: input.article.publishedAt,
    p_modified_at: input.article.modifiedAt,
    p_detected_at: input.article.detectedAt,
    p_image_url: input.article.imageUrl,
    p_processing_status: input.article.processingStatus,
    p_content_hash: input.snapshot.contentHash,
    p_body: input.snapshot.body,
    p_source_metadata: input.snapshot.sourceMetadata,
    p_extracted_at: input.snapshot.extractedAt,
  };
}

function isRpcRow(value: unknown): value is NewsroomPersistenceRpcRow {
  if (!isRecord(value) || !hasExactKeys(value, rpcResultKeys)) {
    return false;
  }

  return (
    typeof value.article_id === "string"
    && UUID_PATTERN.test(value.article_id)
    && typeof value.snapshot_id === "string"
    && UUID_PATTERN.test(value.snapshot_id)
    && (
      value.article_action === "created"
      || value.article_action === "reused"
      || value.article_action === "updated"
    )
    && (
      value.snapshot_action === "created"
      || value.snapshot_action === "reused"
    )
  );
}

function rpcRow(value: unknown): NewsroomPersistenceRpcRow | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRpcRow(value[0])) {
    return null;
  }

  return value[0];
}

function errorPayload(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }

  try {
    return JSON.parse(error.message) as unknown;
  } catch {
    return { message: error.message };
  }
}

function controlledRpcError(error: unknown): ControlledRpcError | null {
  const payload = errorPayload(error);
  if (!isRecord(payload) || typeof payload.message !== "string") {
    return null;
  }

  if (
    payload.message !== "input_invalid"
    && payload.message !== "source_not_found"
    && payload.message !== "persistence_conflict"
  ) {
    return null;
  }

  return {
    code: payload.message,
    detail: typeof payload.details === "string"
      ? payload.details
      : typeof payload.detail === "string"
        ? payload.detail
        : null,
  };
}

function controlledFailure(error: ControlledRpcError): PersistNewsroomArticleResult {
  if (error.code === "input_invalid" || error.code === "source_not_found") {
    return failure(error.code, "validation");
  }

  return failure(
    "persistence_conflict",
    error.detail === "snapshot" ? "snapshot" : "article",
  );
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

    let rawResult: unknown;
    try {
      rawResult = await transport.executeRpc(
        NEWSROOM_PERSISTENCE_RPC_NAME,
        rpcArguments(input),
      );
    } catch (error) {
      const controlled = controlledRpcError(error);
      return controlled
        ? controlledFailure(controlled)
        : failure("persistence_unavailable", "article");
    }

    const persisted = rpcRow(rawResult);
    if (!persisted) {
      return failure("persistence_unavailable", "article");
    }

    return {
      ok: true,
      value: {
        complete: true,
        article: {
          id: persisted.article_id,
          action: persisted.article_action,
        },
        snapshot: {
          id: persisted.snapshot_id,
          action: persisted.snapshot_action,
        },
      },
    };
  };
}
