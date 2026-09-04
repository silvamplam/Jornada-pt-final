import {
  editorialVisualFamilyCapacity,
  type EditorialVisualFamily,
} from "@/lib/editorial-visual-families";
import type {
  LiveLayoutZoneId,
  MatchdayLiveLayoutBlock,
} from "@/lib/editorial-matchday-live-layout-physical";
import type {
  LiveLayoutPhysicalCutover,
  LiveLayoutWorkspaceBankItem,
  LiveLayoutWorkspaceMemory,
  LiveLayoutWorkspacePlacementType,
  LiveLayoutWorkspaceState,
} from "@/lib/editorial-matchday-live-layout-workspace";
import type {
  MatchdayEditorialProfileLatestZonePlacement,
} from "@/lib/editorial-matchday-profile-workspace";

export type PhysicalDeskZone = Readonly<{
  id: LiveLayoutZoneId;
  publicTitle: string;
  visualFamily: EditorialVisualFamily;
  capacity: number;
}>;

export type PhysicalDeskPlacement = Readonly<{
  bankItemId: string;
  placementType: LiveLayoutWorkspacePlacementType;
  zoneId: LiveLayoutZoneId | null;
  slotPosition: number;
}>;

export type PhysicalDeskPresentation = Readonly<{
  headlineTitleColor: string | null;
  latestZonePlacement: MatchdayEditorialProfileLatestZonePlacement;
  latestZoneTitle: string;
  videoModuleActive: boolean;
}>;

export type PhysicalDeskMemory = Readonly<{
  bankItemId: string;
  memoryKind: LiveLayoutWorkspaceMemory["memoryKind"];
  recordedAt: string | null;
}>;

export type PhysicalDeskSnapshot = Readonly<{
  zones: readonly PhysicalDeskZone[];
  blocks: readonly MatchdayLiveLayoutBlock[];
  placements: readonly PhysicalDeskPlacement[];
  faixaSlotCount: number;
  bankItems: readonly LiveLayoutWorkspaceBankItem[];
  explicitBankItemIds: readonly string[];
  displacedBankItemIds: readonly string[];
  workedBankItemIds: readonly string[];
  memory: readonly PhysicalDeskMemory[];
  faixaArrivalBankItemIds: readonly string[];
  displacedArrivalBankItemIds: readonly string[];
  presentation: PhysicalDeskPresentation;
}>;

export type PhysicalDeskState = Readonly<{
  matchdayId: string;
  physicalStateToken: string;
  physicalCutover: LiveLayoutPhysicalCutover | null;
  baseline: PhysicalDeskSnapshot;
  current: PhysicalDeskSnapshot;
  history: readonly PhysicalDeskSnapshot[];
  selectedBankItemIds: readonly string[];
}>;

export type PhysicalDeskSlotTarget =
  | Readonly<{
      placementType: "zone";
      zoneId: LiveLayoutZoneId;
      slotPosition: number;
    }>
  | Readonly<{
      placementType: "opening" | "faixa" | "selection" | "video_highlight";
      zoneId: null;
      slotPosition: number;
    }>;

export type PhysicalDeskZoneSlot = Readonly<{
  zoneId: LiveLayoutZoneId;
  slotPosition: number;
  placement: PhysicalDeskPlacement | null;
}>;

export type PhysicalDeskFaixaSlot = Readonly<{
  slotPosition: number;
  placement: PhysicalDeskPlacement | null;
}>;

