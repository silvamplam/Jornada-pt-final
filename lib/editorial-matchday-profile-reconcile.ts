import type { EditorialProfile, EditorialProfileZoneKey } from "@/lib/editorial-profiles";
import type {
  MatchdayEditorialProfileDeskAutomaticItem,
  MatchdayEditorialProfileDeskItem,
} from "@/lib/editorial-matchday-profile-desk";
import {
  buildMatchdayEditorialProfileEffectiveDistribution,
  compareThematicItemsByActuality,
  thematicEditorialIdentity,
  validateMatchdayEditorialProfileManualOverrides,
  type MatchdayEditorialProfileEffectiveItem,
  type MatchdayEditorialProfileEffectiveZone,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";

export type MatchdayEditorialProfileAppliedZoneItem = Readonly<{
  sourceType: string;
  sourceId: string;
  zoneKey: EditorialProfileZoneKey;
  sortOrder: number;
}>;

export type MatchdayEditorialProfileFaixaItem =
  & MatchdayEditorialProfileEffectiveItem
  & Readonly<{ sortOrder: number }>;

export type MatchdayEditorialProfileMovementPlacement = Readonly<{
  kind: "zone" | "faixa" | "bank";
  zoneKey?: EditorialProfileZoneKey;
  sortOrder?: number;
}>;

export type MatchdayEditorialProfileMovement = Readonly<{
  sourceType: string;
  sourceId: string;
  title: string | null;
  from: MatchdayEditorialProfileMovementPlacement;
  to: MatchdayEditorialProfileMovementPlacement;
}>;

export type MatchdayEditorialProfileReconcileResult = Readonly<{
  zonesBefore: readonly MatchdayEditorialProfileEffectiveZone[];
  zonesAfter: readonly MatchdayEditorialProfileEffectiveZone[];
  faixaBefore: readonly MatchdayEditorialProfileFaixaItem[];
  faixaAfter: readonly MatchdayEditorialProfileFaixaItem[];
  bankAfter: readonly (MatchdayEditorialProfileEffectiveItem & Readonly<{ sortOrder: null }>)[];
  movements: readonly MatchdayEditorialProfileMovement[];
  hasChanges: boolean;
}>;

function itemIdentity(item: Pick<MatchdayEditorialProfileDeskItem, "sourceType" | "sourceId">): string {
  return thematicEditorialIdentity(item.sourceType, item.sourceId);
}

function effectiveItem(
  item: MatchdayEditorialProfileDeskAutomaticItem,
  sortOrder: number | null,
  manualOverride: MatchdayEditorialProfileEffectiveItem["manualOverride"],
): MatchdayEditorialProfileEffectiveItem {
  return {
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    sortOrder,
    label: item.label,
    title: item.title,
    subtitle: item.subtitle,
    imageUrl: item.imageUrl,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    manualOverride,
  };
}
function appliedZones(
  profile: EditorialProfile,
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  rows: readonly MatchdayEditorialProfileAppliedZoneItem[],
): readonly MatchdayEditorialProfileEffectiveZone[] {
  const activeByIdentity = new Map(activeItems.map((item) => [itemIdentity(item), item] as const));
  return profile.zones.map((zone) => ({
    key: zone.key,
    label: zone.label,
    capacity: zone.capacity,
    visualFamily: zone.visualFamily,
    placementMode: zone.placementMode,
    items: rows
      .filter((row) => row.zoneKey === zone.key)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .flatMap((row) => {
        const item = activeByIdentity.get(thematicEditorialIdentity(row.sourceType, row.sourceId));
        return item ? [{
          ...effectiveItem(item, row.sortOrder, null),
          sortOrder: row.sortOrder,
        }] : [];
      }),
  }));
}

function placementMap(
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  zones: readonly MatchdayEditorialProfileEffectiveZone[],
  faixa: readonly MatchdayEditorialProfileFaixaItem[],
): Map<string, MatchdayEditorialProfileMovementPlacement> {
  const result = new Map<string, MatchdayEditorialProfileMovementPlacement>();
  for (const item of activeItems) result.set(itemIdentity(item), { kind: "bank" });
  for (const zone of zones) {
    for (const item of zone.items) {
      result.set(itemIdentity(item), {
        kind: "zone",
        zoneKey: zone.key,
        sortOrder: item.sortOrder,
      });
    }
  }
  for (const item of faixa) {
    result.set(itemIdentity(item), { kind: "faixa", sortOrder: item.sortOrder });
  }
  return result;
}

function samePlacement(
  left: MatchdayEditorialProfileMovementPlacement,
  right: MatchdayEditorialProfileMovementPlacement,
): boolean {
  return left.kind === right.kind
    && left.zoneKey === right.zoneKey
    && left.sortOrder === right.sortOrder;
}

function compareAutomaticOverflow(
  profile: EditorialProfile,
  left: MatchdayEditorialProfileDeskAutomaticItem,
  right: MatchdayEditorialProfileDeskAutomaticItem,
): number {
  const zoneOrder = new Map(profile.zones.map((zone, index) => [zone.key, index] as const));
  const leftZoneOrder = left.classifiedZoneKey === null
    ? profile.zones.length
    : zoneOrder.get(left.classifiedZoneKey) ?? profile.zones.length;
  const rightZoneOrder = right.classifiedZoneKey === null
    ? profile.zones.length
    : zoneOrder.get(right.classifiedZoneKey) ?? profile.zones.length;

  return leftZoneOrder - rightZoneOrder
    || (left.actualityOrder ?? Number.MAX_SAFE_INTEGER) - (right.actualityOrder ?? Number.MAX_SAFE_INTEGER)
    || left.sourceType.localeCompare(right.sourceType)
    || left.sourceId.localeCompare(right.sourceId);
}

export function reconcileMatchdayEditorialProfileDistribution(
  profile: EditorialProfile,
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  manualOverrides: readonly MatchdayEditorialProfileManualOverride[],
  appliedZoneItems: readonly MatchdayEditorialProfileAppliedZoneItem[],
  hasAppliedSnapshot: boolean,
  currentFaixa: readonly MatchdayEditorialProfileFaixaItem[],
): MatchdayEditorialProfileReconcileResult {
  const overrides = validateMatchdayEditorialProfileManualOverrides(profile, manualOverrides);
  const activeByIdentity = new Map(activeItems.map((item) => [itemIdentity(item), item] as const));
  const zonesBefore = hasAppliedSnapshot
    ? appliedZones(profile, activeItems, appliedZoneItems)
    : buildMatchdayEditorialProfileEffectiveDistribution(profile, activeItems, []).zones;
  const effectiveAfter = buildMatchdayEditorialProfileEffectiveDistribution(
    profile,
    activeItems,
    overrides,
  );
  const zonesAfter = effectiveAfter.zones;
  const placedAfter = new Set(zonesAfter.flatMap((zone) => zone.items.map(itemIdentity)));
  const explicitBank = new Set(overrides
    .filter((override) => override.placementTarget === "bank")
    .map(itemIdentity));
  const manualFaixa = overrides
    .filter((override) => override.placementTarget === "faixa" && override.sortOrder !== null)
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
  const manualFaixaIdentities = new Set(manualFaixa.map(itemIdentity));
  const faixaBefore = [...currentFaixa]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));

  const displaced = zonesBefore.flatMap((zone) => zone.items)
    .filter((item) => {
      const identity = itemIdentity(item);
      return activeByIdentity.has(identity)
        && !placedAfter.has(identity)
        && !explicitBank.has(identity)
        && !manualFaixaIdentities.has(identity);
    });
  const automaticOverflow = [...activeItems]
    .filter((item) => {
      const identity = itemIdentity(item);
      return !placedAfter.has(identity)
        && !explicitBank.has(identity)
        && !manualFaixaIdentities.has(identity);
    })
    .sort((left, right) => compareAutomaticOverflow(profile, left, right))
    .map((item): MatchdayEditorialProfileFaixaItem => ({
      ...effectiveItem(item, 1, null),
      sortOrder: 1,
    }));

  const faixaBase: MatchdayEditorialProfileFaixaItem[] = [];
  const faixaIdentities = new Set<string>();
  for (const item of [...displaced, ...faixaBefore, ...automaticOverflow]) {
    const identity = itemIdentity(item);
    if (
      faixaIdentities.has(identity)
      || placedAfter.has(identity)
      || explicitBank.has(identity)
      || manualFaixaIdentities.has(identity)
    ) continue;
    const active = activeByIdentity.get(identity);
    if (!active) continue;
    faixaIdentities.add(identity);
    faixaBase.push({
      ...effectiveItem(active, faixaBase.length + 1, item.manualOverride),
      sortOrder: faixaBase.length + 1,
    });
  }

  for (const override of manualFaixa) {
    const identity = itemIdentity(override);
    const item = activeByIdentity.get(identity);
    if (!item || placedAfter.has(identity) || explicitBank.has(identity)) continue;
    const existingIndex = faixaBase.findIndex((candidate) => itemIdentity(candidate) === identity);
    if (existingIndex >= 0) faixaBase.splice(existingIndex, 1);
    const targetIndex = Math.min((override.sortOrder ?? 1) - 1, faixaBase.length);
    faixaBase.splice(targetIndex, 0, {
      ...effectiveItem(item, targetIndex + 1, "faixa"),
      sortOrder: targetIndex + 1,
    });
    faixaIdentities.add(identity);
  }

  const faixaAfter = faixaBase.map((item, index) => ({ ...item, sortOrder: index + 1 }));
  const bankAfter = activeItems
    .filter((item) => explicitBank.has(itemIdentity(item)))
    .map((item) => {
      return { ...effectiveItem(item, null, "bank"), sortOrder: null };
    })
    .sort(compareThematicItemsByActuality);

  const beforePlacements = placementMap(activeItems, zonesBefore, faixaBefore);
  const afterPlacements = placementMap(activeItems, zonesAfter, faixaAfter);
  const movements = activeItems.flatMap((item): MatchdayEditorialProfileMovement[] => {
    const identity = itemIdentity(item);
    const from = beforePlacements.get(identity) ?? { kind: "bank" as const };
    const to = afterPlacements.get(identity) ?? { kind: "bank" as const };
    return samePlacement(from, to) ? [] : [{
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: item.title,
      from,
      to,
    }];
  });

  return {
    zonesBefore,
    zonesAfter,
    faixaBefore,
    faixaAfter,
    bankAfter,
    movements,
    hasChanges: movements.length > 0,
  };
}
