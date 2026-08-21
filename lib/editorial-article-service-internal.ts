import {
  missingEditorialArticleCanonicalFields,
  type EditorialArticleCanonicalField,
} from "@/lib/editorial-article-canonical";
import {
  EDITORIAL_CONTEXT_DESTINATION,
  EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS,
} from "@/lib/editorial-context-post-title";
import type { EditorialInitialPlacement } from "@/lib/editorial-matchday-news-flow";

export type EditorialArticleStatus = "draft" | "published";
export type EditorialArticleScope = "home" | "competition" | "matchday" | "general";
export type EditorialArticleAction = "save" | "publish";

export type EditorialArticleInput = Readonly<{
  label: string | null;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  slug: string | null;
  image_url: string | null;
  image_caption: string | null;
  author: string | null;
  published_at: string | null;
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
  editorial_destination?: string | null;
}>;

export type EditorialArticleContextInput = Readonly<{
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
}>;

export type CanonicalEditorialArticleContext = Readonly<{
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
}>;

export type EditorialArticlePayload = Readonly<{
  title: string;
  slug: string;
  status: EditorialArticleStatus;
  scope: EditorialArticleScope;
  label: string | null;
  author: string | null;
  subtitle: string | null;
  body: string;
  image_url: string | null;
  image_caption: string | null;
  published_at: string | null;
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
}>;

export type EditorialArticleInsertPayload = Readonly<{
  id: string;
  title: string;
  slug: string;
  status: EditorialArticleStatus;
  scope: EditorialArticleScope;
  body: string;
  created_at: string;
  updated_at: string;
  label?: string;
  author?: string;
  subtitle?: string;
  image_url?: string;
  image_caption?: string;
  published_at?: string;
  competition_id?: string;
  season_id?: string;
  matchday_id?: string;
}>;

export type EditorialArticleUpdatePayload = EditorialArticlePayload & Readonly<{
  updated_at: string;
}>;

export type EditorialArticlePublishedLiveSnapshotSyncInput = Readonly<{
  articleId: string;
  previousSlug: string | null;
  article: EditorialArticleUpdatePayload;
}>;

export type EditorialArticleWriteOptions = Readonly<{
  action: EditorialArticleAction;
  initialPlacement: EditorialInitialPlacement;
}>;

export type EditorialArticlePlacementFailure = Readonly<{
  cause: unknown;
}>;

export type EditorialArticleWriteResult = Readonly<{
  articleId: string;
  slug: string;
  status: EditorialArticleStatus;
  matchdayId: string | null;
  isFirstPublication: boolean;
  placement: EditorialInitialPlacement;
  placementFailure: EditorialArticlePlacementFailure | null;
}>;

type ArticleIdRow = Readonly<{
  id: string;
}>;

type ArticleStatusRow = Readonly<{
  id: string;
  status: string | null;
  matchday_id: string | null;
  slug: string | null;
}>;

type CreatedArticleRow = Readonly<{
  id: string;
  slug: string | null;
}>;

type CompetitionContextRow = Readonly<{
  id: string;
}>;

type SeasonContextRow = Readonly<{
  id: string;
  competition_id: string | null;
}>;

type MatchdayContextRow = Readonly<{
  id: string;
  season_id: string | null;
}>;

export interface EditorialArticleServiceTransport {
  findArticlesBySlug(slug: string): Promise<readonly ArticleIdRow[]>;
  readArticleStatus(articleId: string): Promise<ArticleStatusRow | null>;
  readCompetition(competitionId: string): Promise<CompetitionContextRow | null>;
  readSeason(seasonId: string): Promise<SeasonContextRow | null>;
  readMatchday(matchdayId: string): Promise<MatchdayContextRow | null>;
  insertArticle(payload: EditorialArticleInsertPayload): Promise<readonly CreatedArticleRow[]>;
  updateArticle(articleId: string, payload: EditorialArticleUpdatePayload): Promise<void>;
  syncPublishedArticleLiveSnapshots?(
    input: EditorialArticlePublishedLiveSnapshotSyncInput,
  ): Promise<void>;
  placePublishedArticleInitially(
    matchdayId: string,
    articleId: string,
    placement: EditorialInitialPlacement,
  ): Promise<void>;
  randomUuid(): string;
  now(): string;
}

type EditorialArticleContextReader = Pick<
  EditorialArticleServiceTransport,
  "readCompetition" | "readSeason" | "readMatchday"
>;

export class EditorialArticleServiceError extends Error {
  constructor(public code: string, message = code) {
    super(message);
  }
}

