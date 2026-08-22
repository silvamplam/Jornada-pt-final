import {
  editorialProfile,
  type EditorialPlacementMode,
  type EditorialProfile,
  type EditorialProfileKey,
  type EditorialProfileZoneKey,
  type EditorialVisualFamily,
} from "@/lib/editorial-profiles";
import { fetchSupabaseAdminTable } from "@/lib/supabase";

const SUPPORTED_SOURCE_TYPE = "editorial_article";
const READ_PAGE_SIZE = 1_000;
const ARTICLE_BATCH_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MatchdayEditorialProfileStateRow = Readonly<{
  source_type: string;
  source_id: string;
  zone_key: string | null;
  sort_order: number | null;
}>;

export type MatchdayEditorialProfileActiveBankRow = Readonly<{
  source_type: string | null;
  source_id: string | null;
  status: string | null;
}>;

export type MatchdayEditorialProfileArticleRow = Readonly<{
  id: string;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  published_at: string | null;
  updated_at: string | null;
}>;

export type MatchdayEditorialProfileDeskDiagnosticCode =
  | "unsupported_profile"
  | "unknown_zone"
  | "missing_article"
  | "active_bank_without_state";

export type MatchdayEditorialProfileDeskDiagnostic = Readonly<{
  code: MatchdayEditorialProfileDeskDiagnosticCode;
  message: string;
  sourceType?: string;
  sourceId?: string;
  zoneKey?: string;
  profileKey?: string;
}>;

export type MatchdayEditorialProfileDeskItem = Readonly<{
  sourceType: string;
  sourceId: string;
  sortOrder: number | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
}>;

export type MatchdayEditorialProfileDeskZone = Readonly<{
  key: EditorialProfileZoneKey;
  label: string;
  capacity: number;
  visualFamily: EditorialVisualFamily;
  placementMode: EditorialPlacementMode;
  items: readonly (MatchdayEditorialProfileDeskItem & Readonly<{ sortOrder: number }>)[];
}>;

export type MatchdayEditorialProfileDeskDistribution = Readonly<{
  zones: readonly MatchdayEditorialProfileDeskZone[];
  overflow: readonly (MatchdayEditorialProfileDeskItem & Readonly<{ sortOrder: null }>)[];
  diagnostics: readonly MatchdayEditorialProfileDeskDiagnostic[];
  inactiveHistoricalCount: number;
}>;

export type MatchdayEditorialProfileDeskContext = Readonly<{
  matchdayId: string;
  matchdayLabel: string;
  seasonId: string;
  seasonLabel: string;
  competitionId: string;
  competitionName: string;
  competitionSlug: string;
}>;

export type MatchdayEditorialProfileDeskSnapshot =
  & MatchdayEditorialProfileDeskContext
  & MatchdayEditorialProfileDeskDistribution
  & Readonly<{
    kind: "thematic";
    profileKey: EditorialProfileKey;
    profileDisplayName: string;
  }>;

export type UnsupportedMatchdayEditorialProfileDesk =
  & MatchdayEditorialProfileDeskContext
  & Readonly<{
    kind: "unsupported_profile";
    profileKey: string;
    diagnostics: readonly MatchdayEditorialProfileDeskDiagnostic[];
  }>;

export type MatchdayEditorialProfileDeskReadResult =
  | MatchdayEditorialProfileDeskSnapshot
  | UnsupportedMatchdayEditorialProfileDesk;

export type MatchdayEditorialProfileDeskTableFetcher = <T>(path: string) => Promise<T[]>;

export type MatchdayEditorialProfileDeskReadDependencies = Readonly<{
  fetchTable?: MatchdayEditorialProfileDeskTableFetcher;
}>;

type AssignmentRow = Readonly<{
  profile_key: string;
}>;

type MatchdayRow = Readonly<{
  id: string;
  season_id: string;
  number: number;
  label: string | null;
}>;

type SeasonRow = Readonly<{
  id: string;
  competition_id: string;
  label: string;
}>;

