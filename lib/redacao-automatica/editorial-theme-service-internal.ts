import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const EDITORIAL_THEME_STATUSES = ["open", "archived"] as const;

export type EditorialThemeStatus =
  (typeof EDITORIAL_THEME_STATUSES)[number];

export type EditorialThemeContext = Readonly<{
  contextText: string | null;
  competitionId: string | null;
  seasonId: string | null;
  matchdayId: string | null;
  matchId: string | null;
}>;

export type EditorialTheme = Readonly<{
  id: string;
  title: string;
  classificationKey: ArticleClassificationKey;
  status: EditorialThemeStatus;
  context: EditorialThemeContext;
  createdAt: string;
  updatedAt: string;
}>;

export type EditorialThemeWrite = Readonly<{
  title: string;
  classificationKey: ArticleClassificationKey;
  contextText: string | null;
  competitionId: string | null;
  seasonId: string | null;
  matchdayId: string | null;
  matchId: string | null;
}>;

export type CreateEditorialThemeInput = Readonly<{
  title: string;
  classificationKey: string;
  contextText?: string | null;
  competitionId?: string | null;
  seasonId?: string | null;
  matchdayId?: string | null;
  matchId?: string | null;
}>;

export type UpdateEditorialThemeInput = CreateEditorialThemeInput &
  Readonly<{ themeId: string }>;

export type SetEditorialThemeStatusInput = Readonly<{
  themeId: string;
  status: string;
}>;

export type SetEditorialThemeSourceMembershipInput = Readonly<{
  themeId: string;
  newsroomArticleId: string;
  associated: boolean;
}>;

export type SetEditorialThemeArticleMembershipInput = Readonly<{
  themeId: string;
  editorialArticleId: string;
  associated: boolean;
}>;

export type EditorialThemeMembershipChange = Readonly<{
  themeId: string;
  memberId: string;
  associated: boolean;
  changed: boolean;
  addedAt: string | null;
}>;

export type EditorialThemeErrorCode =
  | "invalid_request"
  | "not_configured"
  | "theme_not_found"
  | "source_not_found"
  | "article_not_found"
  | "context_invalid"
  | "relation_invalid"
  | "persistence_failed";

export type EditorialThemeServiceResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: EditorialThemeErrorCode;
        message: string;
      }>;
    }>;

export interface EditorialThemeTransport {
  isConfigured(): boolean;
  createTheme(input: EditorialThemeWrite): Promise<EditorialTheme>;
  updateTheme(
    themeId: string,
    input: EditorialThemeWrite,
  ): Promise<EditorialTheme>;
  setThemeStatus(
    themeId: string,
    status: EditorialThemeStatus,
  ): Promise<EditorialTheme>;
  setSourceMembership(
    themeId: string,
    newsroomArticleId: string,
    associated: boolean,
  ): Promise<EditorialThemeMembershipChange>;
  setArticleMembership(
    themeId: string,
    editorialArticleId: string,
    associated: boolean,
  ): Promise<EditorialThemeMembershipChange>;
  classifyError(error: unknown): EditorialThemeErrorCode;
}

const ERROR_MESSAGES: Readonly<Record<EditorialThemeErrorCode, string>> = {
  invalid_request: "Os dados do Tema editorial são inválidos.",
  not_configured: "O acesso administrativo à base de dados não está configurado.",
  theme_not_found: "O Tema editorial não existe.",
  source_not_found: "A fonte da Redação não existe.",
  article_not_found: "O artigo editorial canónico não existe.",
  context_invalid: "O contexto competitivo do Tema é inconsistente.",
  relation_invalid: "A relação devolvida para o Tema é inválida.",
  persistence_failed: "Não foi possível guardar o Tema editorial.",
};

function failure<T>(
  code: EditorialThemeErrorCode,
): EditorialThemeServiceResult<T> {
  return {
    ok: false,
    error: {
      code,
      message: ERROR_MESSAGES[code],
    },
  };
}

export function isEditorialThemeUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function isEditorialThemeStatus(
  value: unknown,
): value is EditorialThemeStatus {
  return typeof value === "string"
    && EDITORIAL_THEME_STATUSES.includes(value as EditorialThemeStatus);
}

function optionalUuid(
  value: string | null | undefined,
): Readonly<{ ok: true; value: string | null }> | Readonly<{ ok: false }> {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return { ok: true, value: null };
  }

  return UUID_PATTERN.test(normalized)
    ? { ok: true, value: normalized.toLowerCase() }
    : { ok: false };
}