function stateError(code: string): never {
  throw new Error(`matchday-live-layout-desk-state-${code}`);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort();
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function placementKey(
  placement: Pick<PhysicalDeskPlacement, "placementType" | "zoneId" | "slotPosition">,
): string {
  return `${placement.placementType}\u0000${placement.zoneId ?? ""}\u0000${placement.slotPosition}`;
}

function sortPlacements(
  placements: readonly PhysicalDeskPlacement[],
): readonly PhysicalDeskPlacement[] {
  return [...placements].sort((left, right) => (
    left.placementType.localeCompare(right.placementType)
    || (left.zoneId ?? "").localeCompare(right.zoneId ?? "")
    || left.slotPosition - right.slotPosition
    || left.bankItemId.localeCompare(right.bankItemId)
  ));
}

function sortBlocks(
  blocks: readonly MatchdayLiveLayoutBlock[],
): readonly MatchdayLiveLayoutBlock[] {
  return [...blocks].sort((left, right) => left.sortOrder - right.sortOrder);
}

function synchronizeMemory(
  snapshot: PhysicalDeskSnapshot,
): readonly PhysicalDeskMemory[] {
  const unavailable = new Set([
    ...snapshot.placements.map((placement) => placement.bankItemId),
    ...snapshot.explicitBankItemIds,
  ]);
  const displaced = new Set(snapshot.displacedBankItemIds);
  const preserved = snapshot.memory.filter((item) => (
    !unavailable.has(item.bankItemId)
    && !displaced.has(item.bankItemId)
    && item.memoryKind === "legacy_unknown"
  ));
  const previousDisplaced = new Map(snapshot.memory
    .filter((item) => item.memoryKind === "displaced")
    .map((item) => [item.bankItemId, item] as const));
  return [
    ...preserved,
    ...snapshot.displacedBankItemIds.map((bankItemId) => ({
      bankItemId,
      memoryKind: "displaced" as const,
      recordedAt: previousDisplaced.get(bankItemId)?.recordedAt ?? null,
    })),
  ].sort((left, right) => left.bankItemId.localeCompare(right.bankItemId));
}

function validateSnapshot(snapshot: PhysicalDeskSnapshot): PhysicalDeskSnapshot {
  const zoneIds = new Set<LiveLayoutZoneId>();
  for (const zone of snapshot.zones) {
    if (zoneIds.has(zone.id)) stateError("zone-duplicate");
    if (!zone.publicTitle.trim()) stateError("zone-public-title-empty");
    if (zone.capacity !== editorialVisualFamilyCapacity(zone.visualFamily)) {
      stateError("zone-capacity-inconsistent");
    }
    zoneIds.add(zone.id);
  }

  const bankItemIds = new Set(snapshot.bankItems.map((item) => item.id));
  if (bankItemIds.size !== snapshot.bankItems.length) stateError("bank-item-duplicate");

  const placedBankItemIds = new Set<string>();
  const occupiedTargets = new Set<string>();
  if (!Number.isInteger(snapshot.faixaSlotCount) || snapshot.faixaSlotCount < 0) {
    stateError("faixa-slot-count-invalid");
  }
  for (const placement of snapshot.placements) {
    if (!bankItemIds.has(placement.bankItemId)) stateError("placement-bank-item-unknown");
    if (placedBankItemIds.has(placement.bankItemId)) stateError("placement-bank-item-duplicate");
    if (!Number.isInteger(placement.slotPosition) || placement.slotPosition <= 0) {
      stateError("placement-slot-invalid");
    }
    if (placement.placementType === "zone") {
      if (placement.zoneId === null) stateError("placement-zone-missing");
      const zone = snapshot.zones.find((candidate) => candidate.id === placement.zoneId);
      if (!zone || placement.slotPosition > zone.capacity) {
        stateError("placement-zone-slot-invalid");
      }
    } else if (placement.zoneId !== null) {
      stateError("placement-zone-shape-invalid");
    }
    if (placement.placementType === "opening" && placement.slotPosition > 5) {
      stateError("placement-opening-slot-invalid");
    }
    if (placement.placementType === "selection" && placement.slotPosition > 4) {
      stateError("placement-selection-slot-invalid");
    }
    if (placement.placementType === "video_highlight" && placement.slotPosition !== 1) {
      stateError("placement-video-slot-invalid");
    }
    if (
      placement.placementType === "faixa"
      && placement.slotPosition > snapshot.faixaSlotCount
    ) {
      stateError("placement-faixa-slot-invalid");
    }

    const target = placementKey(placement);
    if (occupiedTargets.has(target)) stateError("placement-target-duplicate");
    occupiedTargets.add(target);
    placedBankItemIds.add(placement.bankItemId);
  }

  const explicit = new Set(snapshot.explicitBankItemIds);
  const displaced = new Set(snapshot.displacedBankItemIds);
  const worked = new Set(snapshot.workedBankItemIds);
  if (explicit.size !== snapshot.explicitBankItemIds.length) {
    stateError("explicit-bank-duplicate");
  }
  if (displaced.size !== snapshot.displacedBankItemIds.length) {
    stateError("displaced-duplicate");
  }
  if (worked.size !== snapshot.workedBankItemIds.length) {
    stateError("worked-duplicate");
  }
  for (const id of [...explicit, ...displaced, ...worked]) {
    if (!bankItemIds.has(id)) stateError("bank-state-item-unknown");
  }
  for (const id of explicit) {
    if (placedBankItemIds.has(id) || displaced.has(id)) stateError("explicit-bank-conflict");
  }
  for (const id of displaced) {
    if (placedBankItemIds.has(id)) stateError("displaced-placement-conflict");
  }

  const memoryBankItemIds = new Set<string>();
  for (const memory of snapshot.memory) {
    if (!bankItemIds.has(memory.bankItemId)) stateError("memory-bank-item-unknown");
    if (memoryBankItemIds.has(memory.bankItemId)) stateError("memory-bank-item-duplicate");
    if (placedBankItemIds.has(memory.bankItemId) || explicit.has(memory.bankItemId)) {
      stateError("memory-placement-conflict");
    }
    if (
      (memory.memoryKind === "displaced")
      !== displaced.has(memory.bankItemId)
    ) {
      stateError("memory-displaced-inconsistent");
    }
    memoryBankItemIds.add(memory.bankItemId);
  }
  for (const id of displaced) {
    if (!memoryBankItemIds.has(id)) stateError("memory-displaced-missing");
  }

  const faixaArrivals = new Set(snapshot.faixaArrivalBankItemIds);
  const displacedArrivals = new Set(snapshot.displacedArrivalBankItemIds);
  if (faixaArrivals.size !== snapshot.faixaArrivalBankItemIds.length) {
    stateError("faixa-arrival-duplicate");
  }
  if (displacedArrivals.size !== snapshot.displacedArrivalBankItemIds.length) {
    stateError("displaced-arrival-duplicate");
  }
  for (const id of faixaArrivals) {
    if (
      !bankItemIds.has(id)
      || !snapshot.placements.some((placement) => (
        placement.bankItemId === id && placement.placementType === "faixa"
      ))
    ) {
      stateError("faixa-arrival-state-invalid");
    }
  }
  for (const id of displacedArrivals) {
    if (!bankItemIds.has(id) || !displaced.has(id)) {
      stateError("displaced-arrival-state-invalid");
    }
  }

  const blockZoneIds = new Set<LiveLayoutZoneId>();
  const blockIds = new Set<string>();
  const blockOrders = new Set<number>();
  for (const block of snapshot.blocks) {
    if (blockIds.has(block.id)) stateError("block-id-duplicate");
    if (!Number.isInteger(block.sortOrder) || block.sortOrder <= 0) {
      stateError("block-order-invalid");
    }
    blockIds.add(block.id);
    if (blockOrders.has(block.sortOrder)) stateError("block-order-duplicate");
    blockOrders.add(block.sortOrder);
    if (block.kind === "zone") {
      if (!zoneIds.has(block.zoneId) || blockZoneIds.has(block.zoneId)) {
        stateError("block-zone-invalid");
      }
      blockZoneIds.add(block.zoneId);
    }
  }
  if (blockZoneIds.size !== zoneIds.size) stateError("block-zone-missing");

  return {
    ...snapshot,
    zones: [...snapshot.zones],
    blocks: sortBlocks(snapshot.blocks),
    placements: sortPlacements(snapshot.placements),
    explicitBankItemIds: uniqueSorted(snapshot.explicitBankItemIds),
    displacedBankItemIds: uniqueSorted(snapshot.displacedBankItemIds),
    workedBankItemIds: uniqueSorted(snapshot.workedBankItemIds),
    faixaArrivalBankItemIds: [...snapshot.faixaArrivalBankItemIds],
    displacedArrivalBankItemIds: [...snapshot.displacedArrivalBankItemIds],
  };
}

export function createPhysicalDeskState(
  workspace: LiveLayoutWorkspaceState,
  legacyBootstrapPresentation?: PhysicalDeskPresentation,
): PhysicalDeskState {
  const faixaSlotCount = workspace.workspaceSettings?.faixaSlotCount
    ?? workspace.placements.reduce((maximum, placement) => (
      placement.placementType === "faixa"
        ? Math.max(maximum, placement.slotPosition)
        : maximum
    ), 0);
  const presentation: PhysicalDeskPresentation = workspace.workspaceSettings
    ? {
        headlineTitleColor: workspace.workspaceSettings.headlineTitleColor,
        latestZonePlacement: workspace.workspaceSettings.latestZonePlacement,
        latestZoneTitle: workspace.workspaceSettings.latestZoneTitle,
        videoModuleActive: workspace.workspaceSettings.videoModuleActive,
      }
    : legacyBootstrapPresentation ?? stateError("legacy-bootstrap-presentation-missing");
  const snapshot = validateSnapshot({
    zones: workspace.zones.map((zone) => ({
      id: zone.id,
      publicTitle: zone.publicTitle,
      visualFamily: zone.visualFamily,
      capacity: zone.capacity,
    })),
    blocks: workspace.blocks,
    placements: workspace.placements.map((placement) => ({
      bankItemId: placement.bankItemId,
      placementType: placement.placementType,
      zoneId: placement.zoneId,
      slotPosition: placement.slotPosition,
    })),
    faixaSlotCount,
    bankItems: workspace.bankItems,
    explicitBankItemIds: workspace.explicitBankItemIds,
    displacedBankItemIds: workspace.displacedBankItemIds,
    workedBankItemIds: workspace.workedBankItemIds,
    memory: workspace.memory,
    faixaArrivalBankItemIds: [],
    displacedArrivalBankItemIds: [],
    presentation,
  });

  return {
    matchdayId: workspace.matchdayId,
    physicalStateToken: workspace.stateToken,
    physicalCutover: workspace.physicalCutover,
    baseline: snapshot,
    current: snapshot,
    history: [],
    selectedBankItemIds: [],
  };
}

export function physicalDeskHasChanges(state: PhysicalDeskState): boolean {
  return !sameJson(state.current, state.baseline);
}

export function physicalDeskPlacementForBankItem(
  state: PhysicalDeskState,
  bankItemId: string,
): PhysicalDeskPlacement | null {
  return state.current.placements.find((placement) => (
    placement.bankItemId === bankItemId
  )) ?? null;
}

export function physicalDeskZoneSlots(
  state: PhysicalDeskState,
  zoneId: LiveLayoutZoneId,
): readonly PhysicalDeskZoneSlot[] {
  const zone = state.current.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) return stateError("zone-unknown");
  return Array.from({ length: zone.capacity }, (_, index) => {
    const slotPosition = index + 1;
    return {
      zoneId,
      slotPosition,
      placement: state.current.placements.find((placement) => (
        placement.placementType === "zone"
        && placement.zoneId === zoneId
        && placement.slotPosition === slotPosition
      )) ?? null,
    };
  });
}

