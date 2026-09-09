import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";
import {
  classifyNewsroomEditorialInboxItem,
  newsroomEditorialUsedUpdateAvailable,
  type NewsroomEditorialDecision,
  type NewsroomEditorialInboxClassification,
  type NewsroomEditorialReviewState,
  type NewsroomEditorialUsedState,
} from "@/lib/redacao-automatica/newsroom-editorial-inbox-internal";
import type {
  NewsroomArticleSummary,
} from "@/lib/redacao-automatica/newsroom-article-repository";
import type {
  NewsroomArticleClassificationSource,
} from "@/lib/redacao-automatica/newsroom-article-classification-service-internal";
import type {
  ArticleBodyBlock,
  ArticleProcessingStatus,
  JsonObject,
  JsonValue,
  PublishedAtPrecision,
} from "@/lib/redacao-automatica/types";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NEWSROOM_PROCESSING_STATUSES = new Set<ArticleProcessingStatus>([
  "detected",
  "normalized",
  "duplicate",
  "rejected",
  "ready_for_review",
  "failed",
]);

const NEWSROOM_DESK_SOURCE_STATUSES = new Set<ArticleProcessingStatus>([
  "detected",
  "normalized",
  "ready_for_review",
]);

const BANK_CLASSIFICATION_SOURCES = new Set([
  "automatic",
  "continuity_assisted",
  "manual",
] as const);

export type EditorialDeskPageInput = Readonly<{
  limit?: number;
  offset?: number;
}>;

export type EditorialDeskNewItemsInput = EditorialDeskPageInput & Readonly<{
  sourceCode?: string | null;
}>;

export type EditorialDeskClassificationFilter =
  | Readonly<{ mode: "all" }>
  | Readonly<{
      mode: "classified";
      classificationKey: ArticleClassificationKey;
    }>
  | Readonly<{ mode: "unclassified" }>;

export type EditorialDeskPublishedContextFilter = Readonly<{
  competitionId: string | null;
  seasonId: string | null;
  matchdayId: string | null;
}>;

export type EditorialDeskPublishedInput = EditorialDeskPageInput & Readonly<{
  competitionId?: string | null;
  seasonId?: string | null;
  matchdayId?: string | null;
}>;

export type EditorialDeskThemesInput = EditorialDeskPageInput & Readonly<{
  status?: "open" | "archived";
}>;

export type EditorialDeskReadModelInput = Readonly<{
  classification?: EditorialDeskClassificationFilter;
  novas?: EditorialDeskNewItemsInput;
  publicadas?: EditorialDeskPublishedInput;
  temas?: EditorialDeskThemesInput;
}>;

export type EditorialDeskPagination = Readonly<{
  limit: number;
  offset: number;
  hasNextPage: boolean;
}>;

export type EditorialDeskPage<T> = Readonly<{
  items: readonly T[];
  pagination: EditorialDeskPagination;
}>;

export type EditorialDeskPrePublicationClassification =
  | Readonly<{
      status: "classified";
      classificationKey: ArticleClassificationKey;
      classificationSource: NewsroomArticleClassificationSource;
      classifiedAt: string;
      updatedAt: string;
    }>
  | Readonly<{
      status: "unclassified";
      classificationKey: null;
      classificationSource: null;
      classifiedAt: null;
      updatedAt: null;
    }>;

export type EditorialDeskBankClassification =
  | Readonly<{
      status: "classified";
      classificationKey: ArticleClassificationKey;
      classificationSource: "automatic" | "continuity_assisted" | "manual";
      classifiedAt: string;
    }>
  | Readonly<{
      status: "unclassified";
      classificationKey: null;
      classificationSource: null;
      classifiedAt: null;
    }>;

export type EditorialDeskThemeMembership = Readonly<{
  status: "associated" | "none";
  themeIds: readonly string[];
}>;

export type EditorialDeskPublishedRelationEvidence =
  | Readonly<{
      kind: "dossier_plan";
      dossierId: string;
      dossierTitle: string;
      dossierStatus: string;
      dossierSourceId: string;
      articlePlanId: string;
      newsroomSnapshotId: string;
    }>
  | Readonly<{
      kind: "legacy_source_package";
      packageId: string;
      year: string;
      month: string;
      articlePosition: number;
      sourcePosition: number;
      newsroomSnapshotId: string;
      usedAt: string;
    }>;

export type EditorialDeskPublishedRelation = Readonly<{
  editorialArticleId: string;
  slug: string;
  title: string;
  publishedAt: string | null;
  evidence: readonly EditorialDeskPublishedRelationEvidence[];
}>;

export type EditorialDeskPublishedRelations = Readonly<{
  status: "known" | "unknown";
  items: readonly EditorialDeskPublishedRelation[];
}>;

export type EditorialDeskUsageProvenance = Readonly<{
  status: "known" | "none";
  dossierSources: readonly Readonly<{
    dossierId: string;
    dossierTitle: string;
    dossierStatus: string;
    dossierSourceId: string;
    newsroomSnapshotId: string;
    included: boolean;
  }>[];
  legacySourcePackages: readonly Readonly<{
    packageId: string;
    year: string;
    month: string;
    articlePosition: number;
    sourcePosition: number;
    newsroomSnapshotId: string;
    usedAt: string;
    publishedArticleId: string | null;
  }>[];
}>;