function cleanText(value: string | null | undefined) {
  const cleanValue = value?.trim();
  return cleanValue ? cleanValue : null;
}

export function normalizeEditorialArticleSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeExistingStatus(value: string | null): EditorialArticleStatus {
  return value === "published" ? "published" : "draft";
}

export function normalizeEditorialArticlePublishedAt(value: string | null) {
  const cleanValue = cleanText(value);
  if (!cleanValue) {
    return null;
  }

  const date = new Date(cleanValue);
  if (Number.isNaN(date.getTime())) {
    throw new EditorialArticleServiceError("invalid-published-at");
  }

  return date.toISOString();
}

export async function resolveCanonicalEditorialArticleContext(
  input: EditorialArticleContextInput,
  reader: EditorialArticleContextReader,
): Promise<CanonicalEditorialArticleContext> {
  let competitionId = cleanText(input.competition_id);
  let seasonId = cleanText(input.season_id);
  const matchdayId = cleanText(input.matchday_id);

  if (competitionId && !(await reader.readCompetition(competitionId))) {
    throw new EditorialArticleServiceError("invalid-context");
  }

  if (matchdayId) {
    const matchday = await reader.readMatchday(matchdayId);
    if (!matchday?.season_id) {
      throw new EditorialArticleServiceError("invalid-context");
    }

    if (seasonId && matchday.season_id !== seasonId) {
      throw new EditorialArticleServiceError("invalid-context");
    }

    seasonId = seasonId ?? matchday.season_id;
  }

  if (seasonId) {
    const season = await reader.readSeason(seasonId);
    if (!season?.competition_id) {
      throw new EditorialArticleServiceError("invalid-context");
    }

    if (competitionId && season.competition_id !== competitionId) {
      throw new EditorialArticleServiceError("invalid-context");
    }

    competitionId = competitionId ?? season.competition_id;
  }

  return {
    competition_id: competitionId,
    season_id: seasonId,
    matchday_id: matchdayId,
  };
}

export function editorialArticleScopeForContext(
  context: CanonicalEditorialArticleContext,
): EditorialArticleScope {
  if (context.matchday_id) {
    return "matchday";
  }

  if (context.competition_id || context.season_id) {
    return "competition";
  }

  return "home";
}

async function assertSlugAvailable(
  slug: string,
  currentArticleId: string | null,
  transport: EditorialArticleServiceTransport,
) {
  const rows = await transport.findArticlesBySlug(slug);
  const collision = rows.find((row) => row.id !== currentArticleId);
  if (collision) {
    throw new EditorialArticleServiceError("duplicate-slug");
  }
}

async function buildPayload(
  input: EditorialArticleInput,
  currentArticleId: string | null,
  targetStatus: EditorialArticleStatus,
  transport: EditorialArticleServiceTransport,
): Promise<EditorialArticlePayload> {
  const title = cleanText(input.title);
  if (!title) {
    throw new EditorialArticleServiceError("missing-title");
  }

  const slug = normalizeEditorialArticleSlug(cleanText(input.slug) ?? title);
  if (!slug) {
    throw new EditorialArticleServiceError("missing-slug");
  }

  await assertSlugAvailable(slug, currentArticleId, transport);

  const label = cleanText(input.label);
  const author = cleanText(input.author);
  const subtitle = cleanText(input.subtitle);
  const editorialDestination = cleanText(input.editorial_destination);
  if (
    !currentArticleId
    && editorialDestination
    && editorialDestination !== EDITORIAL_CONTEXT_DESTINATION
  ) {
    throw new EditorialArticleServiceError("invalid-editorial-destination");
  }
  if (
    !currentArticleId
    && editorialDestination === EDITORIAL_CONTEXT_DESTINATION
    && subtitle
    && subtitle.length > EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS
  ) {
    throw new EditorialArticleServiceError("context-post-title-too-long");
  }
  const body = cleanText(input.body) ?? "";
  const imageUrl = cleanText(input.image_url);

  let publishedAt = normalizeEditorialArticlePublishedAt(input.published_at);
  if (targetStatus === "published" && !publishedAt) {
    publishedAt = transport.now();
  }

  if (targetStatus === "published") {
    const missing = missingEditorialArticleCanonicalFields({
      label,
      title,
      subtitle,
      body,
      image_url: imageUrl,
      author,
      published_at: publishedAt,
    });
    const errorByField: Readonly<Partial<Record<EditorialArticleCanonicalField, string>>> = {
      label: "missing-ante-title",
      subtitle: "missing-post-title",
      body: "missing-body",
      image_url: "missing-image",
      author: "missing-author",
      published_at: "invalid-published-at",
    };
    const errorCode = missing.map((field) => errorByField[field]).find(Boolean);
    if (errorCode) {
      throw new EditorialArticleServiceError(errorCode);
    }
  }

  const context = await resolveCanonicalEditorialArticleContext(input, transport);

  return {
    title,
    slug,
    status: targetStatus,
    scope: editorialArticleScopeForContext(context),
    label,
    author,
    subtitle,
    body,
    image_url: imageUrl,
    image_caption: cleanText(input.image_caption),
    published_at: publishedAt,
    competition_id: context.competition_id,
    season_id: context.season_id,
    matchday_id: context.matchday_id,
  };
}