export function physicalDeskPlacementsOfType(
  state: PhysicalDeskState,
  placementType: Exclude<LiveLayoutWorkspacePlacementType, "zone">,
): readonly PhysicalDeskPlacement[] {
  return state.current.placements
    .filter((placement) => placement.placementType === placementType)
    .sort((left, right) => left.slotPosition - right.slotPosition);
}

export function physicalDeskFaixaSlots(
  state: PhysicalDeskState,
): readonly PhysicalDeskFaixaSlot[] {
  return Array.from({ length: state.current.faixaSlotCount }, (_, index) => {
    const slotPosition = index + 1;
    return {
      slotPosition,
      placement: state.current.placements.find((placement) => (
        placement.placementType === "faixa"
        && placement.slotPosition === slotPosition
      )) ?? null,
    };
  });
}

function commitSnapshot(
  state: PhysicalDeskState,
  nextValue: PhysicalDeskSnapshot,
  workedBankItemIds: readonly string[] = [],
): PhysicalDeskState {
  const nextValueWithWorked = {
    ...nextValue,
    workedBankItemIds: uniqueSorted([
      ...nextValue.workedBankItemIds,
      ...workedBankItemIds,
    ]),
  };
  const next = validateSnapshot({
    ...nextValueWithWorked,
    memory: synchronizeMemory(nextValueWithWorked),
  });
  return {
    ...state,
    current: next,
    history: [...state.history, state.current],
    selectedBankItemIds: [],
  };
}

