import {
  EDITORIAL_VISUAL_FAMILIES,
  editorialVisualFamilyCapacity,
  type EditorialVisualFamily,
} from "@/lib/editorial-visual-families";
import type {
  PhysicalDeskPresentation,
  PhysicalDeskState,
} from "@/lib/editorial-matchday-live-layout-desk-state";
import {
  LIVE_LAYOUT_WORKSPACE_PLACEMENT_TYPES,
  type LiveLayoutWorkspacePlacementType,
} from "@/lib/editorial-matchday-live-layout-workspace";

export type PhysicalDeskApplyPayload = Readonly<{
  profileKey: string;
  expectedPhysicalStateToken: string;
  latestCompanionZoneId: string | null;
  zones: readonly Readonly<{
    id: string;
    publicTitle: string;
    visualFamily: EditorialVisualFamily;
  }>[];
  blocks: readonly Readonly<{
    id: string;
    blockType: "zone" | "latest" | "video";
    zoneId: string | null;
    sortOrder: number;
  }>[];
  placements: readonly Readonly<{
    bankItemId: string;
    placementType: LiveLayoutWorkspacePlacementType;
    zoneId: string | null;
    slotPosition: number;
  }>[];
  faixaSlotCount: number;
  explicitBankItemIds: readonly string[];
  displacedBankItemIds: readonly string[];
  workedBankItemIds: readonly string[];
  faixaArrivalBankItemIds: readonly string[];
  displacedArrivalBankItemIds: readonly string[];
  presentation: Readonly<{
    headline_title_color: string | null;
    latest_zone_placement: PhysicalDeskPresentation["latestZonePlacement"];
    latest_zone_title: string;
    video_module_active: boolean;
  }>;
}>;

export type PhysicalDeskApplyRpcArguments = Readonly<{
  p_matchday_id: string;
  p_profile_key: string;
  p_expected_physical_state_token: string;
  p_latest_companion_zone_id: string | null;
  p_zones: readonly Readonly<{
    id: string;
    public_title: string;
    visual_family: EditorialVisualFamily;
  }>[];
  p_blocks: readonly Readonly<{
    id: string;
    block_type: "zone" | "latest" | "video";
    zone_id: string | null;
    sort_order: number;
  }>[];
  p_placements: readonly Readonly<{
    bank_item_id: string;
    placement_type: LiveLayoutWorkspacePlacementType;
    zone_id: string | null;
    slot_position: number;
  }>[];
  p_faixa_slot_count: number;
  p_explicit_bank_item_ids: readonly string[];
  p_displaced_bank_item_ids: readonly string[];
  p_worked_bank_item_ids: readonly string[];
  p_faixa_arrival_bank_item_ids: readonly string[];
  p_displaced_arrival_bank_item_ids: readonly string[];
  p_presentation: PhysicalDeskApplyPayload["presentation"];
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;
const VISUAL_FAMILIES = new Set<string>(EDITORIAL_VISUAL_FAMILIES);
const PLACEMENT_TYPES = new Set<string>(LIVE_LAYOUT_WORKSPACE_PLACEMENT_TYPES);

function applyError(code: string): never {
  throw new Error(`matchday-live-layout-physical-apply-${code}`);
}

function recordValue(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return applyError(code);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    applyError(code);
  }
}

function arrayValue(value: unknown, code: string): readonly unknown[] {
  if (!Array.isArray(value)) return applyError(code);
  return value;
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) return applyError(code);
  return value.trim();
}

function trimmedText(value: unknown, code: string): string {
  if (typeof value !== "string") return applyError(code);
  return value.trim();
}

function uuidText(value: unknown, code: string): string {
  const candidate = requiredText(value, code).toLowerCase();
  if (!UUID_PATTERN.test(candidate)) return applyError(code);
  return candidate;
}

function physicalStateToken(value: unknown): string {
  if (typeof value !== "string" || !STATE_TOKEN_PATTERN.test(value)) {
    return applyError("state-token-invalid");
  }
  return value;
}

function positiveInteger(value: unknown, code: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) return applyError(code);
  return value as number;
}

