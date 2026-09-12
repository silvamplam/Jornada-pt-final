import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";
import type {
  EditorialDeskClassificationFilter,
  EditorialDeskPage,
  EditorialDeskPrePublicationClassification,
  EditorialDeskThemeMembership,
} from "@/lib/redacao-automatica/newsroom-desk-read-model-internal";
import type {
  NewsroomArticleClassificationSource,
} from "@/lib/redacao-automatica/newsroom-article-classification-service-internal";
import type {
  ArticleBodyBlock,
  ArticleProcessingStatus,
  JsonObject,
} from "@/lib/redacao-automatica/types";
import {
  MESA_OPERATIONAL_CYCLE_STARTED_AT,
} from "@/lib/redacao-automatica/newsroom-operational-desk-contract";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_STATUSES = new Set<ArticleProcessingStatus>([
  "detected",
  "normalized",
  "duplicate",
  "rejected",
  "ready_for_review",
  "failed",
]);

export type OperationalDeskSourceLifecycle = "new" | "published";

export type OperationalDeskPublishedContribution =
  | Readonly<{
      origin: "dossier_plan";
      editorialArticleId: string;
      slug: string;
      title: string;
      publishedAt: string | null;
      dossierId: string;
      dossierTitle: string;
      articlePlanId: string;
      dossierSourceId: string;
      newsroomSnapshotId: string;
    }>
  | Readonly<{
      origin: "legacy_source_package";
      editorialArticleId: string;
      slug: string;
      title: string;
      publishedAt: string | null;
      packageId: string;
      packageGroup?: number;
      packageYear?: string;
      packageMonth?: string;
      usedAt: string;
      newsroomSnapshotId: string;
    }>;

export type OperationalDeskSourceItem = Readonly<{
  lifecycle: OperationalDeskSourceLifecycle;
  newsroomArticleId: string;
  sourceCode: string;
  sourceName: string | null;
  url: string | null;
  title: string;
  subtitle: string | null;
  summary: string | null;
  imageCandidateUrl: string | null;
  publishedAt: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  snapshot: Readonly<{
    id: string;
    contentHash: string;
    body: readonly ArticleBodyBlock[];
    extractedAt: string;
    createdAt: string;
    sourceMetadata: JsonObject;
    hasUsableBody?: boolean;
  }> | null;
  classification: EditorialDeskPrePublicationClassification;
  themeMembership: EditorialDeskThemeMembership;
  publishedContributions: readonly OperationalDeskPublishedContribution[];
  sourceUpdated: boolean;
  dossierMembership?: readonly string[];
  comparisonSnapshotId?: string | null;
  sourceUpdatedAt?: string | null;
}>;

export type OperationalDeskClassificationCounts = Readonly<{
  total: number;
  benfica: number;
  sporting: number;
  fc_porto: number;
  other_liga_clubs: number;
  outside_liga_other: number;
  unclassified: number;
}>;

export type OperationalDeskSourceCounts = Readonly<{
  novas: OperationalDeskClassificationCounts;
  publicadas: OperationalDeskClassificationCounts;
}>;

export type OperationalDeskReadModelInput = Readonly<{
  classification?: EditorialDeskClassificationFilter;
  sourceCode?: string | null;
  // Explicit context reads may recover older material; the general inbox keeps its cycle.
  sourceIds?: readonly string[];
  novas?: Readonly<{ limit?: number; offset?: number }>;
  publicadas?: Readonly<{ limit?: number; offset?: number }>;
}>;

export type OperationalDeskReadModel = Readonly<{
  cycleStartedAt: string;
  classification: EditorialDeskClassificationFilter;
  counts: OperationalDeskSourceCounts;
  sources: readonly OperationalDeskSourceItem[];
  novas: EditorialDeskPage<OperationalDeskSourceItem>;
  publicadas: EditorialDeskPage<OperationalDeskSourceItem>;
}>;

export type OperationalDeskReadModelResult =
  | Readonly<{ ok: true; value: OperationalDeskReadModel }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "invalid_request" | "not_configured" | "relation_invalid" | "read_unavailable";
        message: string;
      }>;
    }>;