type CompetitionRow = Readonly<{
  id: string;
  name: string;
  slug: string;
}>;

function cleanText(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean || null;
}

function canonicalIdentity(sourceType: string | null | undefined, sourceId: string | null | undefined): string | null {
  const cleanType = cleanText(sourceType)?.toLowerCase();
  const cleanId = cleanText(sourceId)?.toLowerCase();
  return cleanType && cleanId ? `${cleanType}\u0000${cleanId}` : null;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function compareTimestampDescNullLast(left: string | null, right: string | null): number {
  const leftTime = timestamp(left);
  const rightTime = timestamp(right);
  if (leftTime === null && rightTime === null) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return rightTime - leftTime;
}

function itemFromArticle(
  sourceType: string,
  sourceId: string,
  sortOrder: number | null,
  article: MatchdayEditorialProfileArticleRow,
): MatchdayEditorialProfileDeskItem {
  return {
    sourceType,
    sourceId,
    sortOrder,
    label: cleanText(article.label),
    title: cleanText(article.title),
    subtitle: cleanText(article.subtitle),
    imageUrl: cleanText(article.image_url),
    publishedAt: article.published_at,
    updatedAt: article.updated_at,
  };
}

export function buildMatchdayEditorialProfileDeskDistribution(
  profile: EditorialProfile,
  stateRows: readonly MatchdayEditorialProfileStateRow[],
  activeBankRows: readonly MatchdayEditorialProfileActiveBankRow[],
  articleRows: readonly MatchdayEditorialProfileArticleRow[],
): MatchdayEditorialProfileDeskDistribution {
  const articlesById = new Map(
    articleRows.map((article) => [article.id.trim().toLowerCase(), article] as const),
  );
  const activeBankByIdentity = new Map<string, MatchdayEditorialProfileActiveBankRow>();

  for (const bankRow of activeBankRows) {
    if (cleanText(bankRow.status)?.toLowerCase() !== "active") continue;
    if (cleanText(bankRow.source_type)?.toLowerCase() !== SUPPORTED_SOURCE_TYPE) continue;
    const identity = canonicalIdentity(bankRow.source_type, bankRow.source_id);
    if (identity && !activeBankByIdentity.has(identity)) {
      activeBankByIdentity.set(identity, bankRow);
    }
  }

  const stateIdentities = new Set<string>();
  for (const stateRow of stateRows) {
    const identity = canonicalIdentity(stateRow.source_type, stateRow.source_id);
    if (identity) stateIdentities.add(identity);
  }

  const diagnostics: MatchdayEditorialProfileDeskDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  const addDiagnostic = (
    diagnostic: MatchdayEditorialProfileDeskDiagnostic,
    identity = "",
  ) => {
    const key = `${diagnostic.code}\u0000${identity}\u0000${diagnostic.zoneKey ?? ""}`;
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push(diagnostic);
  };

  const zoneItems = new Map<EditorialProfileZoneKey, Array<MatchdayEditorialProfileDeskItem & { sortOrder: number }>>(
    profile.zones.map((zone) => [zone.key, []]),
  );
  const displayedIdentities = new Set<string>();
  const knownZoneKeys = new Set<string>(profile.zones.map((zone) => zone.key));
  const historicalIdentities = new Set<string>();

  for (const stateRow of stateRows) {
    const identity = canonicalIdentity(stateRow.source_type, stateRow.source_id);
    if (!identity) continue;

    if (!activeBankByIdentity.has(identity)) historicalIdentities.add(identity);

    const article = articlesById.get(stateRow.source_id.trim().toLowerCase());
    if (!article) {
      addDiagnostic({
        code: "missing_article",
        message: `O estado aponta para um artigo inexistente (${stateRow.source_id}).`,
        sourceType: stateRow.source_type,
        sourceId: stateRow.source_id,
      }, identity);
    }

    if (stateRow.zone_key !== null && !knownZoneKeys.has(stateRow.zone_key)) {
      addDiagnostic({
        code: "unknown_zone",
        message: `A zona persistida "${stateRow.zone_key}" não existe no perfil.`,
        sourceType: stateRow.source_type,
        sourceId: stateRow.source_id,
        zoneKey: stateRow.zone_key,
      }, identity);
      continue;
    }

    if (
      stateRow.zone_key === null
      || stateRow.sort_order === null
      || !article
      || displayedIdentities.has(identity)
    ) {
      continue;
    }

    const items = zoneItems.get(stateRow.zone_key as EditorialProfileZoneKey);
    if (!items) continue;
    items.push({
      ...itemFromArticle(stateRow.source_type, stateRow.source_id, stateRow.sort_order, article),
      sortOrder: stateRow.sort_order,
    });
    displayedIdentities.add(identity);
  }

  const zones = profile.zones.map((zone) => ({
    key: zone.key,
    label: zone.label,
    capacity: zone.capacity,
    visualFamily: zone.visualFamily,
    placementMode: zone.placementMode,
    items: (zoneItems.get(zone.key) ?? []).sort((left, right) => left.sortOrder - right.sortOrder),
  }));

  const overflow: Array<MatchdayEditorialProfileDeskItem & { sortOrder: null }> = [];
  for (const stateRow of stateRows) {
    if (stateRow.zone_key !== null || stateRow.sort_order !== null) continue;
    const identity = canonicalIdentity(stateRow.source_type, stateRow.source_id);
    if (!identity || !activeBankByIdentity.has(identity) || displayedIdentities.has(identity)) continue;
    const article = articlesById.get(stateRow.source_id.trim().toLowerCase());
    if (!article) continue;
    overflow.push({
      ...itemFromArticle(stateRow.source_type, stateRow.source_id, null, article),
      sortOrder: null,
    });
    displayedIdentities.add(identity);
  }

  overflow.sort((left, right) => (
    compareTimestampDescNullLast(left.publishedAt, right.publishedAt)
    || compareTimestampDescNullLast(left.updatedAt, right.updatedAt)
    || compareText(left.sourceType, right.sourceType)
    || compareText(left.sourceId, right.sourceId)
  ));

  for (const [identity, bankRow] of activeBankByIdentity) {
    if (stateIdentities.has(identity)) continue;
    const sourceType = cleanText(bankRow.source_type) ?? SUPPORTED_SOURCE_TYPE;
    const sourceId = cleanText(bankRow.source_id) ?? "";
    addDiagnostic({
      code: "active_bank_without_state",
      message: `A publicação ativa ${sourceType}:${sourceId} ainda não tem estado temático.`,
      sourceType,
      sourceId,
    }, identity);
  }

  return {
    zones,
    overflow,
    diagnostics,
    inactiveHistoricalCount: historicalIdentities.size,
  };
}

function pagedPath(path: string, offset: number): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}limit=${READ_PAGE_SIZE}&offset=${offset}`;
}

async function readAllRows<T>(
  fetchTable: MatchdayEditorialProfileDeskTableFetcher,
  path: string,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchTable<T>(pagedPath(path, offset));
    rows.push(...page);
    if (page.length < READ_PAGE_SIZE) return rows;
    offset += page.length;
  }
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function readArticles(
  fetchTable: MatchdayEditorialProfileDeskTableFetcher,
  stateRows: readonly MatchdayEditorialProfileStateRow[],
  bankRows: readonly MatchdayEditorialProfileActiveBankRow[],
): Promise<MatchdayEditorialProfileArticleRow[]> {
  const articleIds = Array.from(new Set(
    [...stateRows.map((row) => row.source_id), ...bankRows.map((row) => row.source_id ?? "")]
      .map((id) => id.trim())
      .filter((id) => UUID_PATTERN.test(id)),
  ));
  if (articleIds.length === 0) return [];

  const batches = await Promise.all(chunks(articleIds, ARTICLE_BATCH_SIZE).map((batch) => (
    fetchTable<MatchdayEditorialProfileArticleRow>(
      `editorial_articles?select=id,label,title,subtitle,image_url,published_at,updated_at&id=in.(${batch.join(",")})`,
    )
  )));
  return batches.flat();
}

async function readContext(
  fetchTable: MatchdayEditorialProfileDeskTableFetcher,
  matchday: MatchdayRow,
): Promise<MatchdayEditorialProfileDeskContext> {
  const seasonRows = await fetchTable<SeasonRow>(
    `seasons?select=id,competition_id,label&id=eq.${encodeURIComponent(matchday.season_id)}&limit=1`,
  );
  const season = seasonRows[0];
  if (!season) throw new Error("matchday-editorial-profile-desk-season-not-found");

  const competitionRows = await fetchTable<CompetitionRow>(
    `competitions?select=id,name,slug&id=eq.${encodeURIComponent(season.competition_id)}&limit=1`,
  );
  const competition = competitionRows[0];
  if (!competition) throw new Error("matchday-editorial-profile-desk-competition-not-found");

  return {
    matchdayId: matchday.id,
    matchdayLabel: cleanText(matchday.label) ?? `Jornada ${matchday.number}`,
    seasonId: season.id,
    seasonLabel: season.label,
    competitionId: competition.id,
    competitionName: competition.name,
    competitionSlug: competition.slug,
  };
}

export async function readMatchdayEditorialProfileDesk(
  matchdayId: string,
  dependencies: MatchdayEditorialProfileDeskReadDependencies = {},
): Promise<MatchdayEditorialProfileDeskReadResult | null> {
  const cleanMatchdayId = matchdayId.trim();
  if (!cleanMatchdayId) throw new Error("matchday-editorial-profile-desk-invalid-input");
  const fetchTable = dependencies.fetchTable ?? fetchSupabaseAdminTable;

  const assignmentRows = await fetchTable<AssignmentRow>(
    `matchday_editorial_profile_assignments?select=profile_key&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&limit=1`,
  );
  const assignment = assignmentRows[0];
  if (!assignment) return null;

  const matchdayRowsPromise = fetchTable<MatchdayRow>(
    `matchdays?select=id,season_id,number,label&id=eq.${encodeURIComponent(cleanMatchdayId)}&limit=1`,
  );
  const profile = editorialProfile(assignment.profile_key);

  if (!profile) {
    const matchday = (await matchdayRowsPromise)[0];
    if (!matchday) throw new Error("matchday-editorial-profile-desk-matchday-not-found");
    const context = await readContext(fetchTable, matchday);
    return {
      kind: "unsupported_profile",
      ...context,
      profileKey: assignment.profile_key,
      diagnostics: [{
        code: "unsupported_profile",
        message: `O perfil atribuído "${assignment.profile_key}" não é suportado por esta Mesa.`,
        profileKey: assignment.profile_key,
      }],
    };
  }

  const [matchdayRows, stateRows, bankRows] = await Promise.all([
    matchdayRowsPromise,
    readAllRows<MatchdayEditorialProfileStateRow>(
      fetchTable,
      `matchday_editorial_profile_state_items?select=source_type,source_id,zone_key,sort_order&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&profile_key=eq.${encodeURIComponent(assignment.profile_key)}`,
    ),
    readAllRows<MatchdayEditorialProfileActiveBankRow>(
      fetchTable,
      `matchday_editorial_bank_items?select=source_type,source_id,status&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&status=eq.active&source_type=eq.editorial_article`,
    ),
  ]);
  const matchday = matchdayRows[0];
  if (!matchday) throw new Error("matchday-editorial-profile-desk-matchday-not-found");

  const [context, articleRows] = await Promise.all([
    readContext(fetchTable, matchday),
    readArticles(fetchTable, stateRows, bankRows),
  ]);

  return {
    kind: "thematic",
    ...context,
    profileKey: assignment.profile_key as EditorialProfileKey,
    profileDisplayName: profile.displayName,
    ...buildMatchdayEditorialProfileDeskDistribution(profile, stateRows, bankRows, articleRows),
  };
}
