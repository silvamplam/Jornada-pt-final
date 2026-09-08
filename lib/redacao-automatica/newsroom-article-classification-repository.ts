import "server-only";

import {
  isArticleClassificationKey,
} from "@/lib/editorial-classifications";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  readNewsroomArticleClassificationRowsByIds,
} from "@/lib/redacao-automatica/newsroom-article-classification-read-internal";
import {
  isNewsroomArticleClassificationSource,
  isNewsroomArticleClassificationUuid,
  type NewsroomArticleClassification,
  type NewsroomArticleClassificationState,
} from "@/lib/redacao-automatica/newsroom-article-classification-service-internal";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_BATCH_SIZE = 1000;

type ClassificationRow = Readonly<{
  newsroom_article_id: string;
  classification_key: string;
  classification_source: string;
  classified_at: string;
  updated_at: string;
}>;

type ClassificationStateRpcRow = Readonly<{
  newsroom_article_id: string;
  classification_key: string | null;
  classification_source: string | null;
  classified_at: string | null;
  updated_at: string | null;
  classified: boolean;
}>;

export type NewsroomArticleClassificationReadErrorCode =
  | "invalid_request"
  | "not_configured"
  | "relation_invalid"
  | "read_unavailable";

export type NewsroomArticleClassificationRepositoryResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: NewsroomArticleClassificationReadErrorCode;
        message: string;
      }>;
    }>;

export type ListNewsroomArticleClassificationsInput = Readonly<{
  classificationKey: string;
  limit?: number;
  offset?: number;
}>;

export type NewsroomArticleClassificationPage = Readonly<{
  items: readonly NewsroomArticleClassification[];
  limit: number;
  offset: number;
  hasNextPage: boolean;
}>;

function failure<T>(
  code: NewsroomArticleClassificationReadErrorCode,
): NewsroomArticleClassificationRepositoryResult<T> {
  const messages: Readonly<
    Record<NewsroomArticleClassificationReadErrorCode, string>
  > = {
    invalid_request: "Os filtros de classificação editorial são inválidos.",
    not_configured: "O acesso administrativo à base de dados não está configurado.",
    relation_invalid: "Uma classificação editorial persistida é inválida.",
    read_unavailable: "Não foi possível ler as classificações editoriais.",
  };
  return { ok: false, error: { code, message: messages[code] } };
}

function classificationFromRow(
  row: ClassificationRow,
): NewsroomArticleClassification | null {
  if (
    !isNewsroomArticleClassificationUuid(row.newsroom_article_id)
    || !isArticleClassificationKey(row.classification_key)
    || !isNewsroomArticleClassificationSource(row.classification_source)
    || !row.classified_at
    || !row.updated_at
  ) {
    return null;
  }

  return {
    newsroomArticleId: row.newsroom_article_id,
    classificationKey: row.classification_key,
    classificationSource: row.classification_source,
    classifiedAt: row.classified_at,
    updatedAt: row.updated_at,
  };
}

function stateFromRpcRow(
  row: ClassificationStateRpcRow,
  expectedArticleId: string,
): NewsroomArticleClassificationState | null {
  if (
    row.newsroom_article_id !== expectedArticleId
    || !isNewsroomArticleClassificationUuid(row.newsroom_article_id)
    || typeof row.classified !== "boolean"
  ) {
    return null;
  }
  if (!row.classified) {
    return row.classification_key === null
      && row.classification_source === null
      && row.classified_at === null
      && row.updated_at === null
      ? { status: "unclassified", classification: null }
      : null;
  }

  if (
    row.classification_key === null
    || row.classification_source === null
    || row.classified_at === null
    || row.updated_at === null
  ) {
    return null;
  }
  const classification = classificationFromRow({
    newsroom_article_id: row.newsroom_article_id,
    classification_key: row.classification_key,
    classification_source: row.classification_source,
    classified_at: row.classified_at,
    updated_at: row.updated_at,
  });
  return classification
    ? { status: "classified", classification }
    : null;
}

