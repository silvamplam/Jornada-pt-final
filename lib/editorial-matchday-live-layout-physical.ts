import {
  EDITORIAL_VISUAL_FAMILIES,
  editorialVisualFamilyCapacity,
  type EditorialVisualFamily,
} from "@/lib/editorial-visual-families";

declare const liveLayoutZoneIdBrand: unique symbol;
declare const liveLayoutBlockIdBrand: unique symbol;

export type LiveLayoutZoneId = string & {
  readonly [liveLayoutZoneIdBrand]: true;
};

export type LiveLayoutBlockId = string & {
  readonly [liveLayoutBlockIdBrand]: true;
};

export type MatchdayLiveLayoutZoneRow = Readonly<{
  id: LiveLayoutZoneId;
  matchday_id: string;
  public_title: string;
  visual_family: EditorialVisualFamily;
}>;

export type MatchdayLiveLayoutBlockRow = Readonly<{
  id: LiveLayoutBlockId;
  matchday_id: string;
  block_type: "zone" | "latest" | "video";
  zone_id: LiveLayoutZoneId | null;
  sort_order: number;
}>;

export type MatchdayLiveLayoutPlacementProjectionRow = Readonly<{
  bank_item_id: string;
  source_type: string | null;
  source_id: string | null;
  classification_key?: string | null;
  placement_count: number;
  placement_type: string | null;
  zone_id: string | null;
  slot_position: number | null;
}>;

export type MatchdayLiveLayoutZoneItem = Readonly<{
  bankItemId: string;
  sourceType: string;
  sourceId: string;
  zoneId: LiveLayoutZoneId;
  slotPosition: number;
}>;

export type MatchdayLiveLayoutZone = Readonly<{
  id: LiveLayoutZoneId;
  publicTitle: string;
  visualFamily: EditorialVisualFamily;
  capacity: number;
  sortOrder: number;
  items: readonly MatchdayLiveLayoutZoneItem[];
}>;

export type MatchdayLiveLayoutBlock =
  | Readonly<{
      id: LiveLayoutBlockId;
      kind: "zone";
      zoneId: LiveLayoutZoneId;
      sortOrder: number;
    }>
  | Readonly<{
      id: LiveLayoutBlockId;
      kind: "latest";
      sortOrder: number;
    }>
  | Readonly<{
      id: LiveLayoutBlockId;
      kind: "video";
      sortOrder: number;
    }>;

export type MatchdayLiveLayoutPhysicalSnapshot = Readonly<{
  zones: readonly MatchdayLiveLayoutZone[];
  blocks: readonly MatchdayLiveLayoutBlock[];
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VISUAL_FAMILIES = new Set<string>(EDITORIAL_VISUAL_FAMILIES);

function snapshotError(code: string): never {
  throw new Error(`matchday-live-layout-physical-${code}`);
}

function recordValue(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return snapshotError(code);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) return snapshotError(code);
  return value.trim();
}

function trimmedText(value: unknown, code: string): string {
  if (typeof value !== "string") return snapshotError(code);
  return value.trim();
}

function positiveInteger(value: unknown, code: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) return snapshotError(code);
  return value as number;
}

export function parseLiveLayoutZoneId(value: unknown): LiveLayoutZoneId {
  const candidate = requiredText(value, "zone-id-invalid").toLowerCase();
  if (!UUID_PATTERN.test(candidate)) return snapshotError("zone-id-invalid");
  return candidate as LiveLayoutZoneId;
}

export function parseLiveLayoutBlockId(value: unknown): LiveLayoutBlockId {
  const candidate = requiredText(value, "block-id-invalid").toLowerCase();
  if (!UUID_PATTERN.test(candidate)) return snapshotError("block-id-invalid");
  return candidate as LiveLayoutBlockId;
}

export function parseMatchdayLiveLayoutZoneRow(
  value: unknown,
): MatchdayLiveLayoutZoneRow {
  const row = recordValue(value, "zone-row-invalid");
  const visualFamily = requiredText(
    row.visual_family,
    "zone-visual-family-invalid",
  );
  if (!VISUAL_FAMILIES.has(visualFamily)) {
    return snapshotError("zone-visual-family-invalid");
  }

  const publicTitle = trimmedText(
    row.public_title,
    "zone-public-title-invalid",
  );

  if (publicTitle.length > 120) {
    return snapshotError("zone-public-title-invalid");
  }

  return {
    id: parseLiveLayoutZoneId(row.id),
    matchday_id: requiredText(row.matchday_id, "zone-matchday-invalid"),
    public_title: publicTitle,
    visual_family: visualFamily as EditorialVisualFamily,
  };
}

export function parseMatchdayLiveLayoutBlockRow(
  value: unknown,
): MatchdayLiveLayoutBlockRow {
  const row = recordValue(value, "block-row-invalid");
  const blockType = requiredText(row.block_type, "block-type-invalid");
  if (blockType !== "zone" && blockType !== "latest" && blockType !== "video") {
    return snapshotError("block-type-invalid");
  }

  const zoneId = blockType === "zone"
    ? parseLiveLayoutZoneId(row.zone_id)
    : row.zone_id === null
      ? null
      : snapshotError("block-zone-shape-invalid");

  return {
    id: parseLiveLayoutBlockId(row.id),
    matchday_id: requiredText(row.matchday_id, "block-matchday-invalid"),
    block_type: blockType,
    zone_id: zoneId,
    sort_order: positiveInteger(row.sort_order, "block-sort-order-invalid"),
  };
}