export type EditorialDeskNewItem = Readonly<{
  newsroomArticleId: string;
  sourceCode: string;
  sourceName: string | null;
  url: string | null;
  originalUrl: string | null;
  normalizedUrl: string | null;
  title: string;
  subtitle: string | null;
  summary: string | null;
  body: readonly ArticleBodyBlock[];
  imageCandidateUrl: string | null;
  publishedAt: string | null;
  publishedAtPrecision: PublishedAtPrecision | null;
  snapshot: Readonly<{
    id: string;
    contentHash: string;
    extractedAt: string;
    createdAt: string;
    sourceMetadata: JsonObject;
  }> | null;
  sourceState: Readonly<{
    processingStatus: ArticleProcessingStatus;
    editorial: NewsroomEditorialInboxClassification;
    editoriallyActionable: boolean;
    changedAfterKnownUsage: boolean;
  }>;
  classification: EditorialDeskPrePublicationClassification;
  themeMembership: EditorialDeskThemeMembership;
  publishedRelations: EditorialDeskPublishedRelations;
  usageProvenance: EditorialDeskUsageProvenance;
}>;

export type EditorialDeskPublishedBankContext = Readonly<{
  bankItemId: string;
  bankStatus: "active" | "archived";
  competitionId: string;
  seasonId: string;
  matchdayId: string;
  matchesFilter: boolean;
  classification: EditorialDeskBankClassification;
}>;

export type EditorialDeskPublishedItem = Readonly<{
  editorialArticleId: string;
  slug: string;
  title: string;
  anteTitle: string | null;
  postTitle: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  status: "published";
  canonicalContext: Readonly<{
    competitionId: string | null;
    seasonId: string | null;
    matchdayId: string | null;
  }>;
  bankContexts: readonly EditorialDeskPublishedBankContext[];
  themeMembership: EditorialDeskThemeMembership;
}>;

export type EditorialDeskThemeSummary = Readonly<{
  id: string;
  title: string;
  classificationKey: ArticleClassificationKey;
  status: "open" | "archived";
  contextText: string | null;
  context: Readonly<{
    competitionId: string | null;
    seasonId: string | null;
    matchdayId: string | null;
    matchId: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
  sourceCount: number;
  articleCount: number;
  lastActivityAt: null;
}>;

export type EditorialDeskReadModel = Readonly<{
  classification: EditorialDeskClassificationFilter;
  novas: EditorialDeskPage<EditorialDeskNewItem>;
  publicadas: EditorialDeskPage<EditorialDeskPublishedItem> & Readonly<{
    contextFilter: EditorialDeskPublishedContextFilter;
  }>;
  temas: EditorialDeskPage<EditorialDeskThemeSummary> & Readonly<{
    status: "open" | "archived";
  }>;
}>;

export type EditorialDeskReadModelResult =
  | Readonly<{ ok: true; value: EditorialDeskReadModel }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code:
          | "invalid_request"
          | "not_configured"
          | "relation_invalid"
          | "read_unavailable";
        message: string;
      }>;
    }>;

export type EditorialDeskNewArticleRecord = Readonly<{
  id: string;
  source_code: string;
  source_name: string | null;
  original_url: string | null;
  normalized_url: string | null;
  title: string;
  subtitle: string | null;
  summary: string | null;
  author: string | null;
  published_at: string | null;
  detected_at: string;
  image_url: string | null;
  processing_status: string;
  last_detected_at: string;
}>;

export type EditorialDeskSnapshotRecord = Readonly<{
  id: string;
  article_id: string;
  content_hash: string;
  body: unknown;
  source_metadata: unknown;
  extracted_at: string;
  created_at: string;
}>;

export type EditorialDeskReviewRecord = Readonly<{
  newsroom_article_id: string;
  decision: string;
  reviewed_snapshot_id: string;
  reviewed_at: string;
}>;

export type EditorialDeskClassificationRecord = Readonly<{
  newsroom_article_id: string;
  classification_key: string;
  classification_source: string;
  classified_at: string;
  updated_at: string;
}>;

export type EditorialDeskThemeSourceRecord = Readonly<{
  theme_id: string;
  newsroom_article_id: string;
  added_at: string;
}>;

export type EditorialDeskThemeArticleRecord = Readonly<{
  theme_id: string;
  editorial_article_id: string;
  added_at: string;
}>;

export type EditorialDeskDossierSourceRecord = Readonly<{
  id: string;
  dossier_id: string;
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  included: boolean;
}>;

export type EditorialDeskPlanAssignmentRecord = Readonly<{
  dossier_id: string;
  article_plan_id: string;
  dossier_source_id: string;
}>;

export type EditorialDeskPlanRecord = Readonly<{
  id: string;
  dossier_id: string;
  editorial_article_id: string | null;
}>;

export type EditorialDeskDossierRecord = Readonly<{
  id: string;
  title: string;
  status: string;
}>;

export type EditorialDeskLegacyUsageRecord = Readonly<{
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  used_at: string;
  package_id: string;
  year: string;
  month: string;
  article_position: number;
  source_position: number;
  published_article_id: string | null;
}>;

export type EditorialDeskPublishedArticleRecord = Readonly<{
  id: string;
  slug: string | null;
  title: string | null;
  label: string | null;
  subtitle: string | null;
  image_url: string | null;
  published_at: string | null;
  status: string | null;
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
}>;

export type EditorialDeskBankContextRecord = Readonly<{
  id: string;
  source_id: string;
  status: string;
  competition_id: string;
  season_id: string;
  matchday_id: string;
  classification_key: string | null;
  classification_source: string | null;
  classified_at: string | null;
}>;