function validPagination(
  input: ListNewsroomArticleClassificationsInput,
): Readonly<{ limit: number; offset: number }> | null {
  const limit = input.limit ?? DEFAULT_PAGE_SIZE;
  const offset = input.offset ?? 0;
  return Number.isInteger(limit)
    && limit >= 1
    && limit <= MAX_PAGE_SIZE
    && Number.isInteger(offset)
    && offset >= 0
    ? { limit, offset }
    : null;
}

function normalizedArticleIds(
  articleIds: readonly string[],
): readonly string[] | null {
  if (!Array.isArray(articleIds) || articleIds.length > MAX_BATCH_SIZE) {
    return null;
  }

  if (articleIds.some((value) => typeof value !== "string")) {
    return null;
  }
  const normalized = articleIds.map((value) => value.trim().toLowerCase());
  if (normalized.some((value) => !isNewsroomArticleClassificationUuid(value))) {
    return null;
  }
  return new Set(normalized).size === normalized.length ? normalized : null;
}

export async function getNewsroomArticleClassification(
  newsroomArticleId: string | null | undefined,
): Promise<
  NewsroomArticleClassificationRepositoryResult<
    NewsroomArticleClassificationState
  >
> {
  const normalized = newsroomArticleId?.trim().toLowerCase() ?? "";
  const result = await getNewsroomArticleClassificationsByIds([normalized]);
  if (!result.ok) return result;
  return { ok: true, value: result.value[0] };
}

export async function getNewsroomArticleClassificationsByIds(
  articleIds: readonly string[],
): Promise<
  NewsroomArticleClassificationRepositoryResult<
    readonly NewsroomArticleClassificationState[]
  >
> {
  const normalizedIds = normalizedArticleIds(articleIds);
  if (!normalizedIds) {
    return failure("invalid_request");
  }
  if (normalizedIds.length === 0) {
    return { ok: true, value: [] };
  }
  if (!getSupabaseServiceConfig()) {
    return failure("not_configured");
  }

  try {
    const rows = await readNewsroomArticleClassificationRowsByIds<
      ClassificationStateRpcRow
    >(
      async <T>(chunk: readonly string[]) => (
        writeSupabaseAdminReturning<T>(
          "rpc/newsroom_read_article_classification_states_v1",
          {
            method: "POST",
            body: JSON.stringify({ p_newsroom_article_ids: chunk }),
          },
        )
      ),
      normalizedIds,
    );
    const states = rows.map((row, index) => (
      stateFromRpcRow(row, normalizedIds[index] ?? "")
    ));
    if (states.some((state) => state === null)) {
      return failure("relation_invalid");
    }

    return {
      ok: true,
      value: states as readonly NewsroomArticleClassificationState[],
    };
  } catch {
    return failure("read_unavailable");
  }
}

export async function listNewsroomArticleClassifications(
  input: ListNewsroomArticleClassificationsInput,
): Promise<
  NewsroomArticleClassificationRepositoryResult<
    NewsroomArticleClassificationPage
  >
> {
  const pagination = validPagination(input);
  if (!isArticleClassificationKey(input.classificationKey) || !pagination) {
    return failure("invalid_request");
  }
  if (!getSupabaseServiceConfig()) {
    return failure("not_configured");
  }

  try {
    const rows = await fetchSupabaseAdminTable<ClassificationRow>(
      "newsroom_editorial_article_classifications"
      + "?select=newsroom_article_id,classification_key,classification_source,classified_at,updated_at"
      + `&classification_key=eq.${encodeURIComponent(input.classificationKey)}`
      + "&order=classified_at.desc,newsroom_article_id.asc"
      + `&limit=${pagination.limit + 1}&offset=${pagination.offset}`,
    );
    const parsed = rows.map(classificationFromRow);
    if (parsed.some((classification) => classification === null)) {
      return failure("relation_invalid");
    }

    return {
      ok: true,
      value: {
        items: (parsed as NewsroomArticleClassification[]).slice(
          0,
          pagination.limit,
        ),
        limit: pagination.limit,
        offset: pagination.offset,
        hasNextPage: rows.length > pagination.limit,
      },
    };
  } catch {
    return failure("read_unavailable");
  }
}
