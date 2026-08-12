export const REFERENCE_COMPOSITION_PRESENTATION_MODES = ["standard", "hierarchical"] as const;

export type ReferenceCompositionPresentationMode =
  (typeof REFERENCE_COMPOSITION_PRESENTATION_MODES)[number];

export const HIERARCHICAL_COMPOSITION_MOMENTS = [
  {
    key: "dominant",
    title: "Momento 1 — Jogo dominante",
    slots: [
      { key: "dominant_main", label: "Crónica dominante" },
      { key: "dominant_side_top", label: "Lateral superior" },
      { key: "dominant_side_bottom", label: "Lateral inferior" },
    ],
  },
  {
    key: "other-chronicles",
    title: "Momento 2 — Outras crónicas",
    slots: [
      { key: "other_chronicle_1", label: "Crónica 1" },
      { key: "other_chronicle_2", label: "Crónica 2" },
      { key: "other_chronicle_3", label: "Crónica 3" },
    ],
  },
  {
    key: "strong",
    title: "Momento 3 — Notícias fortes",
    slots: [
      { key: "secondary_strong_1", label: "Forte 1" },
      { key: "secondary_strong_2", label: "Forte 2" },
    ],
  },
  {
    key: "secondary",
    title: "Momento 4 — Secundárias",
    slots: [
      { key: "secondary_1", label: "Secundária 1" },
      { key: "secondary_2", label: "Secundária 2" },
      { key: "secondary_3", label: "Secundária 3" },
      { key: "secondary_4", label: "Secundária 4" },
    ],
  },
  {
    key: "closing",
    title: "Momento 5 — Fecho da Jornada",
    slots: [
      { key: "closing_1", label: "Fecho 1" },
      { key: "closing_2", label: "Fecho 2" },
      { key: "closing_3", label: "Fecho 3" },
    ],
  },
] as const;

export const HIERARCHICAL_COMPOSITION_SLOT_KEYS = HIERARCHICAL_COMPOSITION_MOMENTS.flatMap(
  (moment) => moment.slots.map((slot) => slot.key),
);

export type HierarchicalCompositionSlotKey =
  (typeof HIERARCHICAL_COMPOSITION_SLOT_KEYS)[number];

export type HierarchicalMediaKind = "embed" | "direct_video";

export type HierarchicalCompositionMediaSnapshotSource = {
  media_kind_snapshot?: string | null;
  media_embed_url_snapshot?: string | null;
  media_video_url_snapshot?: string | null;
  image_url_snapshot?: string | null;
  title_snapshot?: string | null;
};

export type HierarchicalCompositionMediaSnapshot = {
  kind: HierarchicalMediaKind;
  embedUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  title: string | null;
};