export type EditorialDeskThemeRecord = Readonly<{
  id: string;
  title: string;
  classification_key: string;
  status: string;
  context_text: string | null;
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
  match_id: string | null;
  created_at: string;
  updated_at: string;
}>;

export type EditorialDeskTransportPage<T> = Readonly<{
  items: readonly T[];
  hasNextPage: boolean;
}>;

export interface EditorialDeskReadTransport {
  isConfigured(): boolean;
  listNewArticles(input: Readonly<{
    limit: number;
    offset: number;
    sourceCode: string | null;
    classification: EditorialDeskClassificationFilter;
  }>): Promise<EditorialDeskTransportPage<EditorialDeskNewArticleRecord>>;
  readLatestSnapshots(
    newsroomArticleIds: readonly string[],
  ): Promise<readonly EditorialDeskSnapshotRecord[]>;
  readReviewStates(
    newsroomArticleIds: readonly string[],
  ): Promise<readonly EditorialDeskReviewRecord[]>;
  readPrePublicationClassifications(
    newsroomArticleIds: readonly string[],
  ): Promise<readonly EditorialDeskClassificationRecord[]>;
  readThemeSourcesByArticleIds(
    newsroomArticleIds: readonly string[],
  ): Promise<readonly EditorialDeskThemeSourceRecord[]>;
  readDossierSources(
    newsroomArticleIds: readonly string[],
  ): Promise<readonly EditorialDeskDossierSourceRecord[]>;
  readPlanAssignments(
    dossierSourceIds: readonly string[],
  ): Promise<readonly EditorialDeskPlanAssignmentRecord[]>;
  readPlans(
    articlePlanIds: readonly string[],
  ): Promise<readonly EditorialDeskPlanRecord[]>;
  readDossiers(
    dossierIds: readonly string[],
  ): Promise<readonly EditorialDeskDossierRecord[]>;
  readLegacyUsage(
    newsroomArticleIds: readonly string[],
  ): Promise<readonly EditorialDeskLegacyUsageRecord[]>;
  readPublishedArticlesByIds(
    editorialArticleIds: readonly string[],
  ): Promise<readonly EditorialDeskPublishedArticleRecord[]>;
  listPublishedArticles(input: Readonly<{
    limit: number;
    offset: number;
    contextFilter: EditorialDeskPublishedContextFilter;
    classification: EditorialDeskClassificationFilter;
  }>): Promise<EditorialDeskTransportPage<EditorialDeskPublishedArticleRecord>>;
  readBankContexts(
    editorialArticleIds: readonly string[],
  ): Promise<readonly EditorialDeskBankContextRecord[]>;
  readThemeArticlesByArticleIds(
    editorialArticleIds: readonly string[],
  ): Promise<readonly EditorialDeskThemeArticleRecord[]>;
  listThemes(input: Readonly<{
    limit: number;
    offset: number;
    status: "open" | "archived";
    classification: EditorialDeskClassificationFilter;
  }>): Promise<EditorialDeskTransportPage<EditorialDeskThemeRecord>>;
  readThemeSourcesByThemeIds(
    themeIds: readonly string[],
  ): Promise<readonly EditorialDeskThemeSourceRecord[]>;
  readThemeArticlesByThemeIds(
    themeIds: readonly string[],
  ): Promise<readonly EditorialDeskThemeArticleRecord[]>;
}

type NormalizedInput = Readonly<{
  classification: EditorialDeskClassificationFilter;
  novas: Readonly<{ limit: number; offset: number; sourceCode: string | null }>;
  publicadas: Readonly<{
    limit: number;
    offset: number;
    contextFilter: EditorialDeskPublishedContextFilter;
  }>;
  temas: Readonly<{
    limit: number;
    offset: number;
    status: "open" | "archived";
  }>;
}>;

class EditorialDeskRelationInvalidError extends Error {}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function optionalUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function normalizedPagination(
  input: EditorialDeskPageInput | undefined,
): Readonly<{ limit: number; offset: number }> | null {
  const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
  const offset = input?.offset ?? 0;
  return Number.isInteger(limit)
    && limit >= 1
    && limit <= MAX_PAGE_SIZE
    && Number.isInteger(offset)
    && offset >= 0
    ? { limit, offset }
    : null;
}

function normalizedUuid(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized ? (isUuid(normalized) ? normalized : "") : null;
}

function normalizedClassificationFilter(
  value: EditorialDeskClassificationFilter | undefined,
): EditorialDeskClassificationFilter | null {
  if (value === undefined || value.mode === "all") return { mode: "all" };
  if (value.mode === "unclassified") return { mode: "unclassified" };
  return value.mode === "classified" && isArticleClassificationKey(value.classificationKey)
    ? { mode: "classified", classificationKey: value.classificationKey }
    : null;
}

function normalizeInput(input: EditorialDeskReadModelInput): NormalizedInput | null {
  const novasPage = normalizedPagination(input.novas);
  const publicadasPage = normalizedPagination(input.publicadas);
  const temasPage = normalizedPagination(input.temas);
  const sourceCode = input.novas?.sourceCode?.trim().toLowerCase() || null;
  const competitionId = normalizedUuid(input.publicadas?.competitionId);
  const seasonId = normalizedUuid(input.publicadas?.seasonId);
  const matchdayId = normalizedUuid(input.publicadas?.matchdayId);
  const classification = normalizedClassificationFilter(input.classification);

  if (
    !novasPage
    || !publicadasPage
    || !temasPage
    || (sourceCode !== null && !/^[a-z0-9_-]{1,64}$/.test(sourceCode))
    || competitionId === ""
    || seasonId === ""
    || matchdayId === ""
    || !classification
  ) {
    return null;
  }

  return {
    classification,
    novas: { ...novasPage, sourceCode },
    publicadas: {
      ...publicadasPage,
      contextFilter: { competitionId, seasonId, matchdayId },
    },
    temas: {
      ...temasPage,
      status: input.temas?.status ?? "open",
    },
  };
}

