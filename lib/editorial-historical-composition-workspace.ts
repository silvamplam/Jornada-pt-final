import {
  EDITORIAL_VISUAL_FAMILIES,
  EDITORIAL_VISUAL_FAMILY_DEFINITIONS,
  type EditorialVisualFamily,
} from "./editorial-visual-families";
import {
  headlineTitleColorForClassification,
  type ArticleClassificationKey,
} from "./editorial-classifications";
export const HISTORICAL_COMPOSITION_BLOCK_KEYS = [
  "opening",
  "zone_1",
  "zone_2",
  "video",
  "beyond",
] as const;

export type HistoricalCompositionBlockKey =
  (typeof HISTORICAL_COMPOSITION_BLOCK_KEYS)[number];

export const HISTORICAL_COMPOSITION_DEFAULT_ZONE_TITLES = {
  zone_1: "Arbitragem e Reações",
  zone_2: "Outros jogos da jornada",
} as const;

export const HISTORICAL_COMPOSITION_DEFAULT_HEADLINE_TITLE_COLOR =
  headlineTitleColorForClassification(null);

function historicalDynamicZoneLayout(
  visualFamily: EditorialVisualFamily,
) {
  const definition =
    EDITORIAL_VISUAL_FAMILY_DEFINITIONS[visualFamily];

  return Object.freeze({
    label: definition.label,
    capacity: definition.slots.length,
    positions: Object.freeze(
      definition.slots.map((slot) => ({
        position: slot.position,
        label: slot.role,
      })),
    ),
  });
}

export const HISTORICAL_DYNAMIC_ZONE_LAYOUTS: Readonly<
  Record<
    EditorialVisualFamily,
    Readonly<{
      label: string;
      capacity: number;
      positions: readonly Readonly<{
        position: number;
        label: string;
      }>[];
    }>
  >
> = Object.freeze({
  six_news: historicalDynamicZoneLayout("six_news"),
  five_news_balanced: historicalDynamicZoneLayout(
    "five_news_balanced",
  ),
  five_news_secondary: historicalDynamicZoneLayout(
    "five_news_secondary",
  ),
  four_news: historicalDynamicZoneLayout(
    "four_news",
  ),
});

export type HistoricalDynamicZoneVisualFamily = EditorialVisualFamily;

export type HistoricalDynamicZoneDefinition = Readonly<{
  id: string;
  sortOrder: number;
  publicTitle: string;
  visualFamily: HistoricalDynamicZoneVisualFamily;
}>;

export function isHistoricalDynamicZoneVisualFamily(
  value: unknown,
): value is HistoricalDynamicZoneVisualFamily {
  return (
    typeof value === "string"
    && EDITORIAL_VISUAL_FAMILIES.includes(
      value as HistoricalDynamicZoneVisualFamily,
    )
  );
}

export function historicalDynamicZoneCapacity(
  visualFamily: HistoricalDynamicZoneVisualFamily,
) {
  return HISTORICAL_DYNAMIC_ZONE_LAYOUTS[visualFamily].capacity;
}

export function historicalDynamicZonePositions(
  visualFamily: HistoricalDynamicZoneVisualFamily,
) {
  return HISTORICAL_DYNAMIC_ZONE_LAYOUTS[visualFamily].positions;
}

export function normalizeHistoricalDynamicZoneTitle(
  value: unknown,
  fallback = "Nova zona",
) {
  if (typeof value !== "string") return fallback;

  const title = value.trim();

  return title.length > 0 && title.length <= 120
    ? title
    : fallback;
}


const historicalCompositionBlockKeySet = new Set<string>(
  HISTORICAL_COMPOSITION_BLOCK_KEYS,
);

export function normalizeHistoricalCompositionBlockOrder(
  value: unknown,
): HistoricalCompositionBlockKey[] {
  if (
    !Array.isArray(value)
    || value.length !== HISTORICAL_COMPOSITION_BLOCK_KEYS.length
    || value.some(
      (key) => typeof key !== "string" || !historicalCompositionBlockKeySet.has(key),
    )
    || new Set(value).size !== HISTORICAL_COMPOSITION_BLOCK_KEYS.length
  ) {
    return [...HISTORICAL_COMPOSITION_BLOCK_KEYS];
  }

  return value as HistoricalCompositionBlockKey[];
}

