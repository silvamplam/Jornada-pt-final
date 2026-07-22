import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import type {
  ArticleBodyBlock,
  ArticleProcessingStatus,
  JsonObject,
  JsonValue,
} from "@/lib/redacao-automatica/types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const SUMMARY_PAGE_SIZE = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const processingStatuses = new Set<ArticleProcessingStatus>([
  "detected",
  "normalized",
  "duplicate",
  "rejected",
  "ready_for_review",
  "failed",
]);

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

type NewsroomArticleCountRow = Pick<NewsroomArticleRow, "id" | "processing_status">;

type NewsroomSnapshotRow = {
  id: string;
  article_id: string;
  content_hash: string;
  body: unknown;
  source_metadata: unknown;
  extracted_at: string;
  created_at: string;
};

export type NewsroomArticleSummary = Readonly<{
  id: string;
  sourceCode: string;
  title: string;
  author: string | null;
  publishedAt: string | null;
  detectedAt: string;
  lastDetectedAt: string;
  imageUrl: string | null;
  processingStatus: ArticleProcessingStatus;
}>;

export type NewsroomArticleSnapshot = Readonly<{
  id: string;
  articleId: string;
  contentHash: string;
  body: readonly ArticleBodyBlock[];
  sourceMetadata: JsonObject;
  extractedAt: string;
  createdAt: string;
}>;

export type NewsroomArticleDetail = NewsroomArticleSummary &
  Readonly<{
    originalUrl: string;
    normalizedUrl: string;
    externalId: string | null;
    subtitle: string | null;
    summary: string | null;
    modifiedAt: string | null;
    firstDetectedAt: string;
    createdAt: string;
    updatedAt: string;
    snapshot: NewsroomArticleSnapshot | null;
  }>;

export type NewsroomArticlePage = Readonly<{
  items: readonly NewsroomArticleSummary[];
  page: number;
  pageSize: number;
  total: number;
  readyForReview: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}>;

export type NewsroomRepositoryResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "read_unavailable";
        message: "Não foi possível ler a caixa de entrada neste momento.";
      }>;
    }>;

export type ListNewsroomArticlesOptions = Readonly<{
  page?: number;
  pageSize?: number;
  sourceCode?: string | null;
}>;

function readUnavailable<T>(): NewsroomRepositoryResult<T> {
  return {
    ok: false,
    error: {
      code: "read_unavailable",
      message: "Não foi possível ler a caixa de entrada neste momento.",
    },
  };
}

function normalizePage(value: number | undefined): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : 1;
}

function normalizePageSize(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(value!, MAX_PAGE_SIZE);
}

function normalizeSourceCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[a-z0-9_-]{1,64}$/.test(normalized) ? normalized : null;
}

function processingStatus(value: string): ArticleProcessingStatus {
  return processingStatuses.has(value as ArticleProcessingStatus)
    ? (value as ArticleProcessingStatus)
    : "failed";
}

function articleSummary(row: NewsroomArticleRow): NewsroomArticleSummary {
  return {
    id: row.id,
    sourceCode: row.source_code,
    title: row.title,
    author: row.author,
    publishedAt: row.published_at,
    detectedAt: row.detected_at,
    lastDetectedAt: row.last_detected_at,
    imageUrl: row.image_url,
    processingStatus: processingStatus(row.processing_status),
  };
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return typeof value === "object" && Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function sourceMetadata(value: unknown): JsonObject {
  if (!value || Array.isArray(value) || typeof value !== "object" || !isJsonValue(value)) {
    return {};
  }

  return value as JsonObject;
}

function articleBody(value: unknown): readonly ArticleBodyBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate): ArticleBodyBlock[] => {
    if (!candidate || typeof candidate !== "object") {
      return [];
    }

    const block = candidate as { type?: unknown; text?: unknown };
    if ((block.type !== "paragraph" && block.type !== "heading") || typeof block.text !== "string") {
      return [];
    }

    return [{ type: block.type, text: block.text }];
  });
}

