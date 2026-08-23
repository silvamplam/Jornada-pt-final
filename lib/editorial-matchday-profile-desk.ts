import {
  editorialProfile,
  type EditorialPlacementMode,
  type EditorialProfile,
  type EditorialProfileKey,
  type EditorialProfileZoneKey,
  type EditorialVisualFamily,
} from "@/lib/editorial-profiles";
import {
  compareThematicItemsByActuality,
  thematicEditorialIdentity,
  validateMatchdayEditorialProfileManualOverrides,
  type MatchdayEditorialProfileEffectiveDistribution,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  type MatchdayEditorialProfileAppliedZoneItem,
  type MatchdayEditorialProfileFaixaItem,
  type MatchdayEditorialProfileReconcileResult,
} from "@/lib/editorial-matchday-profile-reconcile";
import {
  emptyMatchdayEditorialProfileOpening,
  normalizeMatchdayEditorialProfileThematicZoneOrder,
  reconcileMatchdayEditorialProfileWorkspace,
  type MatchdayEditorialProfileOpening,
  type MatchdayEditorialProfilePageControls,
} from "@/lib/editorial-matchday-profile-workspace";
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
  slug?: string | null;
  status?: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  published_at: string | null;
  updated_at: string | null;
}>;

export type MatchdayEditorialProfileManualOverrideRow = Readonly<{
  source_type: string;
  source_id: string;
  placement_target: string;
  zone_key: string | null;
  sort_order: number | null;
}>;

export type MatchdayEditorialProfileClassificationRow = Readonly<{
  source_type: string;
  source_id: string;
  classified_zone_key: string;
  actuality_order: number;
}>;

export type MatchdayEditorialProfileZoneItemRow = Readonly<{
  source_type: string;
  source_id: string;
  zone_key: string;
  sort_order: number;
}>;

export type MatchdayEditorialProfileHorizontalRow = Readonly<{
  id: string;
  label: string | null;
  label_color: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
}>;

export type MatchdayEditorialProfileDeskDiagnosticCode =
  | "unsupported_profile"
  | "unknown_zone"
  | "missing_article"
  | "active_bank_without_state"
  | "missing_classification"
  | "unresolved_faixa"
  | "ambiguous_faixa"
  | "inactive_faixa"
  | "duplicate_faixa_identity"
  | "unresolved_opening"
  | "invalid_applied_snapshot";

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

