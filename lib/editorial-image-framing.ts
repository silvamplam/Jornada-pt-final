import type { CSSProperties } from "react";

import type {
  HierarchicalCompositionSlotKey,
} from "@/lib/editorial-hierarchical-composition";

export const EDITORIAL_IMAGE_OBJECT_POSITION = {
  standard: "center 40%",
  wide: "center 38%",
  "extra-wide": "center 34%",
  panoramic: "center 30%",
} as const;

export type EditorialImageFramingFamily =
  keyof typeof EDITORIAL_IMAGE_OBJECT_POSITION;

type EditorialImageFramingProps = Readonly<{
  "data-editorial-image-framing": EditorialImageFramingFamily;
  style: CSSProperties;
}>;

export const EDITORIAL_IMAGE_FRAMING_PROPS = {
  standard: {
    "data-editorial-image-framing": "standard",
    style: { objectPosition: EDITORIAL_IMAGE_OBJECT_POSITION.standard },
  },
  wide: {
    "data-editorial-image-framing": "wide",
    style: { objectPosition: EDITORIAL_IMAGE_OBJECT_POSITION.wide },
  },
  "extra-wide": {
    "data-editorial-image-framing": "extra-wide",
    style: { objectPosition: EDITORIAL_IMAGE_OBJECT_POSITION["extra-wide"] },
  },
  panoramic: {
    "data-editorial-image-framing": "panoramic",
    style: { objectPosition: EDITORIAL_IMAGE_OBJECT_POSITION.panoramic },
  },
} as const satisfies Record<
  EditorialImageFramingFamily,
  EditorialImageFramingProps
>;

export const HIERARCHICAL_EDITORIAL_IMAGE_FRAMING = {
  dominant_main: "standard",
  dominant_side_top: "panoramic",
  dominant_side_bottom: "panoramic",
  other_chronicle_1: "wide",
  other_chronicle_2: "wide",
  other_chronicle_3: "wide",
  secondary_strong_1: "extra-wide",
  secondary_strong_2: "wide",
  secondary_1: "wide",
  secondary_2: "wide",
  secondary_3: "panoramic",
  secondary_4: "wide",
  closing_1: "wide",
  closing_2: "wide",
  closing_3: "wide",
} as const satisfies Record<
  HierarchicalCompositionSlotKey,
  EditorialImageFramingFamily
>;

export function editorialImageFramingProps(
  family: EditorialImageFramingFamily,
): EditorialImageFramingProps {
  return EDITORIAL_IMAGE_FRAMING_PROPS[family];
}

export function hierarchicalEditorialImageFramingProps(
  slotKey: HierarchicalCompositionSlotKey,
) {
  return editorialImageFramingProps(
    HIERARCHICAL_EDITORIAL_IMAGE_FRAMING[slotKey],
  );
}