function nonNegativeInteger(value: unknown, code: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) return applyError(code);
  return value as number;
}

function uniqueUuidList(value: unknown, code: string): readonly string[] {
  const ids = arrayValue(value, code).map((item) => uuidText(item, code));
  if (new Set(ids).size !== ids.length) return applyError(`${code}-duplicate`);
  return ids;
}

function baselineRelativeArrivalOrder(
  baselineIds: ReadonlySet<string>,
  finalIds: ReadonlySet<string>,
  observedOrder: readonly string[],
  code: string,
): readonly string[] {
  if (
    new Set(observedOrder).size !== observedOrder.length
    || observedOrder.some((id) => !finalIds.has(id))
  ) {
    return applyError(`${code}-invalid`);
  }
  const delta = new Set(Array.from(finalIds).filter((id) => !baselineIds.has(id)));
  const orderedDelta = observedOrder.filter((id) => (
    delta.has(id) && finalIds.has(id)
  ));
  if (
    new Set(orderedDelta).size !== orderedDelta.length
    || orderedDelta.length !== delta.size
    || orderedDelta.some((id) => !delta.has(id))
  ) {
    return applyError(`${code}-incomplete`);
  }
  return orderedDelta;
}

export function buildPhysicalDeskApplyPayload(
  profileKey: string,
  physicalDesk: PhysicalDeskState,
): PhysicalDeskApplyPayload {
  const cleanProfileKey = requiredText(profileKey, "profile-key-invalid");
  const expectedPhysicalStateToken = physicalStateToken(
    physicalDesk.physicalStateToken,
  );

  const baselineFaixa = new Set(physicalDesk.baseline.placements.flatMap(
    (placement) => placement.placementType === "faixa"
      ? [placement.bankItemId]
      : [],
  ));
  const currentFaixa = new Set(physicalDesk.current.placements.flatMap(
    (placement) => placement.placementType === "faixa"
      ? [placement.bankItemId]
      : [],
  ));
  const baselineDisplaced = new Set(physicalDesk.baseline.displacedBankItemIds);
  const currentDisplaced = new Set(physicalDesk.current.displacedBankItemIds);
  const faixaArrivalBankItemIds = baselineRelativeArrivalOrder(
    baselineFaixa,
    currentFaixa,
    physicalDesk.current.faixaArrivalBankItemIds,
    "faixa-arrivals",
  );
  const displacedArrivalBankItemIds = baselineRelativeArrivalOrder(
    baselineDisplaced,
    currentDisplaced,
    physicalDesk.current.displacedArrivalBankItemIds,
    "displaced-arrivals",
  );

  if (
    !physicalDesk.current.presentation.videoModuleActive
    && physicalDesk.current.placements.some(
      (placement) => placement.placementType === "video_highlight",
    )
  ) {
    return applyError("video-highlight-inactive");
  }

  return parsePhysicalDeskApplyPayload({
    profileKey: cleanProfileKey,
    expectedPhysicalStateToken,
    latestCompanionZoneId:
      physicalDesk.current.latestCompanionZoneId,
    zones: physicalDesk.current.zones.map((zone) => ({
      id: zone.id,
      publicTitle: zone.publicTitle,
      visualFamily: zone.visualFamily,
    })),
    blocks: physicalDesk.current.blocks.map((block) => ({
      id: block.id,
      blockType: block.kind,
      zoneId: block.kind === "zone" ? block.zoneId : null,
      sortOrder: block.sortOrder,
    })),
    placements: physicalDesk.current.placements.map((placement) => ({
      bankItemId: placement.bankItemId,
      placementType: placement.placementType,
      zoneId: placement.zoneId,
      slotPosition: placement.slotPosition,
    })),
    faixaSlotCount: physicalDesk.current.faixaSlotCount,
    explicitBankItemIds: physicalDesk.current.explicitBankItemIds,
    displacedBankItemIds: physicalDesk.current.displacedBankItemIds,
    workedBankItemIds: physicalDesk.current.workedBankItemIds,
    faixaArrivalBankItemIds,
    displacedArrivalBankItemIds,
    presentation: {
      headline_title_color:
        physicalDesk.current.presentation.headlineTitleColor,
      latest_zone_placement:
        physicalDesk.current.presentation.latestZonePlacement,
      latest_zone_title:
        physicalDesk.current.presentation.latestZoneTitle,
      video_module_active:
        physicalDesk.current.presentation.videoModuleActive,
    },
  });
}