export type OperationalDeskArticleRecord = Readonly<{
  id: string;
  source_code: string;
  source_name: string | null;
  original_url: string | null;
  normalized_url: string | null;
  title: string;
  subtitle: string | null;
  summary: string | null;
  published_at: string | null;
  first_detected_at: string;
  last_detected_at: string;
  image_url: string | null;
  processing_status: string;
}>;

export type OperationalDeskSnapshotRecord = Readonly<{
  id: string;
  article_id: string;
  content_hash: string;
  body: unknown;
  source_metadata: unknown;
  has_usable_snapshot?: boolean;
  extracted_at: string;
  created_at: string;
}>;

export type OperationalDeskReviewRecord = Readonly<{
  newsroom_article_id: string;
  decision: string;
  reviewed_snapshot_id: string;
  reviewed_at: string;
}>;

export type OperationalDeskClassificationRecord = Readonly<{
  newsroom_article_id: string;
  classification_key: string;
  classification_source: string;
  classified_at: string;
  updated_at: string;
}>;

export type OperationalDeskThemeSourceRecord = Readonly<{
  theme_id: string;
  newsroom_article_id: string;
  reference_snapshot_id?: string | null;
  added_at?: string | null;
}>;

export type OperationalDeskDossierSourceRecord = Readonly<{
  id: string;
  dossier_id: string;
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  included?: boolean;
}>;

export type OperationalDeskPlanAssignmentRecord = Readonly<{
  dossier_id: string;
  article_plan_id: string;
  dossier_source_id: string;
}>;

export type OperationalDeskPlanRecord = Readonly<{
  id: string;
  dossier_id: string;
  editorial_article_id: string | null;
}>;

export type OperationalDeskFinalUsageRecord = Readonly<{
  dossier_id: string;
  article_plan_id: string;
  dossier_source_id: string;
  editorial_article_id: string;
}>;

export type OperationalDeskProductionContextRecord = Readonly<{
  dossier_id: string;
  theme_id: string | null;
  source_refs: unknown;
  created_at: string;
  workspace_role: string | null;
  workspace_contract_version: number | null;
  workspace_state: string | null;
}>;

export type OperationalDeskDossierRecord = Readonly<{
  id: string;
  title: string;
  preparation_key: string | null;
}>;

export type OperationalDeskLegacyUsageRecord = Readonly<{
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  used_at: string;
  package_id: string;
  package_group?: number;
  package_year?: string;
  package_month?: string;
  published_article_id: string | null;
}>;

export type OperationalDeskPublishedArticleRecord = Readonly<{
  id: string;
  slug: string;
  title: string;
  status: string;
  published_at: string | null;
}>;

export interface OperationalDeskReadTransport {
  isConfigured(): boolean;
  listCycleArticles(sourceCode: string | null, sourceIds?: readonly string[]): Promise<readonly OperationalDeskArticleRecord[]>;
  readLatestSnapshots(articleIds: readonly string[]): Promise<readonly OperationalDeskSnapshotRecord[]>;
  readReviewStates(articleIds: readonly string[]): Promise<readonly OperationalDeskReviewRecord[]>;
  readClassifications(articleIds: readonly string[]): Promise<readonly OperationalDeskClassificationRecord[]>;
  readThemeSources(articleIds: readonly string[]): Promise<readonly OperationalDeskThemeSourceRecord[]>;
  readLegacyUsage(articleIds: readonly string[]): Promise<readonly OperationalDeskLegacyUsageRecord[]>;
  readDossierSources(articleIds: readonly string[]): Promise<readonly OperationalDeskDossierSourceRecord[]>;
  readPlanAssignments(dossierSourceIds: readonly string[]): Promise<readonly OperationalDeskPlanAssignmentRecord[]>;
  readFinalUsage?(dossierSourceIds: readonly string[]): Promise<readonly OperationalDeskFinalUsageRecord[]>;
  readProductionContexts?(dossierIds: readonly string[]): Promise<readonly OperationalDeskProductionContextRecord[]>;
  readPlans(planIds: readonly string[]): Promise<readonly OperationalDeskPlanRecord[]>;
  readDossiers(dossierIds: readonly string[]): Promise<readonly OperationalDeskDossierRecord[]>;
  readPublishedArticles(articleIds: readonly string[]): Promise<readonly OperationalDeskPublishedArticleRecord[]>;
}

