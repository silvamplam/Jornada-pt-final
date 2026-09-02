import {
  editorialProfile,
  editorialProfileWithZoneLayouts,
  type EditorialPlacementMode,
  type EditorialProfile,
  type EditorialProfileKey,
  type EditorialProfileZoneKey,
  type EditorialVisualFamily,
} from "@/lib/editorial-profiles";
import {
  compareThematicItemsByCircuitOrder,
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
  normalizeMatchdayEditorialProfileThematicBlockOrder,
  normalizeMatchdayEditorialProfileThematicZoneLayouts,
  normalizeMatchdayEditorialProfileThematicZoneOrder,
  normalizeMatchdayEditorialProfileThematicZoneTitles,
  reconcileMatchdayEditorialProfileWorkspace,
  type MatchdayEditorialProfileOpening,
  type MatchdayEditorialProfilePageControls,
} from "@/lib/editorial-matchday-profile-workspace";
import { fetchSupabaseAdminTable } from "@/lib/supabase";

const SUPPORTED_SOURCE_TYPE = "editorial_article";
const READ_PAGE_SIZE = 1_000;

export type MatchdayEditorialTrackingState = "NOVA" | "FAIXA" | "DESALOJADA";

export type MatchdayEditorialProfileStateRow = Readonly<{
  source_type: string;
  source_id: string;
  zone_key: string | null;
  sort_order: number | null;
}>;

export type MatchdayEditorialProfileActiveBankRow = Readonly<{
  id?: string;
  source_type: string | null;
  source_id: string | null;
  status: string | null;
  automatic_eligible?: boolean | null;
  editorially_worked_at?: string | null;
  editorial_state?: MatchdayEditorialTrackingState | null;
}>;