export function buildMatchdayLiveLayoutPhysicalSnapshot(
  matchdayId: string,
  rawZoneRows: readonly unknown[],
  rawBlockRows: readonly unknown[],
  placementRows: readonly MatchdayLiveLayoutPlacementProjectionRow[],
): MatchdayLiveLayoutPhysicalSnapshot {
  const cleanMatchdayId = requiredText(matchdayId, "matchday-invalid");
  const zoneRows = rawZoneRows.map(parseMatchdayLiveLayoutZoneRow);
  const blockRows = rawBlockRows.map(parseMatchdayLiveLayoutBlockRow);
  const zoneById = new Map<LiveLayoutZoneId, MatchdayLiveLayoutZoneRow>();

  for (const zone of zoneRows) {
    if (zone.matchday_id !== cleanMatchdayId) {
      return snapshotError("zone-matchday-mismatch");
    }
    if (zoneById.has(zone.id)) return snapshotError("zone-duplicate");
    zoneById.set(zone.id, zone);
  }

  const sortOrders = new Set<number>();
  const blockIds = new Set<LiveLayoutBlockId>();
  const zoneBlockCounts = new Map<LiveLayoutZoneId, number>();
  const zoneSortOrders = new Map<LiveLayoutZoneId, number>();
  let latestCount = 0;
  let videoCount = 0;

  for (const block of blockRows) {
    if (block.matchday_id !== cleanMatchdayId) {
      return snapshotError("block-matchday-mismatch");
    }
    if (blockIds.has(block.id)) return snapshotError("block-id-duplicate");
    blockIds.add(block.id);
    if (sortOrders.has(block.sort_order)) {
      return snapshotError("block-sort-order-duplicate");
    }
    sortOrders.add(block.sort_order);

    if (block.block_type === "zone") {
      const zoneId = block.zone_id!;
      if (!zoneById.has(zoneId)) return snapshotError("block-zone-unknown");
      const count = (zoneBlockCounts.get(zoneId) ?? 0) + 1;
      if (count > 1) return snapshotError("zone-block-duplicate");
      zoneBlockCounts.set(zoneId, count);
      zoneSortOrders.set(zoneId, block.sort_order);
      continue;
    }

    if (block.block_type === "latest") {
      latestCount += 1;
      if (latestCount > 1) return snapshotError("latest-block-duplicate");
      continue;
    }

    videoCount += 1;
    if (videoCount > 1) return snapshotError("video-block-duplicate");
  }

  for (const zoneId of zoneById.keys()) {
    if (zoneBlockCounts.get(zoneId) !== 1) {
      return snapshotError("zone-block-missing");
    }
  }

  const itemsByZone = new Map<LiveLayoutZoneId, MatchdayLiveLayoutZoneItem[]>(
    Array.from(zoneById.keys(), (zoneId) => [zoneId, []]),
  );
  const occupiedSlots = new Set<string>();
  const placedBankItemIds = new Set<string>();
  const placedSourceIdentities = new Set<string>();

  for (const placement of placementRows) {
    if (!Number.isInteger(placement.placement_count) || placement.placement_count < 0) {
      return snapshotError("placement-count-invalid");
    }
    if (placement.placement_count > 1) {
      return snapshotError("placement-item-duplicate");
    }
    if (placement.placement_count === 0) continue;

    const bankItemId = requiredText(
      placement.bank_item_id,
      "placement-bank-item-invalid",
    ).toLowerCase();
    const sourceType = requiredText(
      placement.source_type,
      "placement-source-invalid",
    ).toLowerCase();
    const sourceId = requiredText(
      placement.source_id,
      "placement-source-invalid",
    ).toLowerCase();
    const sourceIdentity = `${sourceType}\u0000${sourceId}`;

    if (placedBankItemIds.has(bankItemId) || placedSourceIdentities.has(sourceIdentity)) {
      return snapshotError("placement-item-duplicate");
    }
    placedBankItemIds.add(bankItemId);
    placedSourceIdentities.add(sourceIdentity);

    if (placement.placement_type !== "zone") continue;

    const zoneId = parseLiveLayoutZoneId(placement.zone_id);
    const zone = zoneById.get(zoneId);
    if (!zone) return snapshotError("placement-zone-unknown");
    const slotPosition = positiveInteger(
      placement.slot_position,
      "placement-slot-invalid",
    );
    if (slotPosition > editorialVisualFamilyCapacity(zone.visual_family)) {
      return snapshotError("placement-slot-out-of-capacity");
    }

    const slotIdentity = `${zoneId}\u0000${slotPosition}`;
    if (occupiedSlots.has(slotIdentity)) {
      return snapshotError("placement-slot-duplicate");
    }
    occupiedSlots.add(slotIdentity);
    itemsByZone.get(zoneId)!.push({
      bankItemId,
      sourceType,
      sourceId,
      zoneId,
      slotPosition,
    });
  }

  const blocks: MatchdayLiveLayoutBlock[] = blockRows
    .map((block) => block.block_type === "zone"
      ? {
          id: block.id,
          kind: "zone" as const,
          zoneId: block.zone_id!,
          sortOrder: block.sort_order,
        }
      : {
          id: block.id,
          kind: block.block_type,
          sortOrder: block.sort_order,
        })
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const zones = Array.from(zoneById.values(), (zone): MatchdayLiveLayoutZone => ({
    id: zone.id,
    publicTitle: zone.public_title,
    visualFamily: zone.visual_family,
    capacity: editorialVisualFamilyCapacity(zone.visual_family),
    sortOrder: zoneSortOrders.get(zone.id)!,
    items: (itemsByZone.get(zone.id) ?? [])
      .sort((left, right) => left.slotPosition - right.slotPosition),
  })).sort((left, right) => left.sortOrder - right.sortOrder);

  return { zones, blocks };
}
