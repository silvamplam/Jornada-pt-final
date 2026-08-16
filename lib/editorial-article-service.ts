import "server-only";

import { randomUUID } from "node:crypto";

import { placePublishedArticleInitially } from "@/lib/editorial-matchday-news-flow";
import {
  createEditorialArticleService,
  type EditorialArticleContextInput,
  type EditorialArticleInput,
  type EditorialArticleInsertPayload,
  type EditorialArticleUpdatePayload,
  type EditorialArticleWriteOptions,
} from "@/lib/editorial-article-service-internal";
import {
  fetchSupabaseAdminTable,
  writeSupabaseAdmin,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";

export {
  EditorialArticleServiceError,
  type CanonicalEditorialArticleContext,
  type EditorialArticleAction,
  type EditorialArticleContextInput,
  type EditorialArticleInput,
  type EditorialArticlePlacementFailure,
  type EditorialArticleScope,
  type EditorialArticleStatus,
  type EditorialArticleWriteOptions,
  type EditorialArticleWriteResult,
  normalizeEditorialArticleSlug,
} from "@/lib/editorial-article-service-internal";

type ArticleIdRow = {
  id: string;
};

type ArticleStatusRow = {
  id: string;
  status: string | null;
  matchday_id: string | null;
  slug: string | null;
};

type CreatedArticleRow = {
  id: string;
  slug: string | null;
};

type CompetitionContextRow = {
  id: string;
};

type SeasonContextRow = {
  id: string;
  competition_id: string | null;
};

type MatchdayContextRow = {
  id: string;
  season_id: string | null;
};

const service = createEditorialArticleService({
  findArticlesBySlug(slug: string) {
    return fetchSupabaseAdminTable<ArticleIdRow>(
      `editorial_articles?select=id&slug=eq.${encodeURIComponent(slug)}&limit=2`,
    );
  },

  async readArticleStatus(articleId: string) {
    const rows = await fetchSupabaseAdminTable<ArticleStatusRow>(
      `editorial_articles?select=id,status,matchday_id,slug&id=eq.${encodeURIComponent(articleId)}&limit=1`,
    );
    return rows[0] ?? null;
  },

  async readCompetition(competitionId: string) {
    const rows = await fetchSupabaseAdminTable<CompetitionContextRow>(
      `competitions?select=id&id=eq.${encodeURIComponent(competitionId)}&limit=1`,
    );
    return rows[0] ?? null;
  },

  async readSeason(seasonId: string) {
    const rows = await fetchSupabaseAdminTable<SeasonContextRow>(
      `seasons?select=id,competition_id&id=eq.${encodeURIComponent(seasonId)}&limit=1`,
    );
    return rows[0] ?? null;
  },

  async readMatchday(matchdayId: string) {
    const rows = await fetchSupabaseAdminTable<MatchdayContextRow>(
      `matchdays?select=id,season_id&id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    return rows[0] ?? null;
  },

  insertArticle(payload: EditorialArticleInsertPayload) {
    return writeSupabaseAdminReturning<CreatedArticleRow>(
      "editorial_articles?select=id,slug",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  updateArticle(articleId: string, payload: EditorialArticleUpdatePayload) {
    return writeSupabaseAdmin(
      `editorial_articles?id=eq.${encodeURIComponent(articleId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
  },

  placePublishedArticleInitially,

  randomUuid() {
    return randomUUID();
  },

  now() {
    return new Date().toISOString();
  },
});

export function resolveCanonicalArticleContext(input: EditorialArticleContextInput) {
  return service.resolveCanonicalContext(input);
}

export function createEditorialArticle(
  input: EditorialArticleInput,
  options: EditorialArticleWriteOptions,
) {
  return service.createArticle(input, options);
}

export function updateEditorialArticle(
  articleId: string,
  input: EditorialArticleInput,
  options: EditorialArticleWriteOptions,
) {
  return service.updateArticle(articleId, input, options);
}