function createInsertPayload(
  payload: EditorialArticlePayload,
  transport: EditorialArticleServiceTransport,
): EditorialArticleInsertPayload {
  const now = transport.now();
  return Object.fromEntries(
    Object.entries({
      id: transport.randomUuid(),
      ...payload,
      created_at: now,
      updated_at: now,
    }).filter(([, value]) => value !== null),
  ) as EditorialArticleInsertPayload;
}

function isEditorialArticleUuid(value: string | null | undefined) {
  return Boolean(
    value
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  );
}

async function applyInitialPlacement(
  transport: EditorialArticleServiceTransport,
  matchdayId: string | null,
  articleId: string,
  initialPlacement: EditorialInitialPlacement,
  shouldPlace: boolean,
) {
  if (!shouldPlace || !matchdayId || initialPlacement === "none") {
    return null;
  }

  try {
    await transport.placePublishedArticleInitially(matchdayId, articleId, initialPlacement);
    return null;
  } catch (error) {
    return { cause: error };
  }
}

export function createEditorialArticleService(
  transport: EditorialArticleServiceTransport,
) {
  return {
    resolveCanonicalContext(input: EditorialArticleContextInput) {
      return resolveCanonicalEditorialArticleContext(input, transport);
    },

    async createArticle(
      input: EditorialArticleInput,
      options: EditorialArticleWriteOptions,
    ): Promise<EditorialArticleWriteResult> {
      const targetStatus = options.action === "publish" ? "published" : "draft";
      const payload = await buildPayload(input, null, targetStatus, transport);
      const rows = await transport.insertArticle(createInsertPayload(payload, transport));
      const created = rows[0];

      if (!created?.id || !isEditorialArticleUuid(created.id)) {
        throw new EditorialArticleServiceError("save-failed");
      }

      const placement = targetStatus === "published" && payload.matchday_id
        ? options.initialPlacement
        : "none";
      const placementFailure = await applyInitialPlacement(
        transport,
        payload.matchday_id,
        created.id,
        options.initialPlacement,
        targetStatus === "published",
      );

      return {
        articleId: created.id,
        slug: payload.slug,
        status: targetStatus,
        matchdayId: payload.matchday_id,
        isFirstPublication: targetStatus === "published",
        placement,
        placementFailure,
      };
    },

    async updateArticle(
      articleId: string,
      input: EditorialArticleInput,
      options: EditorialArticleWriteOptions,
    ): Promise<EditorialArticleWriteResult> {
      const currentArticle = await transport.readArticleStatus(articleId);
      if (!currentArticle) {
        throw new EditorialArticleServiceError("missing-article");
      }

      const targetStatus = options.action === "publish"
        ? "published"
        : normalizeExistingStatus(currentArticle.status);
      const stableInput =
        currentArticle.status === "published" && cleanText(currentArticle.slug)
          ? { ...input, slug: currentArticle.slug }
          : input;
      const payload = await buildPayload(stableInput, articleId, targetStatus, transport);
      const updatePayload = {
        ...payload,
        updated_at: transport.now(),
      };
      await transport.updateArticle(articleId, updatePayload);
      if (currentArticle.status === "published" && targetStatus === "published") {
        await transport.syncPublishedArticleLiveSnapshots?.({
          articleId,
          previousSlug: currentArticle.slug,
          article: updatePayload,
        });
      }

      const isFirstPublication = options.action === "publish"
        && currentArticle.status !== "published";
      const placement = isFirstPublication && payload.matchday_id
        ? options.initialPlacement
        : "none";
      const placementFailure = await applyInitialPlacement(
        transport,
        payload.matchday_id,
        articleId,
        options.initialPlacement,
        isFirstPublication,
      );

      return {
        articleId,
        slug: payload.slug,
        status: targetStatus,
        matchdayId: payload.matchday_id,
        isFirstPublication,
        placement,
        placementFailure,
      };
    },
  };
}