export type HierarchicalCompositionSlot = {
  id: string;
  composition_id: string;
  slot_key: HierarchicalCompositionSlotKey;
  bank_item_id: string | null;
  source_identity: string;
  label_snapshot: string | null;
  title_snapshot: string | null;
  subtitle_snapshot: string | null;
  image_url_snapshot: string | null;
  link_url_snapshot: string | null;
  media_kind_snapshot?: HierarchicalMediaKind | null;
  media_embed_url_snapshot?: string | null;
  media_video_url_snapshot?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export const HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS = [
  { sortOrder: 1, key: "dominant", label: "Dominante" },
  { sortOrder: 2, key: "secondary_1", label: "Secundária 1" },
  { sortOrder: 3, key: "secondary_2", label: "Secundária 2" },
  { sortOrder: 4, key: "secondary_3", label: "Secundária 3" },
  { sortOrder: 5, key: "secondary_4", label: "Secundária 4" },
] as const;

export type HierarchicalBeyondMatchdayPosition =
  (typeof HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS)[number];

export type HierarchicalCompositionReferenceItem = {
  slot_type: string;
  sort_order: number;
  title_snapshot: string | null;
  subtitle_snapshot: string | null;
  image_url_snapshot: string | null;
  link_url_snapshot: string | null;
  label_snapshot: string | null;
};

export function isReferenceCompositionPresentationMode(
  value?: string | null,
): value is ReferenceCompositionPresentationMode {
  return REFERENCE_COMPOSITION_PRESENTATION_MODES.includes(
    value as ReferenceCompositionPresentationMode,
  );
}

export function isHierarchicalCompositionSlotKey(
  value?: string | null,
): value is HierarchicalCompositionSlotKey {
  return HIERARCHICAL_COMPOSITION_SLOT_KEYS.includes(
    value as HierarchicalCompositionSlotKey,
  );
}

export function hierarchicalCompositionMediaSnapshot(
  item?: HierarchicalCompositionMediaSnapshotSource | null,
): HierarchicalCompositionMediaSnapshot | null {
  if (!item) return null;

  const mediaKind = item.media_kind_snapshot?.trim();
  const embedUrl = item.media_embed_url_snapshot?.trim() || null;
  const videoUrl = item.media_video_url_snapshot?.trim() || null;

  if (mediaKind === "embed" && embedUrl) {
    return {
      kind: "embed",
      embedUrl,
      videoUrl,
      posterUrl: item.image_url_snapshot?.trim() || null,
      title: item.title_snapshot?.trim() || null,
    };
  }

  if (mediaKind === "direct_video" && videoUrl) {
    return {
      kind: "direct_video",
      embedUrl: null,
      videoUrl,
      posterUrl: item.image_url_snapshot?.trim() || null,
      title: item.title_snapshot?.trim() || null,
    };
  }

  return null;
}

export function hierarchicalSlotLabel(slotKey: HierarchicalCompositionSlotKey) {
  for (const moment of HIERARCHICAL_COMPOSITION_MOMENTS) {
    const slot = moment.slots.find((candidate) => candidate.key === slotKey);
    if (slot) return slot.label;
  }

  return slotKey;
}

export function isHierarchicalBeyondMatchdaySortOrder(value: number) {
  return HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.some((position) => position.sortOrder === value);
}

export function hierarchicalBeyondMatchdayPositionLabel(sortOrder: number) {
  return HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.find((position) => position.sortOrder === sortOrder)?.label ?? `Posição ${sortOrder}`;
}

export function incompleteHierarchicalBeyondMatchdayPositions(
  items: HierarchicalCompositionReferenceItem[],
) {
  const beyondItems = items.filter((item) => item.slot_type === "beyond_matchday");

  return HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.filter((position) => {
    const item = beyondItems.find((candidate) => candidate.sort_order === position.sortOrder);
    return !item ||
      !item.label_snapshot?.trim() ||
      !item.title_snapshot?.trim() ||
      !item.subtitle_snapshot?.trim() ||
      !item.image_url_snapshot?.trim() ||
      !item.link_url_snapshot?.trim();
  });
}

export function isPublishableHierarchicalBeyondMatchday(
  items: HierarchicalCompositionReferenceItem[],
) {
  const beyondItems = items.filter((item) => item.slot_type === "beyond_matchday");
  return beyondItems.length === HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.length &&
    incompleteHierarchicalBeyondMatchdayPositions(beyondItems).length === 0;
}

export function missingHierarchicalCompositionSlots(slots: HierarchicalCompositionSlot[]) {
  const occupied = new Set(slots.map((slot) => slot.slot_key));
  return HIERARCHICAL_COMPOSITION_SLOT_KEYS.filter((slotKey) => !occupied.has(slotKey));
}

export function incompleteHierarchicalCompositionSlots(slots: HierarchicalCompositionSlot[]) {
  return slots
    .filter(
      (slot) =>
        !slot.label_snapshot?.trim() ||
        !slot.title_snapshot?.trim() ||
        !slot.subtitle_snapshot?.trim() ||
        (!slot.image_url_snapshot?.trim() &&
          !(slot.slot_key === "dominant_main" && hierarchicalCompositionMediaSnapshot(slot))),
    )
    .map((slot) => slot.slot_key);
}

export function isPublishableHierarchicalComposition(slots: HierarchicalCompositionSlot[]) {
  return (
    slots.length === HIERARCHICAL_COMPOSITION_SLOT_KEYS.length &&
    missingHierarchicalCompositionSlots(slots).length === 0 &&
    incompleteHierarchicalCompositionSlots(slots).length === 0
  );
}
