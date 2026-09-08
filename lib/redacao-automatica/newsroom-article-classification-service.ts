import "server-only";

import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";
import {
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  applyAutomaticNewsroomArticleClassificationService,
  clearNewsroomArticleClassificationService,
  isNewsroomArticleClassificationSource,
  isNewsroomArticleClassificationUuid,
  setManualNewsroomArticleClassificationService,
  type NewsroomArticleClassification,
  type NewsroomArticleClassificationErrorCode,
  type NewsroomArticleClassificationMutation,
  type NewsroomArticleClassificationState,
  type NewsroomArticleClassificationTransport,
} from "@/lib/redacao-automatica/newsroom-article-classification-service-internal";

export type {
  ClearNewsroomArticleClassificationInput,
  NewsroomArticleClassification,
  NewsroomArticleClassificationErrorCode,
  NewsroomArticleClassificationMutation,
  NewsroomArticleClassificationServiceResult,
  NewsroomArticleClassificationSource,
  NewsroomArticleClassificationState,
  SetNewsroomArticleClassificationInput,
} from "@/lib/redacao-automatica/newsroom-article-classification-service-internal";

type ClassificationRpcRow = Readonly<{
  newsroom_article_id: string;
  classification_key: string | null;
  classification_source: string | null;
  classified_at: string | null;
  updated_at: string | null;
  classified: boolean;
  applied: boolean;
  changed: boolean;
}>;

function classifiedState(
  row: ClassificationRpcRow,
): NewsroomArticleClassificationState | null {
  if (!row.classified) {
    return row.classification_key === null
      && row.classification_source === null
      && row.classified_at === null
      && row.updated_at === null
      ? { status: "unclassified", classification: null }
      : null;
  }

  if (
    !isArticleClassificationKey(row.classification_key)
    || !isNewsroomArticleClassificationSource(row.classification_source)
    || !row.classified_at
    || !row.updated_at
  ) {
    return null;
  }

  const classification: NewsroomArticleClassification = {
    newsroomArticleId: row.newsroom_article_id,
    classificationKey: row.classification_key,
    classificationSource: row.classification_source,
    classifiedAt: row.classified_at,
    updatedAt: row.updated_at,
  };
  return { status: "classified", classification };
}

function mutationFromRpcRow(
  row: ClassificationRpcRow | undefined,
  expectedArticleId: string,
): NewsroomArticleClassificationMutation {
  if (
    !row
    || row.newsroom_article_id !== expectedArticleId
    || !isNewsroomArticleClassificationUuid(row.newsroom_article_id)
    || typeof row.classified !== "boolean"
    || typeof row.applied !== "boolean"
    || typeof row.changed !== "boolean"
  ) {
    throw new Error("newsroom_article_classification_relation_invalid");
  }

  const state = classifiedState(row);
  if (!state) {
    throw new Error("newsroom_article_classification_relation_invalid");
  }

  return {
    newsroomArticleId: row.newsroom_article_id,
    state,
    applied: row.applied,
    changed: row.changed,
  };
}

function classifyRpcError(
  error: unknown,
): NewsroomArticleClassificationErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  const knownErrors: ReadonlyArray<
    readonly [string, NewsroomArticleClassificationErrorCode]
  > = [
    ["newsroom_article_classification_source_not_found", "source_not_found"],
    ["newsroom_article_classification_relation_invalid", "relation_invalid"],
    ["newsroom_editorial_article_classifications_key_check", "invalid_request"],
    ["newsroom_editorial_article_classifications_source_check", "invalid_request"],
    ["newsroom_article_classification_invalid_input", "invalid_request"],
  ];

  return knownErrors.find(([code]) => message.includes(code))?.[1]
    ?? "persistence_failed";
}

async function writeClassificationRpc(
  functionName: string,
  newsroomArticleId: string,
  classificationKey?: ArticleClassificationKey,
): Promise<NewsroomArticleClassificationMutation> {
  const rows = await writeSupabaseAdminReturning<ClassificationRpcRow>(
    `rpc/${functionName}`,
    {
      method: "POST",
      body: JSON.stringify({
        p_newsroom_article_id: newsroomArticleId,
        ...(classificationKey
          ? { p_classification_key: classificationKey }
          : {}),
      }),
    },
  );

  return mutationFromRpcRow(rows[0], newsroomArticleId);
}

const transport: NewsroomArticleClassificationTransport = {
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },
  applyAutomatic(newsroomArticleId, classificationKey) {
    return writeClassificationRpc(
      "newsroom_apply_automatic_article_classification_v1",
      newsroomArticleId,
      classificationKey,
    );
  },
  setManual(newsroomArticleId, classificationKey) {
    return writeClassificationRpc(
      "newsroom_set_manual_article_classification_v1",
      newsroomArticleId,
      classificationKey,
    );
  },
  clear(newsroomArticleId) {
    return writeClassificationRpc(
      "newsroom_clear_article_classification_v1",
      newsroomArticleId,
    );
  },
  classifyError: classifyRpcError,
};

const applyAutomatic =
  applyAutomaticNewsroomArticleClassificationService(transport);
const setManual = setManualNewsroomArticleClassificationService(transport);
const clear = clearNewsroomArticleClassificationService(transport);

export function applyAutomaticNewsroomArticleClassification(
  input: Parameters<typeof applyAutomatic>[0],
) {
  return applyAutomatic(input);
}

export function setManualNewsroomArticleClassification(
  input: Parameters<typeof setManual>[0],
) {
  return setManual(input);
}

export function clearNewsroomArticleClassification(
  input: Parameters<typeof clear>[0],
) {
  return clear(input);
}