type NormalizedInput = Readonly<{
  classification: EditorialDeskClassificationFilter;
  sourceCode: string | null;
  sourceIds?: readonly string[];
  novas: Readonly<{ limit: number; offset: number }>;
  publicadas: Readonly<{ limit: number; offset: number }>;
}>;

class OperationalDeskRelationInvalidError extends Error {}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function pageInput(
  value: Readonly<{ limit?: number; offset?: number }> | undefined,
): Readonly<{ limit: number; offset: number }> | null {
  const limit = value?.limit ?? DEFAULT_PAGE_SIZE;
  const offset = value?.offset ?? 0;
  return Number.isInteger(limit)
    && limit >= 1
    && limit <= MAX_PAGE_SIZE
    && Number.isInteger(offset)
    && offset >= 0
    ? { limit, offset }
    : null;
}

function normalizeInput(input: OperationalDeskReadModelInput): NormalizedInput | null {
  const classification = input.classification ?? { mode: "all" };
  const novas = pageInput(input.novas);
  const publicadas = pageInput(input.publicadas);
  if (
    !novas
    || (input.sourceIds !== undefined && (
      !Array.isArray(input.sourceIds)
      || input.sourceIds.some((id) => !isUuid(id))
      || new Set(input.sourceIds).size !== input.sourceIds.length
    ))
    || !publicadas
    || (classification.mode === "classified"
      && !isArticleClassificationKey(classification.classificationKey))
  ) return null;
  return {
    classification,
    sourceCode: input.sourceCode?.trim() || null,
    sourceIds: input.sourceIds,
    novas,
    publicadas,
  };
}

function jsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function articleBody(value: unknown): readonly ArticleBodyBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): ArticleBodyBlock[] => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const block = candidate as Record<string, unknown>;
    return (block.type === "paragraph" || block.type === "heading")
      && typeof block.text === "string"
      && block.text.trim().length > 0
      ? [{ type: block.type, text: block.text.trim() }]
      : [];
  });
}

function classification(
  row: OperationalDeskClassificationRecord | undefined,
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
    !isArticleClassificationKey(row.classification_key)
    || (row.classification_source !== "automatic" && row.classification_source !== "manual")
    || !validDate(row.classified_at)
    || !validDate(row.updated_at)
  ) throw new OperationalDeskRelationInvalidError();
  return {
    status: "classified",
    classificationKey: row.classification_key,
    classificationSource: row.classification_source as NewsroomArticleClassificationSource,
    classifiedAt: row.classified_at,
    updatedAt: row.updated_at,
  };
}

function classificationMatches(
  item: OperationalDeskSourceItem,
  filter: EditorialDeskClassificationFilter,
): boolean {
  if (filter.mode === "all") return true;
  if (filter.mode === "unclassified") return item.classification.status === "unclassified";
  return item.classification.status === "classified"
    && item.classification.classificationKey === filter.classificationKey;
}

function counts(items: readonly OperationalDeskSourceItem[]): OperationalDeskClassificationCounts {
  const result = {
    total: items.length,
    benfica: 0,
    sporting: 0,
    fc_porto: 0,
    other_liga_clubs: 0,
    outside_liga_other: 0,
    unclassified: 0,
  };
  for (const item of items) {
    if (item.classification.status === "unclassified") result.unclassified += 1;
    else result[item.classification.classificationKey] += 1;
  }
  return result;
}

function page<T>(
  items: readonly T[],
  pagination: Readonly<{ limit: number; offset: number }>,
): EditorialDeskPage<T> {
  return {
    items: items.slice(pagination.offset, pagination.offset + pagination.limit),
    pagination: {
      ...pagination,
      hasNextPage: items.length > pagination.offset + pagination.limit,
    },
  };
}

function uniqueBy<T>(values: readonly T[], identity: (value: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = identity(value);
    if (result.has(key)) throw new OperationalDeskRelationInvalidError();
    result.set(key, value);
  }
  return result;
}