export type MatchdayEditorialProfileDeskAutomaticItem =
  & MatchdayEditorialProfileDeskItem
  & Readonly<{
    classifiedZoneKey: EditorialProfileZoneKey | null;
    actualityOrder: number | null;
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
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[];
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
  & Readonly<{
    kind: "thematic";
    profileKey: EditorialProfileKey;
    profileDisplayName: string;
    automaticDistribution: MatchdayEditorialProfileDeskDistribution;
    manualOverrides: readonly MatchdayEditorialProfileManualOverride[];
    reconcileRevision: number;
    reconcileStateToken: string;
    hasAppliedSnapshot: boolean;
    appliedZoneItems: readonly MatchdayEditorialProfileAppliedZoneItem[];
    currentFaixa: readonly MatchdayEditorialProfileFaixaItem[];
    opening: MatchdayEditorialProfileOpening;
    pageControls: MatchdayEditorialProfilePageControls;
    reconcile: MatchdayEditorialProfileReconcileResult;
    zones: MatchdayEditorialProfileEffectiveDistribution["zones"];
    bank: MatchdayEditorialProfileEffectiveDistribution["bank"];
    diagnostics: readonly MatchdayEditorialProfileDeskDiagnostic[];
    inactiveHistoricalCount: number;
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

type AssignmentRow = Readonly<{ profile_key: string }>;

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

type ReconcileControlRow = Readonly<{ revision: number; thematic_zone_order: unknown }>;
type ReconcileTokenRow = Readonly<{ state_token: string }>;
type OpeningEditorialRow = Readonly<{
  status: string | null;
  title_color: string | null;
  headline_link_url: string | null;
  side_block_status: string | null;
  side_block_link_url: string | null;
  latest_zone_placement: string | null;
}>;
type OpeningHighlightRow = Readonly<{
  sort_order: number;
  status: string | null;
  link_url: string | null;
}>;

function cleanText(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean || null;
}

function canonicalIdentity(
  sourceType: string | null | undefined,
  sourceId: string | null | undefined,
): string | null {
  const cleanType = cleanText(sourceType);
  const cleanId = cleanText(sourceId);
  return cleanType && cleanId ? thematicEditorialIdentity(cleanType, cleanId) : null;
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
  classificationRows?: readonly MatchdayEditorialProfileClassificationRow[],
): MatchdayEditorialProfileDeskDistribution {
  const articlesById = new Map(
    articleRows.map((article) => [article.id.trim().toLowerCase(), article] as const),
  );
  const activeBankByIdentity = new Map<string, MatchdayEditorialProfileActiveBankRow>();
  for (const bankRow of activeBankRows) {
    if (cleanText(bankRow.status)?.toLowerCase() !== "active") continue;
    if (cleanText(bankRow.source_type)?.toLowerCase() !== SUPPORTED_SOURCE_TYPE) continue;
    const identity = canonicalIdentity(bankRow.source_type, bankRow.source_id);
    if (identity && !activeBankByIdentity.has(identity)) activeBankByIdentity.set(identity, bankRow);
  }

  const stateByIdentity = new Map<string, MatchdayEditorialProfileStateRow>();
  for (const stateRow of stateRows) {
    const identity = canonicalIdentity(stateRow.source_type, stateRow.source_id);
    if (identity && !stateByIdentity.has(identity)) stateByIdentity.set(identity, stateRow);
  }
  const classificationByIdentity = new Map<string, MatchdayEditorialProfileClassificationRow>();
  for (const classificationRow of classificationRows ?? []) {
    const identity = canonicalIdentity(classificationRow.source_type, classificationRow.source_id);
    if (identity && !classificationByIdentity.has(identity)) {
      classificationByIdentity.set(identity, classificationRow);
    }
  }

  const diagnostics: MatchdayEditorialProfileDeskDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  const addDiagnostic = (diagnostic: MatchdayEditorialProfileDeskDiagnostic, identity = "") => {
    const key = `${diagnostic.code}\u0000${identity}\u0000${diagnostic.zoneKey ?? ""}`;
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push(diagnostic);
  };

  const knownZoneKeys = new Set<string>(profile.zones.map((zone) => zone.key));
  const historicalIdentities = new Set<string>();
  for (const [identity, stateRow] of stateByIdentity) {
    if (!activeBankByIdentity.has(identity)) historicalIdentities.add(identity);
    if (!articlesById.has(stateRow.source_id.trim().toLowerCase())) {
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
    }
  }

  const activeItems: MatchdayEditorialProfileDeskAutomaticItem[] = [];
  for (const [identity, bankRow] of activeBankByIdentity) {
    const sourceType = cleanText(bankRow.source_type) ?? SUPPORTED_SOURCE_TYPE;
    const sourceId = cleanText(bankRow.source_id) ?? "";
    const state = stateByIdentity.get(identity);
    if (!state) {
      addDiagnostic({
        code: "active_bank_without_state",
        message: `A publicação ativa ${sourceType}:${sourceId} ainda não tem estado temático.`,
        sourceType,
        sourceId,
      }, identity);
    }

    const classification = classificationByIdentity.get(identity);
    if (classificationRows !== undefined && !classification) {
      addDiagnostic({
        code: "missing_classification",
        message: `A publicação ativa ${sourceType}:${sourceId} não tem classificação natural.`,
        sourceType,
        sourceId,
      }, identity);
    }

    const article = articlesById.get(sourceId.toLowerCase());
    if (!article) {
      addDiagnostic({
        code: "missing_article",
        message: `O banco ativo aponta para um artigo inexistente (${sourceId}).`,
        sourceType,
        sourceId,
      }, identity);
      continue;
    }

    const fallbackZoneKey = state?.zone_key !== null
      && state?.zone_key !== undefined
      && knownZoneKeys.has(state.zone_key)
      ? state.zone_key as EditorialProfileZoneKey
      : null;
    const classifiedZoneKey = classification
      && knownZoneKeys.has(classification.classified_zone_key)
      ? classification.classified_zone_key as EditorialProfileZoneKey
      : fallbackZoneKey;
    const actualityOrder = classification?.actuality_order ?? state?.sort_order ?? null;
    activeItems.push({
      ...itemFromArticle(sourceType, sourceId, actualityOrder, article),
      classifiedZoneKey,
      actualityOrder,
    });
  }
  activeItems.sort(compareThematicItemsByActuality);

  const activeItemsByIdentity = new Map(activeItems.map((item) => [
    thematicEditorialIdentity(item.sourceType, item.sourceId),
    item,
  ]));
  const zoneItems = new Map<EditorialProfileZoneKey, Array<MatchdayEditorialProfileDeskItem & { sortOrder: number }>>(
    profile.zones.map((zone) => [zone.key, []]),
  );
  const overflow: Array<MatchdayEditorialProfileDeskItem & { sortOrder: null }> = [];

  for (const item of activeItemsByIdentity.values()) {
    const zone = profile.zones.find((candidate) => candidate.key === item.classifiedZoneKey);
    if (!zone || item.actualityOrder === null || item.actualityOrder > zone.capacity) {
      overflow.push({ ...itemFromArticle(
        item.sourceType,
        item.sourceId,
        null,
        articlesById.get(item.sourceId.toLowerCase())!,
      ), sortOrder: null });
      continue;
    }
    zoneItems.get(zone.key)?.push({
      ...itemFromArticle(
        item.sourceType,
        item.sourceId,
        item.actualityOrder,
        articlesById.get(item.sourceId.toLowerCase())!,
      ),
      sortOrder: item.actualityOrder,
    });
  }

  const zones = profile.zones.map((zone) => ({
    key: zone.key,
    label: zone.label,
    capacity: zone.capacity,
    visualFamily: zone.visualFamily,
    placementMode: zone.placementMode,
    items: (zoneItems.get(zone.key) ?? []).sort((left, right) => left.sortOrder - right.sortOrder),
  }));
  overflow.sort(compareThematicItemsByActuality);

  return {
    zones,
    overflow,
    activeItems,
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
      `editorial_articles?select=id,slug,status,label,title,subtitle,image_url,published_at,updated_at&id=in.(${batch.join(",")})`,
    )
  )));
  return batches.flat();
}

