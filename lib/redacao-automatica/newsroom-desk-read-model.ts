import "server-only";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
} from "@/lib/supabase";
import {
  editorialSourcePackageUsedDossierRefs,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import {
  findRegisteredSource,
} from "@/lib/redacao-automatica/source-registry";
import {
  createEditorialDeskReadModel,
  type EditorialDeskBankContextRecord,
  type EditorialDeskClassificationFilter,
  type EditorialDeskClassificationRecord,
  type EditorialDeskDossierRecord,
  type EditorialDeskDossierSourceRecord,
  type EditorialDeskLegacyUsageRecord,
  type EditorialDeskNewArticleRecord,
  type EditorialDeskPlanAssignmentRecord,
  type EditorialDeskPlanRecord,
  type EditorialDeskPublishedArticleRecord,
  type EditorialDeskPublishedContextFilter,
  type EditorialDeskReadModelInput,
  type EditorialDeskReviewRecord,
  type EditorialDeskSnapshotRecord,
  type EditorialDeskThemeArticleRecord,
  type EditorialDeskThemeRecord,
  type EditorialDeskThemeSourceRecord,
  type EditorialDeskTransportPage,
} from "@/lib/redacao-automatica/newsroom-desk-read-model-internal";

export type {
  EditorialDeskBankClassification,
  EditorialDeskClassificationFilter,
  EditorialDeskNewItem,
  EditorialDeskNewItemsInput,
  EditorialDeskPage,
  EditorialDeskPageInput,
  EditorialDeskPagination,
  EditorialDeskPrePublicationClassification,
  EditorialDeskPublishedBankContext,
  EditorialDeskPublishedContextFilter,
  EditorialDeskPublishedInput,
  EditorialDeskPublishedItem,
  EditorialDeskPublishedRelation,
  EditorialDeskPublishedRelationEvidence,
  EditorialDeskPublishedRelations,
  EditorialDeskReadModel,
  EditorialDeskReadModelInput,
  EditorialDeskReadModelResult,
  EditorialDeskThemeMembership,
  EditorialDeskThemeSummary,
  EditorialDeskThemesInput,
  EditorialDeskUsageProvenance,
} from "@/lib/redacao-automatica/newsroom-desk-read-model-internal";

const BATCH_SIZE = 100;
const LEGACY_FILTER_BATCH_SIZE = 20;
const RELATION_PAGE_SIZE = 500;
const LEGACY_PACKAGE_PAGE_SIZE = 500;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NewsroomArticleRow = Omit<EditorialDeskNewArticleRecord, "source_name">;

type SnapshotIdentityRow = Readonly<{
  id: string;
  article_id: string;
}>;

type LegacyPackageRow = Readonly<{
  id: string;
  manifest: unknown;
}>;

type MatchdayRow = Readonly<{
  id: string;
  season_id: string;
}>;

type SeasonRow = Readonly<{
  id: string;
  competition_id: string;
}>;

type BankRow = Readonly<{
  id: string;
  source_id: string;
  status: string;
  matchday_id: string;
  classification_key: string | null;
  classification_source: string | null;
  classified_at: string | null;
}>;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function chunks(values: readonly string[], size = BATCH_SIZE): string[][] {
  const result: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function inList(values: readonly string[]): string {
  return values.map((value) => encodeURIComponent(value)).join(",");
}

async function readAllPages<T>(
  orderedQuery: string,
  pageSize = RELATION_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ;) {
    const page = await fetchSupabaseAdminTable<T>(
      `${orderedQuery}&limit=${pageSize}&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < pageSize) return rows;
    offset += page.length;
  }
}

async function readByChunks<T>(
  values: readonly string[],
  query: (chunk: readonly string[]) => string,
): Promise<T[]> {
  const normalized = unique(values);
  if (normalized.length === 0) return [];
  const pages = await Promise.all(
    chunks(normalized).map((chunk) => readAllPages<T>(query(chunk))),
  );
  return pages.flat();
}

function page<T>(
  rows: readonly T[],
  limit: number,
): EditorialDeskTransportPage<T> {
  return {
    items: rows.slice(0, limit),
    hasNextPage: rows.length > limit,
  };
}

function publishedSort(
  left: EditorialDeskPublishedArticleRecord,
  right: EditorialDeskPublishedArticleRecord,
): number {
  const leftTime = left.published_at ? Date.parse(left.published_at) : Number.NEGATIVE_INFINITY;
  const rightTime = right.published_at ? Date.parse(right.published_at) : Number.NEGATIVE_INFINITY;
  return rightTime - leftTime || right.id.localeCompare(left.id);
}

async function readMatchdaysBySeasonIds(
  seasonIds: readonly string[],
): Promise<MatchdayRow[]> {
  return readByChunks<MatchdayRow>(seasonIds, (chunk) => (
    "matchdays?select=id,season_id"
    + `&season_id=in.(${inList(chunk)})`
    + "&order=season_id.asc,id.asc"
  ));
}

async function matchingMatchdayIds(
  filter: EditorialDeskPublishedContextFilter,
): Promise<readonly string[]> {
  if (filter.matchdayId) {
    const matchdays = await fetchSupabaseAdminTable<MatchdayRow>(
      "matchdays?select=id,season_id"
      + `&id=eq.${encodeURIComponent(filter.matchdayId)}&limit=1`,
    );
    const matchday = matchdays[0];
    if (!matchday || (filter.seasonId && matchday.season_id !== filter.seasonId)) {
      return [];
    }
    if (!filter.competitionId) return [matchday.id];
    const seasons = await fetchSupabaseAdminTable<SeasonRow>(
      "seasons?select=id,competition_id"
      + `&id=eq.${encodeURIComponent(matchday.season_id)}`
      + `&competition_id=eq.${encodeURIComponent(filter.competitionId)}&limit=1`,
    );
    return seasons[0] ? [matchday.id] : [];
  }

  if (filter.seasonId) {
    const competitionFilter = filter.competitionId
      ? `&competition_id=eq.${encodeURIComponent(filter.competitionId)}`
      : "";
    const seasons = await fetchSupabaseAdminTable<SeasonRow>(
      "seasons?select=id,competition_id"
      + `&id=eq.${encodeURIComponent(filter.seasonId)}`
      + competitionFilter
      + "&limit=1",
    );
    return seasons[0]
      ? (await readMatchdaysBySeasonIds([filter.seasonId])).map((row) => row.id)
      : [];
  }

  if (filter.competitionId) {
    const seasons = await readAllPages<SeasonRow>(
      "seasons?select=id,competition_id"
      + `&competition_id=eq.${encodeURIComponent(filter.competitionId)}`
      + "&order=id.asc",
    );
    return (await readMatchdaysBySeasonIds(seasons.map((row) => row.id)))
      .map((row) => row.id);
  }

  return [];
}

async function publishedArticlesByIds(
  articleIds: readonly string[],
): Promise<EditorialDeskPublishedArticleRecord[]> {
  return readByChunks<EditorialDeskPublishedArticleRecord>(articleIds, (chunk) => (
    "editorial_articles"
    + "?select=id,slug,title,label,subtitle,image_url,published_at,status,competition_id,season_id,matchday_id"
    + `&id=in.(${inList(chunk)})`
    + "&status=eq.published"
    + "&order=id.asc"
  ));
}

function bankClassificationQuery(
  classification: EditorialDeskClassificationFilter,
): string {
  if (classification.mode === "all") return "";
  return classification.mode === "classified"
    ? `&classification_key=eq.${encodeURIComponent(classification.classificationKey)}`
    : "&classification_key=is.null";
}

async function bankFilteredPublishedArticles(input: Readonly<{
  limit: number;
  offset: number;
  contextFilter: EditorialDeskPublishedContextFilter;
  classification: EditorialDeskClassificationFilter;
}>): Promise<EditorialDeskTransportPage<EditorialDeskPublishedArticleRecord>> {
  const hasContextFilter = Boolean(
    input.contextFilter.competitionId
    || input.contextFilter.seasonId
    || input.contextFilter.matchdayId,
  );
  const classificationQuery = bankClassificationQuery(input.classification);
  let bankRows: Pick<BankRow, "source_id">[];
  if (hasContextFilter) {
    const matchdayIds = await matchingMatchdayIds(input.contextFilter);
    if (matchdayIds.length === 0) return { items: [], hasNextPage: false };
    bankRows = await readByChunks<Pick<BankRow, "source_id">>(
      matchdayIds,
      (chunk) => (
        "matchday_editorial_bank_items?select=source_id"
        + `&matchday_id=in.(${inList(chunk)})`
        + "&source_type=eq.editorial_article"
        + classificationQuery
        + "&order=matchday_id.asc,source_id.asc,id.asc"
      ),
    );
  } else {
    bankRows = await readAllPages<Pick<BankRow, "source_id">>(
      "matchday_editorial_bank_items?select=source_id"
      + "&source_type=eq.editorial_article"
      + classificationQuery
      + "&order=source_id.asc,matchday_id.asc,id.asc",
    );
  }
  const articleIds = unique(bankRows.map((row) => row.source_id));
  if (articleIds.some((articleId) => !UUID_PATTERN.test(articleId))) {
    throw new Error("editorial_desk_bank_identity_invalid");
  }
  const articles = (await publishedArticlesByIds(articleIds)).sort(publishedSort);
  const selected = articles.slice(input.offset, input.offset + input.limit + 1);
  return page(selected, input.limit);
}

const transport = {
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },

  async listNewArticles(input: Readonly<{
    limit: number;
    offset: number;
    sourceCode: string | null;
    classification: EditorialDeskClassificationFilter;
  }>) {
    const sourceFilter = input.sourceCode
      ? `&source_code=eq.${encodeURIComponent(input.sourceCode)}`
      : "";
    const classificationProjection = input.classification.mode === "all"
      ? ""
      : input.classification.mode === "classified"
        ? ",newsroom_editorial_article_classifications!inner(newsroom_article_id)"
        : ",newsroom_editorial_article_classifications(newsroom_article_id)";
    const classificationFilter = input.classification.mode === "all"
      ? ""
      : input.classification.mode === "classified"
        ? "&newsroom_editorial_article_classifications.classification_key=eq."
          + encodeURIComponent(input.classification.classificationKey)
        : "&newsroom_editorial_article_classifications=is.null";
    const rows = await fetchSupabaseAdminTable<NewsroomArticleRow>(
      "newsroom_articles"
      + "?select=id,source_code,original_url,normalized_url,title,subtitle,summary,author,published_at,detected_at,image_url,processing_status,last_detected_at"
      + classificationProjection
      + "&processing_status=in.(detected,normalized,ready_for_review)"
      + sourceFilter
      + classificationFilter
      + "&order=last_detected_at.desc,id.desc"
      + `&limit=${input.limit + 1}&offset=${input.offset}`,
    );
    return page(
      rows.map((row): EditorialDeskNewArticleRecord => ({
        ...row,
        source_name: findRegisteredSource(row.source_code)?.name ?? null,
      })),
      input.limit,
    );
  },

  async readLatestSnapshots(newsroomArticleIds: readonly string[]) {
    if (newsroomArticleIds.length === 0) return [];
    const identityPages = await Promise.all(
      chunks(unique(newsroomArticleIds)).map((chunk) => (
        fetchSupabaseAdminTable<SnapshotIdentityRow>(
          "rpc/newsroom_latest_snapshot_summaries"
          + `?p_article_ids=${encodeURIComponent(`{${chunk.join(",")}}`)}`,
        )
      )),
    );
    const snapshotIds = identityPages.flat().map((row) => row.id);
    return readByChunks<EditorialDeskSnapshotRecord>(snapshotIds, (chunk) => (
      "newsroom_article_snapshots"
      + "?select=id,article_id,content_hash,body,source_metadata,extracted_at,created_at"
      + `&id=in.(${inList(chunk)})`
      + "&order=id.asc"
    ));
  },

  readReviewStates(newsroomArticleIds: readonly string[]) {
    return readByChunks<EditorialDeskReviewRecord>(newsroomArticleIds, (chunk) => (
      "newsroom_editorial_review_states"
      + "?select=newsroom_article_id,decision,reviewed_snapshot_id,reviewed_at"
      + `&newsroom_article_id=in.(${inList(chunk)})`
      + "&order=newsroom_article_id.asc"
    ));
  },

  readPrePublicationClassifications(newsroomArticleIds: readonly string[]) {
    return readByChunks<EditorialDeskClassificationRecord>(
      newsroomArticleIds,
      (chunk) => (
        "newsroom_editorial_article_classifications"
        + "?select=newsroom_article_id,classification_key,classification_source,classified_at,updated_at"
        + `&newsroom_article_id=in.(${inList(chunk)})`
        + "&order=newsroom_article_id.asc"
      ),
    );
  },

  readThemeSourcesByArticleIds(newsroomArticleIds: readonly string[]) {
    return readByChunks<EditorialDeskThemeSourceRecord>(
      newsroomArticleIds,
      (chunk) => (
        "newsroom_editorial_theme_sources"
        + "?select=theme_id,newsroom_article_id,added_at"
        + `&newsroom_article_id=in.(${inList(chunk)})`
        + "&order=newsroom_article_id.asc,theme_id.asc"
      ),
    );
  },

  readDossierSources(newsroomArticleIds: readonly string[]) {
    return readByChunks<EditorialDeskDossierSourceRecord>(
      newsroomArticleIds,
      (chunk) => (
        "newsroom_editorial_dossier_sources"
        + "?select=id,dossier_id,newsroom_article_id,newsroom_snapshot_id,included"
        + `&newsroom_article_id=in.(${inList(chunk)})`
        + "&order=newsroom_article_id.asc,dossier_id.asc,id.asc"
      ),
    );
  },

  readPlanAssignments(dossierSourceIds: readonly string[]) {
    return readByChunks<EditorialDeskPlanAssignmentRecord>(
      dossierSourceIds,
      (chunk) => (
        "newsroom_editorial_dossier_article_plan_sources"
        + "?select=dossier_id,article_plan_id,dossier_source_id"
        + `&dossier_source_id=in.(${inList(chunk)})`
        + "&order=dossier_source_id.asc,article_plan_id.asc"
      ),
    );
  },

  readPlans(articlePlanIds: readonly string[]) {
    return readByChunks<EditorialDeskPlanRecord>(articlePlanIds, (chunk) => (
      "newsroom_editorial_dossier_article_plans"
      + "?select=id,dossier_id,editorial_article_id"
      + `&id=in.(${inList(chunk)})`
      + "&order=id.asc"
    ));
  },

  readDossiers(dossierIds: readonly string[]) {
    return readByChunks<EditorialDeskDossierRecord>(dossierIds, (chunk) => (
      "newsroom_editorial_dossiers?select=id,title,status"
      + `&id=in.(${inList(chunk)})`
      + "&order=id.asc"
    ));
  },

  async readLegacyUsage(newsroomArticleIds: readonly string[]) {
    if (newsroomArticleIds.length === 0) return [];
    const pages = await Promise.all(
      chunks(unique(newsroomArticleIds), LEGACY_FILTER_BATCH_SIZE).map(
        async (chunk) => {
          const requested = new Set(chunk);
          const filters = chunk.map((articleId) => (
            "manifest-%3Eentries.cs."
            + encodeURIComponent(JSON.stringify([{ newsroomArticleId: articleId }]))
          ));
          const packages = await readAllPages<LegacyPackageRow>(
            "newsroom_editorial_source_packages?select=id,manifest"
            + `&or=(${filters.join(",")})`
            + "&order=id.asc",
            LEGACY_PACKAGE_PAGE_SIZE,
          );
          return packages.flatMap((row): EditorialDeskLegacyUsageRecord[] => (
            editorialSourcePackageUsedDossierRefs(row.manifest)
              .filter((reference) => requested.has(reference.newsroomArticleId))
              .map((reference) => ({
                newsroom_article_id: reference.newsroomArticleId,
                newsroom_snapshot_id: reference.newsroomSnapshotId,
                used_at: reference.usedAt,
                package_id: reference.packageId,
                year: reference.year,
                month: reference.month,
                article_position: reference.articlePosition,
                source_position: reference.sourcePosition,
                published_article_id: reference.publishedArticleId,
              }))
          ));
        },
      ),
    );
    return pages.flat();
  },

  readPublishedArticlesByIds(editorialArticleIds: readonly string[]) {
    return publishedArticlesByIds(editorialArticleIds);
  },

  async listPublishedArticles(input: Readonly<{
    limit: number;
    offset: number;
    contextFilter: EditorialDeskPublishedContextFilter;
    classification: EditorialDeskClassificationFilter;
  }>) {
    if (
      input.contextFilter.competitionId
      || input.contextFilter.seasonId
      || input.contextFilter.matchdayId
      || input.classification.mode !== "all"
    ) {
      return bankFilteredPublishedArticles(input);
    }
    const rows = await fetchSupabaseAdminTable<EditorialDeskPublishedArticleRecord>(
      "editorial_articles"
      + "?select=id,slug,title,label,subtitle,image_url,published_at,status,competition_id,season_id,matchday_id"
      + "&status=eq.published"
      + "&order=published_at.desc.nullslast,id.desc"
      + `&limit=${input.limit + 1}&offset=${input.offset}`,
    );
    return page(rows, input.limit);
  },

  async readBankContexts(editorialArticleIds: readonly string[]) {
    const bankRows = await readByChunks<BankRow>(editorialArticleIds, (chunk) => (
      "matchday_editorial_bank_items"
      + "?select=id,source_id,status,matchday_id,classification_key,classification_source,classified_at"
      + "&source_type=eq.editorial_article"
      + `&source_id=in.(${inList(chunk)})`
      + "&order=source_id.asc,matchday_id.asc,id.asc"
    ));
    const matchdays = await readByChunks<MatchdayRow>(
      bankRows.map((row) => row.matchday_id),
      (chunk) => (
        "matchdays?select=id,season_id"
        + `&id=in.(${inList(chunk)})`
        + "&order=id.asc"
      ),
    );
    const seasons = await readByChunks<SeasonRow>(
      matchdays.map((row) => row.season_id),
      (chunk) => (
        "seasons?select=id,competition_id"
        + `&id=in.(${inList(chunk)})`
        + "&order=id.asc"
      ),
    );
    const matchdayById = new Map(matchdays.map((row) => [row.id, row]));
    const seasonById = new Map(seasons.map((row) => [row.id, row]));
    return bankRows.map((row): EditorialDeskBankContextRecord => {
      const matchday = matchdayById.get(row.matchday_id);
      const season = matchday ? seasonById.get(matchday.season_id) : null;
      if (!matchday || !season) {
        throw new Error("editorial_desk_bank_context_invalid");
      }
      return {
        ...row,
        matchday_id: matchday.id,
        season_id: season.id,
        competition_id: season.competition_id,
      };
    });
  },

  readThemeArticlesByArticleIds(editorialArticleIds: readonly string[]) {
    return readByChunks<EditorialDeskThemeArticleRecord>(
      editorialArticleIds,
      (chunk) => (
        "newsroom_editorial_theme_articles"
        + "?select=theme_id,editorial_article_id,added_at"
        + `&editorial_article_id=in.(${inList(chunk)})`
        + "&order=editorial_article_id.asc,theme_id.asc"
      ),
    );
  },

  async listThemes(input: Readonly<{
    limit: number;
    offset: number;
    status: "open" | "archived";
    classification: EditorialDeskClassificationFilter;
  }>) {
    if (input.classification.mode === "unclassified") {
      return { items: [], hasNextPage: false };
    }
    const classificationFilter = input.classification.mode === "classified"
      ? `&classification_key=eq.${encodeURIComponent(input.classification.classificationKey)}`
      : "";
    const rows = await fetchSupabaseAdminTable<EditorialDeskThemeRecord>(
      "newsroom_editorial_themes"
      + "?select=id,title,classification_key,status,context_text,competition_id,season_id,matchday_id,match_id,created_at,updated_at"
      + `&status=eq.${input.status}`
      + classificationFilter
      + "&order=updated_at.desc,id.asc"
      + `&limit=${input.limit + 1}&offset=${input.offset}`,
    );
    return page(rows, input.limit);
  },

  readThemeSourcesByThemeIds(themeIds: readonly string[]) {
    return readByChunks<EditorialDeskThemeSourceRecord>(themeIds, (chunk) => (
      "newsroom_editorial_theme_sources"
      + "?select=theme_id,newsroom_article_id,added_at"
      + `&theme_id=in.(${inList(chunk)})`
      + "&order=theme_id.asc,newsroom_article_id.asc"
    ));
  },

  readThemeArticlesByThemeIds(themeIds: readonly string[]) {
    return readByChunks<EditorialDeskThemeArticleRecord>(themeIds, (chunk) => (
      "newsroom_editorial_theme_articles"
      + "?select=theme_id,editorial_article_id,added_at"
      + `&theme_id=in.(${inList(chunk)})`
      + "&order=theme_id.asc,editorial_article_id.asc"
    ));
  },
};

const load = createEditorialDeskReadModel(transport);

export function loadEditorialDeskReadModel(
  input: EditorialDeskReadModelInput = {},
) {
  return load(input);
}
