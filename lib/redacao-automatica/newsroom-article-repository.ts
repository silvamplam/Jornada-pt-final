import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import {
  NEWSROOM_TOPIC_ARCHIVE_OUTCOMES,
  classifyNewsroomTopicArchiveCandidate,
  classifyNewsroomTopicArchiveMetadata,
  scoreNewsroomTopicCandidate,
} from "@/lib/redacao-automatica/newsroom-topic-search";
import type {
  NewsroomTopicArchiveOutcome,
} from "@/lib/redacao-automatica/newsroom-topic-search";
import type {
  ArticleBodyBlock,
  ArticleProcessingStatus,
  JsonObject,
  JsonValue,
  PublishedAtPrecision,
} from "@/lib/redacao-automatica/types";
import {
  publishedAtPrecisionFromSourceMetadata,
} from "@/lib/redacao-automatica/types";
import {
  isManualNewsroomSource,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const SUMMARY_PAGE_SIZE = 1000;
const TOPIC_SEARCH_PAGE_SIZE = 250;
const SNAPSHOT_ARTICLE_CHUNK_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const topicSearchProcessingStatuses = new Set([
  "detected",
  "normalized",
  "ready_for_review",
]);

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
  original_url: string | null;
  normalized_url: string | null;
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
  subtitle: string | null;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  publishedAtPrecision: PublishedAtPrecision | null;
  detectedAt: string;
  lastDetectedAt: string;
  imageUrl: string | null;
  processingStatus: ArticleProcessingStatus;
  latestSnapshotId: string | null;
  hasUsableSnapshot: boolean;
  sourceUrl: string | null;
  isManualEntry: boolean;
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
    originalUrl: string | null;
    normalizedUrl: string | null;
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
  topicDiagnostics?: NewsroomTopicSearchDiagnostics;
}>;

export type NewsroomTopicSearchDiagnostics = Readonly<{
  totalProcessed: number;
  counts: Readonly<Record<NewsroomTopicArchiveOutcome, number>>;
  reasonsByArticleId: Readonly<Record<string, NewsroomTopicArchiveOutcome>>;
}>;

export type NewsroomUndatedTopicRecoveryCandidate = Readonly<{
  id: string;
  sourceCode: "record" | "abola";
  normalizedUrl: string;
  lastDetectedAt: string;
  score: number;
}>;