export function normalizeHistoricalCompositionZoneTitle(
  value: unknown,
  fallback: string,
) {
  if (typeof value !== "string") return fallback;
  const title = value.trim();
  return title.length > 0 && title.length <= 120 ? title : fallback;
}

export function normalizeHistoricalCompositionHeadlineTitleColor(
  value: unknown,
) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toUpperCase()
    : HISTORICAL_COMPOSITION_DEFAULT_HEADLINE_TITLE_COLOR;
}

export type HistoricalCompositionReservoirArticle = Readonly<{
  bankItemId: string;
  label: string | null;
  title: string;
  naturalGroupKey: string | null;
  historicalEligible?: boolean;
  historicalDecision: HistoricalCompositionDecision;
}>;

export type HistoricalCompositionDecision =
  | "selected"
  | "bank"
  | "undecided";

export function historicalCompositionEffectiveDecision(
  explicitDecision: HistoricalCompositionDecision | null | undefined,
  fromLiveBank: boolean,
): HistoricalCompositionDecision {
  return explicitDecision ?? (fromLiveBank ? "bank" : "undecided");
}

export const HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY = "__unclassified__";

export type HistoricalCompositionDecisionFilter =
  | "all"
  | HistoricalCompositionDecision;

function isAvailableHistoricalCompositionArticle(
  article: HistoricalCompositionReservoirArticle,
  placedBankItemIds: ReadonlySet<string>,
) {
  return article.historicalEligible !== false
    && !placedBankItemIds.has(article.bankItemId);
}

function matchesHistoricalCompositionSearch(
  article: HistoricalCompositionReservoirArticle,
  normalizedSearch: string,
) {
  return !normalizedSearch
    || article.title.toLocaleLowerCase("pt-PT").includes(normalizedSearch)
    || (article.label ?? "").toLocaleLowerCase("pt-PT").includes(normalizedSearch);
}

function matchesHistoricalCompositionClassification(
  article: HistoricalCompositionReservoirArticle,
  selectedGroupKeys: ReadonlySet<string>,
) {
  if (selectedGroupKeys.size === 0) return true;
  if (!article.naturalGroupKey) {
    return selectedGroupKeys.has(HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY);
  }
  return selectedGroupKeys.has(article.naturalGroupKey);
}

function matchesHistoricalCompositionDecision(
  article: HistoricalCompositionReservoirArticle,
  decisionFilter: HistoricalCompositionDecisionFilter,
) {
  return decisionFilter === "all"
    || article.historicalDecision === decisionFilter;
}

export function historicalCompositionDecisionCounts<
  T extends HistoricalCompositionReservoirArticle,
>(
  articles: readonly T[],
  placedBankItemIds: ReadonlySet<string>,
  selectedGroupKeys: ReadonlySet<string> = new Set(),
  search = "",
) {
  let all = 0;
  let undecided = 0;
  let bank = 0;
  let selected = 0;
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-PT");

  for (const article of articles) {
    if (
      !isAvailableHistoricalCompositionArticle(article, placedBankItemIds)
      || !matchesHistoricalCompositionClassification(article, selectedGroupKeys)
      || !matchesHistoricalCompositionSearch(article, normalizedSearch)
    ) {
      continue;
    }

    all += 1;
    if (article.historicalDecision === "undecided") undecided += 1;
    else if (article.historicalDecision === "bank") bank += 1;
    else selected += 1;
  }

  return { all, undecided, bank, selected } as const;
}

export function historicalCompositionClassificationCounts<
  T extends HistoricalCompositionReservoirArticle,