function errorResult(
  code: "invalid_request" | "not_configured" | "relation_invalid" | "read_unavailable",
): EditorialDeskReadModelResult {
  const messages = {
    invalid_request: "Os filtros da Mesa da Redação são inválidos.",
    not_configured: "O acesso administrativo à base de dados não está configurado.",
    relation_invalid: "Uma relação persistida da Mesa da Redação é inválida.",
    read_unavailable: "Não foi possível ler a Mesa da Redação.",
  } as const;
  return { ok: false, error: { code, message: messages[code] } };
}

function assertUniqueBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const identity = key(value);
    if (result.has(identity)) throw new EditorialDeskRelationInvalidError();
    result.set(identity, value);
  }
  return result;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object"
    && Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function jsonObject(value: unknown): JsonObject {
  return value
    && !Array.isArray(value)
    && typeof value === "object"
    && isJsonValue(value)
    ? value as JsonObject
    : {};
}

function articleBody(value: unknown): readonly ArticleBodyBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): ArticleBodyBlock[] => {
    if (!candidate || Array.isArray(candidate) || typeof candidate !== "object") {
      return [];
    }
    const block = candidate as { type?: unknown; text?: unknown };
    return (block.type === "paragraph" || block.type === "heading")
      && typeof block.text === "string"
      ? [{ type: block.type, text: block.text }]
      : [];
  });
}

function publishedAtPrecision(metadata: JsonObject): PublishedAtPrecision | null {
  const value = metadata.publishedAtPrecision;
  return value === "date" || value === "instant" ? value : null;
}

function themeMembership(themeIds: readonly string[]): EditorialDeskThemeMembership {
  const ids = [...new Set(themeIds)].sort((left, right) => left.localeCompare(right));
  return { status: ids.length > 0 ? "associated" : "none", themeIds: ids };
}

function prePublicationClassification(
  row: EditorialDeskClassificationRecord | undefined,
): EditorialDeskPrePublicationClassification {
  if (!row) {
    return {
      status: "unclassified",
      classificationKey: null,
      classificationSource: null,
      classifiedAt: null,
      updatedAt: null,
    };
  }
  if (
    !isUuid(row.newsroom_article_id)
    || !isArticleClassificationKey(row.classification_key)
    || (row.classification_source !== "automatic" && row.classification_source !== "manual")
    || !validDate(row.classified_at)
    || !validDate(row.updated_at)
  ) {
    throw new EditorialDeskRelationInvalidError();
  }
  return {
    status: "classified",
    classificationKey: row.classification_key,
    classificationSource: row.classification_source,
    classifiedAt: row.classified_at,
    updatedAt: row.updated_at,
  };
}

function bankClassification(
  row: EditorialDeskBankContextRecord,
): EditorialDeskBankClassification {
  if (
    row.classification_key === null
    && row.classification_source === null
    && row.classified_at === null
  ) {
    return {
      status: "unclassified",
      classificationKey: null,
      classificationSource: null,
      classifiedAt: null,
    };
  }
  if (
    !isArticleClassificationKey(row.classification_key)
    || !BANK_CLASSIFICATION_SOURCES.has(
      row.classification_source as "automatic" | "continuity_assisted" | "manual",
    )
    || !validDate(row.classified_at)
  ) {
    throw new EditorialDeskRelationInvalidError();
  }
  return {
    status: "classified",
    classificationKey: row.classification_key,
    classificationSource: row.classification_source as
      "automatic" | "continuity_assisted" | "manual",
    classifiedAt: row.classified_at,
  };
}

function classificationMatchesFilter(
  classification: EditorialDeskPrePublicationClassification | EditorialDeskBankClassification,
  filter: EditorialDeskClassificationFilter,
): boolean {
  if (filter.mode === "all") return true;
  if (filter.mode === "unclassified") return classification.status === "unclassified";
  return classification.status === "classified"
    && classification.classificationKey === filter.classificationKey;
}

function latestLegacyUsedState(
  articleId: string,
  snapshotId: string | null,
  rows: readonly EditorialDeskLegacyUsageRecord[],
): NewsroomEditorialUsedState | null {
  const relevant = rows
    .filter((row) => row.newsroom_article_id === articleId)
    .sort((left, right) => (
      Date.parse(right.used_at) - Date.parse(left.used_at)
      || right.package_id.localeCompare(left.package_id)
      || right.article_position - left.article_position
      || right.source_position - left.source_position
    ));
  const selected = relevant.find((row) => row.newsroom_snapshot_id === snapshotId)
    ?? relevant[0];
  if (!selected) return null;
  return {
    articleId,
    snapshotId: selected.newsroom_snapshot_id,
    usedAt: selected.used_at,
    dossier: null,
  };
}

function newArticleSort(
  left: EditorialDeskNewArticleRecord,
  right: EditorialDeskNewArticleRecord,
): number {
  return Date.parse(right.last_detected_at) - Date.parse(left.last_detected_at)
    || right.id.localeCompare(left.id);
}