export type NewsroomDossierSourceCandidate = Readonly<{
  id: string;
  sourceCode: string;
  title: string;
  publishedAt: string | null;
  processingStatus: ArticleProcessingStatus;
  snapshot: Readonly<{
    id: string;
    body: readonly ArticleBodyBlock[];
  }> | null;
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

export type SearchNewsroomArticlesOptions = Readonly<{
  query: string;
  periodDays?: number | null;
  sourceCode?: string | null;
}>;

export type ListUndatedNewsroomTopicRecoveryCandidatesOptions = Readonly<{
  query: string;
  sourceCode?: string | null;
  now?: Date;
  cooldownHours?: number;
  limit?: number;
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


function normalizeTopicPeriodDays(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Number.isInteger(value) && value > 0 && value <= 365 ? value : 7;
}

function publishedAtTimestamp(row: NewsroomArticleRow): number | null {
  if (!row.published_at) {
    return null;
  }

  const timestamp = Date.parse(row.published_at);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function emptyTopicDiagnostics(): {
  totalProcessed: number;
  counts: Record<NewsroomTopicArchiveOutcome, number>;
  reasonsByArticleId: Record<string, NewsroomTopicArchiveOutcome>;
} {
  return {
    totalProcessed: 0,
    counts: Object.fromEntries(
      NEWSROOM_TOPIC_ARCHIVE_OUTCOMES.map((outcome) => [outcome, 0]),
    ) as Record<NewsroomTopicArchiveOutcome, number>,
    reasonsByArticleId: {},
  };
}

function recordTopicOutcome(
  diagnostics: ReturnType<typeof emptyTopicDiagnostics>,
  articleId: string,
  outcome: NewsroomTopicArchiveOutcome,
): void {
  diagnostics.totalProcessed += 1;
  diagnostics.counts[outcome] += 1;
  diagnostics.reasonsByArticleId[articleId] = outcome;
}

function snapshotText(row: NewsroomSnapshotRow | null): string {
  return row ? articleBody(row.body).map((block) => block.text).join(" ") : "";
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

function hasUsableBody(body: readonly ArticleBodyBlock[]): boolean {
  return body.some((block) => block.text.trim().length > 0);
}

function articleSummary(
  row: NewsroomArticleRow,
  snapshotRow: NewsroomSnapshotRow | null = null,
): NewsroomArticleSummary {
  const body = snapshotRow ? articleBody(snapshotRow.body) : [];
  const isManualEntry = isManualNewsroomSource(
    row.source_code,
    snapshotRow?.source_metadata,
  );

  return {
    id: row.id,
    sourceCode: row.source_code,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    author: row.author,
    publishedAt: row.published_at,
    publishedAtPrecision: publishedAtPrecisionFromSourceMetadata(
      snapshotRow?.source_metadata,
    ),
    detectedAt: row.detected_at,
    lastDetectedAt: row.last_detected_at,
    imageUrl: row.image_url,
    processingStatus: processingStatus(row.processing_status),
    latestSnapshotId: snapshotRow?.id ?? null,
    hasUsableSnapshot: hasUsableBody(body),
    sourceUrl: row.normalized_url || row.original_url,
    isManualEntry,
  };
}

function canonicalArticleIdentity(row: NewsroomArticleRow): string {
  if (isManualNewsroomSource(row.source_code)) {
    return `${row.source_code.trim().toLowerCase()}\u0000${row.id}`;
  }

  return (
    `${row.source_code.trim().toLowerCase()}\u0000`
    + (row.normalized_url?.trim() || row.original_url?.trim() || row.id)
  );
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

function uuidList(values: readonly string[]): string {
  return values.map((value) => encodeURIComponent(value)).join(",");
}

async function latestSnapshotsByArticle(
  articleIds: readonly string[],
): Promise<Map<string, NewsroomSnapshotRow>> {
  if (articleIds.length === 0) {
    return new Map();
  }

  const latest = new Map<string, NewsroomSnapshotRow>();

  for (let start = 0; start < articleIds.length; start += SNAPSHOT_ARTICLE_CHUNK_SIZE) {
    const articleIdChunk = articleIds.slice(start, start + SNAPSHOT_ARTICLE_CHUNK_SIZE);
    let offset = 0;

    while (true) {
      const rows = await fetchSupabaseAdminTable<NewsroomSnapshotRow>(
        "newsroom_article_snapshots?select=id,article_id,content_hash,body,source_metadata,extracted_at,created_at"
        + `&article_id=in.(${uuidList(articleIdChunk)})`
        + `&order=extracted_at.desc,created_at.desc,id.desc&offset=${offset}&limit=${SUMMARY_PAGE_SIZE}`,
      );

      for (const row of rows) {
        if (!latest.has(row.article_id)) {
          latest.set(row.article_id, row);
        }
      }

      if (rows.length < SUMMARY_PAGE_SIZE) {
        break;
      }

      offset += SUMMARY_PAGE_SIZE;
    }
  }

  return latest;
}

function sourceFilter(sourceCode: string | null): string {
  return sourceCode ? `&source_code=eq.${encodeURIComponent(sourceCode)}` : "";
}

async function readAllTopicSearchArticleRows(
  sourceCode: string | null,
): Promise<readonly NewsroomArticleRow[]> {
  const rows: NewsroomArticleRow[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchSupabaseAdminTable<NewsroomArticleRow>(
      "newsroom_articles?select=id,source_code,original_url,normalized_url,external_id,title,subtitle,summary,author,published_at,modified_at,detected_at,image_url,processing_status,first_detected_at,last_detected_at,created_at,updated_at"
      + sourceFilter(sourceCode)
      + `&order=published_at.desc,id.asc&offset=${offset}&limit=${TOPIC_SEARCH_PAGE_SIZE}`,
    );

    rows.push(...page);
    if (page.length < TOPIC_SEARCH_PAGE_SIZE) {
      return rows;
    }

    offset += TOPIC_SEARCH_PAGE_SIZE;
  }
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
    const latestSnapshots = await latestSnapshotsByArticle(rows.map((row) => row.id));

    return {
      ok: true,
      value: {
        items: rows.map((row) => articleSummary(row, latestSnapshots.get(row.id) ?? null)),
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

export async function searchNewsroomArticles(
  options: SearchNewsroomArticlesOptions,
): Promise<NewsroomRepositoryResult<NewsroomArticlePage>> {
  const query = options.query.trim();
  const sourceCode = normalizeSourceCode(options.sourceCode);
  const periodDays = normalizeTopicPeriodDays(options.periodDays);

  if (!query) {
    return {
      ok: true,
      value: {
        items: [],
        page: 1,
        pageSize: 0,
        total: 0,
        readyForReview: 0,
        hasPreviousPage: false,
        hasNextPage: false,
        topicDiagnostics: emptyTopicDiagnostics(),
      },
    };
  }

  try {
    const rows = await readAllTopicSearchArticleRows(sourceCode);
    const now = new Date();
    const diagnostics = emptyTopicDiagnostics();
    const metadataEligibleRows = rows.filter((row) => {
      const outcome = classifyNewsroomTopicArchiveMetadata({
        processingStatus: row.processing_status,
        publishedAt: row.published_at,
        periodDays,
        now,
      });
      if (outcome) {
        recordTopicOutcome(diagnostics, row.id, outcome);
        return false;
      }
      return true;
    });
    const latestSnapshots = await latestSnapshotsByArticle(
      metadataEligibleRows.map((row) => row.id),
    );
    const relevant = metadataEligibleRows
      .flatMap((row) => {
        const snapshotRow = latestSnapshots.get(row.id) ?? null;
        const body = snapshotRow ? articleBody(snapshotRow.body) : [];
        const classification = classifyNewsroomTopicArchiveCandidate({
          processingStatus: row.processing_status,
          publishedAt: row.published_at,
          periodDays,
          now,
          snapshotPresent: snapshotRow !== null,
          snapshotUsable: hasUsableBody(body),
          candidate: {
            title: row.title,
            subtitle: row.subtitle,
            summary: row.summary,
            body: snapshotText(snapshotRow),
          },
          query,
        });
        if (classification.outcome !== "eligible") {
          recordTopicOutcome(diagnostics, row.id, classification.outcome);
          return [];
        }

        return [{
          row,
          snapshot: snapshotRow!,
          publishedAt: publishedAtTimestamp(row) ?? 0,
          score: classification.score,
        }];
      })
      .sort((left, right) => (
        right.score - left.score
        || right.publishedAt - left.publishedAt
        || right.row.id.localeCompare(left.row.id)
      ));
    const canonicalArticles = new Map<string, typeof relevant[number]>();

    for (const candidate of relevant) {
      const canonicalIdentity = canonicalArticleIdentity(candidate.row);
      if (canonicalArticles.has(canonicalIdentity)) {
        recordTopicOutcome(diagnostics, candidate.row.id, "canonical_duplicate");
        continue;
      }
      canonicalArticles.set(canonicalIdentity, candidate);
      recordTopicOutcome(diagnostics, candidate.row.id, "eligible");
    }

    const selected = [...canonicalArticles.values()];

    return {
      ok: true,
      value: {
        items: selected.map(({ row, snapshot: snapshotRow }) => articleSummary(row, snapshotRow)),
        page: 1,
        pageSize: selected.length,
        total: selected.length,
        readyForReview: selected.filter(({ row }) => row.processing_status === "ready_for_review").length,
        hasPreviousPage: false,
        hasNextPage: false,
        topicDiagnostics: diagnostics,
      },
    };
  } catch {
    return readUnavailable();
  }
}

function validRecoveryUrl(
  sourceCode: string,
  value: string | null,
): value is string {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    const expectedHost = sourceCode === "record"
      ? "www.record.pt"
      : sourceCode === "abola"
        ? "www.abola.pt"
        : "";
    return url.protocol === "https:" && url.hostname === expectedHost;
  } catch {
    return false;
  }
}

export async function listUndatedNewsroomTopicRecoveryCandidates(
  options: ListUndatedNewsroomTopicRecoveryCandidatesOptions,
): Promise<NewsroomRepositoryResult<readonly NewsroomUndatedTopicRecoveryCandidate[]>> {
  const query = options.query.trim();
  const requestedSource = normalizeSourceCode(options.sourceCode);
  const allowedSources = requestedSource
    ? (["record", "abola"].includes(requestedSource) ? [requestedSource] : [])
    : ["record", "abola"];
  const now = options.now ?? new Date();
  const cooldownHours = Number.isFinite(options.cooldownHours)
    ? Math.max(1, Math.floor(options.cooldownHours!))
    : 24;
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(4, Math.floor(options.limit!)))
    : 4;

  if (!query || allowedSources.length === 0 || Number.isNaN(now.getTime())) {
    return { ok: true, value: [] };
  }

  try {
    const rows: NewsroomArticleRow[] = [];
    const cooldownBefore = new Date(
      now.getTime() - cooldownHours * 60 * 60 * 1000,
    ).toISOString();
    let offset = 0;

    while (true) {
      const page = await fetchSupabaseAdminTable<NewsroomArticleRow>(
        "newsroom_articles?select=id,source_code,original_url,normalized_url,external_id,title,subtitle,summary,author,published_at,modified_at,detected_at,image_url,processing_status,first_detected_at,last_detected_at,created_at,updated_at"
        + `&source_code=in.(${allowedSources.map(encodeURIComponent).join(",")})`
        + "&processing_status=in.(detected,normalized,ready_for_review)"
        + "&published_at=is.null"
        + `&last_detected_at=lte.${encodeURIComponent(cooldownBefore)}`
        + `&order=last_detected_at.asc,id.asc&offset=${offset}&limit=${TOPIC_SEARCH_PAGE_SIZE}`,
      );
      rows.push(...page);
      if (page.length < TOPIC_SEARCH_PAGE_SIZE) {
        break;
      }
      offset += TOPIC_SEARCH_PAGE_SIZE;
    }

    const latestSnapshots = await latestSnapshotsByArticle(rows.map((row) => row.id));
    const canonicalUrls = new Set<string>();
    const candidates = rows.flatMap((row): NewsroomUndatedTopicRecoveryCandidate[] => {
      const snapshotRow = latestSnapshots.get(row.id) ?? null;
      const body = snapshotRow ? articleBody(snapshotRow.body) : [];
      if (
        row.published_at !== null
        || !topicSearchProcessingStatuses.has(row.processing_status)
        || !snapshotRow
        || !hasUsableBody(body)
        || !validRecoveryUrl(row.source_code, row.normalized_url)
      ) {
        return [];
      }

      const relevanceScore = scoreNewsroomTopicCandidate({
        title: row.title,
        subtitle: row.subtitle,
        summary: row.summary,
        body: snapshotText(snapshotRow),
      }, query);
      if (relevanceScore <= 0) {
        return [];
      }

      const canonicalIdentity = `${row.source_code}\u0000${row.normalized_url}`;
      if (canonicalUrls.has(canonicalIdentity)) {
        return [];
      }
      canonicalUrls.add(canonicalIdentity);

      return [{
        id: row.id,
        sourceCode: row.source_code as "record" | "abola",
        normalizedUrl: row.normalized_url,
        lastDetectedAt: row.last_detected_at,
        score: relevanceScore,
      }];
    });

    return {
      ok: true,
      value: candidates
        .sort((left, right) => (
          right.score - left.score
          || Date.parse(left.lastDetectedAt) - Date.parse(right.lastDetectedAt)
          || left.id.localeCompare(right.id)
        ))
        .slice(0, limit),
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

    const latestSnapshot = snapshots[0] ?? null;

    return {
      ok: true,
      value: {
        ...articleSummary(article, latestSnapshot),
        originalUrl: article.original_url,
        normalizedUrl: article.normalized_url,
        externalId: article.external_id,
        subtitle: article.subtitle,
        summary: article.summary,
        modifiedAt: article.modified_at,
        firstDetectedAt: article.first_detected_at,
        createdAt: article.created_at,
        updatedAt: article.updated_at,
        snapshot: latestSnapshot ? snapshot(latestSnapshot) : null,
      },
    };
  } catch {
    return readUnavailable();
  }
}


export async function getNewsroomDossierSourceCandidates(
  articleIds: readonly string[],
): Promise<NewsroomRepositoryResult<readonly NewsroomDossierSourceCandidate[]>> {
  const normalizedIds = articleIds
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, values) => UUID_PATTERN.test(value) && values.indexOf(value) === index);

  if (normalizedIds.length === 0) {
    return { ok: true, value: [] };
  }

  try {
    const rows = await fetchSupabaseAdminTable<NewsroomArticleRow>(
      "newsroom_articles?select=id,source_code,original_url,normalized_url,external_id,title,subtitle,summary,author,published_at,modified_at,detected_at,image_url,processing_status,first_detected_at,last_detected_at,created_at,updated_at"
      + `&id=in.(${uuidList(normalizedIds)})&limit=${normalizedIds.length}`,
    );
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const latestSnapshots = await latestSnapshotsByArticle(normalizedIds);

    return {
      ok: true,
      value: normalizedIds.flatMap((id): NewsroomDossierSourceCandidate[] => {
        const row = rowsById.get(id);
        if (!row) {
          return [];
        }

        const latestSnapshot = latestSnapshots.get(id);
        return [{
          id,
          sourceCode: row.source_code,
          title: row.title,
          publishedAt: row.published_at,
          processingStatus: processingStatus(row.processing_status),
          snapshot: latestSnapshot
            ? {
                id: latestSnapshot.id,
                body: articleBody(latestSnapshot.body),
              }
            : null,
        }];
      }),
    };
  } catch {
    return readUnavailable();
  }
}
