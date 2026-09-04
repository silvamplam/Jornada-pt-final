import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";
import {
  buildMatchdayLiveLayoutPhysicalSnapshot,
  parseLiveLayoutZoneId,
  type LiveLayoutZoneId,
  type MatchdayLiveLayoutBlock,
  type MatchdayLiveLayoutPlacementProjectionRow,
  type MatchdayLiveLayoutZone,
} from "@/lib/editorial-matchday-live-layout-physical";

export const LIVE_LAYOUT_WORKSPACE_PLACEMENT_TYPES = [
  "opening",
  "faixa",
  "selection",
  "video_highlight",
  "zone",
] as const;

export type LiveLayoutWorkspacePlacementType =
  (typeof LIVE_LAYOUT_WORKSPACE_PLACEMENT_TYPES)[number];

type LiveLayoutWorkspacePlacementBase = Readonly<{
  id: string;
  bankItemId: string;
  slotPosition: number;
  createdAt: string;
  updatedAt: string;
}>;

export type LiveLayoutWorkspacePlacement =
  | (LiveLayoutWorkspacePlacementBase & Readonly<{
      placementType: "zone";
      zoneId: LiveLayoutZoneId;
    }>)
  | (LiveLayoutWorkspacePlacementBase & Readonly<{
      placementType: "opening" | "faixa" | "selection" | "video_highlight";
      zoneId: null;
    }>);

export type LiveLayoutWorkspaceObservedClassification = Readonly<{
  key: ArticleClassificationKey;
  source: string;
  classifiedAt: string;
}>;

export type LiveLayoutWorkspaceBankItem = Readonly<{
  id: string;
  sourceType: string;
  sourceId: string;
  status: string;
  label: string | null;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  automaticEligible: boolean;
  editoriallyWorkedAt: string | null;
  classification: LiveLayoutWorkspaceObservedClassification | null;
  continuitySourceMatchdayId: string | null;
  continuitySourceCompositionId: string | null;
  isExplicitBank: boolean;
}>;

export type LiveLayoutWorkspaceMemory = Readonly<{
  bankItemId: string;
  memoryKind: "legacy_unknown" | "displaced";
  recordedAt: string;
}>;

export type LiveLayoutWorkspaceState = Readonly<{
  matchdayId: string;
  stateToken: string;
  zones: readonly MatchdayLiveLayoutZone[];
  blocks: readonly MatchdayLiveLayoutBlock[];
  placements: readonly LiveLayoutWorkspacePlacement[];
  bankItems: readonly LiveLayoutWorkspaceBankItem[];
  memory: readonly LiveLayoutWorkspaceMemory[];
  explicitBankItemIds: readonly string[];
  displacedBankItemIds: readonly string[];
  workedBankItemIds: readonly string[];
}>;

export type MatchdayLiveLayoutWorkspaceReaderRow = Readonly<{
  state_token: unknown;
  zones: unknown;
  blocks: unknown;
  placements: unknown;
  bank_items: unknown;
  state_memory: unknown;
  explicit_bank_item_ids: unknown;
  displaced_bank_item_ids: unknown;
  worked_bank_item_ids: unknown;
  legacy_zone_projection: unknown;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEMENT_TYPES = new Set<string>(LIVE_LAYOUT_WORKSPACE_PLACEMENT_TYPES);

function workspaceError(code: string): never {
  throw new Error(`matchday-live-layout-workspace-${code}`);
}

function recordValue(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return workspaceError(code);
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, code: string): readonly unknown[] {
  if (!Array.isArray(value)) return workspaceError(code);
  return value;
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) return workspaceError(code);
  return value.trim();
}

function optionalText(value: unknown, code: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return workspaceError(code);
  return value;
}

function uuidText(value: unknown, code: string): string {
  const candidate = requiredText(value, code).toLowerCase();
  if (!UUID_PATTERN.test(candidate)) return workspaceError(code);
  return candidate;
}

function positiveInteger(value: unknown, code: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    return workspaceError(code);
  }
  return value as number;
}