function faixaSlug(linkUrl: string | null): string | null {
  const clean = cleanText(linkUrl);
  if (!clean?.startsWith("/noticias/")) return null;
  const slug = clean.slice("/noticias/".length);
  return slug && !slug.includes("/") && !slug.includes("?") && !slug.includes("#") ? slug : null;
}

async function readFaixaArticles(
  fetchTable: MatchdayEditorialProfileDeskTableFetcher,
  faixaRows: readonly MatchdayEditorialProfileHorizontalRow[],
): Promise<MatchdayEditorialProfileArticleRow[]> {
  const slugs = Array.from(new Set(faixaRows.map((row) => faixaSlug(row.link_url)).filter(
    (slug): slug is string => slug !== null,
  )));
  if (slugs.length === 0) return [];
  const batches = await Promise.all(chunks(slugs, ARTICLE_BATCH_SIZE).map((batch) => (
    fetchTable<MatchdayEditorialProfileArticleRow>(
      `editorial_articles?select=id,slug,status,label,title,subtitle,image_url,published_at,updated_at&slug=in.(${batch.map(encodeURIComponent).join(",")})`,
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

  const reconcileTokenPath = `rpc/matchday_editorial_profile_workspace_token?p_matchday_id=${encodeURIComponent(cleanMatchdayId)}&p_profile_key=${encodeURIComponent(assignment.profile_key)}`;
  const reconcileTokenBefore = (await fetchTable<ReconcileTokenRow>(reconcileTokenPath))[0]?.state_token;
  if (!reconcileTokenBefore) throw new Error("matchday-editorial-profile-desk-reconcile-token-not-found");

  const [
    matchdayRows,
    verifiedAssignmentRows,
    stateRows,
    bankRows,
    manualOverrideRows,
    classificationRows,
    appliedZoneRows,
    reconcileControlRows,
    faixaRows,
    openingEditorialRows,
    openingHighlightRows,
  ] = await Promise.all([
    matchdayRowsPromise,
    fetchTable<AssignmentRow>(
      `matchday_editorial_profile_assignments?select=profile_key&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&limit=1`,
    ),
    readAllRows<MatchdayEditorialProfileStateRow>(
      fetchTable,
      `matchday_editorial_profile_state_items?select=source_type,source_id,zone_key,sort_order&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&profile_key=eq.${encodeURIComponent(assignment.profile_key)}`,
    ),
    readAllRows<MatchdayEditorialProfileActiveBankRow>(
      fetchTable,
      `matchday_editorial_bank_items?select=source_type,source_id,status&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&status=eq.active&source_type=eq.editorial_article`,
    ),
    readAllRows<MatchdayEditorialProfileManualOverrideRow>(
      fetchTable,
      `matchday_editorial_profile_manual_overrides?select=source_type,source_id,placement_target,zone_key,sort_order&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&profile_key=eq.${encodeURIComponent(assignment.profile_key)}`,
    ),
    readAllRows<MatchdayEditorialProfileClassificationRow>(
      fetchTable,
      `rpc/matchday_editorial_profile_classification_plan?p_matchday_id=${encodeURIComponent(cleanMatchdayId)}`,
    ),
    readAllRows<MatchdayEditorialProfileZoneItemRow>(
      fetchTable,
      `matchday_editorial_profile_zone_items?select=source_type,source_id,zone_key,sort_order&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&profile_key=eq.${encodeURIComponent(assignment.profile_key)}`,
    ),
    fetchTable<ReconcileControlRow>(
      `matchday_editorial_profile_reconcile_control?select=revision,thematic_zone_order&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&profile_key=eq.${encodeURIComponent(assignment.profile_key)}&limit=1`,
    ),
    readAllRows<MatchdayEditorialProfileHorizontalRow>(
      fetchTable,
      `matchday_horizontal_news?select=id,label,label_color,title,subtitle,image_url,link_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&order=sort_order.asc`,
    ),
    fetchTable<OpeningEditorialRow>(
      `matchday_editorials?select=status,title_color,headline_link_url,side_block_status,side_block_link_url,latest_zone_placement&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&limit=1`,
    ),
    fetchTable<OpeningHighlightRow>(
      `matchday_highlights?select=sort_order,status,link_url&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&order=sort_order.asc&limit=3`,
    ),
  ]);
  const matchday = matchdayRows[0];
  if (!matchday) throw new Error("matchday-editorial-profile-desk-matchday-not-found");
  if (verifiedAssignmentRows[0]?.profile_key !== assignment.profile_key) {
    throw new Error("matchday-editorial-profile-desk-concurrent-read");
  }

  const [context, activeArticleRows, faixaArticleRows] = await Promise.all([
    readContext(fetchTable, matchday),
    readArticles(fetchTable, stateRows, bankRows),
    readFaixaArticles(fetchTable, faixaRows),
  ]);
  const articleRows = Array.from(new Map(
    [...activeArticleRows, ...faixaArticleRows].map((article) => [article.id.toLowerCase(), article] as const),
  ).values());
  const reconcileTokenAfter = (await fetchTable<ReconcileTokenRow>(reconcileTokenPath))[0]?.state_token;
  if (!reconcileTokenAfter) throw new Error("matchday-editorial-profile-desk-reconcile-token-not-found");
  if (reconcileTokenBefore !== reconcileTokenAfter) {
    throw new Error("matchday-editorial-profile-desk-concurrent-read");
  }
  const automaticDistribution = buildMatchdayEditorialProfileDeskDistribution(
    profile,
    stateRows,
    bankRows,
    articleRows,
    classificationRows,
  );
  const activeIdentities = new Set(automaticDistribution.activeItems.map((item) => (
    thematicEditorialIdentity(item.sourceType, item.sourceId)
  )));
  const activeSourceIdsBySlug = new Map<string, string[]>();
  for (const article of articleRows) {
    const slug = cleanText(article.slug);
    const sourceId = article.id.trim().toLowerCase();
    if (
      !slug
      || cleanText(article.status)?.toLowerCase() !== "published"
      || !activeIdentities.has(thematicEditorialIdentity(SUPPORTED_SOURCE_TYPE, sourceId))
    ) continue;
    const current = activeSourceIdsBySlug.get(slug) ?? [];
    current.push(sourceId);
    activeSourceIdsBySlug.set(slug, current);
  }
  const openingDiagnostics: MatchdayEditorialProfileDeskDiagnostic[] = [];
  const openingSourceId = (linkUrl: string | null, label: string): string | null => {
    const slug = faixaSlug(linkUrl);
    if (!slug) {
      if (cleanText(linkUrl)) {
        openingDiagnostics.push({
          code: "unresolved_opening",
          message: `${label} não resolve para uma notícia canónica ativa.`,
        });
      }
      return null;
    }
    const matches = activeSourceIdsBySlug.get(slug) ?? [];
    if (matches.length !== 1) {
      openingDiagnostics.push({
        code: "unresolved_opening",
        message: `${label} não resolve univocamente para uma notícia canónica ativa.`,
      });
      return null;
    }
    return matches[0];
  };
  const openingEditorial = openingEditorialRows[0];
  const highlightByOrder = new Map(openingHighlightRows.map((row) => [row.sort_order, row] as const));
  const opening = {
    ...emptyMatchdayEditorialProfileOpening(),
    headline: cleanText(openingEditorial?.status)?.toLowerCase() === "published"
      ? openingSourceId(openingEditorial?.headline_link_url ?? null, "A Manchete")
      : null,
    highlight_1: cleanText(highlightByOrder.get(1)?.status)?.toLowerCase() === "published"
      ? openingSourceId(highlightByOrder.get(1)?.link_url ?? null, "A Notícia 1")
      : null,
    highlight_2: cleanText(highlightByOrder.get(2)?.status)?.toLowerCase() === "published"
      ? openingSourceId(highlightByOrder.get(2)?.link_url ?? null, "A Notícia 2")
      : null,
    highlight_3: cleanText(highlightByOrder.get(3)?.status)?.toLowerCase() === "published"
      ? openingSourceId(highlightByOrder.get(3)?.link_url ?? null, "A Notícia 3")
      : null,
    context: cleanText(openingEditorial?.side_block_status)?.toLowerCase() === "published"
      ? openingSourceId(openingEditorial?.side_block_link_url ?? null, "O Contexto")
      : null,
  } satisfies MatchdayEditorialProfileOpening;
  const pageControls: MatchdayEditorialProfilePageControls = {
    headlineTitleColor: /^#[0-9a-f]{6}$/i.test(cleanText(openingEditorial?.title_color) ?? "")
      ? cleanText(openingEditorial?.title_color)?.toUpperCase() ?? null
      : null,
    latestZonePlacement: openingEditorial?.latest_zone_placement === "four_news"
      ? "four_news"
      : openingEditorial?.latest_zone_placement === "hidden"
        ? "hidden"
        : "top",
    thematicZoneOrder: normalizeMatchdayEditorialProfileThematicZoneOrder(
      reconcileControlRows[0]?.thematic_zone_order,
    ),
  };
  const manualOverrides = validateMatchdayEditorialProfileManualOverrides(
    profile,
    manualOverrideRows
      .map((row): MatchdayEditorialProfileManualOverride => ({
        sourceType: SUPPORTED_SOURCE_TYPE,
        sourceId: row.source_id.trim().toLowerCase(),
        placementTarget: row.placement_target as MatchdayEditorialProfileManualOverride["placementTarget"],
        zoneKey: row.zone_key as EditorialProfileZoneKey | null,
        sortOrder: row.sort_order,
      }))
      .filter((override) => activeIdentities.has(
        thematicEditorialIdentity(override.sourceType, override.sourceId),
      )),
  );
  const articleRowsBySlug = new Map<string, MatchdayEditorialProfileArticleRow[]>();
  for (const article of faixaArticleRows) {
    const slug = cleanText(article.slug);
    if (!slug || cleanText(article.status)?.toLowerCase() !== "published") continue;
    const current = articleRowsBySlug.get(slug) ?? [];
    current.push(article);
    articleRowsBySlug.set(slug, current);
  }
  const faixaDiagnostics: MatchdayEditorialProfileDeskDiagnostic[] = [];
  const currentFaixa: MatchdayEditorialProfileFaixaItem[] = [];
  const currentFaixaIdentities = new Set<string>();
  for (const faixaRow of [...faixaRows].sort((left, right) => left.sort_order - right.sort_order)) {
    const slug = faixaSlug(faixaRow.link_url);
    const matches = slug ? articleRowsBySlug.get(slug) ?? [] : [];
    if (matches.length !== 1) {
      faixaDiagnostics.push({
        code: matches.length > 1 ? "ambiguous_faixa" : "unresolved_faixa",
        message: matches.length > 1
          ? `A Faixa ${faixaRow.sort_order} resolve para vários artigos canónicos.`
          : `A Faixa ${faixaRow.sort_order} não resolve univocamente para um artigo canónico.`,
        sourceType: "matchday_horizontal_news",
        sourceId: faixaRow.id,
      });
      continue;
    }
    const article = matches[0];
    const articleIdentity = thematicEditorialIdentity(SUPPORTED_SOURCE_TYPE, article.id.toLowerCase());
    if (currentFaixaIdentities.has(articleIdentity)) {
      faixaDiagnostics.push({
        code: "duplicate_faixa_identity",
        message: `A Faixa ${faixaRow.sort_order} repete uma publicação canónica já colocada.`,
        sourceType: SUPPORTED_SOURCE_TYPE,
        sourceId: article.id.toLowerCase(),
      });
      continue;
    }
    if (!activeIdentities.has(articleIdentity)) {
      faixaDiagnostics.push({
        code: "inactive_faixa",
        message: `A Faixa ${faixaRow.sort_order} aponta para um artigo que não está no banco temático ativo.`,
        sourceType: SUPPORTED_SOURCE_TYPE,
        sourceId: article.id.toLowerCase(),
      });
      continue;
    }
    currentFaixaIdentities.add(articleIdentity);
    currentFaixa.push({
      ...itemFromArticle(SUPPORTED_SOURCE_TYPE, article.id.toLowerCase(), faixaRow.sort_order, article),
      sortOrder: faixaRow.sort_order,
      manualOverride: null,
    });
  }

  const knownZones = new Set<string>(profile.zones.map((zone) => zone.key));
  const appliedZoneItems = appliedZoneRows.flatMap((row): MatchdayEditorialProfileAppliedZoneItem[] => {
    if (!knownZones.has(row.zone_key)) return [];
    return [{
      sourceType: row.source_type,
      sourceId: row.source_id,
      zoneKey: row.zone_key as EditorialProfileZoneKey,
      sortOrder: row.sort_order,
    }];
  });
  const hasAppliedSnapshot = reconcileControlRows.length > 0;
  const snapshotDiagnostics: MatchdayEditorialProfileDeskDiagnostic[] = [];
  if (!hasAppliedSnapshot && appliedZoneRows.length > 0) {
    snapshotDiagnostics.push({
      code: "invalid_applied_snapshot",
      message: "Existem posições temáticas aplicadas sem controlo de reconcile.",
    });
  }
  const reconcile = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    automaticDistribution.activeItems,
    manualOverrides,
    opening,
    appliedZoneItems,
    hasAppliedSnapshot,
    currentFaixa,
  );
  const diagnostics = [
    ...automaticDistribution.diagnostics,
    ...faixaDiagnostics,
    ...openingDiagnostics,
    ...snapshotDiagnostics,
  ];

  return {
    kind: "thematic",
    ...context,
    profileKey: assignment.profile_key as EditorialProfileKey,
    profileDisplayName: profile.displayName,
    automaticDistribution,
    manualOverrides,
    reconcileRevision: reconcileControlRows[0]?.revision ?? 0,
    reconcileStateToken: reconcileTokenAfter,
    hasAppliedSnapshot,
    appliedZoneItems,
    currentFaixa,
    opening,
    pageControls,
    reconcile,
    zones: reconcile.zonesAfter,
    bank: reconcile.bankAfter,
    diagnostics,
    inactiveHistoricalCount: automaticDistribution.inactiveHistoricalCount,
  };
}
