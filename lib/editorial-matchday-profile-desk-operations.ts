import type {
  EditorialProfile,
  EditorialProfileZoneKey,
} from "@/lib/editorial-profiles";
import type {
  MatchdayEditorialProfileDeskAutomaticItem,
  MatchdayEditorialProfileDeskItem,
} from "@/lib/editorial-matchday-profile-desk";

export const THEMATIC_EDITORIAL_SOURCE_TYPE = "editorial_article" as const;

export type MatchdayEditorialProfileManualPlacementTarget =
  | "bank"
  | "zone"
  | "faixa";

export type MatchdayEditorialProfileManualOverride = Readonly<{
  sourceType: typeof THEMATIC_EDITORIAL_SOURCE_TYPE;
  sourceId: string;
  placementTarget: MatchdayEditorialProfileManualPlacementTarget;
  zoneKey: EditorialProfileZoneKey | null;
  sortOrder: number | null;
}>;

export type MatchdayEditorialProfileManualOverrideMode =
  | "bank"
  | "zone"
  | "position"
  | "faixa";

export type MatchdayEditorialProfileEffectiveItem =
  & MatchdayEditorialProfileDeskItem
  & Readonly<{
    manualOverride: MatchdayEditorialProfileManualOverrideMode | null;
  }>;

export type MatchdayEditorialProfileEffectiveZone = Readonly<{
  key: EditorialProfileZoneKey;
  label: string;
  capacity: number;
  visualFamily: EditorialProfile["zones"][number]["visualFamily"];
  placementMode: EditorialProfile["zones"][number]["placementMode"];
  items: readonly (MatchdayEditorialProfileEffectiveItem & Readonly<{ sortOrder: number }>)[];
}>;

export type MatchdayEditorialProfileEffectiveDistribution = Readonly<{
  zones: readonly MatchdayEditorialProfileEffectiveZone[];
  bank: readonly (MatchdayEditorialProfileEffectiveItem & Readonly<{ sortOrder: null }>)[];
}>;

export type MatchdayEditorialProfileDeskEditorState = Readonly<{
  persistedOverrides: readonly MatchdayEditorialProfileManualOverride[];
  draftOverrides: readonly MatchdayEditorialProfileManualOverride[];
  selectedIdentities: readonly string[];
}>;

function cleanText(value: string): string {
  return value.trim();
}