export function parsePhysicalDeskApplyPayload(
  value: unknown,
): PhysicalDeskApplyPayload {
  const input = recordValue(value, "payload-invalid");
  exactKeys(input, [
    "profileKey",
    "expectedPhysicalStateToken",
    "latestCompanionZoneId",
    "zones",
    "blocks",
    "placements",
    "faixaSlotCount",
    "explicitBankItemIds",
    "displacedBankItemIds",
    "workedBankItemIds",
    "faixaArrivalBankItemIds",
    "displacedArrivalBankItemIds",
    "presentation",
  ], "payload-shape-invalid");

  const profileKey = requiredText(input.profileKey, "profile-key-invalid");
  const expectedPhysicalStateToken = physicalStateToken(
    input.expectedPhysicalStateToken,
  );

  const zones = arrayValue(input.zones, "zones-invalid").map((value) => {
    const zone = recordValue(value, "zone-invalid");
    exactKeys(zone, ["id", "publicTitle", "visualFamily"], "zone-shape-invalid");
    const publicTitle = trimmedText(zone.publicTitle, "zone-title-invalid");
    if (publicTitle.length > 120) return applyError("zone-title-invalid");
    const visualFamily = requiredText(
      zone.visualFamily,
      "zone-visual-family-invalid",
    );
    if (!VISUAL_FAMILIES.has(visualFamily)) {
      return applyError("zone-visual-family-invalid");
    }
    return {
      id: uuidText(zone.id, "zone-id-invalid"),
      publicTitle,
      visualFamily: visualFamily as EditorialVisualFamily,
    };
  });
  const zoneIds = new Set(zones.map((zone) => zone.id));
  if (zoneIds.size !== zones.length) return applyError("zone-duplicate");

  const latestCompanionZoneId =
    input.latestCompanionZoneId === null
      ? null
      : uuidText(
          input.latestCompanionZoneId,
          "latest-companion-zone-id-invalid",
        );

  if (latestCompanionZoneId !== null) {
    const hostZone = zones.find(
      (zone) => zone.id === latestCompanionZoneId,
    );

    if (!hostZone || hostZone.visualFamily !== "four_news") {
      return applyError("latest-companion-host-invalid");
    }
  }

  const blocks = arrayValue(input.blocks, "blocks-invalid").map((value) => {
    const block = recordValue(value, "block-invalid");
    exactKeys(block, ["id", "blockType", "zoneId", "sortOrder"], "block-shape-invalid");
    const blockType = requiredText(block.blockType, "block-type-invalid");
    if (blockType !== "zone" && blockType !== "latest" && blockType !== "video") {
      return applyError("block-type-invalid");
    }
    const zoneId = blockType === "zone"
      ? uuidText(block.zoneId, "block-zone-invalid")
      : block.zoneId === null
        ? null
        : applyError("block-zone-invalid");
    if (zoneId !== null && !zoneIds.has(zoneId)) {
      return applyError("block-zone-unknown");
    }
    return {
      id: uuidText(block.id, "block-id-invalid"),
      blockType: blockType as "zone" | "latest" | "video",
      zoneId,
      sortOrder: positiveInteger(block.sortOrder, "block-sort-order-invalid"),
    };
  });
  if (new Set(blocks.map((block) => block.id)).size !== blocks.length) {
    return applyError("block-id-duplicate");
  }
  if (new Set(blocks.map((block) => block.sortOrder)).size !== blocks.length) {
    return applyError("block-sort-order-duplicate");
  }
  const zoneBlockIds = blocks.flatMap((block) => block.blockType === "zone"
    ? [block.zoneId!]
    : []);
  if (
    new Set(zoneBlockIds).size !== zoneBlockIds.length
    || zoneBlockIds.length !== zoneIds.size
    || zoneBlockIds.some((zoneId) => !zoneIds.has(zoneId))
  ) {
    return applyError("block-zone-topology-invalid");
  }
  if (blocks.filter((block) => block.blockType === "latest").length !== 1) {
    return applyError("latest-block-invalid");
  }
  if (blocks.filter((block) => block.blockType === "video").length > 1) {
    return applyError("video-block-invalid");
  }

  const faixaSlotCount = nonNegativeInteger(
    input.faixaSlotCount,
    "faixa-slot-count-invalid",
  );
  const placements = arrayValue(input.placements, "placements-invalid").map((value) => {
    const placement = recordValue(value, "placement-invalid");
    exactKeys(
      placement,
      ["bankItemId", "placementType", "zoneId", "slotPosition"],
      "placement-shape-invalid",
    );
    const placementType = requiredText(
      placement.placementType,
      "placement-type-invalid",
    );
    if (!PLACEMENT_TYPES.has(placementType)) {
      return applyError("placement-type-invalid");
    }
    const zoneId = placementType === "zone"
      ? uuidText(placement.zoneId, "placement-zone-invalid")
      : placement.zoneId === null
        ? null
        : applyError("placement-zone-invalid");
    const slotPosition = positiveInteger(
      placement.slotPosition,
      "placement-slot-invalid",
    );
    const zone = zoneId === null
      ? null
      : zones.find((candidate) => candidate.id === zoneId);
    if (placementType === "zone" && (!zone || slotPosition > editorialVisualFamilyCapacity(zone.visualFamily))) {
      return applyError("placement-zone-slot-invalid");
    }
    if (placementType === "faixa" && slotPosition > faixaSlotCount) {
      return applyError("placement-faixa-slot-invalid");
    }
    if (placementType === "opening" && slotPosition > 5) {
      return applyError("placement-opening-slot-invalid");
    }
    if (placementType === "selection" && slotPosition > 4) {
      return applyError("placement-selection-slot-invalid");
    }
    if (placementType === "video_highlight" && slotPosition !== 1) {
      return applyError("placement-video-slot-invalid");
    }
    return {
      bankItemId: uuidText(placement.bankItemId, "placement-bank-item-invalid"),
      placementType: placementType as LiveLayoutWorkspacePlacementType,
      zoneId,
      slotPosition,
    };
  });
  if (new Set(placements.map((placement) => placement.bankItemId)).size !== placements.length) {
    return applyError("placement-bank-item-duplicate");
  }
  const placementTargets = placements.map((placement) => (
    `${placement.placementType}\u0000${placement.zoneId ?? ""}\u0000${placement.slotPosition}`
  ));
  if (new Set(placementTargets).size !== placementTargets.length) {
    return applyError("placement-target-duplicate");
  }

  const explicitBankItemIds = uniqueUuidList(
    input.explicitBankItemIds,
    "explicit-bank-item-ids-invalid",
  );
  const displacedBankItemIds = uniqueUuidList(
    input.displacedBankItemIds,
    "displaced-bank-item-ids-invalid",
  );
  const workedBankItemIds = uniqueUuidList(
    input.workedBankItemIds,
    "worked-bank-item-ids-invalid",
  );
  const faixaArrivalBankItemIds = uniqueUuidList(
    input.faixaArrivalBankItemIds,
    "faixa-arrival-bank-item-ids-invalid",
  );
  const displacedArrivalBankItemIds = uniqueUuidList(
    input.displacedArrivalBankItemIds,
    "displaced-arrival-bank-item-ids-invalid",
  );
  const placedIds = new Set(placements.map((placement) => placement.bankItemId));
  if (explicitBankItemIds.some((id) => placedIds.has(id) || displacedBankItemIds.includes(id))) {
    return applyError("explicit-bank-conflict");
  }
  if (displacedBankItemIds.some((id) => placedIds.has(id))) {
    return applyError("displaced-placement-conflict");
  }
  const faixaIds = new Set(placements.flatMap((placement) => (
    placement.placementType === "faixa" ? [placement.bankItemId] : []
  )));
  if (faixaArrivalBankItemIds.some((id) => !faixaIds.has(id))) {
    return applyError("faixa-arrival-state-invalid");
  }
  if (displacedArrivalBankItemIds.some((id) => !displacedBankItemIds.includes(id))) {
    return applyError("displaced-arrival-state-invalid");
  }

  const presentation = recordValue(input.presentation, "presentation-invalid");
  exactKeys(presentation, [
    "headline_title_color",
    "latest_zone_placement",
    "latest_zone_title",
    "video_module_active",
  ], "presentation-shape-invalid");
  const headlineTitleColor = presentation.headline_title_color;
  if (
    headlineTitleColor !== null
    && (
      typeof headlineTitleColor !== "string"
      || !/^#[0-9a-f]{6}$/i.test(headlineTitleColor)
    )
  ) {
    return applyError("presentation-headline-color-invalid");
  }
  const latestZonePlacement = presentation.latest_zone_placement;
  if (
    latestZonePlacement !== "top"
    && latestZonePlacement !== "four_news"
    && latestZonePlacement !== "hidden"
  ) {
    return applyError("presentation-latest-placement-invalid");
  }
  if (
    typeof presentation.latest_zone_title !== "string"
    || presentation.latest_zone_title !== presentation.latest_zone_title.trim()
    || presentation.latest_zone_title.length > 120
  ) {
    return applyError("presentation-latest-title-invalid");
  }
  if (typeof presentation.video_module_active !== "boolean") {
    return applyError("presentation-video-active-invalid");
  }
  if (
    !presentation.video_module_active
    && placements.some((placement) => placement.placementType === "video_highlight")
  ) {
    return applyError("video-highlight-inactive");
  }

  return {
    profileKey,
    expectedPhysicalStateToken,
    latestCompanionZoneId,
    zones,
    blocks,
    placements,
    faixaSlotCount,
    explicitBankItemIds,
    displacedBankItemIds,
    workedBankItemIds,
    faixaArrivalBankItemIds,
    displacedArrivalBankItemIds,
    presentation: {
      headline_title_color: headlineTitleColor,
      latest_zone_placement: latestZonePlacement,
      latest_zone_title: presentation.latest_zone_title,
      video_module_active: presentation.video_module_active,
    },
  };
}