function requiredBoolean(value: unknown, code: string): boolean {
  if (typeof value !== "boolean") return workspaceError(code);
  return value;
}

function timestampText(value: unknown, code: string): string {
  const candidate = requiredText(value, code);
  if (Number.isNaN(Date.parse(candidate))) return workspaceError(code);
  return candidate;
}

function optionalTimestamp(value: unknown, code: string): string | null {
  return value === null ? null : timestampText(value, code);
}

function parseBankItem(
  value: unknown,
  matchdayId: string,
): LiveLayoutWorkspaceBankItem {
  const row = recordValue(value, "bank-item-invalid");
  if (requiredText(row.matchday_id, "bank-item-matchday-invalid") !== matchdayId) {
    return workspaceError("bank-item-matchday-mismatch");
  }

  const classificationKey = row.classification_key;
  const classificationSource = row.classification_source;
  const classifiedAt = row.classified_at;
  const classificationIsEmpty = classificationKey === null
    && classificationSource === null
    && classifiedAt === null;
  let classification: LiveLayoutWorkspaceObservedClassification | null = null;

  if (!classificationIsEmpty) {
    if (!isArticleClassificationKey(classificationKey)) {
      return workspaceError("bank-item-classification-key-invalid");
    }
    classification = {
      key: classificationKey,
      source: requiredText(
        classificationSource,
        "bank-item-classification-source-invalid",
      ),
      classifiedAt: timestampText(
        classifiedAt,
        "bank-item-classification-time-invalid",
      ),
    };
  }

  return {
    id: uuidText(row.id, "bank-item-id-invalid"),
    sourceType: requiredText(row.source_type, "bank-item-source-invalid").toLowerCase(),
    sourceId: requiredText(row.source_id, "bank-item-source-invalid").toLowerCase(),
    status: requiredText(row.status, "bank-item-status-invalid").toLowerCase(),
    label: optionalText(row.label, "bank-item-label-invalid"),
    title: requiredText(row.title, "bank-item-title-invalid"),
    subtitle: optionalText(row.subtitle, "bank-item-subtitle-invalid"),
    imageUrl: optionalText(row.image_url, "bank-item-image-invalid"),
    linkUrl: optionalText(row.link_url, "bank-item-link-invalid"),
    automaticEligible: requiredBoolean(
      row.automatic_eligible,
      "bank-item-automatic-eligible-invalid",
    ),
    editoriallyWorkedAt: optionalTimestamp(
      row.editorially_worked_at,
      "bank-item-worked-time-invalid",
    ),
    classification,
    continuitySourceMatchdayId: row.continuity_source_matchday_id === null
      ? null
      : uuidText(
          row.continuity_source_matchday_id,
          "bank-item-continuity-matchday-invalid",
        ),
    continuitySourceCompositionId: row.continuity_source_composition_id === null
      ? null
      : uuidText(
          row.continuity_source_composition_id,
          "bank-item-continuity-composition-invalid",
        ),
    isExplicitBank: requiredBoolean(
      row.is_explicit_bank,
      "bank-item-explicit-bank-invalid",
    ),
  };
}

function parsePlacement(
  value: unknown,
  matchdayId: string,
): LiveLayoutWorkspacePlacement {
  const row = recordValue(value, "placement-invalid");
  if (requiredText(row.matchday_id, "placement-matchday-invalid") !== matchdayId) {
    return workspaceError("placement-matchday-mismatch");
  }

  const placementType = requiredText(
    row.placement_type,
    "placement-type-invalid",
  );
  if (!PLACEMENT_TYPES.has(placementType)) {
    return workspaceError("placement-type-invalid");
  }

  const slotPosition = positiveInteger(row.slot_position, "placement-slot-invalid");
  if (placementType === "opening" && slotPosition > 5) {
    return workspaceError("placement-slot-invalid");
  }
  if (placementType === "selection" && slotPosition > 4) {
    return workspaceError("placement-slot-invalid");
  }
  if (placementType === "video_highlight" && slotPosition !== 1) {
    return workspaceError("placement-slot-invalid");
  }

  const base = {
    id: uuidText(row.id, "placement-id-invalid"),
    bankItemId: uuidText(row.bank_item_id, "placement-bank-item-invalid"),
    slotPosition,
    createdAt: timestampText(row.created_at, "placement-created-at-invalid"),
    updatedAt: timestampText(row.updated_at, "placement-updated-at-invalid"),
  };

  if (placementType === "zone") {
    return {
      ...base,
      placementType,
      zoneId: parseLiveLayoutZoneId(row.zone_id),
    };
  }
  if (row.zone_id !== null) return workspaceError("placement-zone-shape-invalid");

  return {
    ...base,
    placementType: placementType as Exclude<
      LiveLayoutWorkspacePlacementType,
      "zone"
    >,
    zoneId: null,
  };
}