function assertKnownBankItem(snapshot: PhysicalDeskSnapshot, bankItemId: string): void {
  if (!snapshot.bankItems.some((item) => item.id === bankItemId)) {
    stateError("bank-item-unknown");
  }
}

function withoutBankItem(
  placements: readonly PhysicalDeskPlacement[],
  bankItemId: string,
): readonly PhysicalDeskPlacement[] {
  return placements.filter((placement) => placement.bankItemId !== bankItemId);
}

function prependArrival(values: readonly string[], bankItemId: string): readonly string[] {
  return [bankItemId, ...values.filter((candidate) => candidate !== bankItemId)];
}

function withoutArrival(values: readonly string[], bankItemId: string): readonly string[] {
  return values.filter((candidate) => candidate !== bankItemId);
}

function withPlacement(
  state: PhysicalDeskState,
  bankItemId: string,
  target: PhysicalDeskSlotTarget,
): PhysicalDeskState {
  const current = state.current;
  assertKnownBankItem(current, bankItemId);
  const source = current.placements.find((placement) => placement.bankItemId === bankItemId) ?? null;
  if (source && placementKey(source) === placementKey(target)) return state;

  if (target.placementType === "zone") {
    const zone = current.zones.find((candidate) => candidate.id === target.zoneId);
    if (!zone || target.slotPosition > zone.capacity || target.slotPosition <= 0) {
      return stateError("target-zone-slot-invalid");
    }
  }

  const targetPlacement = current.placements.find((placement) => (
    placementKey(placement) === placementKey(target)
  )) ?? null;
  let placements = withoutBankItem(current.placements, bankItemId);
  let displaced: readonly string[] = current.displacedBankItemIds.filter((id) => id !== bankItemId);
  let explicit: readonly string[] = current.explicitBankItemIds.filter((id) => id !== bankItemId);
  let displacedArrivals: readonly string[] = withoutArrival(current.displacedArrivalBankItemIds, bankItemId);
  let faixaArrivals: readonly string[] = target.placementType === "faixa" && source?.placementType !== "faixa"
    ? prependArrival(current.faixaArrivalBankItemIds, bankItemId)
    : source?.placementType === "faixa" && target.placementType !== "faixa"
      ? withoutArrival(current.faixaArrivalBankItemIds, bankItemId)
      : current.faixaArrivalBankItemIds;

  const sameSurfaceSwap = Boolean(
    source
    && targetPlacement
    && source.placementType === target.placementType
    && source.zoneId === target.zoneId,
  );

  if (targetPlacement && targetPlacement.bankItemId !== bankItemId) {
    placements = withoutBankItem(placements, targetPlacement.bankItemId);
    if (sameSurfaceSwap && source) {
      placements = [...placements, {
        bankItemId: targetPlacement.bankItemId,
        placementType: source.placementType,
        zoneId: source.zoneId,
        slotPosition: source.slotPosition,
      }];
    } else {
      displaced = uniqueSorted([...displaced, targetPlacement.bankItemId]);
      explicit = explicit.filter((id) => id !== targetPlacement.bankItemId);
      displacedArrivals = prependArrival(displacedArrivals, targetPlacement.bankItemId);
      faixaArrivals = withoutArrival(faixaArrivals, targetPlacement.bankItemId);
    }
  }

  placements = [...placements, { bankItemId, ...target }];
  return commitSnapshot(state, {
    ...current,
    placements,
    faixaSlotCount: target.placementType === "faixa"
      ? Math.max(current.faixaSlotCount, target.slotPosition)
      : current.faixaSlotCount,
    explicitBankItemIds: explicit,
    displacedBankItemIds: displaced,
    faixaArrivalBankItemIds: faixaArrivals,
    displacedArrivalBankItemIds: displacedArrivals,
  }, [
    bankItemId,
    ...(targetPlacement && targetPlacement.bankItemId !== bankItemId
      ? [targetPlacement.bankItemId]
      : []),
  ]);
}