function publishedArticleSort(
  left: EditorialDeskPublishedArticleRecord,
  right: EditorialDeskPublishedArticleRecord,
): number {
  const leftTime = left.published_at ? Date.parse(left.published_at) : Number.NEGATIVE_INFINITY;
  const rightTime = right.published_at ? Date.parse(right.published_at) : Number.NEGATIVE_INFINITY;
  return rightTime - leftTime || right.id.localeCompare(left.id);
}

function themeSort(
  left: EditorialDeskThemeRecord,
  right: EditorialDeskThemeRecord,
): number {
  return Date.parse(right.updated_at) - Date.parse(left.updated_at)
    || left.id.localeCompare(right.id);
}

function matchesContext(
  context: EditorialDeskBankContextRecord,
  filter: EditorialDeskPublishedContextFilter,
): boolean {
  return (!filter.competitionId || context.competition_id === filter.competitionId)
    && (!filter.seasonId || context.season_id === filter.seasonId)
    && (!filter.matchdayId || context.matchday_id === filter.matchdayId);
}

function idsFor<T>(values: readonly T[], select: (value: T) => string | null): string[] {
  return [...new Set(values.flatMap((value) => {
    const selected = select(value);
    return selected ? [selected] : [];
  }))];
}

async function readNewItems(
  transport: EditorialDeskReadTransport,
  input: NormalizedInput["novas"],
  classification: EditorialDeskClassificationFilter,
): Promise<EditorialDeskPage<EditorialDeskNewItem>> {
  const page = await transport.listNewArticles({ ...input, classification });
  const records = [...page.items].sort(newArticleSort);
  if (records.some((row) => (
    !isUuid(row.id)
    || !nonEmpty(row.source_code)
    || !nonEmpty(row.title)
    || !validDate(row.detected_at)
    || !validDate(row.last_detected_at)
    || !NEWSROOM_PROCESSING_STATUSES.has(row.processing_status as ArticleProcessingStatus)
    || !NEWSROOM_DESK_SOURCE_STATUSES.has(row.processing_status as ArticleProcessingStatus)
  ))) {
    throw new EditorialDeskRelationInvalidError();
  }
  const articleIds = records.map((row) => row.id);
  const [
    snapshots,
    reviews,
    classifications,
    themeSources,
    dossierSources,
    legacyUsage,
  ] = await Promise.all([
    transport.readLatestSnapshots(articleIds),
    transport.readReviewStates(articleIds),
    transport.readPrePublicationClassifications(articleIds),
    transport.readThemeSourcesByArticleIds(articleIds),
    transport.readDossierSources(articleIds),
    transport.readLegacyUsage(articleIds),
  ]);

  const snapshotByArticle = assertUniqueBy(snapshots, (row) => row.article_id);
  const reviewByArticle = assertUniqueBy(reviews, (row) => row.newsroom_article_id);
  const classificationByArticle = assertUniqueBy(
    classifications,
    (row) => row.newsroom_article_id,
  );
  const dossierSourceIds = idsFor(dossierSources, (row) => row.id);
  const assignments = await transport.readPlanAssignments(dossierSourceIds);
  const planIds = idsFor(assignments, (row) => row.article_plan_id);
  const dossierIds = idsFor(dossierSources, (row) => row.dossier_id);
  const [plans, dossiers] = await Promise.all([
    transport.readPlans(planIds),
    transport.readDossiers(dossierIds),
  ]);
  const relationArticleIds = [
    ...idsFor(plans, (row) => row.editorial_article_id),
    ...idsFor(legacyUsage, (row) => row.published_article_id),
  ];
  const publishedArticles = await transport.readPublishedArticlesByIds(
    [...new Set(relationArticleIds)],
  );

  const planById = assertUniqueBy(plans, (row) => row.id);
  const dossierById = assertUniqueBy(dossiers, (row) => row.id);
  const publishedById = assertUniqueBy(publishedArticles, (row) => row.id);
  const dossierSourceById = assertUniqueBy(dossierSources, (row) => row.id);

  for (const row of snapshots) {
    if (
      !articleIds.includes(row.article_id)
      || !isUuid(row.id)
      || !nonEmpty(row.content_hash)
      || !validDate(row.extracted_at)
      || !validDate(row.created_at)
    ) throw new EditorialDeskRelationInvalidError();
  }
  for (const row of reviews) {
    if (
      !articleIds.includes(row.newsroom_article_id)
      || !isUuid(row.reviewed_snapshot_id)
      || !["working", "seen", "dismissed"].includes(row.decision)
      || !validDate(row.reviewed_at)
    ) throw new EditorialDeskRelationInvalidError();
  }
  for (const row of classifications) {
    if (!articleIds.includes(row.newsroom_article_id)) {
      throw new EditorialDeskRelationInvalidError();
    }
    prePublicationClassification(row);
  }
  for (const row of records) {
    if (!classificationMatchesFilter(
      prePublicationClassification(classificationByArticle.get(row.id)),
      classification,
    )) throw new EditorialDeskRelationInvalidError();
  }
  for (const row of themeSources) {
    if (
      !articleIds.includes(row.newsroom_article_id)
      || !isUuid(row.theme_id)
      || !validDate(row.added_at)
    ) throw new EditorialDeskRelationInvalidError();
  }
  for (const row of dossierSources) {
    if (
      !articleIds.includes(row.newsroom_article_id)
      || !isUuid(row.id)
      || !isUuid(row.dossier_id)
      || !isUuid(row.newsroom_snapshot_id)
      || typeof row.included !== "boolean"
    ) throw new EditorialDeskRelationInvalidError();
  }
  for (const row of assignments) {
    const source = dossierSourceById.get(row.dossier_source_id);
    if (
      !source
      || source.dossier_id !== row.dossier_id
      || !isUuid(row.article_plan_id)
    ) throw new EditorialDeskRelationInvalidError();
  }
  for (const row of plans) {
    if (
      !isUuid(row.id)
      || !isUuid(row.dossier_id)
      || !optionalUuid(row.editorial_article_id)
    ) throw new EditorialDeskRelationInvalidError();
  }
  for (const row of dossiers) {
    if (!isUuid(row.id) || !nonEmpty(row.title) || !nonEmpty(row.status)) {
      throw new EditorialDeskRelationInvalidError();
    }
  }
  for (const row of legacyUsage) {
    if (
      !articleIds.includes(row.newsroom_article_id)
      || !isUuid(row.newsroom_snapshot_id)
      || !isUuid(row.package_id)
      || !validDate(row.used_at)
      || !/^\d{4}$/.test(row.year)
      || !/^(0[1-9]|1[0-2])$/.test(row.month)
      || !Number.isInteger(row.article_position)
      || row.article_position < 1
      || !Number.isInteger(row.source_position)
      || row.source_position < 1
      || !optionalUuid(row.published_article_id)
    ) throw new EditorialDeskRelationInvalidError();
  }

  return {
    items: records.map((row): EditorialDeskNewItem => {
      const snapshotRow = snapshotByArticle.get(row.id) ?? null;
      const metadata = jsonObject(snapshotRow?.source_metadata);
      const reviewRow = reviewByArticle.get(row.id);
      const reviewState: NewsroomEditorialReviewState | null = reviewRow
        ? {
            articleId: row.id,
            decision: reviewRow.decision as NewsroomEditorialDecision,
            reviewedSnapshotId: reviewRow.reviewed_snapshot_id,
            reviewedAt: reviewRow.reviewed_at,
          }
        : null;
      const articleLegacyUsage = legacyUsage.filter(
        (usage) => usage.newsroom_article_id === row.id,
      );
      const usedState = latestLegacyUsedState(
        row.id,
        snapshotRow?.id ?? null,
        articleLegacyUsage,
      );
      const summary: NewsroomArticleSummary = {
        id: row.id,
        sourceCode: row.source_code,
        title: row.title,
        subtitle: row.subtitle,
        summary: row.summary,
        author: row.author,
        publishedAt: row.published_at,
        publishedAtPrecision: publishedAtPrecision(metadata),
        detectedAt: row.detected_at,
        lastDetectedAt: row.last_detected_at,
        imageUrl: row.image_url,
        processingStatus: row.processing_status as ArticleProcessingStatus,
        latestSnapshotId: snapshotRow?.id ?? null,
        hasUsableSnapshot: articleBody(snapshotRow?.body).some(
          (block) => block.text.trim().length > 0,
        ),
        sourceUrl: row.normalized_url || row.original_url,
        isManualEntry: metadata.origin === "manual",
        usedInComposition: dossierSources.some(
          (source) => source.newsroom_article_id === row.id && source.included,
        ),
      };
      const editorial = classifyNewsroomEditorialInboxItem(
        summary,
        reviewState,
        usedState,
      );
      const articleDossierSources = dossierSources.filter(
        (source) => source.newsroom_article_id === row.id,
      );
      const articleDossierSourceIds = new Set(
        articleDossierSources.map((source) => source.id),
      );
      const evidenceByPublishedArticle = new Map<
        string,
        EditorialDeskPublishedRelationEvidence[]
      >();

      for (const assignment of assignments) {
        if (!articleDossierSourceIds.has(assignment.dossier_source_id)) continue;
        const source = dossierSourceById.get(assignment.dossier_source_id)!;
        const plan = planById.get(assignment.article_plan_id);
        const dossier = dossierById.get(assignment.dossier_id);
        const publishedArticle = plan?.editorial_article_id
          ? publishedById.get(plan.editorial_article_id)
          : null;
        if (!plan || plan.dossier_id !== source.dossier_id || !dossier) {
          throw new EditorialDeskRelationInvalidError();
        }
        if (!publishedArticle) continue;
        const evidence = evidenceByPublishedArticle.get(publishedArticle.id) ?? [];
        evidence.push({
          kind: "dossier_plan",
          dossierId: dossier.id,
          dossierTitle: dossier.title,
          dossierStatus: dossier.status,
          dossierSourceId: source.id,
          articlePlanId: plan.id,
          newsroomSnapshotId: source.newsroom_snapshot_id,
        });
        evidenceByPublishedArticle.set(publishedArticle.id, evidence);
      }

      for (const usage of articleLegacyUsage) {
        if (!usage.published_article_id) continue;
        const publishedArticle = publishedById.get(usage.published_article_id);
        if (!publishedArticle) continue;
        const evidence = evidenceByPublishedArticle.get(publishedArticle.id) ?? [];
        evidence.push({
          kind: "legacy_source_package",
          packageId: usage.package_id,
          year: usage.year,
          month: usage.month,
          articlePosition: usage.article_position,
          sourcePosition: usage.source_position,
          newsroomSnapshotId: usage.newsroom_snapshot_id,
          usedAt: usage.used_at,
        });
        evidenceByPublishedArticle.set(publishedArticle.id, evidence);
      }

      const publishedRelations = [...evidenceByPublishedArticle.entries()]
        .map(([articleId, evidence]): EditorialDeskPublishedRelation => {
          const article = publishedById.get(articleId);
          if (
            !article
            || article.status !== "published"
            || !nonEmpty(article.slug)
            || !nonEmpty(article.title)
          ) throw new EditorialDeskRelationInvalidError();
          return {
            editorialArticleId: article.id,
            slug: article.slug,
            title: article.title,
            publishedAt: article.published_at,
            evidence: [...evidence].sort((left, right) => (
              left.kind.localeCompare(right.kind)
              || (left.kind === "dossier_plan" && right.kind === "dossier_plan"
                ? left.articlePlanId.localeCompare(right.articlePlanId)
                : left.kind === "legacy_source_package" && right.kind === "legacy_source_package"
                  ? left.packageId.localeCompare(right.packageId)
                  : 0)
            )),
          };
        })
        .sort((left, right) => left.editorialArticleId.localeCompare(right.editorialArticleId));
      const dossierUsage = articleDossierSources.map((source) => {
        const dossier = dossierById.get(source.dossier_id);
        if (!dossier) throw new EditorialDeskRelationInvalidError();
        return {
          dossierId: dossier.id,
          dossierTitle: dossier.title,
          dossierStatus: dossier.status,
          dossierSourceId: source.id,
          newsroomSnapshotId: source.newsroom_snapshot_id,
          included: source.included,
        };
      }).sort((left, right) => (
        left.dossierId.localeCompare(right.dossierId)
        || left.dossierSourceId.localeCompare(right.dossierSourceId)
      ));
      const packageUsage = articleLegacyUsage
        .map((usage) => ({
          packageId: usage.package_id,
          year: usage.year,
          month: usage.month,
          articlePosition: usage.article_position,
          sourcePosition: usage.source_position,
          newsroomSnapshotId: usage.newsroom_snapshot_id,
          usedAt: usage.used_at,
          publishedArticleId: usage.published_article_id,
        }))
        .sort((left, right) => (
          Date.parse(right.usedAt) - Date.parse(left.usedAt)
          || left.packageId.localeCompare(right.packageId)
          || left.articlePosition - right.articlePosition
          || left.sourcePosition - right.sourcePosition
        ));

      return {
        newsroomArticleId: row.id,
        sourceCode: row.source_code,
        sourceName: row.source_name,
        url: row.normalized_url || row.original_url,
        originalUrl: row.original_url,
        normalizedUrl: row.normalized_url,
        title: row.title,
        subtitle: row.subtitle,
        summary: row.summary,
        body: articleBody(snapshotRow?.body),
        imageCandidateUrl: row.image_url,
        publishedAt: row.published_at,
        publishedAtPrecision: publishedAtPrecision(metadata),
        snapshot: snapshotRow
          ? {
              id: snapshotRow.id,
              contentHash: snapshotRow.content_hash,
              extractedAt: snapshotRow.extracted_at,
              createdAt: snapshotRow.created_at,
              sourceMetadata: metadata,
            }
          : null,
        sourceState: {
          processingStatus: row.processing_status as ArticleProcessingStatus,
          editorial,
          editoriallyActionable: editorial.view === "pending" || editorial.view === "working",
          changedAfterKnownUsage: newsroomEditorialUsedUpdateAvailable(summary, usedState),
        },
        classification: prePublicationClassification(classificationByArticle.get(row.id)),
        themeMembership: themeMembership(
          themeSources
            .filter((source) => source.newsroom_article_id === row.id)
            .map((source) => source.theme_id),
        ),
        publishedRelations: {
          status: publishedRelations.length > 0 ? "known" : "unknown",
          items: publishedRelations,
        },
        usageProvenance: {
          status: dossierUsage.length > 0 || packageUsage.length > 0 ? "known" : "none",
          dossierSources: dossierUsage,
          legacySourcePackages: packageUsage,
        },
      };
    }),
    pagination: {
      limit: input.limit,
      offset: input.offset,
      hasNextPage: page.hasNextPage,
    },
  };
}