export type MatchdayLiveDeskAggregateRow = Readonly<{
  bank_item_id: string;
  source_type: string | null;
  source_id: string | null;
  label: string | null;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  bank_status: string | null;
  automatic_eligible: boolean | null;
  classification_key: string | null;
  classification_source: string | null;
  classified_at: string | null;
  article_id: string | null;
  article_published_at: string | null;
  article_updated_at: string | null;
  has_automatic_state: boolean;
  automatic_zone_key: string | null;
  automatic_sort_order: number | null;
  placement_count: number;
  transversal_conflict: boolean;
  memory_kind: "legacy_unknown" | "displaced" | null;
  history_unknown: boolean;
  memory_placement_conflict: boolean;
  editorial_state: "NOVA" | "FAIXA" | "DESALOJADA" | "COLOCADA" | null;
  placement_id: string | null;
  placement_type: string | null;
  zone_id: string | null;
  placement_zone_key: string | null;
  slot_position: number | null;
  inactive_historical_count: number;
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

export type MatchdayEditorialProfileContinuityClassificationRow = Readonly<{
  source_type: string;
  source_id: string;
  classified_zone_key: string;
}>;

export type MatchdayEditorialProfileZoneItemRow = Readonly<{
  source_type: string;
  source_id: string;
  zone_key: string;
  sort_order: number;
}>;

export type MatchdayEditorialProfileLivePlacementRow = Readonly<{
  bank_item_id: string;
  placement_type: string;
  zone_id: string | null;
  slot_position: number;
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
  | "legacy_unknown_state"
  | "transversal_state_conflict"
  | "memory_placement_state_conflict"
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
  isNew?: boolean;
  circuitOrder?: number | null;
}>;

export type MatchdayEditorialTrackingItem =
  & MatchdayEditorialProfileDeskItem
  & Readonly<{
    bankItemId: string;
    classifiedZoneKey: EditorialProfileZoneKey;
    classificationSource: string;
    classifiedAt: string;
    editorialState: MatchdayEditorialTrackingState;
    memoryKind: "displaced" | null;
  }>;

export type MatchdayEditorialTrackingSnapshot = Readonly<{
  items: readonly MatchdayEditorialTrackingItem[];
  legacyUnknownCount: number;
  conflictCount: number;
}>;

export type MatchdayEditorialSelectionCandidate = Readonly<{
  bankItemId: string;
  sourceType: string | null;
  sourceId: string | null;
  label: string | null;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
}>;

export type MatchdayEditorialSelectionItem = Readonly<{
  position: number;
  liveItemId: string;
  bankItemId: string;
  sourceType: string | null;
  sourceId: string | null;
  label: string | null;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
}>;

export type MatchdayEditorialProfileDeskAutomaticItem =
  & MatchdayEditorialProfileDeskItem
  & Readonly<{
    classifiedZoneKey: EditorialProfileZoneKey | null;
    circuitOrder: number | null;
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

export type MatchdayEditorialProfileVideoModule = Readonly<{
  active: boolean;
  highlight: Readonly<{
    isPublished: boolean;
    label: string | null;
    title: string | null;
    text: string | null;
    imageUrl: string | null;
    linkUrl: string | null;
    placement: Readonly<{
      bankItemId: string;
      sourceType: string;
      sourceId: string;
    }> | null;
  }>;
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
    videoModule: MatchdayEditorialProfileVideoModule;
    tracking: MatchdayEditorialTrackingSnapshot;
    selectionCandidates: readonly MatchdayEditorialSelectionCandidate[];
    editorialSelection: readonly MatchdayEditorialSelectionItem[];
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

type ReconcileControlRow = Readonly<{
  revision: number;
  thematic_zone_order: unknown;
  thematic_zone_layouts: unknown;
  thematic_block_order: unknown;
  thematic_zone_titles: unknown;
}>;
type ReconcileTokenRow = Readonly<{ state_token: string }>;
type OpeningEditorialRow = Readonly<{
  title_color: string | null;
  latest_zone_placement: string | null;
  latest_zone_title: string | null;
  complementary_mode: string | null;
  complementary_status: string | null;
  complementary_label: string | null;
  complementary_title: string | null;
  complementary_text: string | null;
  complementary_image_url: string | null;
  complementary_link_url: string | null;
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
  continuityClassificationRows?: readonly MatchdayEditorialProfileContinuityClassificationRow[],
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

  const continuityClassificationByIdentity = new Map<
    string,
    MatchdayEditorialProfileContinuityClassificationRow
  >();
  for (const classificationRow of continuityClassificationRows ?? []) {
    const identity = canonicalIdentity(classificationRow.source_type, classificationRow.source_id);
    if (identity && !continuityClassificationByIdentity.has(identity)) {
      continuityClassificationByIdentity.set(identity, classificationRow);
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
    if (bankRow.automatic_eligible !== false && !state) {
      addDiagnostic({
        code: "active_bank_without_state",
        message: `A publicação ativa ${sourceType}:${sourceId} ainda não tem estado temático.`,
        sourceType,
        sourceId,
      }, identity);
    }

    const classification = classificationByIdentity.get(identity);
    const continuityClassification =
      continuityClassificationByIdentity.get(identity);
    const naturalClassification =
      classification ?? continuityClassification;

    if (
      (
        classificationRows !== undefined
        || continuityClassificationRows !== undefined
      )
      && !naturalClassification
    ) {
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
    const classifiedZoneKey = naturalClassification
      && knownZoneKeys.has(naturalClassification.classified_zone_key)
      ? naturalClassification.classified_zone_key as EditorialProfileZoneKey
      : fallbackZoneKey;
    const circuitOrder = classification?.actuality_order ?? state?.sort_order ?? null;
    activeItems.push({
      ...itemFromArticle(sourceType, sourceId, state?.sort_order ?? null, article),
      classifiedZoneKey,
      circuitOrder,
      isNew: bankRow.editorial_state === "NOVA",
    });
  }
  activeItems.sort(compareThematicItemsByCircuitOrder);

  const activeItemsByIdentity = new Map(activeItems.map((item) => [
    thematicEditorialIdentity(item.sourceType, item.sourceId),
    item,
  ]));
  const zoneItems = new Map<EditorialProfileZoneKey, Array<MatchdayEditorialProfileDeskItem & { sortOrder: number }>>(
    profile.zones.map((zone) => [zone.key, []]),
  );
  const overflow: Array<MatchdayEditorialProfileDeskItem & { sortOrder: null }> = [];

  const nextPositionByZone = new Map<EditorialProfileZoneKey, number>();

  for (const item of activeItemsByIdentity.values()) {
    const zone = profile.zones.find((candidate) => candidate.key === item.classifiedZoneKey);
    if (!zone || item.circuitOrder === null) {
      overflow.push({ ...itemFromArticle(
        item.sourceType,
        item.sourceId,
        null,
        articlesById.get(item.sourceId.toLowerCase())!,
      ), sortOrder: null });
      continue;
    }

    const position = (nextPositionByZone.get(zone.key) ?? 0) + 1;
    nextPositionByZone.set(zone.key, position);

    if (position > zone.capacity) {
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
        position,
        articlesById.get(item.sourceId.toLowerCase())!,
      ),
      sortOrder: position,
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

export function buildMatchdayEditorialTrackingSnapshot(
  profile: EditorialProfile,
  aggregateRows: readonly MatchdayLiveDeskAggregateRow[],
): Readonly<{
  tracking: MatchdayEditorialTrackingSnapshot;
  diagnostics: readonly MatchdayEditorialProfileDeskDiagnostic[];
}> {
  const knownZoneKeys = new Set<string>(profile.zones.map((zone) => zone.key));
  const diagnostics: MatchdayEditorialProfileDeskDiagnostic[] = [];
  const items: MatchdayEditorialTrackingItem[] = [];
  let legacyUnknownCount = 0;
  let conflictCount = 0;

  for (const row of aggregateRows) {
    const sourceType = cleanText(row.source_type)?.toLowerCase() ?? "";
    const sourceId = cleanText(row.source_id)?.toLowerCase() ?? "";

    if (row.transversal_conflict) {
      conflictCount += 1;
      diagnostics.push({
        code: "transversal_state_conflict",
        message: `A participação ${sourceType}:${sourceId} tem ${row.placement_count} placements autoritativos; nenhum estado foi escolhido.`,
        sourceType,
        sourceId,
      });
      continue;
    }

    if (row.memory_placement_conflict) {
      conflictCount += 1;
      diagnostics.push({
        code: "memory_placement_state_conflict",
        message: `A participação ${sourceType}:${sourceId} tem placement e memória simultâneos; nenhum estado foi escolhido.`,
        sourceType,
        sourceId,
      });
      continue;
    }

    if (cleanText(row.bank_status)?.toLowerCase() !== "active") continue;
    if (sourceType !== SUPPORTED_SOURCE_TYPE || !sourceId) continue;

    if (row.history_unknown || row.memory_kind === "legacy_unknown") {
      legacyUnknownCount += 1;
      continue;
    }

    if (
      row.editorial_state !== "NOVA"
      && row.editorial_state !== "FAIXA"
      && row.editorial_state !== "DESALOJADA"
    ) {
      continue;
    }

    if (
      !row.classification_key
      || !knownZoneKeys.has(row.classification_key)
      || !row.classification_source
      || !row.classified_at
      || !row.article_id
    ) {
      continue;
    }

    items.push({
      bankItemId: row.bank_item_id.trim().toLowerCase(),
      sourceType,
      sourceId,
      sortOrder: row.automatic_sort_order,
      label: cleanText(row.label),
      title: cleanText(row.title),
      subtitle: cleanText(row.subtitle),
      imageUrl: cleanText(row.image_url),
      publishedAt: row.article_published_at,
      updatedAt: row.article_updated_at,
      circuitOrder: row.automatic_sort_order,
      classifiedZoneKey: row.classification_key as EditorialProfileZoneKey,
      classificationSource: row.classification_source,
      classifiedAt: row.classified_at,
      editorialState: row.editorial_state,
      memoryKind: row.memory_kind === "displaced" ? "displaced" : null,
    });
  }

  items.sort(compareThematicItemsByCircuitOrder);

  if (legacyUnknownCount > 0) {
    diagnostics.push({
      code: "legacy_unknown_state",
      message: `${legacyUnknownCount} participação(ões) mantém baseline histórico indeterminado e ficam fora do tracking.`,
    });
  }

  return {
    tracking: {
      items,
      legacyUnknownCount,
      conflictCount,
    },
    diagnostics,
  };
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
    aggregateRows,
    manualOverrideRows,
    reconcileControlRows,
    openingEditorialRows,
  ] = await Promise.all([
    matchdayRowsPromise,
    fetchTable<AssignmentRow>(
      `matchday_editorial_profile_assignments?select=profile_key&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&limit=1`,
    ),
    readAllRows<MatchdayLiveDeskAggregateRow>(
      fetchTable,
      `rpc/read_matchday_live_desk_aggregate_tracking?p_matchday_id=${encodeURIComponent(cleanMatchdayId)}&p_profile_key=${encodeURIComponent(assignment.profile_key)}`,
    ),
    readAllRows<MatchdayEditorialProfileManualOverrideRow>(
      fetchTable,
      `matchday_editorial_profile_manual_overrides?select=source_type,source_id,placement_target,zone_key,sort_order&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&profile_key=eq.${encodeURIComponent(assignment.profile_key)}`,
    ),
    fetchTable<ReconcileControlRow>(
      `matchday_editorial_profile_reconcile_control?select=revision,thematic_zone_order,thematic_zone_layouts,thematic_block_order,thematic_zone_titles&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&profile_key=eq.${encodeURIComponent(assignment.profile_key)}&limit=1`,
    ),
    fetchTable<OpeningEditorialRow>(
      `matchday_editorials?select=title_color,latest_zone_placement,latest_zone_title,complementary_mode,complementary_status,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url&matchday_id=eq.${encodeURIComponent(cleanMatchdayId)}&limit=1`,
    ),
  ]);
  const matchday = matchdayRows[0];
  if (!matchday) throw new Error("matchday-editorial-profile-desk-matchday-not-found");
  if (verifiedAssignmentRows[0]?.profile_key !== assignment.profile_key) {
    throw new Error("matchday-editorial-profile-desk-concurrent-read");
  }

  const context = await readContext(fetchTable, matchday);
  const reconcileTokenAfter = (await fetchTable<ReconcileTokenRow>(reconcileTokenPath))[0]?.state_token;
  if (!reconcileTokenAfter) throw new Error("matchday-editorial-profile-desk-reconcile-token-not-found");
  if (reconcileTokenBefore !== reconcileTokenAfter) {
    throw new Error("matchday-editorial-profile-desk-concurrent-read");
  }

  const thematicZoneOrder =
    normalizeMatchdayEditorialProfileThematicZoneOrder(
      reconcileControlRows[0]?.thematic_zone_order,
    );

  const thematicZoneLayouts =
    normalizeMatchdayEditorialProfileThematicZoneLayouts(
      reconcileControlRows[0]?.thematic_zone_layouts,
    );

  const thematicBlockOrder =
    normalizeMatchdayEditorialProfileThematicBlockOrder(
      reconcileControlRows[0]?.thematic_block_order,
      thematicZoneOrder,
    );

  const thematicZoneTitles =
    normalizeMatchdayEditorialProfileThematicZoneTitles(
      reconcileControlRows[0]?.thematic_zone_titles,
    );

  const effectiveProfile =
    editorialProfileWithZoneLayouts(
      profile,
      thematicZoneLayouts,
    );

  const stateRows: MatchdayEditorialProfileStateRow[] = aggregateRows
    .filter((row) => (
      row.has_automatic_state
      && cleanText(row.source_type)?.toLowerCase() === SUPPORTED_SOURCE_TYPE
      && cleanText(row.source_id)
    ))
    .map((row) => ({
      source_type: SUPPORTED_SOURCE_TYPE,
      source_id: row.source_id!.trim().toLowerCase(),
      zone_key: row.automatic_zone_key,
      sort_order: row.automatic_sort_order,
    }));
  const bankRows: MatchdayEditorialProfileActiveBankRow[] = aggregateRows
    .filter((row) => cleanText(row.source_type)?.toLowerCase() === SUPPORTED_SOURCE_TYPE)
    .map((row) => ({
      id: row.bank_item_id,
      source_type: row.source_type,
      source_id: row.source_id,
      status: row.bank_status,
      automatic_eligible: row.automatic_eligible,
      editorial_state:
        row.editorial_state === "NOVA"
        || row.editorial_state === "FAIXA"
        || row.editorial_state === "DESALOJADA"
          ? row.editorial_state
          : null,
    }));
  const articleRows: MatchdayEditorialProfileArticleRow[] = aggregateRows
    .filter((row) => (
      cleanText(row.source_type)?.toLowerCase() === SUPPORTED_SOURCE_TYPE
      && row.article_id !== null
    ))
    .map((row) => ({
      id: row.article_id!,
      label: row.label,
      title: row.title,
      subtitle: row.subtitle,
      image_url: row.image_url,
      published_at: row.article_published_at,
      updated_at: row.article_updated_at,
    }));
  const classificationRows: MatchdayEditorialProfileClassificationRow[] = aggregateRows
    .flatMap((row, index) => {
      const sourceId = cleanText(row.source_id)?.toLowerCase();
      const classificationKey = cleanText(row.classification_key);
      if (
        cleanText(row.source_type)?.toLowerCase() !== SUPPORTED_SOURCE_TYPE
        || !sourceId
        || !classificationKey
      ) return [];
      return [{
        source_type: SUPPORTED_SOURCE_TYPE,
        source_id: sourceId,
        classified_zone_key: classificationKey,
        actuality_order: row.automatic_sort_order ?? index + 1,
      }];
    });
  const placementRows: MatchdayEditorialProfileLivePlacementRow[] = aggregateRows
    .flatMap((row) => (
      row.placement_count === 1
      && row.placement_id
      && row.placement_type
      && row.slot_position !== null
        ? [{
            bank_item_id: row.bank_item_id,
            placement_type: row.placement_type,
            zone_id: row.zone_id,
            slot_position: row.slot_position,
          }]
        : []
    ));
  const appliedZoneRows: MatchdayEditorialProfileZoneItemRow[] = aggregateRows
    .flatMap((row) => {
      const sourceType = cleanText(row.source_type)?.toLowerCase();
      const sourceId = cleanText(row.source_id)?.toLowerCase();
      return row.placement_count === 1
        && row.placement_type === "zone"
        && row.placement_zone_key
        && row.slot_position !== null
        && sourceType
        && sourceId
        ? [{
            source_type: sourceType,
            source_id: sourceId,
            zone_key: row.placement_zone_key,
            sort_order: row.slot_position,
          }]
        : [];
    });
  const trackingProjection = buildMatchdayEditorialTrackingSnapshot(
    effectiveProfile,
    aggregateRows,
  );

  const automaticDistribution = buildMatchdayEditorialProfileDeskDistribution(
    effectiveProfile,
    stateRows,
    bankRows,
    articleRows,
    classificationRows,
  );
  const activeIdentities = new Set(automaticDistribution.activeItems.map((item) => (
    thematicEditorialIdentity(item.sourceType, item.sourceId)
  )));
  const activeBankRowsById = new Map(bankRows.flatMap((row) => {
    const bankItemId = cleanText(row.id)?.toLowerCase();
    return bankItemId ? [[bankItemId, row] as const] : [];
  }));
  const articleRowsById = new Map(articleRows.map((row) => (
    [row.id.trim().toLowerCase(), row] as const
  )));
  const placementSource = (placement: MatchdayEditorialProfileLivePlacementRow) => {
    const bank = activeBankRowsById.get(
      placement.bank_item_id.trim().toLowerCase(),
    );
    const sourceType = cleanText(bank?.source_type)?.toLowerCase() ?? null;
    const sourceId = cleanText(bank?.source_id)?.toLowerCase() ?? null;
    return bank && sourceType && sourceId
      ? {
          bank,
          bankItemId: placement.bank_item_id.trim().toLowerCase(),
          sourceType,
          sourceId,
          identity: thematicEditorialIdentity(sourceType, sourceId),
        }
      : null;
  };
  const openingDiagnostics: MatchdayEditorialProfileDeskDiagnostic[] = [];
  const openingSourceId = (slotPosition: number, label: string): string | null => {
    const placement = placementRows.find((row) => (
      row.placement_type === "opening" && row.slot_position === slotPosition
    ));
    if (!placement) return null;
    const source = placementSource(placement);
    if (
      !source
      || source.sourceType !== SUPPORTED_SOURCE_TYPE
      || !activeIdentities.has(source.identity)
      || !articleRowsById.has(source.sourceId)
    ) {
      openingDiagnostics.push({
        code: "unresolved_opening",
        message: `${label} não resolve para uma notícia canónica ativa.`,
        sourceType: "matchday_live_layout_placement",
        sourceId: placement.bank_item_id,
      });
      return null;
    }
    return source.sourceId;
  };
  const openingEditorial = openingEditorialRows[0];
  const opening = {
    ...emptyMatchdayEditorialProfileOpening(),
    headline: openingSourceId(1, "A Manchete"),
    highlight_1: openingSourceId(2, "A Notícia 1"),
    highlight_2: openingSourceId(3, "A Notícia 2"),
    highlight_3: openingSourceId(4, "A Notícia 3"),
    context: openingSourceId(5, "O Contexto"),
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
    latestZoneTitle: cleanText(openingEditorial?.latest_zone_title) ?? "",
    thematicZoneOrder,
    thematicZoneLayouts,
    thematicBlockOrder,
    thematicZoneTitles,
  };
  const videoHighlightPlacement = placementRows.find(
    (placement) => placement.placement_type === "video_highlight",
  );
  const videoHighlightSource = videoHighlightPlacement
    ? placementSource(videoHighlightPlacement)
    : null;
  const videoModule: MatchdayEditorialProfileVideoModule = {
    active:
      cleanText(openingEditorial?.complementary_mode)?.toLowerCase()
      === "roundup_video",
    highlight: {
      isPublished:
        cleanText(openingEditorial?.complementary_status)?.toLowerCase()
        === "published",
      label: cleanText(openingEditorial?.complementary_label),
      title: cleanText(openingEditorial?.complementary_title),
      text: cleanText(openingEditorial?.complementary_text),
      imageUrl: cleanText(openingEditorial?.complementary_image_url),
      linkUrl: cleanText(openingEditorial?.complementary_link_url),
      placement: videoHighlightSource
        ? {
            bankItemId: videoHighlightSource.bankItemId,
            sourceType: videoHighlightSource.sourceType,
            sourceId: videoHighlightSource.sourceId,
          }
        : null,
    },
  };
  const manualOverrides = validateMatchdayEditorialProfileManualOverrides(
    effectiveProfile,
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
  const faixaDiagnostics: MatchdayEditorialProfileDeskDiagnostic[] = [];
  const currentFaixa: MatchdayEditorialProfileFaixaItem[] = [];
  const currentFaixaIdentities = new Set<string>();
  const authoritativeFaixa = placementRows
    .filter((placement) => placement.placement_type === "faixa")
    .sort((left, right) => left.slot_position - right.slot_position);
  for (const placement of authoritativeFaixa) {
    const source = placementSource(placement);
    const article = source?.sourceType === SUPPORTED_SOURCE_TYPE
      ? articleRowsById.get(source.sourceId)
      : null;
    if (!source || !article) {
      faixaDiagnostics.push({
        code: "unresolved_faixa",
        message: `O placement autoritativo Faixa ${placement.slot_position} não resolve para um artigo canónico ativo.`,
        sourceType: "matchday_live_layout_placement",
        sourceId: placement.bank_item_id.trim().toLowerCase(),
      });
      continue;
    }
    const articleIdentity = source.identity;
    if (currentFaixaIdentities.has(articleIdentity)) {
      faixaDiagnostics.push({
        code: "duplicate_faixa_identity",
        message: `A Faixa ${placement.slot_position} repete uma publicação canónica já colocada.`,
        sourceType: SUPPORTED_SOURCE_TYPE,
        sourceId: source.sourceId,
      });
      continue;
    }
    if (!activeIdentities.has(articleIdentity)) {
      faixaDiagnostics.push({
        code: "inactive_faixa",
        message: `A Faixa ${placement.slot_position} aponta para um artigo que não está no banco temático ativo.`,
        sourceType: SUPPORTED_SOURCE_TYPE,
        sourceId: source.sourceId,
      });
      continue;
    }
    currentFaixaIdentities.add(articleIdentity);
    currentFaixa.push({
      ...itemFromArticle(SUPPORTED_SOURCE_TYPE, source.sourceId, placement.slot_position, article),
      sortOrder: placement.slot_position,
      manualOverride: null,
    });
  }
  const authoritativeSelectionIdentities = Array.from(new Set(
    placementRows
      .filter((placement) => placement.placement_type === "selection")
      .flatMap((placement) => {
        const source = placementSource(placement);
        return source?.sourceType === SUPPORTED_SOURCE_TYPE
          && activeIdentities.has(source.identity)
          ? [source.identity]
          : [];
      }),
  ));
  const independentPlacementIdentities = videoHighlightSource?.sourceType
    === SUPPORTED_SOURCE_TYPE
    && activeIdentities.has(videoHighlightSource.identity)
    ? [videoHighlightSource.identity]
    : [];

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
  for (const row of aggregateRows) {
    if (
      row.placement_count === 1
      && row.placement_type === "zone"
      && !row.placement_zone_key
    ) {
      snapshotDiagnostics.push({
        code: "unknown_zone",
        message: `O placement autoritativo ${row.placement_id ?? row.bank_item_id} aponta para uma zona sem projeção semântica.`,
        sourceType: cleanText(row.source_type)?.toLowerCase(),
        sourceId: cleanText(row.source_id)?.toLowerCase(),
      });
    }
  }
  if (!hasAppliedSnapshot && appliedZoneRows.length > 0) {
    snapshotDiagnostics.push({
      code: "invalid_applied_snapshot",
      message: "Existem posições temáticas aplicadas sem controlo de reconcile.",
    });
  }
  const reconcile = reconcileMatchdayEditorialProfileWorkspace(
    effectiveProfile,
    automaticDistribution.activeItems,
    manualOverrides,
    opening,
    appliedZoneItems,
    hasAppliedSnapshot,
    currentFaixa,
    {
      selectionIdentities: authoritativeSelectionIdentities,
      independentPlacementIdentities,
    },
  );
  const diagnostics = [
    ...automaticDistribution.diagnostics,
    ...trackingProjection.diagnostics,
    ...faixaDiagnostics,
    ...openingDiagnostics,
    ...snapshotDiagnostics,
  ];
  const selectionCandidates: MatchdayEditorialSelectionCandidate[] = aggregateRows
    .filter((row) => {
      const sourceType = cleanText(row.source_type)?.toLowerCase();
      return cleanText(row.bank_status)?.toLowerCase() === "active"
        && (sourceType === "editorial_article" || sourceType === "editorial_content");
    })
    .map((row) => ({
      bankItemId: row.bank_item_id.trim().toLowerCase(),
      sourceType: cleanText(row.source_type)?.toLowerCase() ?? null,
      sourceId: cleanText(row.source_id)?.toLowerCase() ?? null,
      label: cleanText(row.label),
      title: cleanText(row.title) ?? row.bank_item_id,
      subtitle: cleanText(row.subtitle),
      imageUrl: cleanText(row.image_url),
      linkUrl: cleanText(row.link_url),
    }));
  const selectionCandidateById = new Map(
    selectionCandidates.map((item) => [item.bankItemId, item] as const),
  );
  const editorialSelection: MatchdayEditorialSelectionItem[] = aggregateRows
    .flatMap((row) => {
      if (
        row.placement_count !== 1
        || row.placement_type !== "selection"
        || row.placement_id === null
        || row.slot_position === null
        || row.slot_position < 1
        || row.slot_position > 4
      ) return [];
      const bankItemId = row.bank_item_id.trim().toLowerCase();
      const candidate = selectionCandidateById.get(bankItemId);
      return candidate ? [{
        position: row.slot_position,
        liveItemId: row.placement_id,
        ...candidate,
        bankItemId,
      }] : [];
    })
    .sort((left, right) => left.position - right.position);

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
    videoModule,
    tracking: trackingProjection.tracking,
    selectionCandidates,
    editorialSelection,
    reconcile,
    zones: reconcile.zonesAfter,
    bank: reconcile.bankAfter,
    diagnostics,
    inactiveHistoricalCount:
      aggregateRows[0]?.inactive_historical_count
      ?? automaticDistribution.inactiveHistoricalCount,
  };
}