>(
  articles: readonly T[],
  placedBankItemIds: ReadonlySet<string>,
  search: string,
  decisionFilter: HistoricalCompositionDecisionFilter,
) {
  const counts = new Map<string, number>();
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-PT");

  for (const article of articles) {
    if (
      !isAvailableHistoricalCompositionArticle(article, placedBankItemIds)
      || !matchesHistoricalCompositionSearch(article, normalizedSearch)
      || !matchesHistoricalCompositionDecision(article, decisionFilter)
    ) {
      continue;
    }

    const key = article.naturalGroupKey ?? HISTORICAL_COMPOSITION_UNCLASSIFIED_KEY;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

export function filterHistoricalCompositionReservoir<
  T extends HistoricalCompositionReservoirArticle,
>(
  articles: readonly T[],
  placedBankItemIds: ReadonlySet<string>,
  selectedGroupKeys: ReadonlySet<string>,
  search: string,
  decisionFilter: HistoricalCompositionDecisionFilter = "all",
) {
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-PT");

  return articles.filter((article) => {
    return isAvailableHistoricalCompositionArticle(article, placedBankItemIds)
      && matchesHistoricalCompositionDecision(article, decisionFilter)
      && matchesHistoricalCompositionClassification(article, selectedGroupKeys)
      && matchesHistoricalCompositionSearch(article, normalizedSearch);
  });
}

export type HistoricalCompositionPlacementLocation = Readonly<{
  kind: "slot" | "auxiliary";
  zoneKey: string;
  targetKey: string;
}>;

export type HistoricalCompositionPlacementPlan<T> = Readonly<{
  slots: Readonly<Record<string, T | null>>;
  auxiliary: Readonly<Record<string, T | null>>;
}>;

type HistoricalHeadlineCard = Readonly<{
  bankItemId: string | null;
  persistedId?: string | null;
}>;

function historicalHeadlineCardIdentity(
  card: HistoricalHeadlineCard | null,
) {
  if (!card) return "";
  if (card.bankItemId) return `bank:${card.bankItemId}`;
  return card.persistedId ? `persisted:${card.persistedId}` : "";
}

export function synchronizeHistoricalHeadlineTitleColor<
  TCard extends HistoricalHeadlineCard,
  TPlan extends HistoricalCompositionPlacementPlan<TCard> & Readonly<{
    settings: Readonly<{ headlineTitleColor: string }>;
  }>,
>(
  previousPlan: TPlan,
  nextPlan: TPlan,
  classificationKeyForBankItem: (
    bankItemId: string,
  ) => ArticleClassificationKey | null,
): TPlan {
  const previousHeadline = previousPlan.slots.dominant_main ?? null;
  const nextHeadline = nextPlan.slots.dominant_main ?? null;
  if (
    historicalHeadlineCardIdentity(previousHeadline)
    === historicalHeadlineCardIdentity(nextHeadline)
  ) {
    return nextPlan;
  }

  const classificationKey = nextHeadline?.bankItemId
    ? classificationKeyForBankItem(nextHeadline.bankItemId)
    : null;

  return {
    ...nextPlan,
    settings: {
      ...nextPlan.settings,
      headlineTitleColor: headlineTitleColorForClassification(classificationKey),
    },
  };
}

export type HistoricalCompositionMoveResult<T> = Readonly<{
  plan: HistoricalCompositionPlacementPlan<T>;
  changed: boolean;
  swapped: boolean;
  occupied: boolean;
}>;

function cardAt<T>(
  plan: HistoricalCompositionPlacementPlan<T>,
  location: HistoricalCompositionPlacementLocation,
) {
  return location.kind === "slot"
    ? plan.slots[location.targetKey] ?? null
    : plan.auxiliary[location.targetKey] ?? null;
}

export function moveHistoricalCompositionPiece<T>(
  plan: HistoricalCompositionPlacementPlan<T>,
  source: HistoricalCompositionPlacementLocation,
  target: HistoricalCompositionPlacementLocation,
): HistoricalCompositionMoveResult<T> {
  if (source.kind === target.kind && source.targetKey === target.targetKey) {
    return { plan, changed: false, swapped: false, occupied: false };
  }

  const sourceCard = cardAt(plan, source);
  if (!sourceCard) {
    return { plan, changed: false, swapped: false, occupied: false };
  }

  const targetCard = cardAt(plan, target);
  const sameZone = source.kind === target.kind && source.zoneKey === target.zoneKey;

  if (targetCard && !sameZone) {
    return { plan, changed: false, swapped: false, occupied: true };
  }

  const slots = { ...plan.slots };
  const auxiliary = { ...plan.auxiliary };

  if (source.kind === "slot") slots[source.targetKey] = sameZone ? targetCard : null;
  else auxiliary[source.targetKey] = sameZone ? targetCard : null;

  if (target.kind === "slot") slots[target.targetKey] = sourceCard;
  else auxiliary[target.targetKey] = sourceCard;

  return {
    plan: { ...plan, slots, auxiliary },
    changed: true,
    swapped: Boolean(targetCard),
    occupied: false,
  };
}