function parseMemory(
  value: unknown,
  matchdayId: string,
): LiveLayoutWorkspaceMemory {
  const row = recordValue(value, "memory-invalid");
  if (requiredText(row.matchday_id, "memory-matchday-invalid") !== matchdayId) {
    return workspaceError("memory-matchday-mismatch");
  }
  if (row.memory_kind !== "legacy_unknown" && row.memory_kind !== "displaced") {
    return workspaceError("memory-kind-invalid");
  }
  return {
    bankItemId: uuidText(row.bank_item_id, "memory-bank-item-invalid"),
    memoryKind: row.memory_kind,
    recordedAt: timestampText(row.recorded_at, "memory-recorded-at-invalid"),
  };
}

function parseBankItemIdList(value: unknown, code: string): readonly string[] {
  const ids = arrayValue(value, code).map((id) => uuidText(id, code));
  if (new Set(ids).size !== ids.length) return workspaceError(`${code}-duplicate`);
  return [...ids].sort();
}

function assertSameIds(
  actual: readonly string[],
  expected: readonly string[],
  code: string,
): void {
  if (
    actual.length !== expected.length
    || actual.some((id, index) => id !== expected[index])
  ) {
    workspaceError(code);
  }
}

export function buildLiveLayoutWorkspaceState(
  matchdayId: string,
  raw: MatchdayLiveLayoutWorkspaceReaderRow,
): LiveLayoutWorkspaceState {
  const cleanMatchdayId = requiredText(matchdayId, "matchday-invalid");
  const stateToken = requiredText(raw.state_token, "state-token-invalid");
  const rawZones = arrayValue(raw.zones, "zones-invalid");
  const rawBlocks = arrayValue(raw.blocks, "blocks-invalid");
  const bankItems = arrayValue(raw.bank_items, "bank-items-invalid")
    .map((value) => parseBankItem(value, cleanMatchdayId))
    .sort((left, right) => left.id.localeCompare(right.id));
  const bankItemById = new Map<string, LiveLayoutWorkspaceBankItem>();
  const sourceIdentities = new Set<string>();

  for (const bankItem of bankItems) {
    if (bankItemById.has(bankItem.id)) return workspaceError("bank-item-duplicate");
    const sourceIdentity = `${bankItem.sourceType}\u0000${bankItem.sourceId}`;
    if (sourceIdentities.has(sourceIdentity)) {
      return workspaceError("bank-item-source-duplicate");
    }
    bankItemById.set(bankItem.id, bankItem);
    sourceIdentities.add(sourceIdentity);
  }

  const placements = arrayValue(raw.placements, "placements-invalid")
    .map((value) => parsePlacement(value, cleanMatchdayId));
  const placementIds = new Set<string>();
  const placedBankItemIds = new Set<string>();
  const occupiedTargets = new Set<string>();

  for (const placement of placements) {
    if (placementIds.has(placement.id)) return workspaceError("placement-id-duplicate");
    placementIds.add(placement.id);
    if (!bankItemById.has(placement.bankItemId)) {
      return workspaceError("placement-bank-item-unknown");
    }
    if (placedBankItemIds.has(placement.bankItemId)) {
      return workspaceError("placement-bank-item-duplicate");
    }
    placedBankItemIds.add(placement.bankItemId);
    const target = `${placement.placementType}\u0000${placement.zoneId ?? ""}\u0000${placement.slotPosition}`;
    if (occupiedTargets.has(target)) return workspaceError("placement-target-duplicate");
    occupiedTargets.add(target);
  }

  const placementProjection: MatchdayLiveLayoutPlacementProjectionRow[] =
    bankItems.map((bankItem) => {
      const placement = placements.find((candidate) => (
        candidate.bankItemId === bankItem.id
      ));
      return {
        bank_item_id: bankItem.id,
        source_type: bankItem.sourceType,
        source_id: bankItem.sourceId,
        classification_key: bankItem.classification?.key ?? null,
        placement_count: placement ? 1 : 0,
        placement_type: placement?.placementType ?? null,
        zone_id: placement?.zoneId ?? null,
        slot_position: placement?.slotPosition ?? null,
      };
    });
  const physicalSnapshot = buildMatchdayLiveLayoutPhysicalSnapshot(
    cleanMatchdayId,
    rawZones,
    rawBlocks,
    placementProjection,
  );

  const memory = arrayValue(raw.state_memory, "memory-list-invalid")
    .map((value) => parseMemory(value, cleanMatchdayId))
    .sort((left, right) => left.bankItemId.localeCompare(right.bankItemId));
  const memoryBankItemIds = new Set<string>();
  for (const memoryItem of memory) {
    if (!bankItemById.has(memoryItem.bankItemId)) {
      return workspaceError("memory-bank-item-unknown");
    }
    if (memoryBankItemIds.has(memoryItem.bankItemId)) {
      return workspaceError("memory-bank-item-duplicate");
    }
    if (placedBankItemIds.has(memoryItem.bankItemId)) {
      return workspaceError("memory-placement-conflict");
    }
    memoryBankItemIds.add(memoryItem.bankItemId);
  }

  const explicitBankItemIds = parseBankItemIdList(
    raw.explicit_bank_item_ids,
    "explicit-bank-item-ids-invalid",
  );
  const displacedBankItemIds = parseBankItemIdList(
    raw.displaced_bank_item_ids,
    "displaced-bank-item-ids-invalid",
  );
  const workedBankItemIds = parseBankItemIdList(
    raw.worked_bank_item_ids,
    "worked-bank-item-ids-invalid",
  );
  const expectedExplicitIds = bankItems
    .filter((item) => item.isExplicitBank)
    .map((item) => item.id)
    .sort();
  const expectedDisplacedIds = memory
    .filter((item) => item.memoryKind === "displaced")
    .map((item) => item.bankItemId)
    .sort();
  const expectedWorkedIds = bankItems
    .filter((item) => item.editoriallyWorkedAt !== null)
    .map((item) => item.id)
    .sort();

  assertSameIds(
    explicitBankItemIds,
    expectedExplicitIds,
    "explicit-bank-state-inconsistent",
  );
  assertSameIds(
    displacedBankItemIds,
    expectedDisplacedIds,
    "displaced-state-inconsistent",
  );
  assertSameIds(workedBankItemIds, expectedWorkedIds, "worked-state-inconsistent");

  for (const bankItemId of explicitBankItemIds) {
    if (placedBankItemIds.has(bankItemId) || memoryBankItemIds.has(bankItemId)) {
      return workspaceError("explicit-bank-state-conflict");
    }
  }

  const sortedPlacements = [...placements].sort((left, right) => (
    left.placementType.localeCompare(right.placementType)
    || (left.zoneId ?? "").localeCompare(right.zoneId ?? "")
    || left.slotPosition - right.slotPosition
    || left.bankItemId.localeCompare(right.bankItemId)
    || left.id.localeCompare(right.id)
  ));

  return {
    matchdayId: cleanMatchdayId,
    stateToken,
    zones: physicalSnapshot.zones,
    blocks: physicalSnapshot.blocks,
    placements: sortedPlacements,
    bankItems,
    memory,
    explicitBankItemIds,
    displacedBankItemIds,
    workedBankItemIds,
  };
}