export function movePhysicalDeskItemToSlot(
  state: PhysicalDeskState,
  bankItemId: string,
  target: PhysicalDeskSlotTarget,
): PhysicalDeskState {
  return withPlacement(state, bankItemId, target);
}

export function movePhysicalDeskItemToFaixaTop(
  state: PhysicalDeskState,
  bankItemId: string,
): PhysicalDeskState {
  const current = state.current;
  assertKnownBankItem(current, bankItemId);
  const source = physicalDeskPlacementForBankItem(state, bankItemId);
  const remaining = withoutBankItem(current.placements, bankItemId);
  const placements = remaining.map((placement) => (
    placement.placementType === "faixa"
      ? { ...placement, slotPosition: placement.slotPosition + 1 }
      : placement
  ));
  return commitSnapshot(state, {
    ...current,
    placements: [...placements, {
      bankItemId,
      placementType: "faixa",
      zoneId: null,
      slotPosition: 1,
    }],
    faixaSlotCount: source?.placementType === "faixa"
      ? current.faixaSlotCount
      : current.faixaSlotCount + 1,
    explicitBankItemIds: current.explicitBankItemIds.filter((id) => id !== bankItemId),
    displacedBankItemIds: current.displacedBankItemIds.filter((id) => id !== bankItemId),
    faixaArrivalBankItemIds: source?.placementType === "faixa"
      ? current.faixaArrivalBankItemIds
      : prependArrival(current.faixaArrivalBankItemIds, bankItemId),
    displacedArrivalBankItemIds: withoutArrival(
      current.displacedArrivalBankItemIds,
      bankItemId,
    ),
  }, [bankItemId]);
}