async function readPublishedItems(
  transport: EditorialDeskReadTransport,
  input: NormalizedInput["publicadas"],
  classification: EditorialDeskClassificationFilter,
): Promise<EditorialDeskReadModel["publicadas"]> {
  const page = await transport.listPublishedArticles({ ...input, classification });
  const records = [...page.items].sort(publishedArticleSort);
  if (records.some((row) => (
    !isUuid(row.id)
    || !nonEmpty(row.slug)
    || !nonEmpty(row.title)
    || row.status !== "published"
    || (row.published_at !== null && !validDate(row.published_at))
    || !optionalUuid(row.competition_id)
    || !optionalUuid(row.season_id)
    || !optionalUuid(row.matchday_id)
  ))) throw new EditorialDeskRelationInvalidError();

  const articleIds = records.map((row) => row.id);
  const [bankRows, themeRows] = await Promise.all([
    transport.readBankContexts(articleIds),
    transport.readThemeArticlesByArticleIds(articleIds),
  ]);
  for (const row of bankRows) {
    if (
      !articleIds.includes(row.source_id)
      || !isUuid(row.id)
      || (row.status !== "active" && row.status !== "archived")
      || !isUuid(row.competition_id)
      || !isUuid(row.season_id)
      || !isUuid(row.matchday_id)
    ) throw new EditorialDeskRelationInvalidError();
    bankClassification(row);
  }
  for (const row of themeRows) {
    if (
      !articleIds.includes(row.editorial_article_id)
      || !isUuid(row.theme_id)
      || !validDate(row.added_at)
    ) throw new EditorialDeskRelationInvalidError();
  }
  const hasContextFilter = Boolean(
    input.contextFilter.competitionId
    || input.contextFilter.seasonId
    || input.contextFilter.matchdayId,
  );
  if (hasContextFilter || classification.mode !== "all") {
    for (const article of records) {
      const hasMatchingBankContext = bankRows.some((context) => (
        context.source_id === article.id
        && matchesContext(context, input.contextFilter)
        && classificationMatchesFilter(bankClassification(context), classification)
      ));
      if (!hasMatchingBankContext) throw new EditorialDeskRelationInvalidError();
    }
  }

  return {
    items: records.map((row) => ({
      editorialArticleId: row.id,
      slug: row.slug!,
      title: row.title!,
      anteTitle: row.label,
      postTitle: row.subtitle,
      imageUrl: row.image_url,
      publishedAt: row.published_at,
      status: "published",
      canonicalContext: {
        competitionId: row.competition_id,
        seasonId: row.season_id,
        matchdayId: row.matchday_id,
      },
      bankContexts: bankRows
        .filter((context) => context.source_id === row.id)
        .map((context): EditorialDeskPublishedBankContext => ({
          bankItemId: context.id,
          bankStatus: context.status as "active" | "archived",
          competitionId: context.competition_id,
          seasonId: context.season_id,
          matchdayId: context.matchday_id,
          matchesFilter: matchesContext(context, input.contextFilter)
            && classificationMatchesFilter(bankClassification(context), classification),
          classification: bankClassification(context),
        }))
        .sort((left, right) => (
          left.matchdayId.localeCompare(right.matchdayId)
          || left.bankItemId.localeCompare(right.bankItemId)
        )),
      themeMembership: themeMembership(
        themeRows
          .filter((membership) => membership.editorial_article_id === row.id)
          .map((membership) => membership.theme_id),
      ),
    })),
    pagination: {
      limit: input.limit,
      offset: input.offset,
      hasNextPage: page.hasNextPage,
    },
    contextFilter: input.contextFilter,
  };
}

