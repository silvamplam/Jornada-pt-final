import {
  buildNewsroomClassificationSeasonContext,
  type NewsroomArticleClassificationEvidence,
  type NewsroomClassificationAliasInput,
  type NewsroomClassificationSeasonContext,
  type NewsroomClassificationTeamInput,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier";

export const NEWSROOM_DETERMINISTIC_CLASSIFIER_PAGE_SIZE = 500;
export const NEWSROOM_DETERMINISTIC_CLASSIFIER_BATCH_SIZE = 100;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SeasonRow = Readonly<{
  id: string;
  competition_id: string;
}>;

type SeasonTeamRow = Readonly<{
  id: string;
  team_id: string;
}>;

type TeamRow = Readonly<{
  id: string;
  name: string;
  public_name: string | null;
  short_name: string | null;
  slug: string;
  code: string | null;
}>;

type TeamAliasRow = Readonly<{
  id: string;
  team_id: string;
  alias: string;
  normalized_alias: string;
}>;

type NewsroomArticleRow = Readonly<{
  id: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
}>;

type NewsroomSnapshotRow = Readonly<{
  id: string;
  article_id: string;
  body: unknown;
  extracted_at: string;
  created_at: string;
}>;

export type NewsroomDeterministicClassifierLoadErrorCode =
  | "invalid_request"
  | "not_configured"
  | "season_not_found"
  | "source_not_found"
  | "context_invalid"
  | "read_unavailable";

export type NewsroomDeterministicClassifierLoadResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: NewsroomDeterministicClassifierLoadErrorCode;
        message: string;
      }>;
    }>;

export interface NewsroomDeterministicClassifierReader {
  read<T>(path: string): Promise<T[]>;
}

const ERROR_MESSAGES: Readonly<
  Record<NewsroomDeterministicClassifierLoadErrorCode, string>
> = {
  invalid_request: "O contexto do classificador editorial é inválido.",
  not_configured: "O acesso administrativo à base de dados não está configurado.",
  season_not_found: "A época pedida não existe.",
  source_not_found: "Uma fonte da Redação pedida não existe.",
  context_invalid: "O universo de clubes da época é inconsistente.",
  read_unavailable: "Não foi possível preparar o classificador editorial.",
};