export function movePhysicalDeskItemToBank(
  state: PhysicalDeskState,
  bankItemId: string,
): PhysicalDeskState {
  const current = state.current;
  assertKnownBankItem(current, bankItemId);
  return commitSnapshot(state, {
    ...current,
    placements: withoutBankItem(current.placements, bankItemId),
    explicitBankItemIds: uniqueSorted([...current.explicitBankItemIds, bankItemId]),
    displacedBankItemIds: current.displacedBankItemIds.filter((id) => id !== bankItemId),
    faixaArrivalBankItemIds: withoutArrival(current.faixaArrivalBankItemIds, bankItemId),
    displacedArrivalBankItemIds: withoutArrival(
      current.displacedArrivalBankItemIds,
      bankItemId,
    ),
  }, [bankItemId]);
}

export function movePhysicalDeskItemToDisplaced(
  state: PhysicalDeskState,
  bankItemId: string,
): PhysicalDeskState {
  const current = state.current;
  assertKnownBankItem(current, bankItemId);
  return commitSnapshot(state, {
    ...current,
    placements: withoutBankItem(current.placements, bankItemId),
    explicitBankItemIds: current.explicitBankItemIds.filter((id) => id !== bankItemId),
    displacedBankItemIds: uniqueSorted([...current.displacedBankItemIds, bankItemId]),
    faixaArrivalBankItemIds: withoutArrival(current.faixaArrivalBankItemIds, bankItemId),
    displacedArrivalBankItemIds: prependArrival(
      current.displacedArrivalBankItemIds,
      bankItemId,
    ),
  }, [bankItemId]);
}

export function releasePhysicalDeskItem(
  state: PhysicalDeskState,
  bankItemId: string,
): PhysicalDeskState {
  const current = state.current;
  assertKnownBankItem(current, bankItemId);
  return commitSnapshot(state, {
    ...current,
    placements: withoutBankItem(current.placements, bankItemId),
    explicitBankItemIds: current.explicitBankItemIds.filter((id) => id !== bankItemId),
    displacedBankItemIds: current.displacedBankItemIds.filter((id) => id !== bankItemId),
    faixaArrivalBankItemIds: withoutArrival(current.faixaArrivalBankItemIds, bankItemId),
    displacedArrivalBankItemIds: withoutArrival(
      current.displacedArrivalBankItemIds,
      bankItemId,
    ),
  }, [bankItemId]);
}

export function bulkMovePhysicalDeskItemsToZone(
  state: PhysicalDeskState,
  bankItemIds: readonly string[],
  zoneId: LiveLayoutZoneId,
  startPosition: number,
): PhysicalDeskState {
  const uniqueIds = Array.from(new Set(bankItemIds));
  if (uniqueIds.length !== bankItemIds.length || uniqueIds.length === 0) {
    return stateError("bulk-selection-invalid");
  }
  const current = state.current;
  const zone = current.zones.find((candidate) => candidate.id === zoneId);
  if (
    !zone
    || !Number.isInteger(startPosition)
    || startPosition <= 0
    || startPosition + uniqueIds.length - 1 > zone.capacity
  ) {
    return stateError("bulk-target-invalid");
  }
  for (const id of uniqueIds) assertKnownBankItem(current, id);

  const selected = new Set(uniqueIds);
  const targetPositions = new Set(uniqueIds.map((_, index) => startPosition + index));
  const displacedTargets = current.placements.filter((placement) => (
    placement.placementType === "zone"
    && placement.zoneId === zoneId
    && targetPositions.has(placement.slotPosition)
    && !selected.has(placement.bankItemId)
  ));
  const removed = new Set([
    ...uniqueIds,
    ...displacedTargets.map((placement) => placement.bankItemId),
  ]);
  const placements: PhysicalDeskPlacement[] = [
    ...current.placements.filter((placement) => !removed.has(placement.bankItemId)),
    ...uniqueIds.map((bankItemId, index) => ({
      bankItemId,
      placementType: "zone" as const,
      zoneId,
      slotPosition: startPosition + index,
    })),
  ];
  const displacedIds = displacedTargets.map((placement) => placement.bankItemId);
  return commitSnapshot(state, {
    ...current,
    placements,
    explicitBankItemIds: current.explicitBankItemIds.filter((id) => !removed.has(id)),
    displacedBankItemIds: uniqueSorted([
      ...current.displacedBankItemIds.filter((id) => !selected.has(id)),
      ...displacedIds,
    ]),
    faixaArrivalBankItemIds: current.faixaArrivalBankItemIds.filter((id) => !removed.has(id)),
    displacedArrivalBankItemIds: displacedIds.reduce<readonly string[]>(
      (arrivals, id) => prependArrival(arrivals, id),
      current.displacedArrivalBankItemIds.filter((id) => !selected.has(id)),
    ),
  }, [...uniqueIds, ...displacedIds]);
}