async function readThemes(
  transport: EditorialDeskReadTransport,
  input: NormalizedInput["temas"],
  classification: EditorialDeskClassificationFilter,
): Promise<EditorialDeskReadModel["temas"]> {
  const page = await transport.listThemes({ ...input, classification });
  const records = [...page.items].sort(themeSort);
  if (records.some((row) => (
    !isUuid(row.id)
    || !nonEmpty(row.title)
    || !isArticleClassificationKey(row.classification_key)
    || row.status !== input.status
    || classification.mode === "unclassified"
    || (classification.mode === "classified"
      && row.classification_key !== classification.classificationKey)
    || !optionalUuid(row.competition_id)
    || !optionalUuid(row.season_id)
    || !optionalUuid(row.matchday_id)
    || !optionalUuid(row.match_id)
    || !validDate(row.created_at)
    || !validDate(row.updated_at)
  ))) throw new EditorialDeskRelationInvalidError();

  const themeIds = records.map((row) => row.id);
  const [sourceRows, articleRows] = await Promise.all([
    transport.readThemeSourcesByThemeIds(themeIds),
    transport.readThemeArticlesByThemeIds(themeIds),
  ]);
  for (const row of sourceRows) {
    if (
      !themeIds.includes(row.theme_id)
      || !isUuid(row.newsroom_article_id)
      || !validDate(row.added_at)
    ) throw new EditorialDeskRelationInvalidError();
  }
  for (const row of articleRows) {
    if (
      !themeIds.includes(row.theme_id)
      || !isUuid(row.editorial_article_id)
      || !validDate(row.added_at)
    ) throw new EditorialDeskRelationInvalidError();
  }

  return {
    items: records.map((row) => ({
      id: row.id,
      title: row.title,
      classificationKey: row.classification_key as ArticleClassificationKey,
      status: row.status as "open" | "archived",
      contextText: row.context_text,
      context: {
        competitionId: row.competition_id,
        seasonId: row.season_id,
        matchdayId: row.matchday_id,
        matchId: row.match_id,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceCount: sourceRows.filter((membership) => membership.theme_id === row.id).length,
      articleCount: articleRows.filter((membership) => membership.theme_id === row.id).length,
      lastActivityAt: null,
    })),
    pagination: {
      limit: input.limit,
      offset: input.offset,
      hasNextPage: page.hasNextPage,
    },
    status: input.status,
  };
}

export function createEditorialDeskReadModel(
  transport: EditorialDeskReadTransport,
) {
  return async function loadEditorialDeskReadModel(
    input: EditorialDeskReadModelInput = {},
  ): Promise<EditorialDeskReadModelResult> {
    const normalized = normalizeInput(input);
    if (!normalized) return errorResult("invalid_request");
    if (!transport.isConfigured()) return errorResult("not_configured");

    try {
      const [novas, publicadas, temas] = await Promise.all([
        readNewItems(transport, normalized.novas, normalized.classification),
        readPublishedItems(transport, normalized.publicadas, normalized.classification),
        readThemes(transport, normalized.temas, normalized.classification),
      ]);
      return {
        ok: true,
        value: {
          classification: normalized.classification,
          novas,
          publicadas,
          temas,
        },
      };
    } catch (error) {
      return error instanceof EditorialDeskRelationInvalidError
        ? errorResult("relation_invalid")
        : errorResult("read_unavailable");
    }
  };
}
