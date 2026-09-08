import "server-only";

import {
  isArticleClassificationKey,
} from "@/lib/editorial-classifications";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
} from "@/lib/supabase";
import {
  isEditorialThemeStatus,
  isEditorialThemeUuid,
  type EditorialTheme,
  type EditorialThemeStatus,
} from "@/lib/redacao-automatica/editorial-theme-service-internal";
import {
  readAllEditorialThemeMembershipRows,
} from "@/lib/redacao-automatica/editorial-theme-membership-pagination";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

type EditorialThemeRow = Readonly<{
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

type ThemeSourceRow = Readonly<{
  theme_id: string;
  newsroom_article_id: string;
  added_at: string;
}>;

type ThemeArticleRow = Readonly<{
  theme_id: string;
  editorial_article_id: string;
  added_at: string;
}>;

export type EditorialThemeSourceMembership = Readonly<{
  newsroomArticleId: string;
  addedAt: string;
}>;

export type EditorialThemeArticleMembership = Readonly<{
  editorialArticleId: string;
  addedAt: string;
}>;

export type EditorialThemeDetail = EditorialTheme & Readonly<{
  sources: readonly EditorialThemeSourceMembership[];
  articles: readonly EditorialThemeArticleMembership[];
}>;

export type EditorialThemeReadErrorCode =
  | "invalid_request"
  | "not_configured"
  | "relation_invalid"
  | "read_unavailable";

export type EditorialThemeRepositoryResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: EditorialThemeReadErrorCode;
        message: string;
      }>;
    }>;

export type ListEditorialThemesInput = Readonly<{
  classificationKey: string;
  status?: string | null;
  limit?: number;
  offset?: number;
}>;

function failure<T>(
  code: EditorialThemeReadErrorCode,
): EditorialThemeRepositoryResult<T> {
  const messages: Readonly<Record<EditorialThemeReadErrorCode, string>> = {
    invalid_request: "Os filtros dos Temas editoriais são inválidos.",
    not_configured: "O acesso administrativo à base de dados não está configurado.",
    relation_invalid: "Uma relação persistida do Tema é inválida.",
    read_unavailable: "Não foi possível ler os Temas editoriais.",
  };

  return { ok: false, error: { code, message: messages[code] } };
}

function optionalUuidIsValid(value: string | null): boolean {
  return value === null || isEditorialThemeUuid(value);
}

function themeFromRow(row: EditorialThemeRow): EditorialTheme | null {
  if (
    !isEditorialThemeUuid(row.id)
    || !row.title
    || !isArticleClassificationKey(row.classification_key)
    || !isEditorialThemeStatus(row.status)
    || !optionalUuidIsValid(row.competition_id)
    || !optionalUuidIsValid(row.season_id)
    || !optionalUuidIsValid(row.matchday_id)
    || !optionalUuidIsValid(row.match_id)
    || !row.created_at
    || !row.updated_at
  ) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    classificationKey: row.classification_key,
    status: row.status,
    context: {
      contextText: row.context_text,
      competitionId: row.competition_id,
      seasonId: row.season_id,
      matchdayId: row.matchday_id,
      matchId: row.match_id,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validPagination(input: ListEditorialThemesInput): Readonly<{
  limit: number;
  offset: number;
}> | null {
  const limit = input.limit ?? DEFAULT_PAGE_SIZE;
  const offset = input.offset ?? 0;
  if (
    !Number.isInteger(limit)
    || limit < 1
    || limit > MAX_PAGE_SIZE
    || !Number.isInteger(offset)
    || offset < 0
  ) {
    return null;
  }

  return { limit, offset };
}

export async function listEditorialThemes(
  input: ListEditorialThemesInput,
): Promise<EditorialThemeRepositoryResult<readonly EditorialTheme[]>> {
  const pagination = validPagination(input);
  if (
    !isArticleClassificationKey(input.classificationKey)
    || (input.status != null && !isEditorialThemeStatus(input.status))
    || !pagination
  ) {
    return failure("invalid_request");
  }
  if (!getSupabaseServiceConfig()) {
    return failure("not_configured");
  }

  const statusFilter = input.status
    ? `&status=eq.${encodeURIComponent(input.status)}`
    : "";

  try {
    const rows = await fetchSupabaseAdminTable<EditorialThemeRow>(
      "newsroom_editorial_themes"
      + "?select=id,title,classification_key,status,context_text,competition_id,season_id,matchday_id,match_id,created_at,updated_at"
      + `&classification_key=eq.${encodeURIComponent(input.classificationKey)}`
      + statusFilter
      + "&order=updated_at.desc,id.asc"
      + `&limit=${pagination.limit}&offset=${pagination.offset}`,
    );
    const themes = rows.map(themeFromRow);
    if (themes.some((theme) => theme === null)) {
      return failure("relation_invalid");
    }

    return { ok: true, value: themes as readonly EditorialTheme[] };
  } catch {
    return failure("read_unavailable");
  }
}

export async function getEditorialThemeById(
  themeIdValue: string | null | undefined,
): Promise<EditorialThemeRepositoryResult<EditorialThemeDetail | null>> {
  const themeId = themeIdValue?.trim().toLowerCase() ?? "";
  if (!isEditorialThemeUuid(themeId)) {
    return failure("invalid_request");
  }
  if (!getSupabaseServiceConfig()) {
    return failure("not_configured");
  }

  try {
    const rows = await fetchSupabaseAdminTable<EditorialThemeRow>(
      "newsroom_editorial_themes"
      + "?select=id,title,classification_key,status,context_text,competition_id,season_id,matchday_id,match_id,created_at,updated_at"
      + `&id=eq.${encodeURIComponent(themeId)}&limit=1`,
    );
    if (!rows[0]) {
      return { ok: true, value: null };
    }

    const theme = themeFromRow(rows[0]);
    if (!theme) {
      return failure("relation_invalid");
    }

    const [sourceRows, articleRows] = await Promise.all([
      readAllEditorialThemeMembershipRows<ThemeSourceRow>(
        fetchSupabaseAdminTable,
        "newsroom_editorial_theme_sources"
        + "?select=theme_id,newsroom_article_id,added_at"
        + `&theme_id=eq.${encodeURIComponent(themeId)}`
        + "&order=added_at.asc,newsroom_article_id.asc",
      ),
      readAllEditorialThemeMembershipRows<ThemeArticleRow>(
        fetchSupabaseAdminTable,
        "newsroom_editorial_theme_articles"
        + "?select=theme_id,editorial_article_id,added_at"
        + `&theme_id=eq.${encodeURIComponent(themeId)}`
        + "&order=added_at.asc,editorial_article_id.asc",
      ),
    ]);

    const invalidSource = sourceRows.some((row) => (
      row.theme_id !== themeId
      || !isEditorialThemeUuid(row.newsroom_article_id)
      || !row.added_at
    ));
    const invalidArticle = articleRows.some((row) => (
      row.theme_id !== themeId
      || !isEditorialThemeUuid(row.editorial_article_id)
      || !row.added_at
    ));
    if (invalidSource || invalidArticle) {
      return failure("relation_invalid");
    }

    return {
      ok: true,
      value: {
        ...theme,
        sources: sourceRows.map((row) => ({
          newsroomArticleId: row.newsroom_article_id,
          addedAt: row.added_at,
        })),
        articles: articleRows.map((row) => ({
          editorialArticleId: row.editorial_article_id,
          addedAt: row.added_at,
        })),
      },
    };
  } catch {
    return failure("read_unavailable");
  }
}