export function bulkMovePhysicalDeskItemsToBank(
  state: PhysicalDeskState,
  bankItemIds: readonly string[],
): PhysicalDeskState {
  const uniqueIds = Array.from(new Set(bankItemIds));
  if (uniqueIds.length !== bankItemIds.length || uniqueIds.length === 0) {
    return stateError("bulk-selection-invalid");
  }
  for (const id of uniqueIds) assertKnownBankItem(state.current, id);
  const selected = new Set(uniqueIds);
  return commitSnapshot(state, {
    ...state.current,
    placements: state.current.placements.filter((placement) => !selected.has(placement.bankItemId)),
    explicitBankItemIds: uniqueSorted([...state.current.explicitBankItemIds, ...uniqueIds]),
    displacedBankItemIds: state.current.displacedBankItemIds.filter((id) => !selected.has(id)),
    faixaArrivalBankItemIds: state.current.faixaArrivalBankItemIds.filter((id) => !selected.has(id)),
    displacedArrivalBankItemIds: state.current.displacedArrivalBankItemIds.filter((id) => !selected.has(id)),
  }, uniqueIds);
}

export function bulkMovePhysicalDeskItemsToFaixa(
  state: PhysicalDeskState,
  bankItemIds: readonly string[],
  startPosition: number,
): PhysicalDeskState {
  const uniqueIds = Array.from(new Set(bankItemIds));
  if (
    uniqueIds.length !== bankItemIds.length
    || uniqueIds.length === 0
    || !Number.isInteger(startPosition)
    || startPosition <= 0
  ) {
    return stateError("bulk-target-invalid");
  }
  for (const id of uniqueIds) assertKnownBankItem(state.current, id);
  const selected = new Set(uniqueIds);
  if (startPosition > state.current.faixaSlotCount + 1) {
    return stateError("bulk-target-invalid");
  }
  const targetPositions = new Set(
    uniqueIds.map((_, index) => startPosition + index),
  );
  const displacedTargets = state.current.placements.filter((placement) => (
    placement.placementType === "faixa"
    && targetPositions.has(placement.slotPosition)
    && !selected.has(placement.bankItemId)
  ));
  const removed = new Set([
    ...uniqueIds,
    ...displacedTargets.map((placement) => placement.bankItemId),
  ]);
  const placements: PhysicalDeskPlacement[] = [
    ...state.current.placements.filter((placement) => !removed.has(placement.bankItemId)),
    ...uniqueIds.map((bankItemId, index) => ({
      bankItemId,
      placementType: "faixa" as const,
      zoneId: null,
      slotPosition: startPosition + index,
    })),
  ];
  const arrivals = [...uniqueIds].reverse().reduce<readonly string[]>(
    (current, id) => prependArrival(current, id),
    state.current.faixaArrivalBankItemIds,
  );
  return commitSnapshot(state, {
    ...state.current,
    placements,
    faixaSlotCount: Math.max(
      state.current.faixaSlotCount,
      startPosition + uniqueIds.length - 1,
    ),
    explicitBankItemIds: state.current.explicitBankItemIds.filter((id) => !removed.has(id)),
    displacedBankItemIds: uniqueSorted([
      ...state.current.displacedBankItemIds.filter((id) => !selected.has(id)),
      ...displacedTargets.map((placement) => placement.bankItemId),
    ]),
    faixaArrivalBankItemIds: arrivals,
    displacedArrivalBankItemIds: displacedTargets.reduce<readonly string[]>(
      (values, placement) => prependArrival(values, placement.bankItemId),
      state.current.displacedArrivalBankItemIds.filter((id) => !selected.has(id)),
    ),
  }, [...uniqueIds, ...displacedTargets.map((placement) => placement.bankItemId)]);
}

