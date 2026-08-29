import type { EditorialProfile, EditorialProfileZoneKey } from "@/lib/editorial-profiles";
import type {
  MatchdayEditorialProfileDeskAutomaticItem,
  MatchdayEditorialProfileDeskItem,
} from "@/lib/editorial-matchday-profile-desk";
import {
  buildMatchdayEditorialProfileEffectiveDistribution,
  compareThematicItemsByCircuitOrder,
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
    circuitOrder: item.circuitOrder,
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

function reconcileAppliedSnapshotDistribution(
  profile: EditorialProfile,
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  appliedZoneItems: readonly MatchdayEditorialProfileAppliedZoneItem[],
  currentFaixa: readonly MatchdayEditorialProfileFaixaItem[],
): MatchdayEditorialProfileReconcileResult {
  const activeByIdentity = new Map(
    activeItems.map(
      (item) => [itemIdentity(item), item] as const,
    ),
  );

  const overrideByIdentity = new Map(
    overrides.map(
      (override) => [itemIdentity(override), override] as const,
    ),
  );

  const zonesBefore = appliedZones(
    profile,
    activeItems,
    appliedZoneItems,
  );

  const faixaBefore = [...currentFaixa]
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder,
    )
    .map(
      (item, index) => ({
        ...item,
        sortOrder: index + 1,
      }),
    );

  const appliedBaselineIdentities = new Set([
    ...zonesBefore.flatMap(
      (zone) => zone.items.map(itemIdentity),
    ),
    ...faixaBefore.map(itemIdentity),
  ]);

  /*
   * Com snapshot aplicado, a ordem aplicada e soberana.
   * O automatico produz propostas, mas nao reordena
   * a composicao publica sem decisao editorial.
   */
  const displacedFromZones:
    MatchdayEditorialProfileDeskAutomaticItem[] = [];

  const baselineZonesAfter = profile.zones.map((zone) => {
    const baselineZone = zonesBefore.find(
      (candidate) => candidate.key === zone.key,
    );

    const baselineItems = baselineZone?.items ?? [];

    const sequence: Array<MatchdayEditorialProfileEffectiveItem & Readonly<{ sortOrder: number }>> = baselineItems
      .filter((item) => {
        const override = overrideByIdentity.get(itemIdentity(item));

        return !override
          || (
            override.placementTarget === "zone"
            && override.zoneKey === zone.key
            && override.sortOrder === null
          );
      })
      .map((item) => {
        const override = overrideByIdentity.get(itemIdentity(item));

        return {
          ...item,
          manualOverride:
            override?.placementTarget === "zone"
            && override.zoneKey === zone.key
            && override.sortOrder === null
              ? "zone" as const
              : null,
        };
      });

    const fixedBySlot = new Map<
      number,
      MatchdayEditorialProfileEffectiveItem
      & Readonly<{ sortOrder: number }>
    >();

    const floatingIdentities = new Set<string>();

    for (const item of sequence) {
      if (item.manualOverride === "zone") {
        floatingIdentities.add(itemIdentity(item));
      }
    }

    const targetOverrides = overrides.filter(
      (override) =>
        override.placementTarget === "zone"
        && override.zoneKey === zone.key,
    );

    for (
      const override of targetOverrides.filter(
        (candidate) => candidate.sortOrder === null,
      )
    ) {
      const identity = itemIdentity(override);
      const item = activeByIdentity.get(identity);

      if (!item || floatingIdentities.has(identity)) continue;

      floatingIdentities.add(identity);

      const candidate = {
        ...effectiveItem(
          item,
          null,
          "zone",
        ),
        sortOrder: 0,
      };

      let insertAt = sequence.length;

      for (
        let index = 0;
        index < sequence.length;
        index += 1
      ) {
        if (
          compareThematicItemsByCircuitOrder(
            item,
            sequence[index],
          ) < 0
        ) {
          insertAt = index;
          break;
        }
      }

      sequence.splice(
        insertAt,
        0,
        candidate,
      );
    }

    for (
      const override of targetOverrides.filter(
        (candidate) => candidate.sortOrder !== null,
      )
    ) {
      const identity = itemIdentity(override);
      const item = activeByIdentity.get(identity);

      if (!item || override.sortOrder === null) {
        continue;
      }

      fixedBySlot.set(
        override.sortOrder,
        {
          ...effectiveItem(
            item,
            override.sortOrder,
            "position",
          ),
          sortOrder: override.sortOrder,
        },
      );
    }

    const freeSlotCount = Math.max(
      0,
      zone.capacity - fixedBySlot.size,
    );

    while (sequence.length > freeSlotCount) {
      let removableIndex = -1;

      for (
        let index = sequence.length - 1;
        index >= 0;
        index -= 1
      ) {
        if (
          !floatingIdentities.has(
            itemIdentity(sequence[index]),
          )
        ) {
          removableIndex = index;
          break;
        }
      }

      if (removableIndex < 0) {
        throw new Error(
          "matchday-editorial-profile-applied-baseline-zone-capacity-exceeded",
        );
      }

      const removed = sequence.splice(
        removableIndex,
        1,
      )[0];

      const removedIdentity = itemIdentity(removed);
      const removedActive =
        activeByIdentity.get(removedIdentity);

      if (
        removedActive
        && !overrideByIdentity.has(removedIdentity)
      ) {
        displacedFromZones.push(removedActive);
      }
    }

    const items: Array<
      MatchdayEditorialProfileEffectiveItem
      & Readonly<{ sortOrder: number }>
    > = [];

    let freeIndex = 0;

    for (
      let slot = 1;
      slot <= zone.capacity;
      slot += 1
    ) {
      const fixed = fixedBySlot.get(slot);

      if (fixed) {
        items.push(fixed);
        continue;
      }

      const next = sequence[freeIndex];
      freeIndex += 1;

      if (!next) continue;

      items.push({
        ...next,
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

  const placedInBaselineZones = new Set(
    baselineZonesAfter.flatMap(
      (zone) => zone.items.map(itemIdentity),
    ),
  );

  const newAutomaticCandidates = activeItems
    .filter((item) => {
      const identity = itemIdentity(item);

      return (
        !appliedBaselineIdentities.has(identity)
        && !overrideByIdentity.has(identity)
        && !placedInBaselineZones.has(identity)
      );
    })
    .sort(compareThematicItemsByCircuitOrder);

  const placedNewAutomaticIdentities = new Set<string>();

  /*
   * Uma publicação nova pode ocupar apenas um slot realmente livre da sua
   * zona natural. A baseline aplicada e as decisões manuais conservam os
   * seus slots; não são deslocadas nem reordenadas por esta entrada.
   */
  const zonesAfter = baselineZonesAfter.map((zone) => {
    const usedSlots = new Set(
      zone.items.map((item) => item.sortOrder),
    );
    const freeSlots = Array.from(
      { length: zone.capacity },
      (_, index) => index + 1,
    ).filter((slot) => !usedSlots.has(slot));
    const additions = newAutomaticCandidates
      .filter((item) => item.classifiedZoneKey === zone.key)
      .slice(0, freeSlots.length)
      .map((item, index) => {
        placedNewAutomaticIdentities.add(itemIdentity(item));

        return {
          ...effectiveItem(item, freeSlots[index], null),
          sortOrder: freeSlots[index],
        };
      });

    return {
      ...zone,
      items: [...zone.items, ...additions]
        .sort((left, right) => left.sortOrder - right.sortOrder),
    };
  });

  const newAutomaticFaixa = newAutomaticCandidates.filter(
    (item) => !placedNewAutomaticIdentities.has(itemIdentity(item)),
  );

  const placedAfter = new Set(
    zonesAfter.flatMap(
      (zone) => zone.items.map(itemIdentity),
    ),
  );

  const explicitBank = new Set(
    overrides
      .filter(
        (override) =>
          override.placementTarget === "bank",
      )
      .map(itemIdentity),
  );

  const explicitZone = new Set(
    overrides
      .filter(
        (override) =>
          override.placementTarget === "zone",
      )
      .map(itemIdentity),
  );

  const faixaOverrides = overrides.filter(
    (override) =>
      override.placementTarget === "faixa",
  );

  const floatingFaixaOverrides =
    faixaOverrides.filter(
      (override) => override.sortOrder === null,
    );

  const fixedFaixaOverrides = faixaOverrides
    .filter(
      (override) => override.sortOrder !== null,
    )
    .sort(
      (left, right) =>
        (left.sortOrder ?? 0)
        - (right.sortOrder ?? 0),
    );

  const floatingFaixaIdentities = new Set(
    floatingFaixaOverrides.map(itemIdentity),
  );

  const fixedFaixaIdentities = new Set(
    fixedFaixaOverrides.map(itemIdentity),
  );

  /*
   * A Faixa aplicada tambem e baseline.
   * Sem decisao editorial conserva a mesma ordem.
   */
  let faixaBase: MatchdayEditorialProfileFaixaItem[] = faixaBefore
    .filter((item) => {
      const identity = itemIdentity(item);

      return (
        !placedAfter.has(identity)
        && !explicitBank.has(identity)
        && !explicitZone.has(identity)
        && !fixedFaixaIdentities.has(identity)
      );
    })
    .map((item) => {
      const identity = itemIdentity(item);

      return {
        ...item,
        manualOverride:
          floatingFaixaIdentities.has(identity)
            ? "faixa" as const
            : null,
      };
    });

  const existingFaixaIdentities = new Set(
    faixaBase.map(itemIdentity),
  );

  /*
   * Uma noticia desalojada de zona ou uma entrada nova sem vaga natural
   * entra na Faixa. Nada desaparece silenciosamente.
   */
  const additionIdentities = new Set<string>();
  const additions = [
    ...displacedFromZones,
    ...newAutomaticFaixa,
  ]
    .filter((item) => {
      const identity = itemIdentity(item);

      return (
        !additionIdentities.has(identity)
        && !placedAfter.has(identity)
        && !explicitBank.has(identity)
        && !explicitZone.has(identity)
        && !floatingFaixaIdentities.has(identity)
        && !fixedFaixaIdentities.has(identity)
        && !existingFaixaIdentities.has(identity)
      );
    })
    .map((item) => {
      additionIdentities.add(itemIdentity(item));

      return {
        ...effectiveItem(
          item,
          null,
          null,
        ),
        sortOrder: 0,
      };
    });

  for (const override of floatingFaixaOverrides) {
    const identity = itemIdentity(override);

    if (
      placedAfter.has(identity)
      || explicitBank.has(identity)
      || existingFaixaIdentities.has(identity)
      || additions.some(
        (item) =>
          itemIdentity(item) === identity,
      )
    ) {
      continue;
    }

    const item = activeByIdentity.get(identity);

    if (!item) continue;

    additions.push({
      ...effectiveItem(
        item,
        null,
        "faixa",
      ),
      sortOrder: 0,
    });
  }

  additions.sort(compareThematicItemsByCircuitOrder);

  faixaBase = [
    ...additions,
    ...faixaBase,
  ];

  for (const override of fixedFaixaOverrides) {
    const identity = itemIdentity(override);
    const item = activeByIdentity.get(identity);

    if (
      !item
      || override.sortOrder === null
      || placedAfter.has(identity)
      || explicitBank.has(identity)
    ) {
      continue;
    }

    const existingIndex = faixaBase.findIndex(
      (candidate) =>
        itemIdentity(candidate) === identity,
    );

    if (existingIndex >= 0) {
      faixaBase.splice(existingIndex, 1);
    }

    const targetIndex = Math.min(
      override.sortOrder - 1,
      faixaBase.length,
    );

    faixaBase.splice(
      targetIndex,
      0,
      {
        ...effectiveItem(
          item,
          targetIndex + 1,
          "faixa",
        ),
        sortOrder: targetIndex + 1,
      },
    );
  }

  const faixaAfter = faixaBase.map(
    (item, index) => ({
      ...item,
      sortOrder: index + 1,
    }),
  );

  const bankAfter = activeItems
    .filter((item) => explicitBank.has(itemIdentity(item)))
    .map((item) => {
      return {
        ...effectiveItem(
          item,
          null,
          "bank",
        ),
        sortOrder: null,
      };
    })
    .sort(compareThematicItemsByCircuitOrder);

  const beforePlacements = placementMap(
    activeItems,
    zonesBefore,
    faixaBefore,
  );

  const afterPlacements = placementMap(
    activeItems,
    zonesAfter,
    faixaAfter,
  );

  const movements = activeItems.flatMap(
    (
      item,
    ): MatchdayEditorialProfileMovement[] => {
      const identity = itemIdentity(item);

      const from =
        beforePlacements.get(identity)
        ?? { kind: "bank" as const };

      const to =
        afterPlacements.get(identity)
        ?? { kind: "bank" as const };

      return samePlacement(from, to)
        ? []
        : [{
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            title: item.title,
            from,
            to,
          }];
    },
  );

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

  if (hasAppliedSnapshot) {
    return reconcileAppliedSnapshotDistribution(
      profile,
      activeItems,
      overrides,
      appliedZoneItems,
      currentFaixa,
    );
  }

  const zonesBefore =
    buildMatchdayEditorialProfileEffectiveDistribution(
      profile,
      activeItems,
      [],
    ).zones;
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
  const faixaOverrides = overrides
    .filter((override) => override.placementTarget === "faixa");
  const fixedFaixa = faixaOverrides
    .filter((override) => override.sortOrder !== null)
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
  const fixedFaixaIdentities = new Set(fixedFaixa.map(itemIdentity));
  const floatingFaixaIdentities = new Set(
    faixaOverrides
      .filter((override) => override.sortOrder === null)
      .map(itemIdentity),
  );
  const faixaBefore = [...currentFaixa]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));

  // Overrides legacy Faixa/null continuam legiveis. Sem snapshot, a ordem
  // segue a entrada estavel no circuito. Apenas um sortOrder positivo reserva
  // uma posicao absoluta; nenhuma operacao nova cria pertenÃ§a flutuante.
  const automaticFaixa = [...activeItems]
    .filter((item) => {
      const identity = itemIdentity(item);
      return !placedAfter.has(identity)
        && !explicitBank.has(identity)
        && !fixedFaixaIdentities.has(identity);
    })
    .sort(compareThematicItemsByCircuitOrder)
    .map((item): MatchdayEditorialProfileFaixaItem => {
      const identity = itemIdentity(item);
      return {
        ...effectiveItem(
          item,
          1,
          floatingFaixaIdentities.has(identity)
            ? "faixa"
            : null,
        ),
        sortOrder: 1,
      };
    });

  const faixaBase = automaticFaixa.map((item, index) => ({
    ...item,
    sortOrder: index + 1,
  }));

  for (const override of fixedFaixa) {
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
  }

  const faixaAfter = faixaBase.map((item, index) => ({
    ...item,
    sortOrder: index + 1,
  }));

  const bankAfter = activeItems
    .filter((item) => explicitBank.has(itemIdentity(item)))
    .map((item) => {
      return { ...effectiveItem(item, null, "bank"), sortOrder: null };
    })
    .sort(compareThematicItemsByCircuitOrder);

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