export function normalizeEditorialThemeWrite(
  input: CreateEditorialThemeInput,
): EditorialThemeServiceResult<EditorialThemeWrite> {
  const title = input.title?.trim() ?? "";
  if (!title || !isArticleClassificationKey(input.classificationKey)) {
    return failure("invalid_request");
  }

  const competitionId = optionalUuid(input.competitionId);
  const seasonId = optionalUuid(input.seasonId);
  const matchdayId = optionalUuid(input.matchdayId);
  const matchId = optionalUuid(input.matchId);
  if (
    !competitionId.ok
    || !seasonId.ok
    || !matchdayId.ok
    || !matchId.ok
  ) {
    return failure("invalid_request");
  }

  return {
    ok: true,
    value: {
      title,
      classificationKey: input.classificationKey,
      contextText: input.contextText?.trim() || null,
      competitionId: competitionId.value,
      seasonId: seasonId.value,
      matchdayId: matchdayId.value,
      matchId: matchId.value,
    },
  };
}

function persistenceFailure<T>(
  transport: EditorialThemeTransport,
  error: unknown,
): EditorialThemeServiceResult<T> {
  return failure(transport.classifyError(error));
}

export function createEditorialThemeService(
  transport: EditorialThemeTransport,
) {
  return async function createEditorialTheme(
    input: CreateEditorialThemeInput,
  ): Promise<EditorialThemeServiceResult<EditorialTheme>> {
    const normalized = normalizeEditorialThemeWrite(input);
    if (!normalized.ok) {
      return normalized;
    }
    if (!transport.isConfigured()) {
      return failure("not_configured");
    }

    try {
      return {
        ok: true,
        value: await transport.createTheme(normalized.value),
      };
    } catch (error) {
      return persistenceFailure(transport, error);
    }
  };
}

export function updateEditorialThemeService(
  transport: EditorialThemeTransport,
) {
  return async function updateEditorialTheme(
    input: UpdateEditorialThemeInput,
  ): Promise<EditorialThemeServiceResult<EditorialTheme>> {
    const themeId = input.themeId?.trim().toLowerCase() ?? "";
    const normalized = normalizeEditorialThemeWrite(input);
    if (!UUID_PATTERN.test(themeId) || !normalized.ok) {
      return failure("invalid_request");
    }
    if (!transport.isConfigured()) {
      return failure("not_configured");
    }

    try {
      return {
        ok: true,
        value: await transport.updateTheme(themeId, normalized.value),
      };
    } catch (error) {
      return persistenceFailure(transport, error);
    }
  };
}

export function setEditorialThemeStatusService(
  transport: EditorialThemeTransport,
) {
  return async function setEditorialThemeStatus(
    input: SetEditorialThemeStatusInput,
  ): Promise<EditorialThemeServiceResult<EditorialTheme>> {
    const themeId = input.themeId?.trim().toLowerCase() ?? "";
    if (!UUID_PATTERN.test(themeId) || !isEditorialThemeStatus(input.status)) {
      return failure("invalid_request");
    }
    if (!transport.isConfigured()) {
      return failure("not_configured");
    }

    try {
      return {
        ok: true,
        value: await transport.setThemeStatus(themeId, input.status),
      };
    } catch (error) {
      return persistenceFailure(transport, error);
    }
  };
}

export function setEditorialThemeSourceMembershipService(
  transport: EditorialThemeTransport,
) {
  return async function setEditorialThemeSourceMembership(
    input: SetEditorialThemeSourceMembershipInput,
  ): Promise<EditorialThemeServiceResult<EditorialThemeMembershipChange>> {
    const themeId = input.themeId?.trim().toLowerCase() ?? "";
    const newsroomArticleId =
      input.newsroomArticleId?.trim().toLowerCase() ?? "";
    if (
      !UUID_PATTERN.test(themeId)
      || !UUID_PATTERN.test(newsroomArticleId)
      || typeof input.associated !== "boolean"
    ) {
      return failure("invalid_request");
    }
    if (!transport.isConfigured()) {
      return failure("not_configured");
    }

    try {
      return {
        ok: true,
        value: await transport.setSourceMembership(
          themeId,
          newsroomArticleId,
          input.associated,
        ),
      };
    } catch (error) {
      return persistenceFailure(transport, error);
    }
  };
}

export function setEditorialThemeArticleMembershipService(
  transport: EditorialThemeTransport,
) {
  return async function setEditorialThemeArticleMembership(
    input: SetEditorialThemeArticleMembershipInput,
  ): Promise<EditorialThemeServiceResult<EditorialThemeMembershipChange>> {
    const themeId = input.themeId?.trim().toLowerCase() ?? "";
    const editorialArticleId =
      input.editorialArticleId?.trim().toLowerCase() ?? "";
    if (
      !UUID_PATTERN.test(themeId)
      || !UUID_PATTERN.test(editorialArticleId)
      || typeof input.associated !== "boolean"
    ) {
      return failure("invalid_request");
    }
    if (!transport.isConfigured()) {
      return failure("not_configured");
    }

    try {
      return {
        ok: true,
        value: await transport.setArticleMembership(
          themeId,
          editorialArticleId,
          input.associated,
        ),
      };
    } catch (error) {
      return persistenceFailure(transport, error);
    }
  };
}
