import "server-only";

import {
  isArticleClassificationKey,
} from "@/lib/editorial-classifications";
import {
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  createEditorialThemeService,
  isEditorialThemeStatus,
  isEditorialThemeUuid,
  setEditorialThemeArticleMembershipService,
  setEditorialThemeSourceMembershipService,
  setEditorialThemeStatusService,
  updateEditorialThemeService,
  type CreateEditorialThemeInput,
  type EditorialTheme,
  type EditorialThemeErrorCode,
  type EditorialThemeMembershipChange,
  type EditorialThemeStatus,
  type EditorialThemeTransport,
  type EditorialThemeWrite,
  type SetEditorialThemeArticleMembershipInput,
  type SetEditorialThemeSourceMembershipInput,
  type SetEditorialThemeStatusInput,
  type UpdateEditorialThemeInput,
} from "@/lib/redacao-automatica/editorial-theme-service-internal";

export type {
  CreateEditorialThemeInput,
  EditorialTheme,
  EditorialThemeContext,
  EditorialThemeErrorCode,
  EditorialThemeMembershipChange,
  EditorialThemeServiceResult,
  EditorialThemeStatus,
  SetEditorialThemeArticleMembershipInput,
  SetEditorialThemeSourceMembershipInput,
  SetEditorialThemeStatusInput,
  UpdateEditorialThemeInput,
} from "@/lib/redacao-automatica/editorial-theme-service-internal";

type EditorialThemeRpcRow = Readonly<{
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

type SourceMembershipRpcRow = Readonly<{
  theme_id: string;
  newsroom_article_id: string;
  associated: boolean;
  changed: boolean;
  added_at: string | null;
}>;

type ArticleMembershipRpcRow = Readonly<{
  theme_id: string;
  editorial_article_id: string;
  associated: boolean;
  changed: boolean;
  added_at: string | null;
}>;

function optionalUuidIsValid(value: string | null): boolean {
  return value === null || isEditorialThemeUuid(value);
}

function themeFromRpcRow(row: EditorialThemeRpcRow | undefined): EditorialTheme {
  if (
    !row
    || !isEditorialThemeUuid(row.id)
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
    throw new Error("editorial_theme_relation_invalid");
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

function membershipFromRpcRow(
  row: SourceMembershipRpcRow | ArticleMembershipRpcRow | undefined,
  expectedThemeId: string,
  expectedMemberId: string,
): EditorialThemeMembershipChange {
  const memberId = row && "newsroom_article_id" in row
    ? row.newsroom_article_id
    : row?.editorial_article_id;
  if (
    !row
    || row.theme_id !== expectedThemeId
    || !memberId
    || memberId !== expectedMemberId
    || typeof row.associated !== "boolean"
    || typeof row.changed !== "boolean"
    || (row.associated && !row.added_at)
    || (!row.associated && row.added_at !== null)
  ) {
    throw new Error("editorial_theme_relation_invalid");
  }

  return {
    themeId: row.theme_id,
    memberId,
    associated: row.associated,
    changed: row.changed,
    addedAt: row.added_at,
  };
}

function classifyRpcError(error: unknown): EditorialThemeErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  const knownErrors: ReadonlyArray<
    readonly [string, EditorialThemeErrorCode]
  > = [
    ["editorial_theme_not_found", "theme_not_found"],
    ["editorial_theme_source_not_found", "source_not_found"],
    ["editorial_theme_article_not_found", "article_not_found"],
    ["editorial_theme_context_mismatch", "context_invalid"],
    ["editorial_theme_relation_invalid", "relation_invalid"],
    ["newsroom_editorial_themes_classification_check", "invalid_request"],
    ["editorial_theme_invalid_input", "invalid_request"],
  ];

  return knownErrors.find(([code]) => message.includes(code))?.[1]
    ?? "persistence_failed";
}

async function writeThemeRpc(
  functionName: string,
  body: Readonly<Record<string, unknown>>,
): Promise<EditorialTheme> {
  const rows = await writeSupabaseAdminReturning<EditorialThemeRpcRow>(
    `rpc/${functionName}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

  return themeFromRpcRow(rows[0]);
}

const transport: EditorialThemeTransport = {
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },

  createTheme(input: EditorialThemeWrite) {
    return writeThemeRpc("newsroom_create_editorial_theme_v1", {
      p_title: input.title,
      p_classification_key: input.classificationKey,
      p_context_text: input.contextText,
      p_competition_id: input.competitionId,
      p_season_id: input.seasonId,
      p_matchday_id: input.matchdayId,
      p_match_id: input.matchId,
    });
  },

  updateTheme(themeId: string, input: EditorialThemeWrite) {
    return writeThemeRpc("newsroom_update_editorial_theme_v1", {
      p_theme_id: themeId,
      p_title: input.title,
      p_classification_key: input.classificationKey,
      p_context_text: input.contextText,
      p_competition_id: input.competitionId,
      p_season_id: input.seasonId,
      p_matchday_id: input.matchdayId,
      p_match_id: input.matchId,
    });
  },

  setThemeStatus(themeId: string, status: EditorialThemeStatus) {
    return writeThemeRpc("newsroom_set_editorial_theme_status_v1", {
      p_theme_id: themeId,
      p_status: status,
    });
  },

  async setSourceMembership(themeId, newsroomArticleId, associated) {
    const rows = await writeSupabaseAdminReturning<SourceMembershipRpcRow>(
      "rpc/newsroom_set_editorial_theme_source_membership_v1",
      {
        method: "POST",
        body: JSON.stringify({
          p_theme_id: themeId,
          p_newsroom_article_id: newsroomArticleId,
          p_associated: associated,
        }),
      },
    );

    return membershipFromRpcRow(
      rows[0],
      themeId,
      newsroomArticleId,
    );
  },

  async setArticleMembership(themeId, editorialArticleId, associated) {
    const rows = await writeSupabaseAdminReturning<ArticleMembershipRpcRow>(
      "rpc/newsroom_set_editorial_theme_article_membership_v1",
      {
        method: "POST",
        body: JSON.stringify({
          p_theme_id: themeId,
          p_editorial_article_id: editorialArticleId,
          p_associated: associated,
        }),
      },
    );

    return membershipFromRpcRow(
      rows[0],
      themeId,
      editorialArticleId,
    );
  },

  classifyError: classifyRpcError,
};

const createTheme = createEditorialThemeService(transport);
const updateTheme = updateEditorialThemeService(transport);
const setThemeStatus = setEditorialThemeStatusService(transport);
const setSourceMembership =
  setEditorialThemeSourceMembershipService(transport);
const setArticleMembership =
  setEditorialThemeArticleMembershipService(transport);

export function createEditorialTheme(input: CreateEditorialThemeInput) {
  return createTheme(input);
}

export function updateEditorialTheme(input: UpdateEditorialThemeInput) {
  return updateTheme(input);
}

export function setEditorialThemeStatus(
  input: SetEditorialThemeStatusInput,
) {
  return setThemeStatus(input);
}

export function setEditorialThemeSourceMembership(
  input: SetEditorialThemeSourceMembershipInput,
) {
  return setSourceMembership(input);
}

export function setEditorialThemeArticleMembership(
  input: SetEditorialThemeArticleMembershipInput,
) {
  return setArticleMembership(input);
}
