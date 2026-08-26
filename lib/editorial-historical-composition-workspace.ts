import {
  EDITORIAL_VISUAL_FAMILIES,
  EDITORIAL_VISUAL_FAMILY_DEFINITIONS,
  type EditorialVisualFamily,
} from "./editorial-profiles";
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

export const HISTORICAL_COMPOSITION_DEFAULT_HEADLINE_TITLE_COLOR = "#10151B";
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
  six_news: {
    label: EDITORIAL_VISUAL_FAMILY_DEFINITIONS.six_news.label,
    capacity: EDITORIAL_VISUAL_FAMILY_DEFINITIONS.six_news.capacity,
    positions: [
      { position: 1, label: "Dominante" },
      { position: 2, label: "Secundária 1" },
      { position: 3, label: "Secundária 2" },
      { position: 4, label: "Secundária 3" },
      { position: 5, label: "Complementar 1" },
      { position: 6, label: "Complementar 2" },
    ],
  },
  five_news_balanced: {
    label: EDITORIAL_VISUAL_FAMILY_DEFINITIONS.five_news_balanced.label,
    capacity: EDITORIAL_VISUAL_FAMILY_DEFINITIONS.five_news_balanced.capacity,
    positions: [
      { position: 1, label: "Dominante" },
      { position: 2, label: "Secundária" },
      { position: 3, label: "Complementar 1" },
      { position: 4, label: "Complementar 2" },
      { position: 5, label: "Complementar 3" },
    ],
  },
  five_news_secondary: {
    label: EDITORIAL_VISUAL_FAMILY_DEFINITIONS.five_news_secondary.label,
    capacity: EDITORIAL_VISUAL_FAMILY_DEFINITIONS.five_news_secondary.capacity,
    positions: [
      { position: 1, label: "Dominante" },
      { position: 2, label: "Secundária 1" },
      { position: 3, label: "Secundária 2" },
      { position: 4, label: "Secundária 3" },
      { position: 5, label: "Secundária 4" },
    ],
  },
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
}>;

export function filterHistoricalCompositionReservoir<
  T extends HistoricalCompositionReservoirArticle,
>(
  articles: readonly T[],
  placedBankItemIds: ReadonlySet<string>,
  selectedGroupKeys: ReadonlySet<string>,
  search: string,
) {
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-PT");

  return articles.filter((article) => {
    if (placedBankItemIds.has(article.bankItemId)) return false;
    if (
      selectedGroupKeys.size > 0
      && (!article.naturalGroupKey || !selectedGroupKeys.has(article.naturalGroupKey))
    ) {
      return false;
    }

    return !normalizedSearch
      || article.title.toLocaleLowerCase("pt-PT").includes(normalizedSearch)
      || (article.label ?? "").toLocaleLowerCase("pt-PT").includes(normalizedSearch);
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