export function changePhysicalDeskZone(
  state: PhysicalDeskState,
  zoneId: LiveLayoutZoneId,
  change: Readonly<{
    publicTitle?: string;
    visualFamily?: EditorialVisualFamily;
  }>,
): PhysicalDeskState {
  const current = state.current;
  const zone = current.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) return stateError("zone-unknown");
  const publicTitle = change.publicTitle === undefined
    ? zone.publicTitle
    : change.publicTitle.trim();
  if (!publicTitle) return stateError("zone-public-title-empty");
  if (publicTitle.length > 120) return stateError("zone-public-title-too-long");
  const visualFamily = change.visualFamily ?? zone.visualFamily;
  const capacity = editorialVisualFamilyCapacity(visualFamily);
  if (current.placements.some((placement) => (
    placement.placementType === "zone"
    && placement.zoneId === zoneId
    && placement.slotPosition > capacity
  ))) {
    return stateError("zone-layout-shrink-occupied");
  }
  if (
    publicTitle === zone.publicTitle
    && visualFamily === zone.visualFamily
  ) {
    return state;
  }
  return commitSnapshot(state, {
    ...current,
    zones: current.zones.map((candidate) => candidate.id === zoneId
      ? { ...candidate, publicTitle, visualFamily, capacity }
      : candidate),
  });
}

export function movePhysicalDeskBlock(
  state: PhysicalDeskState,
  block: MatchdayLiveLayoutBlock,
  direction: "up" | "down",
): PhysicalDeskState {
  const blocks = sortBlocks(state.current.blocks);
  const index = blocks.findIndex((candidate) => candidate.id === block.id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= blocks.length) return state;
  const target = blocks[targetIndex];
  const nextBlocks = blocks.map((candidate, candidateIndex) => {
    if (candidateIndex === index) return { ...candidate, sortOrder: target.sortOrder };
    if (candidateIndex === targetIndex) return { ...candidate, sortOrder: blocks[index].sortOrder };
    return candidate;
  });
  return commitSnapshot(state, { ...state.current, blocks: nextBlocks });
}

export function changePhysicalDeskPresentation(
  state: PhysicalDeskState,
  change: Partial<PhysicalDeskPresentation>,
): PhysicalDeskState {
  const presentation = { ...state.current.presentation, ...change };
  if (sameJson(state.current.presentation, presentation)) return state;
  return commitSnapshot(state, {
    ...state.current,
    presentation,
  });
}

export function togglePhysicalDeskSelection(
  state: PhysicalDeskState,
  bankItemId: string,
): PhysicalDeskState {
  assertKnownBankItem(state.current, bankItemId);
  return {
    ...state,
    selectedBankItemIds: state.selectedBankItemIds.includes(bankItemId)
      ? state.selectedBankItemIds.filter((candidate) => candidate !== bankItemId)
      : [...state.selectedBankItemIds, bankItemId],
  };
}

export function selectPhysicalDeskItems(
  state: PhysicalDeskState,
  bankItemIds: readonly string[],
): PhysicalDeskState {
  for (const id of bankItemIds) assertKnownBankItem(state.current, id);
  return { ...state, selectedBankItemIds: uniqueSorted(bankItemIds) };
}

export function undoPhysicalDeskState(state: PhysicalDeskState): PhysicalDeskState {
  const previous = state.history.at(-1);
  if (!previous) return state;
  return {
    ...state,
    current: previous,
    history: state.history.slice(0, -1),
    selectedBankItemIds: [],
  };
}

export function resetPhysicalDeskState(state: PhysicalDeskState): PhysicalDeskState {
  if (!physicalDeskHasChanges(state)) return state;
  return {
    ...state,
    current: state.baseline,
    history: [...state.history, state.current],
    selectedBankItemIds: [],
  };
}