export function thematicEditorialIdentity(sourceType: string, sourceId: string): string {
  return `${cleanText(sourceType).toLowerCase()}\u0000${cleanText(sourceId).toLowerCase()}`;
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

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function compareThematicItemsByActuality(
  left: Pick<MatchdayEditorialProfileDeskItem, "publishedAt" | "updatedAt" | "sourceType" | "sourceId">,
  right: Pick<MatchdayEditorialProfileDeskItem, "publishedAt" | "updatedAt" | "sourceType" | "sourceId">,
): number {
  return (
    compareTimestampDescNullLast(left.publishedAt, right.publishedAt)
    || compareTimestampDescNullLast(left.updatedAt, right.updatedAt)
    || compareText(left.sourceType, right.sourceType)
    || compareText(left.sourceId, right.sourceId)
  );
}

function automaticOrder(
  left: MatchdayEditorialProfileDeskAutomaticItem,
  right: MatchdayEditorialProfileDeskAutomaticItem,
): number {
  const leftOrder = left.actualityOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.actualityOrder ?? Number.MAX_SAFE_INTEGER;
  return leftOrder - rightOrder
    || compareText(thematicEditorialIdentity(left.sourceType, left.sourceId), thematicEditorialIdentity(right.sourceType, right.sourceId));
}

function manualMode(override: MatchdayEditorialProfileManualOverride | undefined): MatchdayEditorialProfileManualOverrideMode | null {
  if (!override) return null;
  if (override.placementTarget === "bank") return "bank";
  if (override.placementTarget === "faixa") return "faixa";
  return override.sortOrder === null ? "zone" : "position";
}

function effectiveItem(
  item: MatchdayEditorialProfileDeskAutomaticItem,
  sortOrder: number | null,
  override: MatchdayEditorialProfileManualOverride | undefined,
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
    manualOverride: manualMode(override),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateMatchdayEditorialProfileManualOverrides(
  profile: EditorialProfile,
  values: readonly unknown[],
): readonly MatchdayEditorialProfileManualOverride[] {
  const knownZones = new Map(profile.zones.map((zone) => [zone.key, zone] as const));
  const identities = new Set<string>();
  const fixedSlots = new Set<string>();
  const fixedFaixaSlots = new Set<number>();
  const protectedCountByZone = new Map<EditorialProfileZoneKey, number>();
  const normalized: MatchdayEditorialProfileManualOverride[] = [];

  for (const value of values) {
    if (!isRecord(value)) {
      throw new Error("matchday-editorial-profile-manual-overrides-invalid-payload");
    }

    const keys = Object.keys(value).sort();
    if (keys.join(",") !== "placementTarget,sortOrder,sourceId,sourceType,zoneKey") {
      throw new Error("matchday-editorial-profile-manual-overrides-invalid-payload");
    }

    if (value.sourceType !== THEMATIC_EDITORIAL_SOURCE_TYPE) {
      throw new Error("matchday-editorial-profile-manual-overrides-invalid-source");
    }
    if (typeof value.sourceId !== "string" || !value.sourceId.trim()) {
      throw new Error("matchday-editorial-profile-manual-overrides-invalid-source");
    }

    const sourceId = value.sourceId.trim().toLowerCase();
    const identity = thematicEditorialIdentity(value.sourceType, sourceId);
    if (identities.has(identity)) {
      throw new Error("matchday-editorial-profile-manual-overrides-duplicate-source");
    }
    identities.add(identity);

    if (
      value.placementTarget !== "bank"
      && value.placementTarget !== "zone"
      && value.placementTarget !== "faixa"
    ) {
      throw new Error("matchday-editorial-profile-manual-overrides-invalid-placement");
    }
    const placementTarget = value.placementTarget;

    let zoneKey: EditorialProfileZoneKey | null = null;
    if (value.zoneKey !== null) {
      if (typeof value.zoneKey !== "string" || !knownZones.has(value.zoneKey as EditorialProfileZoneKey)) {
        throw new Error("matchday-editorial-profile-manual-overrides-invalid-zone");
      }
      zoneKey = value.zoneKey as EditorialProfileZoneKey;
    }

    let sortOrder: number | null = null;
    if (value.sortOrder !== null) {
      if (!Number.isInteger(value.sortOrder) || (value.sortOrder as number) <= 0) {
        throw new Error("matchday-editorial-profile-manual-overrides-invalid-sort-order");
      }
      sortOrder = value.sortOrder as number;
    }

    if (
      (placementTarget === "bank" && (zoneKey !== null || sortOrder !== null))
      || (placementTarget === "zone" && zoneKey === null)
      || (placementTarget === "faixa" && zoneKey !== null)
    ) {
      throw new Error("matchday-editorial-profile-manual-overrides-invalid-placement");
    }

    if (placementTarget === "zone" && zoneKey !== null) {
      const zone = knownZones.get(zoneKey);
      if (!zone) throw new Error("matchday-editorial-profile-manual-overrides-invalid-zone");
      if (sortOrder !== null && sortOrder > zone.capacity) {
        throw new Error("matchday-editorial-profile-manual-overrides-invalid-sort-order");
      }

      const protectedCount = (protectedCountByZone.get(zoneKey) ?? 0) + 1;
      if (protectedCount > zone.capacity) {
        throw new Error("matchday-editorial-profile-manual-overrides-zone-capacity-exceeded");
      }
      protectedCountByZone.set(zoneKey, protectedCount);

      if (sortOrder !== null) {
        const slot = `${zoneKey}\u0000${sortOrder}`;
        if (fixedSlots.has(slot)) {
          throw new Error("matchday-editorial-profile-manual-overrides-duplicate-slot");
        }
        fixedSlots.add(slot);
      }
    } else if (placementTarget === "faixa" && sortOrder !== null) {
      if (fixedFaixaSlots.has(sortOrder)) {
        throw new Error("matchday-editorial-profile-manual-overrides-duplicate-faixa-slot");
      }
      fixedFaixaSlots.add(sortOrder);
    }

    normalized.push({
      sourceType: THEMATIC_EDITORIAL_SOURCE_TYPE,
      sourceId,
      placementTarget,
      zoneKey,
      sortOrder,
    });
  }

  return normalized.sort((left, right) => compareText(
    thematicEditorialIdentity(left.sourceType, left.sourceId),
    thematicEditorialIdentity(right.sourceType, right.sourceId),
  ));
}

export function buildMatchdayEditorialProfileEffectiveDistribution(
  profile: EditorialProfile,
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  manualOverrides: readonly MatchdayEditorialProfileManualOverride[],
): MatchdayEditorialProfileEffectiveDistribution {
  const overrides = validateMatchdayEditorialProfileManualOverrides(profile, manualOverrides);
  const activeByIdentity = new Map(
    activeItems.map((item) => [thematicEditorialIdentity(item.sourceType, item.sourceId), item] as const),
  );
  const overrideByIdentity = new Map(
    overrides.map((override) => [thematicEditorialIdentity(override.sourceType, override.sourceId), override] as const),
  );
  const placed = new Set<string>();

  const zones = profile.zones.map((zone): MatchdayEditorialProfileEffectiveZone => {
    const fixedBySlot = new Map<number, {
      item: MatchdayEditorialProfileDeskAutomaticItem;
      override: MatchdayEditorialProfileManualOverride;
    }>();
    const protectedWithoutPosition: Array<{
      item: MatchdayEditorialProfileDeskAutomaticItem;
      override: MatchdayEditorialProfileManualOverride;
    }> = [];

    for (const override of overrides) {
      if (override.placementTarget !== "zone" || override.zoneKey !== zone.key) continue;
      const item = activeByIdentity.get(thematicEditorialIdentity(override.sourceType, override.sourceId));
      if (!item) continue;
      if (override.sortOrder === null) {
        protectedWithoutPosition.push({ item, override });
      } else {
        fixedBySlot.set(override.sortOrder, { item, override });
      }
    }

    const automaticCandidates = activeItems
      .filter((item) => {
        const identity = thematicEditorialIdentity(item.sourceType, item.sourceId);
        return item.classifiedZoneKey === zone.key && !overrideByIdentity.has(identity);
      })
      .sort(automaticOrder);
    const freeSlotCount = zone.capacity - fixedBySlot.size;
    const automaticCount = Math.max(0, freeSlotCount - protectedWithoutPosition.length);
    const freeContents = [
      ...protectedWithoutPosition,
      ...automaticCandidates.slice(0, automaticCount).map((item) => ({ item, override: undefined })),
    ].sort((left, right) => compareThematicItemsByActuality(left.item, right.item));

    let freeIndex = 0;
    const items: Array<MatchdayEditorialProfileEffectiveItem & { sortOrder: number }> = [];
    for (let slot = 1; slot <= zone.capacity; slot += 1) {
      const fixed = fixedBySlot.get(slot);
      const content = fixed ?? freeContents[freeIndex++];
      if (!content) continue;
      const identity = thematicEditorialIdentity(content.item.sourceType, content.item.sourceId);
      if (placed.has(identity)) continue;
      placed.add(identity);
      items.push({
        ...effectiveItem(content.item, slot, content.override),
        sortOrder: slot,
      });
    }

    return {
      key: zone.key,
      label: zone.label,
      capacity: zone.capacity,
      visualFamily: zone.visualFamily,
      placementMode: zone.placementMode,
      items,
    };
  });

  const bank = activeItems
    .filter((item) => !placed.has(thematicEditorialIdentity(item.sourceType, item.sourceId)))
    .map((item) => {
      const override = overrideByIdentity.get(thematicEditorialIdentity(item.sourceType, item.sourceId));
      return {
        ...effectiveItem(item, null, override),
        sortOrder: null,
      };
    })
    .sort(compareThematicItemsByActuality);

  return { zones, bank };
}

function overrideMap(
  overrides: readonly MatchdayEditorialProfileManualOverride[],
): Map<string, MatchdayEditorialProfileManualOverride> {
  return new Map(overrides.map((override) => [
    thematicEditorialIdentity(override.sourceType, override.sourceId),
    override,
  ]));
}

function sameOverride(
  left: MatchdayEditorialProfileManualOverride | undefined,
  right: MatchdayEditorialProfileManualOverride | undefined,
): boolean {
  return left?.sourceType === right?.sourceType
    && left?.sourceId === right?.sourceId
    && left?.placementTarget === right?.placementTarget
    && left?.zoneKey === right?.zoneKey
    && left?.sortOrder === right?.sortOrder;
}

function sameOverrides(
  left: readonly MatchdayEditorialProfileManualOverride[],
  right: readonly MatchdayEditorialProfileManualOverride[],
): boolean {
  return left.length === right.length
    && left.every((override, index) => sameOverride(override, right[index]));
}

function sameIdentities(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((identity, index) => identity === right[index]);
}

function activeOverrides(
  profile: EditorialProfile,
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  activeIdentities: ReadonlySet<string>,
): readonly MatchdayEditorialProfileManualOverride[] {
  return validateMatchdayEditorialProfileManualOverrides(
    profile,
    overrides.filter((override) => activeIdentities.has(
      thematicEditorialIdentity(override.sourceType, override.sourceId),
    )),
  );
}

export function reconcileMatchdayEditorialProfileDeskSnapshot(
  profile: EditorialProfile,
  previous: MatchdayEditorialProfileDeskEditorState,
  nextPersistedOverrides: readonly MatchdayEditorialProfileManualOverride[],
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
): MatchdayEditorialProfileDeskEditorState {
  const activeIdentities = new Set(activeItems.map((item) => (
    thematicEditorialIdentity(item.sourceType, item.sourceId)
  )));
  const previousPersisted = activeOverrides(profile, previous.persistedOverrides, activeIdentities);
  const previousDraft = activeOverrides(profile, previous.draftOverrides, activeIdentities);
  const nextPersisted = activeOverrides(profile, nextPersistedOverrides, activeIdentities);
  const previousPersistedByIdentity = overrideMap(previousPersisted);
  const previousDraftByIdentity = overrideMap(previousDraft);
  const locallyChanged = new Set<string>();

  for (const identity of new Set([
    ...previousPersistedByIdentity.keys(),
    ...previousDraftByIdentity.keys(),
  ])) {
    if (!sameOverride(
      previousPersistedByIdentity.get(identity),
      previousDraftByIdentity.get(identity),
    )) {
      locallyChanged.add(identity);
    }
  }

  const mergedDraft = new Map<string, MatchdayEditorialProfileManualOverride>();
  for (const identity of locallyChanged) {
    const localOverride = previousDraftByIdentity.get(identity);
    if (localOverride) mergedDraft.set(identity, localOverride);
  }

  for (const serverOverride of nextPersisted) {
    const identity = thematicEditorialIdentity(serverOverride.sourceType, serverOverride.sourceId);
    if (locallyChanged.has(identity)) continue;

    const candidate = new Map(mergedDraft);
    candidate.set(identity, serverOverride);
    try {
      validateMatchdayEditorialProfileManualOverrides(profile, Array.from(candidate.values()));
      mergedDraft.set(identity, serverOverride);
    } catch {
      // A decisao local tem prioridade sobre um novo slot persistido incompatível.
    }
  }

  const draftOverrides = validateMatchdayEditorialProfileManualOverrides(
    profile,
    Array.from(mergedDraft.values()),
  );
  const selectedIdentities = Array.from(new Set(previous.selectedIdentities))
    .filter((identity) => activeIdentities.has(identity));

  if (
    sameOverrides(previous.persistedOverrides, nextPersisted)
    && sameOverrides(previous.draftOverrides, draftOverrides)
    && sameIdentities(previous.selectedIdentities, selectedIdentities)
  ) {
    return previous;
  }

  return {
    persistedOverrides: nextPersisted,
    draftOverrides,
    selectedIdentities,
  };
}

function requireActiveItems(
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  identities: readonly string[],
): readonly MatchdayEditorialProfileDeskAutomaticItem[] {
  const activeByIdentity = new Map(activeItems.map((item) => [
    thematicEditorialIdentity(item.sourceType, item.sourceId),
    item,
  ]));
  const unique = new Set<string>();
  return identities.map((identity) => {
    if (unique.has(identity)) {
      throw new Error("matchday-editorial-profile-manual-overrides-duplicate-source");
    }
    unique.add(identity);
    const item = activeByIdentity.get(identity);
    if (!item) throw new Error("matchday-editorial-profile-manual-overrides-source-not-active");
    return item;
  });
}

function normalizedMapValues(
  profile: EditorialProfile,
  map: Map<string, MatchdayEditorialProfileManualOverride>,
): readonly MatchdayEditorialProfileManualOverride[] {
  return validateMatchdayEditorialProfileManualOverrides(profile, Array.from(map.values()));
}

export function compactMatchdayEditorialProfileManualOverridesForLayoutChange(
  currentProfile: EditorialProfile,
  nextProfile: EditorialProfile,
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  zoneKey: EditorialProfileZoneKey,
): readonly MatchdayEditorialProfileManualOverride[] {
  const currentZone = currentProfile.zones.find(
    (zone) => zone.key === zoneKey,
  );

  const nextZone = nextProfile.zones.find(
    (zone) => zone.key === zoneKey,
  );

  if (!currentZone || !nextZone) {
    throw new Error(
      "matchday-editorial-profile-layout-compaction-invalid-zone",
    );
  }

  const normalized =
    validateMatchdayEditorialProfileManualOverrides(
      currentProfile,
      overrides,
    );

  if (nextZone.capacity >= currentZone.capacity) {
    return validateMatchdayEditorialProfileManualOverrides(
      nextProfile,
      normalized,
    );
  }

  const overflowFixed = normalized.filter(
    (override) => (
      override.placementTarget === "zone"
      && override.zoneKey === zoneKey
      && override.sortOrder !== null
      && override.sortOrder > nextZone.capacity
    ),
  );

  if (overflowFixed.length === 0) {
    return validateMatchdayEditorialProfileManualOverrides(
      nextProfile,
      normalized,
    );
  }

  /*
   * Uma posição absoluta que desaparece é compactada para o último
   * slot do novo layout. Conteúdo automático pode ser desalojado.
   * Outra decisão manual nesse slot nunca é deslocada implicitamente.
   */
  if (overflowFixed.length > 1) {
    throw new Error(
      "matchday-editorial-profile-layout-compaction-manual-conflict",
    );
  }

  const targetSlot = nextZone.capacity;

  const targetHasManualPosition = normalized.some(
    (override) => (
      override.placementTarget === "zone"
      && override.zoneKey === zoneKey
      && override.sortOrder === targetSlot
    ),
  );

  if (targetHasManualPosition) {
    throw new Error(
      "matchday-editorial-profile-layout-compaction-manual-conflict",
    );
  }

  const overflowIdentity = thematicEditorialIdentity(
    overflowFixed[0].sourceType,
    overflowFixed[0].sourceId,
  );

  const compacted = normalized.map((override) => (
    thematicEditorialIdentity(
      override.sourceType,
      override.sourceId,
    ) === overflowIdentity
      ? {
          ...override,
          sortOrder: targetSlot,
        }
      : override
  ));

  return validateMatchdayEditorialProfileManualOverrides(
    nextProfile,
    compacted,
  );
}
export function fixMatchdayEditorialItemsInZone(
  profile: EditorialProfile,
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  selectedIdentities: readonly string[],
  zoneKey: EditorialProfileZoneKey,
): readonly MatchdayEditorialProfileManualOverride[] {
  const selected = requireActiveItems(activeItems, selectedIdentities);
  const next = overrideMap(overrides);
  for (const item of selected) {
    next.set(thematicEditorialIdentity(item.sourceType, item.sourceId), {
      sourceType: THEMATIC_EDITORIAL_SOURCE_TYPE,
      sourceId: item.sourceId,
      placementTarget: "zone",
      zoneKey,
      sortOrder: null,
    });
  }
  return normalizedMapValues(profile, next);
}

export function fixMatchdayEditorialItemsAtPosition(
  profile: EditorialProfile,
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  selectedIdentities: readonly string[],
  zoneKey: EditorialProfileZoneKey,
  startPosition: number,
): readonly MatchdayEditorialProfileManualOverride[] {
  const zone = profile.zones.find((candidate) => candidate.key === zoneKey);
  if (!zone || !Number.isInteger(startPosition) || startPosition <= 0 || startPosition > zone.capacity) {
    throw new Error("matchday-editorial-profile-manual-overrides-invalid-sort-order");
  }

  const selected = requireActiveItems(activeItems, selectedIdentities);
  if (selected.length === 0) return validateMatchdayEditorialProfileManualOverrides(profile, overrides);
  if (startPosition + selected.length - 1 > zone.capacity) {
    throw new Error("matchday-editorial-profile-manual-overrides-selection-exceeds-capacity");
  }

  const selectedIdentitySet = new Set(selected.map((item) => (
    thematicEditorialIdentity(item.sourceType, item.sourceId)
  )));
  const targetPositions = new Set(selected.map((_, index) => startPosition + index));
  const next = overrideMap(overrides);

  /*
   * A seleção que está a ser movida deixa primeiro a sua decisão anterior.
   * Isto permite mover uma notícia já manual dentro da própria zona sem
   * contar a posição antiga como uma decisão adicional.
   */
  for (const identity of selectedIdentitySet) {
    next.delete(identity);
  }

  const protectedTargetCount = Array.from(next.values()).filter((current) => (
    current.placementTarget === "zone"
    && current.zoneKey === zoneKey
  )).length;

  /*
   * Uma nova decisão manual nunca destrói outra decisão manual.
   * Se a zona não tiver capacidade para conservar todas, a operação inteira
   * é recusada antes de alterar qualquer override.
   */
  if (protectedTargetCount + selected.length > zone.capacity) {
    throw new Error(
      "matchday-editorial-profile-manual-overrides-manual-insertion-exceeds-capacity",
    );
  }

  const fixedInTarget = Array.from(next.entries())
    .filter(([, current]) => (
      current.placementTarget === "zone"
      && current.zoneKey === zoneKey
      && current.sortOrder !== null
    ))
    .sort((left, right) => {
      const leftPosition = left[1].sortOrder ?? 0;
      const rightPosition = right[1].sortOrder ?? 0;

      return leftPosition - rightPosition
        || compareText(left[0], right[0]);
    });

  const occupiedPositions = new Set<number>(targetPositions);

  /*
   * Posições manuais anteriores ao ponto de inserção permanecem absolutas.
   */
  for (const [, current] of fixedInTarget) {
    if (
      current.sortOrder !== null
      && current.sortOrder < startPosition
    ) {
      occupiedPositions.add(current.sortOrder);
    }
  }

  /*
   * A partir da posição de inserção, só deslocamos uma decisão manual quando
   * o seu slot foi ocupado pela nova seleção ou por outra decisão manual já
   * deslocada. O movimento é sempre para a frente e preserva a ordem relativa.
   */
  for (const [identity, current] of fixedInTarget) {
    const originalPosition = current.sortOrder;

    if (
      originalPosition === null
      || originalPosition < startPosition
    ) {
      continue;
    }

    let nextPosition = originalPosition;

    while (occupiedPositions.has(nextPosition)) {
      nextPosition += 1;
    }

    if (nextPosition > zone.capacity) {
      throw new Error(
        "matchday-editorial-profile-manual-overrides-manual-insertion-exceeds-capacity",
      );
    }

    occupiedPositions.add(nextPosition);

    if (nextPosition !== originalPosition) {
      next.set(identity, {
        ...current,
        sortOrder: nextPosition,
      });
    }
  }

  selected.forEach((item, index) => {
    next.set(thematicEditorialIdentity(item.sourceType, item.sourceId), {
      sourceType: THEMATIC_EDITORIAL_SOURCE_TYPE,
      sourceId: item.sourceId,
      placementTarget: "zone",
      zoneKey,
      sortOrder: startPosition + index,
    });
  });

  return normalizedMapValues(profile, next);
}
export function moveMatchdayEditorialItemsToBank(
  profile: EditorialProfile,
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  selectedIdentities: readonly string[],
): readonly MatchdayEditorialProfileManualOverride[] {
  const selected = requireActiveItems(activeItems, selectedIdentities);
  const next = overrideMap(overrides);
  for (const item of selected) {
    next.set(thematicEditorialIdentity(item.sourceType, item.sourceId), {
      sourceType: THEMATIC_EDITORIAL_SOURCE_TYPE,
      sourceId: item.sourceId,
      placementTarget: "bank",
      zoneKey: null,
      sortOrder: null,
    });
  }
  return normalizedMapValues(profile, next);
}

export function moveMatchdayEditorialItemsToFaixa(
  profile: EditorialProfile,
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  selectedIdentities: readonly string[],
  startPosition: number | null,
): readonly MatchdayEditorialProfileManualOverride[] {
  if (
    startPosition !== null
    && (
      !Number.isInteger(startPosition)
      || startPosition <= 0
    )
  ) {
    throw new Error("matchday-editorial-profile-manual-overrides-invalid-sort-order");
  }

  const selected =
    requireActiveItems(
      activeItems,
      selectedIdentities,
    );

  if (selected.length === 0) {
    return validateMatchdayEditorialProfileManualOverrides(
      profile,
      overrides,
    );
  }

  const selectedSet =
    new Set(
      selected.map(
        (item) =>
          thematicEditorialIdentity(
            item.sourceType,
            item.sourceId,
          ),
      ),
    );

  const next =
    overrideMap(overrides);

  for (const identity of selectedSet) {
    next.delete(identity);
  }

  if (startPosition !== null) {
    const targetPositions =
      new Set(
        selected.map(
          (_, index) =>
            startPosition + index,
        ),
      );

    // Fixar uma posição concreta na Faixa substitui apenas a fixação que
    // ocupava esse slot. As restantes posições manuais permanecem intactas.
    for (const [identity, current] of next) {
      if (
        current.placementTarget === "faixa"
        && current.sortOrder !== null
        && targetPositions.has(
          current.sortOrder,
        )
      ) {
        next.delete(identity);
      }
    }
  }

  selected.forEach(
    (item, index) => {
      next.set(
        thematicEditorialIdentity(
          item.sourceType,
          item.sourceId,
        ),
        {
          sourceType:
            THEMATIC_EDITORIAL_SOURCE_TYPE,
          sourceId:
            item.sourceId,
          placementTarget:
            "faixa",
          zoneKey:
            null,
          sortOrder:
            startPosition === null
              ? null
              : startPosition + index,
        },
      );
    },
  );

  return normalizedMapValues(
    profile,
    next,
  );
}
export function releaseMatchdayEditorialFixedPositions(
  profile: EditorialProfile,
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  selectedIdentities: readonly string[],
): readonly MatchdayEditorialProfileManualOverride[] {
  const selected = new Set(selectedIdentities);
  return validateMatchdayEditorialProfileManualOverrides(
    profile,
    overrides.flatMap((override) => {
      const identity = thematicEditorialIdentity(
        override.sourceType,
        override.sourceId,
      );

      if (!selected.has(identity) || override.sortOrder === null) {
        return [override];
      }

      if (override.placementTarget === "zone") {
        return [];
      }

      if (override.placementTarget === "faixa") {
        return [{
          ...override,
          sortOrder: null,
        }];
      }

      return [override];
    }),
  );
}
export function returnMatchdayEditorialItemsToAutomatic(
  profile: EditorialProfile,
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  selectedIdentities: readonly string[],
): readonly MatchdayEditorialProfileManualOverride[] {
  const selected = new Set(selectedIdentities);
  return validateMatchdayEditorialProfileManualOverrides(
    profile,
    overrides.filter((override) => !selected.has(thematicEditorialIdentity(override.sourceType, override.sourceId))),
  );
}
