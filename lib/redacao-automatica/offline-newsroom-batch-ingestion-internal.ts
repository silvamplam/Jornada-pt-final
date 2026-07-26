import type {
  IngestOfflineNewsroomArticleInput,
  IngestOfflineNewsroomArticleResult,
} from "@/lib/redacao-automatica/offline-newsroom-ingestion-internal";
import type { OperationResult } from "@/lib/redacao-automatica/types";

export const OFFLINE_NEWSROOM_BATCH_MAX_ITEMS = 25;

const BATCH_INPUT_KEYS = ["items"] as const;
const BATCH_ITEM_KEYS = [
  "itemId",
  "sourceCode",
  "originalUrl",
  "html",
  "detectedAt",
] as const;
const BATCH_ITEM_KEYS_WITH_EXTRACTION = [
  ...BATCH_ITEM_KEYS,
  "extractedAt",
] as const;

export type OfflineNewsroomBatchItem = Readonly<
  { itemId: string } & IngestOfflineNewsroomArticleInput
>;

export type OfflineNewsroomBatchInput = Readonly<{
  items: readonly OfflineNewsroomBatchItem[];
}>;

export type OfflineNewsroomBatchErrorCode =
  | "batch_input_invalid"
  | "batch_too_large";

export type OfflineNewsroomBatchError = Readonly<{
  code: OfflineNewsroomBatchErrorCode;
  operationIncomplete: false;
}>;

export type OfflineNewsroomBatchUnexpectedItemError = Readonly<{
  code: "unexpected_item_failure";
  stage: "orchestration";
  message: string;
  sourceCode: string | null;
  persistenceCode: null;
  operationIncomplete: false;
}>;

export type OfflineNewsroomBatchItemIngestionResult =
  | IngestOfflineNewsroomArticleResult
  | Readonly<{
      ok: false;
      error: OfflineNewsroomBatchUnexpectedItemError;
    }>;

export type OfflineNewsroomBatchItemResult = Readonly<{
  itemId: string;
  index: number;
  sourceCode: string | null;
  originalUrl: string | null;
  operationIncomplete: false;
  ingestion: OfflineNewsroomBatchItemIngestionResult;
}>;

export type OfflineNewsroomBatchSuccess = Readonly<{
  complete: true;
  total: number;
  succeeded: number;
  failed: number;
  createdArticles: number;
  reusedArticles: number;
  updatedArticles: number;
  createdSnapshots: number;
  reusedSnapshots: number;
  items: readonly OfflineNewsroomBatchItemResult[];
}>;

export type IngestOfflineNewsroomBatchResult = OperationResult<
  OfflineNewsroomBatchSuccess,
  OfflineNewsroomBatchError
>;

type OfflineNewsroomBatchDependencies = Readonly<{
  ingestArticle(
    input: IngestOfflineNewsroomArticleInput,
  ): Promise<IngestOfflineNewsroomArticleResult>;
}>;

type ValidatedBatchItem = Readonly<Record<string, unknown>> & Readonly<{
  itemId: string;
}>;