export function deterministicClassifierLoadFailure<T>(
  code: NewsroomDeterministicClassifierLoadErrorCode,
): NewsroomDeterministicClassifierLoadResult<T> {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

function normalizeUuid(value: string): string {
  return value.trim().toLowerCase();
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function validSeasonRow(value: SeasonRow | undefined): value is SeasonRow {
  return Boolean(value && isUuid(value.id) && isUuid(value.competition_id));
}

function validSeasonTeamRow(value: SeasonTeamRow): boolean {
  return isUuid(value.id) && isUuid(value.team_id);
}

function validTeamRow(value: TeamRow): boolean {
  return isUuid(value.id)
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && nullableString(value.public_name)
    && nullableString(value.short_name)
    && typeof value.slug === "string"
    && value.slug.trim().length > 0
    && nullableString(value.code);
}

function validAliasRow(value: TeamAliasRow): boolean {
  return isUuid(value.id)
    && isUuid(value.team_id)
    && typeof value.alias === "string"
    && value.alias.trim().length > 0
    && typeof value.normalized_alias === "string"
    && value.normalized_alias.trim().length > 0;
}

function validArticleRow(value: NewsroomArticleRow): boolean {
  return isUuid(value.id)
    && typeof value.title === "string"
    && value.title.trim().length > 0
    && nullableString(value.subtitle)
    && nullableString(value.summary);
}

function validSnapshotRow(value: NewsroomSnapshotRow): boolean {
  return isUuid(value.id)
    && isUuid(value.article_id)
    && typeof value.extracted_at === "string"
    && typeof value.created_at === "string";
}

export async function readAllDeterministicClassifierPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = NEWSROOM_DETERMINISTIC_CLASSIFIER_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("newsroom_deterministic_classifier_invalid_page_size");
  }

  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    if (page.length > pageSize) {
      throw new Error("newsroom_deterministic_classifier_page_overflow");
    }
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function normalizedArticleIds(
  articleIds: readonly string[],
): readonly string[] | null {
  if (
    !Array.isArray(articleIds)
    || articleIds.length < 1
    || articleIds.length > NEWSROOM_DETERMINISTIC_CLASSIFIER_BATCH_SIZE
    || articleIds.some((id) => !isUuid(id))
  ) {
    return null;
  }
  const normalized = articleIds.map(normalizeUuid);
  return new Set(normalized).size === normalized.length ? normalized : null;
}

function idList(values: readonly string[]): string {
  return values.map(encodeURIComponent).join(",");
}

function bodyText(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const text = value.flatMap((candidate): string[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const block = candidate as { type?: unknown; text?: unknown };
    return (
      (block.type === "paragraph" || block.type === "heading")
      && typeof block.text === "string"
      && block.text.trim().length > 0
    ) ? [block.text.trim()] : [];
  }).join("\n");
  return text || null;
}

export async function loadNewsroomClassificationSeasonContextWithReader(
  reader: NewsroomDeterministicClassifierReader,
  seasonIdInput: string,
): Promise<
  NewsroomDeterministicClassifierLoadResult<
    NewsroomClassificationSeasonContext
  >
> {
  if (!isUuid(seasonIdInput)) {
    return deterministicClassifierLoadFailure("invalid_request");
  }
  const seasonId = normalizeUuid(seasonIdInput);

  try {
    const seasons = await reader.read<SeasonRow>(
      "seasons?select=id,competition_id"
      + `&id=eq.${encodeURIComponent(seasonId)}&limit=1`,
    );
    const season = seasons[0];
    if (!season) return deterministicClassifierLoadFailure("season_not_found");
    if (!validSeasonRow(season)) {
      return deterministicClassifierLoadFailure("context_invalid");
    }

    const [participantRows, teamRows, aliasRows] = await Promise.all([
      readAllDeterministicClassifierPages<SeasonTeamRow>(
        (offset, limit) => reader.read(
          "season_teams?select=id,team_id"
          + `&season_id=eq.${encodeURIComponent(seasonId)}`
          + "&status=eq.active&order=team_id.asc,id.asc"
          + `&offset=${offset}&limit=${limit}`,
        ),
      ),
      readAllDeterministicClassifierPages<TeamRow>(
        (offset, limit) => reader.read(
          "teams?select=id,name,public_name,short_name,slug,code"
          + "&order=id.asc"
          + `&offset=${offset}&limit=${limit}`,
        ),
      ),
      readAllDeterministicClassifierPages<TeamAliasRow>(
        (offset, limit) => reader.read(
          "team_aliases?select=id,team_id,alias,normalized_alias"
          + "&status=eq.active&order=team_id.asc,id.asc"
          + `&offset=${offset}&limit=${limit}`,
        ),
      ),
    ]);

    if (
      participantRows.some((row) => !validSeasonTeamRow(row))
      || teamRows.some((row) => !validTeamRow(row))
      || aliasRows.some((row) => !validAliasRow(row))
    ) {
      return deterministicClassifierLoadFailure("context_invalid");
    }

    const teams: NewsroomClassificationTeamInput[] = teamRows.map((row) => ({
      id: normalizeUuid(row.id),
      name: row.name,
      publicName: row.public_name,
      shortName: row.short_name,
      slug: row.slug,
      code: row.code,
    }));
    const aliases: NewsroomClassificationAliasInput[] = aliasRows.map(
      (row) => ({
        teamId: normalizeUuid(row.team_id),
        alias: row.alias,
        normalizedAlias: row.normalized_alias,
      }),
    );
    const context = buildNewsroomClassificationSeasonContext({
      seasonId,
      competitionId: normalizeUuid(season.competition_id),
      participantTeamIds: participantRows.map((row) => normalizeUuid(row.team_id)),
      teams,
      aliases,
    });
    return context
      ? { ok: true, value: context }
      : deterministicClassifierLoadFailure("context_invalid");
  } catch {
    return deterministicClassifierLoadFailure("read_unavailable");
  }
}

export async function loadNewsroomArticleClassificationEvidenceWithReader(
  reader: NewsroomDeterministicClassifierReader,
  articleIdsInput: readonly string[],
): Promise<
  NewsroomDeterministicClassifierLoadResult<
    readonly NewsroomArticleClassificationEvidence[]
  >
> {
  const articleIds = normalizedArticleIds(articleIdsInput);
  if (!articleIds) return deterministicClassifierLoadFailure("invalid_request");

  try {
    const articleRows = await reader.read<NewsroomArticleRow>(
      "newsroom_articles?select=id,title,subtitle,summary"
      + `&id=in.(${idList(articleIds)})&order=id.asc&limit=${articleIds.length}`,
    );
    if (
      articleRows.some((row) => !validArticleRow(row))
      || new Set(articleRows.map((row) => normalizeUuid(row.id))).size
        !== articleIds.length
    ) {
      return deterministicClassifierLoadFailure("source_not_found");
    }

    const snapshotRows = await readAllDeterministicClassifierPages<
      NewsroomSnapshotRow
    >(
      (offset, limit) => reader.read(
        "newsroom_article_snapshots?select=id,article_id,body,extracted_at,created_at"
        + `&article_id=in.(${idList(articleIds)})`
        + "&order=article_id.asc,extracted_at.desc,created_at.desc,id.desc"
        + `&offset=${offset}&limit=${limit}`,
      ),
    );
    if (snapshotRows.some((row) => !validSnapshotRow(row))) {
      return deterministicClassifierLoadFailure("read_unavailable");
    }

    const latestSnapshotByArticleId = new Map<string, NewsroomSnapshotRow>();
    for (const row of snapshotRows) {
      const articleId = normalizeUuid(row.article_id);
      if (!latestSnapshotByArticleId.has(articleId)) {
        latestSnapshotByArticleId.set(articleId, row);
      }
    }
    const articlesById = new Map(
      articleRows.map((row) => [normalizeUuid(row.id), row] as const),
    );

    return {
      ok: true,
      value: articleIds.map((newsroomArticleId) => {
        const article = articlesById.get(newsroomArticleId)!;
        return {
          newsroomArticleId,
          title: article.title,
          subtitle: article.subtitle,
          summary: article.summary,
          body: bodyText(
            latestSnapshotByArticleId.get(newsroomArticleId)?.body,
          ),
        };
      }),
    };
  } catch {
    return deterministicClassifierLoadFailure("read_unavailable");
  }
}
