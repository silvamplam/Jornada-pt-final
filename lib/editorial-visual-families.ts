export const EDITORIAL_VISUAL_FAMILIES = [
  "six_news",
  "five_news_balanced",
  "five_news_secondary",
] as const;

export type EditorialVisualFamily =
  (typeof EDITORIAL_VISUAL_FAMILIES)[number];

export const EDITORIAL_VISUAL_FAMILY_RENDERER_KEYS = [
  "hierarchical_analysis",
  "hierarchical_other_games",
  "secondary_news",
] as const;

export type EditorialVisualFamilyRendererKey =
  (typeof EDITORIAL_VISUAL_FAMILY_RENDERER_KEYS)[number];

export type EditorialVisualFamilySlotDefinition = Readonly<{
  position: number;
  key: string;
  role: string;
}>;

export type EditorialVisualFamilyDefinition = Readonly<{
  id: EditorialVisualFamily;
  label: string;
  slots: readonly EditorialVisualFamilySlotDefinition[];
  rendererKey: EditorialVisualFamilyRendererKey;
}>;

export type EditorialVisualFamilyPlacement<T> = Readonly<{
  position: number;
  item: T;
}>;

export type EditorialVisualFamilySlot<T> =
  EditorialVisualFamilySlotDefinition & Readonly<{
    item: T | null;
  }>;

export type EditorialVisualFamilySlotResult<T> =
  | Readonly<{
      ok: true;
      definition: EditorialVisualFamilyDefinition;
      slots: readonly EditorialVisualFamilySlot<T>[];
    }>
  | Readonly<{
      ok: false;
      reason:
        | "unknown-layout"
        | "invalid-slot-position"
        | "duplicate-slot-position";
    }>;

function defineEditorialVisualFamily(
  id: EditorialVisualFamily,
  label: string,
  rendererKey: EditorialVisualFamilyRendererKey,
  slots: readonly EditorialVisualFamilySlotDefinition[],
): EditorialVisualFamilyDefinition {
  const frozenSlots = Object.freeze(
    slots.map((slot, index) => {
      if (
        slot.position !== index + 1
        || !slot.key.trim()
        || !slot.role.trim()
      ) {
        throw new Error(
          `Invalid slot schema for editorial layout: ${id}`,
        );
      }

      return Object.freeze({ ...slot });
    }),
  );

  if (
    new Set(frozenSlots.map((slot) => slot.key)).size
    !== frozenSlots.length
  ) {
    throw new Error(
      `Duplicate slot key in editorial layout: ${id}`,
    );
  }

  return Object.freeze({
    id,
    label,
    slots: frozenSlots,
    rendererKey,
  });
}

export const EDITORIAL_VISUAL_FAMILY_DEFINITIONS: Readonly<
  Record<
    EditorialVisualFamily,
    EditorialVisualFamilyDefinition
  >
> = Object.freeze({
  six_news: defineEditorialVisualFamily(
    "six_news",
    "6 notícias",
    "hierarchical_analysis",
    [
      { position: 1, key: "secondary_strong_1", role: "Dominante" },
      { position: 2, key: "secondary_strong_2", role: "Secundária 1" },
      { position: 3, key: "secondary_1", role: "Secundária 2" },
      { position: 4, key: "secondary_2", role: "Secundária 3" },
      { position: 5, key: "dominant_side_top", role: "Complementar 1" },
      { position: 6, key: "dominant_side_bottom", role: "Complementar 2" },
    ],
  ),
  five_news_balanced: defineEditorialVisualFamily(
    "five_news_balanced",
    "5 notícias equilibradas",
    "hierarchical_other_games",
    [
      { position: 1, key: "secondary_3", role: "Dominante" },
      { position: 2, key: "secondary_4", role: "Secundária" },
      { position: 3, key: "closing_1", role: "Complementar 1" },
      { position: 4, key: "closing_2", role: "Complementar 2" },
      { position: 5, key: "closing_3", role: "Complementar 3" },
    ],
  ),
  five_news_secondary: defineEditorialVisualFamily(
    "five_news_secondary",
    "5 notícias secundárias",
    "secondary_news",
    [
      { position: 1, key: "dominant", role: "Dominante" },
      { position: 2, key: "secondary_1", role: "Secundária 1" },
      { position: 3, key: "secondary_2", role: "Secundária 2" },
      { position: 4, key: "secondary_3", role: "Secundária 3" },
      { position: 5, key: "secondary_4", role: "Secundária 4" },
    ],
  ),
});

const editorialVisualFamilySet = new Set<string>(
  EDITORIAL_VISUAL_FAMILIES,
);

export function isEditorialVisualFamily(
  value: unknown,
): value is EditorialVisualFamily {
  return (
    typeof value === "string"
    && editorialVisualFamilySet.has(value)
  );
}

export function editorialVisualFamilyDefinition(
  family: unknown,
): EditorialVisualFamilyDefinition | null {
  return isEditorialVisualFamily(family)
    ? EDITORIAL_VISUAL_FAMILY_DEFINITIONS[family]
    : null;
}

export function editorialVisualFamilyCapacity(
  family: EditorialVisualFamily,
): number {
  return EDITORIAL_VISUAL_FAMILY_DEFINITIONS[family].slots.length;
}

export function materializeEditorialVisualFamilySlots<T>(
  family: unknown,
  placements: readonly EditorialVisualFamilyPlacement<T>[],
): EditorialVisualFamilySlotResult<T> {
  const definition =
    editorialVisualFamilyDefinition(family);

  if (!definition) {
    return {
      ok: false,
      reason: "unknown-layout",
    };
  }

  const itemByPosition = new Map<number, T>();

  for (const placement of placements) {
    if (
      !Number.isSafeInteger(placement.position)
      || placement.position < 1
      || placement.position > definition.slots.length
    ) {
      return {
        ok: false,
        reason: "invalid-slot-position",
      };
    }

    if (itemByPosition.has(placement.position)) {
      return {
        ok: false,
        reason: "duplicate-slot-position",
      };
    }

    itemByPosition.set(
      placement.position,
      placement.item,
    );
  }

  return {
    ok: true,
    definition,
    slots: definition.slots.map((slot) => ({
      ...slot,
      item:
        itemByPosition.get(slot.position)
        ?? null,
    })),
  };
}