function snapshot(row: NewsroomSnapshotRow): NewsroomArticleSnapshot {
  return {
    id: row.id,
    articleId: row.article_id,
    contentHash: row.content_hash,
    body: articleBody(row.body),
    sourceMetadata: sourceMetadata(row.source_metadata),
    extractedAt: row.extracted_at,
    createdAt: row.created_at,
  };
}

function sourceFilter(sourceCode: string | null): string {
  return sourceCode ? `&source_code=eq.${encodeURIComponent(sourceCode)}` : "";
}

async function readArticleCounts(sourceCode: string | null): Promise<{
  total: number;
  readyForReview: number;
}> {
  let offset = 0;
  let total = 0;
  let readyForReview = 0;

  while (true) {
    const rows = await fetchSupabaseAdminTable<NewsroomArticleCountRow>(
      `newsroom_articles?select=id,processing_status${sourceFilter(sourceCode)}`
      + `&order=id.asc&offset=${offset}&limit=${SUMMARY_PAGE_SIZE}`,
    );

    total += rows.length;
    readyForReview += rows.filter((row) => row.processing_status === "ready_for_review").length;

    if (rows.length < SUMMARY_PAGE_SIZE) {
      return { total, readyForReview };
    }

    offset += SUMMARY_PAGE_SIZE;
  }
}

export async function listNewsroomArticles(
  options: ListNewsroomArticlesOptions = {},
): Promise<NewsroomRepositoryResult<NewsroomArticlePage>> {
  const page = normalizePage(options.page);
  const pageSize = normalizePageSize(options.pageSize);
  const sourceCode = normalizeSourceCode(options.sourceCode);
  const offset = (page - 1) * pageSize;

  try {
    const [rows, counts] = await Promise.all([
      fetchSupabaseAdminTable<NewsroomArticleRow>(
        "newsroom_articles?select=id,source_code,original_url,normalized_url,external_id,title,subtitle,summary,author,published_at,modified_at,detected_at,image_url,processing_status,first_detected_at,last_detected_at,created_at,updated_at"
        + sourceFilter(sourceCode)
        + `&order=last_detected_at.desc,id.desc&offset=${offset}&limit=${pageSize}`,
      ),
      readArticleCounts(sourceCode),
    ]);

    return {
      ok: true,
      value: {
        items: rows.map(articleSummary),
        page,
        pageSize,
        total: counts.total,
        readyForReview: counts.readyForReview,
        hasPreviousPage: page > 1,
        hasNextPage: offset + rows.length < counts.total,
      },
    };
  } catch {
    return readUnavailable();
  }
}

export async function getNewsroomArticleById(
  articleId: string | null | undefined,
): Promise<NewsroomRepositoryResult<NewsroomArticleDetail | null>> {
  const normalizedId = articleId?.trim() ?? "";
  if (!UUID_PATTERN.test(normalizedId)) {
    return { ok: true, value: null };
  }

  try {
    const articles = await fetchSupabaseAdminTable<NewsroomArticleRow>(
      "newsroom_articles?select=id,source_code,original_url,normalized_url,external_id,title,subtitle,summary,author,published_at,modified_at,detected_at,image_url,processing_status,first_detected_at,last_detected_at,created_at,updated_at"
      + `&id=eq.${encodeURIComponent(normalizedId)}&limit=1`,
    );
    const article = articles[0];
    if (!article) {
      return { ok: true, value: null };
    }

    const snapshots = await fetchSupabaseAdminTable<NewsroomSnapshotRow>(
      "newsroom_article_snapshots?select=id,article_id,content_hash,body,source_metadata,extracted_at,created_at"
      + `&article_id=eq.${encodeURIComponent(normalizedId)}`
      + "&order=extracted_at.desc,created_at.desc&limit=1",
    );

    return {
      ok: true,
      value: {
        ...articleSummary(article),
        originalUrl: article.original_url,
        normalizedUrl: article.normalized_url,
        externalId: article.external_id,
        subtitle: article.subtitle,
        summary: article.summary,
        modifiedAt: article.modified_at,
        firstDetectedAt: article.first_detected_at,
        createdAt: article.created_at,
        updatedAt: article.updated_at,
        snapshot: snapshots[0] ? snapshot(snapshots[0]) : null,
      },
    };
  } catch {
    return readUnavailable();
  }
}