export function physicalDeskApplyRpcArguments(
  matchdayId: string,
  payload: PhysicalDeskApplyPayload,
): PhysicalDeskApplyRpcArguments {
  const cleanMatchdayId = uuidText(matchdayId, "matchday-id-invalid");
  return {
    p_matchday_id: cleanMatchdayId,
    p_profile_key: payload.profileKey,
    p_expected_physical_state_token: payload.expectedPhysicalStateToken,
    p_latest_companion_zone_id: payload.latestCompanionZoneId,
    p_zones: payload.zones.map((zone) => ({
      id: zone.id,
      public_title: zone.publicTitle,
      visual_family: zone.visualFamily,
    })),
    p_blocks: payload.blocks.map((block) => ({
      id: block.id,
      block_type: block.blockType,
      zone_id: block.zoneId,
      sort_order: block.sortOrder,
    })),
    p_placements: payload.placements.map((placement) => ({
      bank_item_id: placement.bankItemId,
      placement_type: placement.placementType,
      zone_id: placement.zoneId,
      slot_position: placement.slotPosition,
    })),
    p_faixa_slot_count: payload.faixaSlotCount,
    p_explicit_bank_item_ids: payload.explicitBankItemIds,
    p_displaced_bank_item_ids: payload.displacedBankItemIds,
    p_worked_bank_item_ids: payload.workedBankItemIds,
    p_faixa_arrival_bank_item_ids: payload.faixaArrivalBankItemIds,
    p_displaced_arrival_bank_item_ids: payload.displacedArrivalBankItemIds,
    p_presentation: payload.presentation,
  };
}