function idsFor<T>(values: readonly T[], identity: (value: T) => string | null): string[] {
  return [...new Set(values.flatMap((value) => {
    const id = identity(value);
    return id ? [id] : [];
  }))];
}

type OperationalDeskReadErrorCode = Extract<
  OperationalDeskReadModelResult,
  { ok: false }
>["error"]["code"];

function errorResult(code: OperationalDeskReadErrorCode): OperationalDeskReadModelResult {
  const messages = {
    invalid_request: "Os filtros da Mesa operacional não são válidos.",
    not_configured: "A leitura administrativa da Mesa não está configurada.",
    relation_invalid: "A Mesa encontrou uma relação editorial persistida inválida.",
    read_unavailable: "Não foi possível ler a Mesa operacional neste momento.",
  } as const;
  return { ok: false, error: { code, message: messages[code] } };
}

export function createOperationalDeskReadModel(transport: OperationalDeskReadTransport) {
  return async function loadOperationalDeskReadModel(
    input: OperationalDeskReadModelInput = {},
  ): Promise<OperationalDeskReadModelResult> {
    const normalized = normalizeInput(input);
    if (!normalized) return errorResult("invalid_request");
    if (!transport.isConfigured()) return errorResult("not_configured");

    try {
      const records = [...await transport.listCycleArticles(normalized.sourceCode, normalized.sourceIds)]
        .sort((left, right) => (
          Date.parse(right.last_detected_at) - Date.parse(left.last_detected_at)
          || right.id.localeCompare(left.id)
        ));
      if (records.some((row) => (
        !isUuid(row.id)
        || !nonEmpty(row.source_code)
        || !nonEmpty(row.title)
        || !validDate(row.first_detected_at)
        || (normalized.sourceIds === undefined && Date.parse(row.first_detected_at) < Date.parse(MESA_OPERATIONAL_CYCLE_STARTED_AT))
        || (normalized.sourceIds !== undefined && !normalized.sourceIds.includes(row.id))
        || !validDate(row.last_detected_at)
        || !SOURCE_STATUSES.has(row.processing_status as ArticleProcessingStatus)
      ))) throw new OperationalDeskRelationInvalidError();

      if (normalized.sourceIds !== undefined && records.length !== normalized.sourceIds.length) {
        throw new OperationalDeskRelationInvalidError();
      }
      const articleIds = records.map((row) => row.id);
      const [snapshots, reviews, classifications, themeSources, legacyUsage, dossierSources] =
        await Promise.all([
          transport.readLatestSnapshots(articleIds),
          transport.readReviewStates(articleIds),
          transport.readClassifications(articleIds),
          transport.readThemeSources(articleIds),
          transport.readLegacyUsage(articleIds),
          transport.readDossierSources(articleIds),
        ]);
      const snapshotByArticle = uniqueBy(snapshots, (row) => row.article_id);
      const reviewByArticle = uniqueBy(reviews, (row) => row.newsroom_article_id);
      const classificationByArticle = uniqueBy(
        classifications,
        (row) => row.newsroom_article_id,
      );
      const dossierSourceById = uniqueBy(dossierSources, (row) => row.id);
      const [assignments, finalUsage, productionContexts] = await Promise.all([
        transport.readPlanAssignments(dossierSources.map((row) => row.id)),
        transport.readFinalUsage?.(dossierSources.map((row) => row.id)) ?? Promise.resolve([]),
        transport.readProductionContexts?.(idsFor(dossierSources, (row) => row.dossier_id)) ?? Promise.resolve([]),
      ]);
      const [plans, dossiers] = await Promise.all([
        transport.readPlans([...new Set([
          ...idsFor(assignments, (row) => row.article_plan_id),
          ...idsFor(finalUsage, (row) => row.article_plan_id),
        ])]),
        transport.readDossiers(idsFor(dossierSources, (row) => row.dossier_id)),
      ]);
      const planById = uniqueBy(plans, (row) => row.id);
      const dossierById = uniqueBy(dossiers, (row) => row.id);
      const publishedArticles = await transport.readPublishedArticles(
        [...new Set([
          ...idsFor(plans, (row) => row.editorial_article_id),
          ...idsFor(finalUsage, (row) => row.editorial_article_id),
          ...idsFor(legacyUsage, (row) => row.published_article_id),
        ])],
      );
      const publishedById = uniqueBy(publishedArticles, (row) => row.id);

      for (const row of snapshots) {
        if (!articleIds.includes(row.article_id) || !isUuid(row.id) || !validDate(row.extracted_at)) {
          throw new OperationalDeskRelationInvalidError();
        }
      }
      for (const row of reviews) {
        if (
          !articleIds.includes(row.newsroom_article_id)
          || !isUuid(row.reviewed_snapshot_id)
          || !["working", "seen", "dismissed"].includes(row.decision)
        ) throw new OperationalDeskRelationInvalidError();
      }
      for (const row of classifications) {
        if (!articleIds.includes(row.newsroom_article_id)) {
          throw new OperationalDeskRelationInvalidError();
        }
        classification(row);
      }
      for (const row of themeSources) {
        if (!articleIds.includes(row.newsroom_article_id) || !isUuid(row.theme_id)) {
          throw new OperationalDeskRelationInvalidError();
        }
      }
      for (const row of finalUsage) {
        const source = dossierSourceById.get(row.dossier_source_id);
        if (
          !source
          || source.dossier_id !== row.dossier_id
          || !isUuid(row.article_plan_id)
          || !isUuid(row.editorial_article_id)
        ) throw new OperationalDeskRelationInvalidError();
      }
      for (const row of productionContexts) {
        if (
          !isUuid(row.dossier_id)
          || (row.theme_id !== null && !isUuid(row.theme_id))
          || !validDate(row.created_at)
        ) throw new OperationalDeskRelationInvalidError();
      }
      for (const row of legacyUsage) {
        if (
          !articleIds.includes(row.newsroom_article_id)
          || !isUuid(row.newsroom_snapshot_id)
          || !isUuid(row.package_id)
          || !validDate(row.used_at)
          || (row.published_article_id !== null && !isUuid(row.published_article_id))
        ) throw new OperationalDeskRelationInvalidError();
      }
      for (const row of dossierSources) {
        if (
          !articleIds.includes(row.newsroom_article_id)
          || !isUuid(row.id)
          || !isUuid(row.dossier_id)
          || !isUuid(row.newsroom_snapshot_id)
        ) throw new OperationalDeskRelationInvalidError();
      }
      for (const row of assignments) {
        const source = dossierSourceById.get(row.dossier_source_id);
        if (
          !source
          || source.dossier_id !== row.dossier_id
          || !isUuid(row.article_plan_id)
        ) throw new OperationalDeskRelationInvalidError();
      }
      for (const row of plans) {
        if (!isUuid(row.id) || !isUuid(row.dossier_id) || (row.editorial_article_id !== null && !isUuid(row.editorial_article_id))) {
          throw new OperationalDeskRelationInvalidError();
        }
      }
      for (const row of dossiers) {
        if (!isUuid(row.id) || !nonEmpty(row.title) || (row.preparation_key !== null && !isUuid(row.preparation_key))) {
          throw new OperationalDeskRelationInvalidError();
        }
      }
      for (const row of publishedArticles) {
        if (
          !isUuid(row.id)
          || row.status !== "published"
          || !nonEmpty(row.slug)
          || !nonEmpty(row.title)
          || (row.published_at !== null && !validDate(row.published_at))
        ) throw new OperationalDeskRelationInvalidError();
      }

      const publishedDossierIds = new Set([
        ...finalUsage.flatMap((usage) => (
          publishedById.has(usage.editorial_article_id) ? [usage.dossier_id] : []
        )),
        ...plans.flatMap((plan) => (
          plan.editorial_article_id && publishedById.has(plan.editorial_article_id)
            ? [plan.dossier_id]
            : []
        )),
      ]);
      const technicalDossierIds = new Set(productionContexts.flatMap((context) => (
        context.workspace_role === "technical"
        || context.workspace_contract_version === 2
        || !publishedDossierIds.has(context.dossier_id)
          ? [context.dossier_id]
          : []
      )));
      const hiddenPreparationThemeMemberships = new Set<string>();
      for (const context of productionContexts) {
        if (!context.theme_id || context.workspace_state === "abandoned") continue;
        const refs = Array.isArray(context.source_refs) ? context.source_refs : [];
        for (const rawRef of refs) {
          const ref = jsonObject(rawRef);
          const articleId = typeof ref.newsroomArticleId === "string"
            ? ref.newsroomArticleId.toLowerCase()
            : "";
          const membership = themeSources.find((candidate) => (
            candidate.theme_id === context.theme_id
            && candidate.newsroom_article_id === articleId
            && candidate.added_at === context.created_at
          ));
          if (membership) hiddenPreparationThemeMemberships.add(`${membership.theme_id}:${articleId}`);
        }
      }

      const items = records.flatMap((row): OperationalDeskSourceItem[] => {
        const snapshot = snapshotByArticle.get(row.id) ?? null;
        const review = reviewByArticle.get(row.id) ?? null;
        const memberships = themeSources.filter((member) => (
          member.newsroom_article_id === row.id
          && !hiddenPreparationThemeMemberships.has(`${member.theme_id}:${row.id}`)
        ));
        const organizedDossierIds = idsFor(dossierSources.filter(
          (source) => source.newsroom_article_id === row.id
            && source.included !== false
            && !technicalDossierIds.has(source.dossier_id),
        ), (source) => source.dossier_id);
        if (
          normalized.sourceIds === undefined
          && memberships.length === 0 && organizedDossierIds.length === 0
          && review?.decision === "dismissed"
          && snapshot
          && review.reviewed_snapshot_id === snapshot.id
        ) return [];

        const sourceRows = dossierSources.filter(
          (source) => source.newsroom_article_id === row.id,
        );
        const sourceIds = new Set(sourceRows.map((source) => source.id));
        const contributionsByArticle = new Map<string, OperationalDeskPublishedContribution>();
        for (const usage of finalUsage) {
          if (!sourceIds.has(usage.dossier_source_id)) continue;
          const source = dossierSourceById.get(usage.dossier_source_id)!;
          const plan = planById.get(usage.article_plan_id);
          const dossier = dossierById.get(usage.dossier_id);
          const article = publishedById.get(usage.editorial_article_id);
          if (!plan || !dossier || !article || plan.dossier_id !== source.dossier_id) {
            throw new OperationalDeskRelationInvalidError();
          }
          contributionsByArticle.set(article.id, {
            origin: "dossier_plan",
            editorialArticleId: article.id,
            slug: article.slug,
            title: article.title,
            publishedAt: article.published_at,
            dossierId: dossier.id,
            dossierTitle: dossier.title,
            articlePlanId: plan.id,
            dossierSourceId: source.id,
            newsroomSnapshotId: source.newsroom_snapshot_id,
          });
        }
        for (const assignment of assignments) {
          if (!sourceIds.has(assignment.dossier_source_id)) continue;
          const source = dossierSourceById.get(assignment.dossier_source_id)!;
          const plan = planById.get(assignment.article_plan_id);
          const dossier = dossierById.get(assignment.dossier_id);
          if (!plan || !dossier || plan.dossier_id !== source.dossier_id) {
            throw new OperationalDeskRelationInvalidError();
          }
          if (!plan.editorial_article_id) continue;
          if (technicalDossierIds.has(assignment.dossier_id)) continue;
          const article = publishedById.get(plan.editorial_article_id);
          if (!article) continue;
          if (!contributionsByArticle.has(article.id)) {
            contributionsByArticle.set(article.id, {
              origin: "dossier_plan",
              editorialArticleId: article.id,
              slug: article.slug,
              title: article.title,
              publishedAt: article.published_at,
              dossierId: dossier.id,
              dossierTitle: dossier.title,
              articlePlanId: plan.id,
              dossierSourceId: source.id,
              newsroomSnapshotId: source.newsroom_snapshot_id,
            });
          }
        }
        for (const usage of legacyUsage) {
          if (
            usage.newsroom_article_id !== row.id
            || !usage.published_article_id
            || contributionsByArticle.has(usage.published_article_id)
          ) continue;
          const article = publishedById.get(usage.published_article_id);
          if (!article) continue;
          contributionsByArticle.set(article.id, {
            origin: "legacy_source_package",
            editorialArticleId: article.id,
            slug: article.slug,
            title: article.title,
            publishedAt: article.published_at,
            packageId: usage.package_id,
            packageGroup: usage.package_group,
            packageYear: usage.package_year,
            packageMonth: usage.package_month,
            usedAt: usage.used_at,
            newsroomSnapshotId: usage.newsroom_snapshot_id,
          });
        }
        const publishedContributions = [...contributionsByArticle.values()]
          .sort((left, right) => (
            Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? "")
            || left.editorialArticleId.localeCompare(right.editorialArticleId)
          ));
        const knownReferences = [
          review?.reviewed_snapshot_id,
          ...memberships.map((member) => member.reference_snapshot_id),
          ...sourceRows.filter((source) => source.included !== false && !technicalDossierIds.has(source.dossier_id))
            .map((source) => source.newsroom_snapshot_id),
          ...publishedContributions.map((contribution) => contribution.newsroomSnapshotId),
        ].filter((id): id is string => Boolean(id));
        const comparisonSnapshotId = knownReferences.find((id) => id !== snapshot?.id) ?? null;
        const sourceUpdated = Boolean(snapshot && (
          comparisonSnapshotId
          || (review && review.reviewed_snapshot_id !== snapshot.id)
          || publishedContributions.some(
            (contribution) => contribution.newsroomSnapshotId !== snapshot.id,
          )
        ));
        return [{
          lifecycle: publishedContributions.length > 0 ? "published" : "new",
          newsroomArticleId: row.id,
          sourceCode: row.source_code,
          sourceName: row.source_name,
          url: row.normalized_url || row.original_url,
          title: row.title,
          subtitle: row.subtitle,
          summary: row.summary,
          imageCandidateUrl: row.image_url,
          publishedAt: row.published_at,
          firstDetectedAt: row.first_detected_at,
          lastDetectedAt: row.last_detected_at,
          snapshot: snapshot ? {
            id: snapshot.id,
            contentHash: snapshot.content_hash,
            body: articleBody(snapshot.body),
            extractedAt: snapshot.extracted_at,
            createdAt: snapshot.created_at,
            sourceMetadata: jsonObject(snapshot.source_metadata),
            hasUsableBody: snapshot.has_usable_snapshot ?? articleBody(snapshot.body).length > 0,
          } : null,
              classification: classification(classificationByArticle.get(row.id)),
              themeMembership: {
                status: memberships.length > 0
                  ? "associated"
                  : "none",
                themeIds: memberships
                  .map((member) => member.theme_id)
                  .sort(),
          },
          publishedContributions,
          sourceUpdated,
          dossierMembership: organizedDossierIds,
          comparisonSnapshotId,
          sourceUpdatedAt: sourceUpdated ? snapshot?.extracted_at ?? null : null,
        }];
      });

      const novas = items.filter((item) => item.lifecycle === "new"
        && item.themeMembership.themeIds.length === 0
        && (item.dossierMembership?.length ?? 0) === 0);
      const publicadas = items.filter((item) => item.lifecycle === "published");
      return {
        ok: true,
        value: {
          cycleStartedAt: MESA_OPERATIONAL_CYCLE_STARTED_AT,
          classification: normalized.classification,
          sources: items,
          counts: { novas: counts(novas), publicadas: counts(publicadas) },
          novas: page(
            novas.filter((item) => classificationMatches(item, normalized.classification)),
            normalized.novas,
          ),
          publicadas: page(
            publicadas.filter((item) => classificationMatches(item, normalized.classification)),
            normalized.publicadas,
          ),
        },
      };
    } catch (error) {
      return error instanceof OperationalDeskRelationInvalidError
        ? errorResult("relation_invalid")
        : errorResult("read_unavailable");
    }
  };
}
