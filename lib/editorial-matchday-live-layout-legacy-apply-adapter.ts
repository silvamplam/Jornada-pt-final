import {
  EDITORIAL_PROFILES,
  editorialProfileWithZoneLayouts,
  type EditorialProfileZoneKey,
  type EditorialVisualFamily,
} from "@/lib/editorial-profiles";
import {
  legacyZoneKeyForLiveLayoutZoneId,
  type LiveLayoutLegacyCompatibility,
} from "@/lib/editorial-matchday-live-layout-compatibility-adapter";
import type { LiveLayoutZoneId } from "@/lib/editorial-matchday-live-layout-physical";
import {
  physicalDeskFaixaSlots,
  physicalDeskPlacementsOfType,
  physicalDeskZoneSlots,
  type PhysicalDeskPlacement,
  type PhysicalDeskSnapshot,
  type PhysicalDeskState,
} from "@/lib/editorial-matchday-live-layout-desk-state";
import type {
  MatchdayEditorialProfileDeskSnapshot,
} from "@/lib/editorial-matchday-profile-desk";
import {
  returnMatchdayEditorialItemsToAutomatic,
  thematicEditorialIdentity,
  validateMatchdayEditorialProfileManualOverrides,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";
import type { MatchdayEditorialVacantZoneSlot } from "@/lib/editorial-matchday-movement-preview";
import {
  MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS,
  matchdayEditorialProfileThematicZoneOrderFromBlockOrder,
  reconcileMatchdayEditorialProfileWorkspace,
  withoutMatchdayEditorialProfileOpeningOverrides,
  type MatchdayEditorialProfileOpening,
  type MatchdayEditorialProfilePageControls,
  type MatchdayEditorialProfileThematicBlockKey,
} from "@/lib/editorial-matchday-profile-workspace";

export type PhysicalDeskLegacyApplyBaseline = Pick<
  MatchdayEditorialProfileDeskSnapshot,
  | "matchdayId"
  | "profileKey"
  | "reconcileRevision"
  | "reconcileStateToken"
  | "manualOverrides"
  | "automaticDistribution"
  | "appliedZoneItems"
  | "hasAppliedSnapshot"
  | "currentFaixa"
  | "selectionCandidates"
>;

export type PhysicalDeskLegacyApplyProjection = Readonly<{
  profileKey: MatchdayEditorialProfileDeskSnapshot["profileKey"];
  expectedRevision: number;
  expectedStateToken: string;
  overrides: readonly MatchdayEditorialProfileManualOverride[];
  opening: MatchdayEditorialProfileOpening;
  pageControls: MatchdayEditorialProfilePageControls;
  selectionBankItemIds: readonly (string | null)[];
  workedSourceIds: readonly string[];
  displacedBankItemIds: readonly string[];
  faixaArrivalBankItemIds: readonly string[];
  displacedArrivalBankItemIds: readonly string[];
  vacantZoneSlots: readonly MatchdayEditorialVacantZoneSlot[];
  vacantFaixaSlots: readonly number[];
  videoModule: Readonly<{
    active: boolean;
    highlightAction: "preserve" | "remove" | "replace";
    highlightBankItemId: string | null;
  }>;
}>;

function adapterError(code: string): never {
  throw new Error(`matchday-live-layout-legacy-apply-${code}`);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sourceIdentity(sourceType: string, sourceId: string): string {
  return thematicEditorialIdentity(sourceType, sourceId);
}

function targetKey(placement: PhysicalDeskPlacement | null): string | null {
  if (!placement) return null;
  return `${placement.placementType}\u0000${placement.zoneId ?? ""}\u0000${placement.slotPosition}`;
}

function mappedZoneRows(
  state: PhysicalDeskState,
  compatibility: LiveLayoutLegacyCompatibility,
): readonly Readonly<{
  zoneId: LiveLayoutZoneId;
  zoneKey: EditorialProfileZoneKey;
  publicTitle: string;
  visualFamily: EditorialVisualFamily;
}>[] {
  return state.current.zones.map((zone) => ({
    zoneId: zone.id,
    zoneKey: legacyZoneKeyForLiveLayoutZoneId(compatibility, zone.id),
    publicTitle: zone.publicTitle,
    visualFamily: zone.visualFamily,
  }));
}

function requireRepresentable(
  state: PhysicalDeskState,
  compatibility: LiveLayoutLegacyCompatibility,
): void {
  if (compatibility.compatibility !== "representable") {
    adapterError("not-legacy-representable");
  }
  if (compatibility.additionalPhysicalZoneIds.length !== 0) {
    adapterError("unexpected-additional-physical-zones");
  }
  if (compatibility.projection.length !== state.current.zones.length) {
    adapterError("projection-cardinality-mismatch");
  }
  const projectedZoneIds = new Set<LiveLayoutZoneId>();
  const projectedZoneKeys = new Set<EditorialProfileZoneKey>();
  for (const row of compatibility.projection) {
    if (row.matchdayId !== state.matchdayId) {
      adapterError("projection-matchday-mismatch");
    }
    if (projectedZoneIds.has(row.zoneId)) adapterError("projection-zone-duplicate");
    if (projectedZoneKeys.has(row.legacyZoneKey)) adapterError("projection-key-duplicate");
    projectedZoneIds.add(row.zoneId);
    projectedZoneKeys.add(row.legacyZoneKey);
  }
  if (state.current.zones.some((zone) => !projectedZoneIds.has(zone.id))) {
    adapterError("projection-zone-missing");
  }
  const mapped = mappedZoneRows(state, compatibility);
  if (mapped.length !== state.current.zones.length) adapterError("zone-cardinality-mismatch");
  if (new Set(mapped.map((row) => row.zoneKey)).size !== mapped.length) {
    adapterError("zone-mapping-not-one-to-one");
  }
}

function vacantFaixaSlotsFromState(state: PhysicalDeskState): readonly number[] {
  return physicalDeskFaixaSlots(state)
    .filter((slot) => slot.placement === null)
    .map((slot) => slot.slotPosition);
}

export function physicalDeskLegacyApplyBlockReason(
  state: PhysicalDeskState,
  compatibility: LiveLayoutLegacyCompatibility,
): string | null {
  try {
    requireRepresentable(state, compatibility);
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "matchday-live-layout-legacy-apply-blocked";
  }
}

function recordFromMappedRows<T>(
  rows: readonly Readonly<{ zoneKey: EditorialProfileZoneKey; value: T }>[],
): Readonly<Record<EditorialProfileZoneKey, T>> {
  return Object.fromEntries(rows.map((row) => [row.zoneKey, row.value])) as Readonly<
    Record<EditorialProfileZoneKey, T>
  >;
}

function placementByBankItemId(
  snapshot: PhysicalDeskSnapshot,
): ReadonlyMap<string, PhysicalDeskPlacement> {
  return new Map(snapshot.placements.map((placement) => (
    [placement.bankItemId, placement] as const
  )));
}

function desiredManualOverride(
  placement: PhysicalDeskPlacement | null,
  explicitBank: boolean,
  zoneKeyById: ReadonlyMap<LiveLayoutZoneId, EditorialProfileZoneKey>,
  sourceType: string,
  sourceId: string,
): MatchdayEditorialProfileManualOverride | null {
  if (sourceType !== "editorial_article") return adapterError("source-type-not-supported");
  if (explicitBank) {
    return { sourceType, sourceId, placementTarget: "bank", zoneKey: null, sortOrder: null };
  }
  if (placement?.placementType === "zone") {
    const zoneKey = placement.zoneId === null ? null : zoneKeyById.get(placement.zoneId);
    if (!zoneKey) return adapterError("zone-not-mapped");
    return {
      sourceType,
      sourceId,
      placementTarget: "zone",
      zoneKey,
      sortOrder: placement.slotPosition,
    };
  }
  if (placement?.placementType === "faixa") {
    return { sourceType, sourceId, placementTarget: "faixa", zoneKey: null, sortOrder: placement.slotPosition };
  }
  return null;
}

function buildOverrides(
  state: PhysicalDeskState,
  baseline: PhysicalDeskLegacyApplyBaseline,
  zoneKeyById: ReadonlyMap<LiveLayoutZoneId, EditorialProfileZoneKey>,
): readonly MatchdayEditorialProfileManualOverride[] {
  const baselinePlacements = placementByBankItemId(state.baseline);
  const currentPlacements = placementByBankItemId(state.current);
  const currentExplicit = new Set(state.current.explicitBankItemIds);
  const baselineExplicit = new Set(state.baseline.explicitBankItemIds);
  const baselineOverrides = new Map(baseline.manualOverrides.map((override) => [
    sourceIdentity(override.sourceType, override.sourceId),
    override,
  ] as const));
  const next: MatchdayEditorialProfileManualOverride[] = [];

  for (const bankItem of state.current.bankItems) {
    const identity = sourceIdentity(bankItem.sourceType, bankItem.sourceId);
    const baselinePlacement = baselinePlacements.get(bankItem.id) ?? null;
    const currentPlacement = currentPlacements.get(bankItem.id) ?? null;
    const existing = baselineOverrides.get(identity) ?? null;
    const unchanged = targetKey(baselinePlacement) === targetKey(currentPlacement)
      && baselineExplicit.has(bankItem.id) === currentExplicit.has(bankItem.id);

    if (unchanged && existing) {
      next.push(existing);
      continue;
    }
    if (unchanged) continue;

    const desired = desiredManualOverride(
      currentPlacement,
      currentExplicit.has(bankItem.id),
      zoneKeyById,
      bankItem.sourceType,
      bankItem.sourceId,
    );
    if (desired) next.push(desired);
  }

  return next;
}

function openingFromState(state: PhysicalDeskState): MatchdayEditorialProfileOpening {
  const byId = new Map(state.current.bankItems.map((item) => [item.id, item] as const));
  const placements = physicalDeskPlacementsOfType(state, "opening");
  return Object.fromEntries(MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.map((slot, index) => {
    const placement = placements.find((candidate) => candidate.slotPosition === index + 1);
    if (!placement) return [slot, null];
    const item = byId.get(placement.bankItemId);
    if (!item || item.sourceType !== "editorial_article") {
      return adapterError("opening-source-not-supported");
    }
    return [slot, item.sourceId];
  })) as MatchdayEditorialProfileOpening;
}

function selectionFromState(state: PhysicalDeskState): readonly (string | null)[] {
  const placements = physicalDeskPlacementsOfType(state, "selection");
  return [1, 2, 3, 4].map((position) => (
    placements.find((placement) => placement.slotPosition === position)?.bankItemId ?? null
  ));
}

function pageControlsFromState(
  state: PhysicalDeskState,
  compatibility: LiveLayoutLegacyCompatibility,
): MatchdayEditorialProfilePageControls {
  const mapped = mappedZoneRows(state, compatibility);
  const zoneKeyById = new Map(mapped.map((row) => [row.zoneId, row.zoneKey] as const));
  const thematicBlockOrder: MatchdayEditorialProfileThematicBlockKey[] = state.current.blocks.map((block) => {
    if (block.kind === "latest" || block.kind === "video") return block.kind;
    const zoneKey = zoneKeyById.get(block.zoneId);
    return zoneKey ?? adapterError("block-zone-not-mapped");
  });
  return {
    headlineTitleColor: state.current.presentation.headlineTitleColor,
    latestZonePlacement: state.current.presentation.latestZonePlacement,
    latestZoneTitle: state.current.presentation.latestZoneTitle,
    thematicZoneOrder: matchdayEditorialProfileThematicZoneOrderFromBlockOrder(
      thematicBlockOrder,
    ),
    thematicZoneLayouts: recordFromMappedRows(mapped.map((row) => ({
      zoneKey: row.zoneKey,
      value: row.visualFamily,
    }))),
    thematicBlockOrder,
    thematicZoneTitles: recordFromMappedRows(mapped.map((row) => ({
      zoneKey: row.zoneKey,
      value: row.publicTitle,
    }))),
  };
}

function videoModuleFromState(state: PhysicalDeskState): PhysicalDeskLegacyApplyProjection["videoModule"] {
  const baseline = state.baseline.placements.find((placement) => (
    placement.placementType === "video_highlight"
  ))?.bankItemId ?? null;
  const current = state.current.placements.find((placement) => (
    placement.placementType === "video_highlight"
  ))?.bankItemId ?? null;
  return {
    active: state.current.presentation.videoModuleActive,
    highlightAction: baseline === current
      ? "preserve"
      : current === null
        ? "remove"
        : "replace",
    highlightBankItemId: baseline === current ? null : current,
  };
}

function identityForBankItem(
  state: PhysicalDeskState,
  bankItemId: string,
): string {
  const item = state.current.bankItems.find((candidate) => candidate.id === bankItemId);
  if (!item) return adapterError("bank-item-unknown");
  return sourceIdentity(item.sourceType, item.sourceId);
}

function sortedSemanticPlacements(
  values: readonly Readonly<{
    zoneKey: EditorialProfileZoneKey;
    slotPosition: number;
    identity: string;
  }>[],
): readonly string[] {
  return [...values]
    .sort((left, right) => (
      left.zoneKey.localeCompare(right.zoneKey)
      || left.slotPosition - right.slotPosition
      || left.identity.localeCompare(right.identity)
    ))
    .map((value) => `${value.zoneKey}\u0000${value.slotPosition}\u0000${value.identity}`);
}

function assertRoundTrip(
  state: PhysicalDeskState,
  baseline: PhysicalDeskLegacyApplyBaseline,
  compatibility: LiveLayoutLegacyCompatibility,
  projection: PhysicalDeskLegacyApplyProjection,
): void {
  const profile = EDITORIAL_PROFILES[baseline.profileKey];
  const effectiveProfile = editorialProfileWithZoneLayouts(
    profile,
    projection.pageControls.thematicZoneLayouts,
  );
  const candidateById = new Map(baseline.selectionCandidates.map((item) => (
    [item.bankItemId, item] as const
  )));
  const selectionIdentities = projection.selectionBankItemIds.flatMap((bankItemId) => {
    if (!bankItemId) return [];
    const item = candidateById.get(bankItemId);
    if (!item?.sourceType || !item.sourceId) return adapterError("selection-source-not-active");
    return [sourceIdentity(item.sourceType, item.sourceId)];
  });
  const videoPlacement = state.current.placements.find((placement) => (
    placement.placementType === "video_highlight"
  ));
  const independentPlacementIdentities = videoPlacement
    ? [identityForBankItem(state, videoPlacement.bankItemId)]
    : [];
  const displacedIdentities = projection.displacedBankItemIds.map((bankItemId) => (
    identityForBankItem(state, bankItemId)
  ));
  const workedIdentities = state.current.workedBankItemIds.map((bankItemId) => (
    identityForBankItem(state, bankItemId)
  ));
  const circuitOverrides = withoutMatchdayEditorialProfileOpeningOverrides(
    effectiveProfile,
    returnMatchdayEditorialItemsToAutomatic(
      effectiveProfile,
      projection.overrides,
      selectionIdentities,
    ),
    projection.opening,
  );
  const result = reconcileMatchdayEditorialProfileWorkspace(
    effectiveProfile,
    baseline.automaticDistribution.activeItems,
    circuitOverrides,
    projection.opening,
    baseline.appliedZoneItems,
    baseline.hasAppliedSnapshot,
    baseline.currentFaixa,
    {
      selectionIdentities,
      workedIdentities,
      independentPlacementIdentities,
      displacedIdentities,
      vacantZoneSlots: projection.vacantZoneSlots,
      vacantFaixaSlots: projection.vacantFaixaSlots,
      allowAutomaticPlacement: false,
    },
  );

  const mapped = mappedZoneRows(state, compatibility);
  const zoneKeyById = new Map(mapped.map((row) => [row.zoneId, row.zoneKey] as const));
  const intendedZones = sortedSemanticPlacements(state.current.placements.flatMap((placement) => {
    if (placement.placementType !== "zone" || placement.zoneId === null) return [];
    const zoneKey = zoneKeyById.get(placement.zoneId);
    if (!zoneKey) return adapterError("round-trip-zone-not-mapped");
    return [{
      zoneKey,
      slotPosition: placement.slotPosition,
      identity: identityForBankItem(state, placement.bankItemId),
    }];
  }));
  const reproducedZones = sortedSemanticPlacements(result.zonesAfter.flatMap((zone) => (
    zone.items.map((item) => ({
      zoneKey: zone.key,
      slotPosition: item.sortOrder,
      identity: sourceIdentity(item.sourceType, item.sourceId),
    }))
  )));
  if (!sameJson(intendedZones, reproducedZones)) adapterError("round-trip-zone-diverged");

  const intendedVacancies = mapped.flatMap((row) => physicalDeskZoneSlots(state, row.zoneId)
    .filter((slot) => slot.placement === null)
    .map((slot) => `${row.zoneKey}\u0000${slot.slotPosition}`))
    .sort();
  const projectedVacancies = projection.vacantZoneSlots
    .map((slot) => `${slot.zoneKey}\u0000${slot.slotPosition}`)
    .sort();
  if (!sameJson(intendedVacancies, projectedVacancies)) {
    adapterError("round-trip-vacancies-diverged");
  }

  const intendedFaixa = physicalDeskPlacementsOfType(state, "faixa").map((placement) => (
    `${placement.slotPosition}\u0000${identityForBankItem(state, placement.bankItemId)}`
  ));
  const reproducedFaixa = result.faixaAfter.map((item) => (
    `${item.sortOrder}\u0000${sourceIdentity(item.sourceType, item.sourceId)}`
  ));
  if (!sameJson(intendedFaixa, reproducedFaixa)) adapterError("round-trip-faixa-diverged");
  if (!sameJson(
    vacantFaixaSlotsFromState(state),
    projection.vacantFaixaSlots,
  )) {
    adapterError("round-trip-faixa-vacancies-diverged");
  }

  const intendedBank = state.current.explicitBankItemIds.map((id) => identityForBankItem(state, id)).sort();
  const reproducedBank = result.bankAfter.map((item) => sourceIdentity(item.sourceType, item.sourceId)).sort();
  if (!sameJson(intendedBank, reproducedBank)) adapterError("round-trip-bank-diverged");

  const openingPlacements = physicalDeskPlacementsOfType(state, "opening");
  const projectedOpeningIds = MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.flatMap((slot, index) => {
    const sourceId = projection.opening[slot];
    return sourceId ? [`${index + 1}\u0000${sourceIdentity("editorial_article", sourceId)}`] : [];
  });
  const intendedOpeningIds = openingPlacements.map((placement) => (
    `${placement.slotPosition}\u0000${identityForBankItem(state, placement.bankItemId)}`
  ));
  if (!sameJson(intendedOpeningIds, projectedOpeningIds)) adapterError("round-trip-opening-diverged");

  const intendedSelection = physicalDeskPlacementsOfType(state, "selection").map((placement) => (
    `${placement.slotPosition}\u0000${placement.bankItemId}`
  ));
  const projectedSelection = projection.selectionBankItemIds.flatMap((id, index) => (
    id ? [`${index + 1}\u0000${id}`] : []
  ));
  if (!sameJson(intendedSelection, projectedSelection)) adapterError("round-trip-selection-diverged");

  const intendedVideo = videoPlacement?.bankItemId ?? null;
  const projectedVideo = projection.videoModule.highlightAction === "preserve"
    ? state.baseline.placements.find((placement) => placement.placementType === "video_highlight")?.bankItemId ?? null
    : projection.videoModule.highlightAction === "remove"
      ? null
      : projection.videoModule.highlightBankItemId;
  if (intendedVideo !== projectedVideo) adapterError("round-trip-video-diverged");

  if (!sameJson([...state.current.displacedBankItemIds].sort(), [...projection.displacedBankItemIds].sort())) {
    adapterError("round-trip-displaced-diverged");
  }
}

export function buildPhysicalDeskLegacyApplyProjection(
  state: PhysicalDeskState,
  baseline: PhysicalDeskLegacyApplyBaseline,
  compatibility: LiveLayoutLegacyCompatibility,
): PhysicalDeskLegacyApplyProjection {
  if (state.matchdayId !== baseline.matchdayId) {
    adapterError("baseline-matchday-mismatch");
  }
  requireRepresentable(state, compatibility);
  const mapped = mappedZoneRows(state, compatibility);
  const zoneKeyById = new Map(mapped.map((row) => [row.zoneId, row.zoneKey] as const));
  const profile = EDITORIAL_PROFILES[baseline.profileKey];
  const pageControls = pageControlsFromState(state, compatibility);
  const effectiveProfile = editorialProfileWithZoneLayouts(
    profile,
    pageControls.thematicZoneLayouts,
  );
  const overrides = validateMatchdayEditorialProfileManualOverrides(
    effectiveProfile,
    buildOverrides(state, baseline, zoneKeyById),
  );
  const vacantZoneSlots = mapped.flatMap((row) => physicalDeskZoneSlots(state, row.zoneId)
    .filter((slot) => slot.placement === null)
    .map((slot) => ({ zoneKey: row.zoneKey, slotPosition: slot.slotPosition })));
  const byId = new Map(state.current.bankItems.map((item) => [item.id, item] as const));
  const workedSourceIds = state.current.workedBankItemIds.map((id) => {
    const item = byId.get(id);
    if (!item || item.sourceType !== "editorial_article") {
      return adapterError("worked-source-not-supported");
    }
    return item.sourceId;
  });
  const projection: PhysicalDeskLegacyApplyProjection = {
    profileKey: baseline.profileKey,
    expectedRevision: baseline.reconcileRevision,
    expectedStateToken: baseline.reconcileStateToken,
    overrides,
    opening: openingFromState(state),
    pageControls,
    selectionBankItemIds: selectionFromState(state),
    workedSourceIds,
    displacedBankItemIds: state.current.displacedBankItemIds,
    faixaArrivalBankItemIds: state.current.faixaArrivalBankItemIds,
    displacedArrivalBankItemIds: state.current.displacedArrivalBankItemIds,
    vacantZoneSlots,
    vacantFaixaSlots: vacantFaixaSlotsFromState(state),
    videoModule: videoModuleFromState(state),
  };
  assertRoundTrip(state, baseline, compatibility, projection);
  return projection;
}