type BatchValidationResult =
  | Readonly<{
      ok: true;
      items: readonly ValidatedBatchItem[];
    }>
  | Readonly<{
      ok: false;
      code: OfflineNewsroomBatchErrorCode;
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

function isValidItemId(value: unknown): value is string {
  return (
    typeof value === "string"
    && value.length > 0
    && value === value.trim()
  );
}

function validateBatchInput(value: unknown): BatchValidationResult {
  if (!isRecord(value) || !hasExactKeys(value, BATCH_INPUT_KEYS)) {
    return { ok: false, code: "batch_input_invalid" };
  }

  if (!Array.isArray(value.items) || value.items.length === 0) {
    return { ok: false, code: "batch_input_invalid" };
  }

  if (value.items.length > OFFLINE_NEWSROOM_BATCH_MAX_ITEMS) {
    return { ok: false, code: "batch_too_large" };
  }

  const itemIds = new Set<string>();
  const items: ValidatedBatchItem[] = [];

  for (const candidate of value.items) {
    if (!isRecord(candidate)) {
      return { ok: false, code: "batch_input_invalid" };
    }

    const hasExtractionTime = Object.hasOwn(candidate, "extractedAt");
    if (
      !hasExactKeys(
        candidate,
        hasExtractionTime
          ? BATCH_ITEM_KEYS_WITH_EXTRACTION
          : BATCH_ITEM_KEYS,
      )
      || !isValidItemId(candidate.itemId)
      || itemIds.has(candidate.itemId)
    ) {
      return { ok: false, code: "batch_input_invalid" };
    }

    itemIds.add(candidate.itemId);
    items.push(candidate as ValidatedBatchItem);
  }

  return { ok: true, items };
}

function articleInput(
  item: ValidatedBatchItem,
): IngestOfflineNewsroomArticleInput {
  const input = Object.hasOwn(item, "extractedAt")
    ? {
        sourceCode: item.sourceCode,
        originalUrl: item.originalUrl,
        html: item.html,
        detectedAt: item.detectedAt,
        extractedAt: item.extractedAt,
      }
    : {
        sourceCode: item.sourceCode,
        originalUrl: item.originalUrl,
        html: item.html,
        detectedAt: item.detectedAt,
      };

  return input as IngestOfflineNewsroomArticleInput;
}

function safeSourceCode(value: unknown): string | null {
  return (
    typeof value === "string"
    && value.length > 0
    && value === value.trim()
  )
    ? value
    : null;
}

function safeOriginalUrl(value: unknown): string | null {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
  ) {
    return null;
  }

  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:")
      && !url.username
      && !url.password
      && Boolean(url.hostname)
    )
      ? value
      : null;
  } catch {
    return null;
  }
}

function unexpectedItemFailure(
  sourceCode: string | null,
): OfflineNewsroomBatchItemIngestionResult {
  return {
    ok: false,
    error: {
      code: "unexpected_item_failure",
      stage: "orchestration",
      message: "A ingestao do item falhou de forma inesperada.",
      sourceCode,
      persistenceCode: null,
      operationIncomplete: false,
    },
  };
}

function batchFailure(
  code: OfflineNewsroomBatchErrorCode,
): IngestOfflineNewsroomBatchResult {
  return {
    ok: false,
    error: {
      code,
      operationIncomplete: false,
    },
  };
}

function summarize(
  items: readonly OfflineNewsroomBatchItemResult[],
): OfflineNewsroomBatchSuccess {
  let succeeded = 0;
  let failed = 0;
  let createdArticles = 0;
  let reusedArticles = 0;
  let updatedArticles = 0;
  let createdSnapshots = 0;
  let reusedSnapshots = 0;

  for (const item of items) {
    if (!item.ingestion.ok) {
      failed += 1;
      continue;
    }

    succeeded += 1;

    switch (item.ingestion.value.article.action) {
      case "created":
        createdArticles += 1;
        break;
      case "reused":
        reusedArticles += 1;
        break;
      case "updated":
        updatedArticles += 1;
        break;
    }

    switch (item.ingestion.value.snapshot.action) {
      case "created":
        createdSnapshots += 1;
        break;
      case "reused":
        reusedSnapshots += 1;
        break;
    }
  }

  return {
    complete: true,
    total: items.length,
    succeeded,
    failed,
    createdArticles,
    reusedArticles,
    updatedArticles,
    createdSnapshots,
    reusedSnapshots,
    items,
  };
}

export function createOfflineNewsroomBatchIngestion(
  dependencies: OfflineNewsroomBatchDependencies,
): (
  input: OfflineNewsroomBatchInput,
) => Promise<IngestOfflineNewsroomBatchResult> {
  return async (rawInput) => {
    const validation = validateBatchInput(rawInput);
    if (!validation.ok) {
      return batchFailure(validation.code);
    }

    const results: OfflineNewsroomBatchItemResult[] = [];

    for (let index = 0; index < validation.items.length; index += 1) {
      const item = validation.items[index];
      const sourceCode = safeSourceCode(item.sourceCode);
      const originalUrl = safeOriginalUrl(item.originalUrl);
      let ingestion: OfflineNewsroomBatchItemIngestionResult;

      try {
        ingestion = await dependencies.ingestArticle(articleInput(item));
      } catch {
        ingestion = unexpectedItemFailure(sourceCode);
      }

      results.push({
        itemId: item.itemId,
        index,
        sourceCode,
        originalUrl,
        operationIncomplete: false,
        ingestion,
      });
    }

    return {
      ok: true,
      value: summarize(results),
    };
  };
}
