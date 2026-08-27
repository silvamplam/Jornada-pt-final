import {
  EDITORIAL_PROFILES,
  EDITORIAL_VISUAL_FAMILIES,
  editorialProfileDefaultZoneLayouts,
  type EditorialProfile,
  type EditorialProfileZoneKey,
  type EditorialProfileZoneLayouts,
  type EditorialVisualFamily,
} from "@/lib/editorial-profiles";
import type {
  MatchdayEditorialProfileDeskAutomaticItem,
} from "@/lib/editorial-matchday-profile-desk";
import {
  thematicEditorialIdentity,
  validateMatchdayEditorialProfileManualOverrides,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  reconcileMatchdayEditorialProfileDistribution,
  type MatchdayEditorialProfileAppliedZoneItem,
  type MatchdayEditorialProfileFaixaItem,
  type MatchdayEditorialProfileReconcileResult,
} from "@/lib/editorial-matchday-profile-reconcile";

export const MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS = [
  "headline",
  "highlight_1",
  "highlight_2",
  "highlight_3",
  "context",
] as const;

export type MatchdayEditorialProfileOpeningSlotKey =
  (typeof MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS)[number];

export const MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_LABELS: Readonly<
  Record<MatchdayEditorialProfileOpeningSlotKey, string>
> = Object.freeze({
  headline: "Manchete",
  highlight_1: "Notícia 1",
  highlight_2: "Notícia 2",
  highlight_3: "Notícia 3",
  context: "Contexto",
});

export type MatchdayEditorialProfileOpening = Readonly<
  Record<MatchdayEditorialProfileOpeningSlotKey, string | null>
>;

export type MatchdayEditorialProfileLatestZonePlacement =
  | "top"
  | "four_news"
  | "hidden";

export const MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS =
  EDITORIAL_PROFILES.liga_portugal_v1.zones.map(
    (zone) => zone.key,
  ) as readonly EditorialProfileZoneKey[];

export type MatchdayEditorialProfileThematicBlockKey =
  | EditorialProfileZoneKey
  | "latest"
  | "video";

const MATCHDAY_EDITORIAL_PROFILE_LEGACY_THEMATIC_BLOCK_ORDER_KEYS =
  [
    ...MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS,
    "latest",
  ] as const;

export const MATCHDAY_EDITORIAL_PROFILE_THEMATIC_BLOCK_ORDER_KEYS =
  [
    ...MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS,
    "latest",
    "video",
  ] as readonly MatchdayEditorialProfileThematicBlockKey[];

export type MatchdayEditorialProfileThematicZoneTitles = Readonly<
  Record<EditorialProfileZoneKey, string>
>;

export type MatchdayEditorialProfilePageControls = Readonly<{
  headlineTitleColor: string | null;
  latestZonePlacement: MatchdayEditorialProfileLatestZonePlacement;
  latestZoneTitle: string;
  thematicZoneOrder: readonly EditorialProfileZoneKey[];
  thematicZoneLayouts: EditorialProfileZoneLayouts;
  thematicBlockOrder: readonly MatchdayEditorialProfileThematicBlockKey[];
  thematicZoneTitles: MatchdayEditorialProfileThematicZoneTitles;
}>;
export type MatchdayEditorialProfileOpeningMove = Readonly<{
  opening: MatchdayEditorialProfileOpening;
  displacedSourceId: string | null;
  previousSlot: MatchdayEditorialProfileOpeningSlotKey | null;
}>;

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanSourceId(value: string): string {
  return value.trim().toLowerCase();
}

function isEditorialVisualFamily(
  value: unknown,
): value is EditorialVisualFamily {
  return (
    typeof value === "string"
    && EDITORIAL_VISUAL_FAMILIES.includes(
      value as EditorialVisualFamily,
    )
  );
}

export function emptyMatchdayEditorialProfileOpening(): MatchdayEditorialProfileOpening {
  return {
    headline: null,
    highlight_1: null,
    highlight_2: null,
    highlight_3: null,
    context: null,
  };
}

export function validateMatchdayEditorialProfileOpening(
  value: unknown,
): MatchdayEditorialProfileOpening {
  if (!isRecord(value)) {
    throw new Error("matchday-editorial-profile-opening-invalid-payload");
  }

  const expectedKeys = [...MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS].sort();
  if (Object.keys(value).sort().join(",") !== expectedKeys.join(",")) {
    throw new Error("matchday-editorial-profile-opening-invalid-payload");
  }

  const identities = new Set<string>();
  const opening = emptyMatchdayEditorialProfileOpening() as Record<
    MatchdayEditorialProfileOpeningSlotKey,
    string | null
  >;
  for (const slot of MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS) {
    const candidate = value[slot];
    if (candidate !== null && (typeof candidate !== "string" || !candidate.trim())) {
      throw new Error("matchday-editorial-profile-opening-invalid-source");
    }
    const sourceId = typeof candidate === "string" ? cleanSourceId(candidate) : null;
    if (sourceId !== null) {
      const identity = thematicEditorialIdentity("editorial_article", sourceId);
      if (identities.has(identity)) {
        throw new Error("matchday-editorial-profile-opening-duplicate-source");
      }
      identities.add(identity);
    }
    opening[slot] = sourceId;
  }
  return opening;
}

export function emptyMatchdayEditorialProfileThematicZoneTitles(): MatchdayEditorialProfileThematicZoneTitles {
  return {
    benfica: "",
    sporting: "",
    fc_porto: "",
    other_liga_clubs: "",
    outside_liga_other: "",
  };
}

export function validateMatchdayEditorialProfilePageControls(
  value: unknown,
): MatchdayEditorialProfilePageControls {
  if (!isRecord(value)) {
    throw new Error(
      "matchday-editorial-profile-page-controls-invalid-payload",
    );
  }

  const keys = Object.keys(value).sort().join(",");
  const legacyKeys =
    "headlineTitleColor,latestZonePlacement,thematicZoneOrder";
  const flexibleKeys =
    "headlineTitleColor,latestZonePlacement,thematicBlockOrder,thematicZoneLayouts,thematicZoneOrder";
  const titledKeys =
    "headlineTitleColor,latestZonePlacement,thematicBlockOrder,thematicZoneLayouts,thematicZoneOrder,thematicZoneTitles";
  const latestTitledKeys =
    "headlineTitleColor,latestZonePlacement,latestZoneTitle,thematicBlockOrder,thematicZoneLayouts,thematicZoneOrder,thematicZoneTitles";

  if (
    keys !== legacyKeys
    && keys !== flexibleKeys
    && keys !== titledKeys
    && keys !== latestTitledKeys
  ) {
    throw new Error(
      "matchday-editorial-profile-page-controls-invalid-payload",
    );
  }

  const headlineTitleColor = value.headlineTitleColor;

  if (
    headlineTitleColor !== null
    && (
      typeof headlineTitleColor !== "string"
      || !HEX_COLOR_PATTERN.test(
        headlineTitleColor.trim(),
      )
    )
  ) {
    throw new Error(
      "matchday-editorial-profile-page-controls-invalid-headline-color",
    );
  }

  if (
    value.latestZonePlacement !== "top"
    && value.latestZonePlacement !== "four_news"
    && value.latestZonePlacement !== "hidden"
  ) {
    throw new Error(
      "matchday-editorial-profile-page-controls-invalid-latest-placement",
    );
  }

  if (
    !Array.isArray(value.thematicZoneOrder)
    || value.thematicZoneOrder.length
      !== MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.length
    || new Set(value.thematicZoneOrder).size
      !== MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.length
    || value.thematicZoneOrder.some((key) => (
      typeof key !== "string"
      || !MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.includes(
        key as EditorialProfileZoneKey,
      )
    ))
  ) {
    throw new Error(
      "matchday-editorial-profile-page-controls-invalid-zone-order",
    );
  }

  const thematicZoneOrder =
    [...value.thematicZoneOrder] as EditorialProfileZoneKey[];

  let thematicZoneLayouts: EditorialProfileZoneLayouts;
  let thematicBlockOrder:
    readonly MatchdayEditorialProfileThematicBlockKey[];

  if (keys === legacyKeys) {
    thematicZoneLayouts =
      editorialProfileDefaultZoneLayouts(
        EDITORIAL_PROFILES.liga_portugal_v1,
      );

    thematicBlockOrder = [
      ...thematicZoneOrder,
      "latest",
      "video",
    ];
  } else {
    const layouts = value.thematicZoneLayouts;

    if (
      !isRecord(layouts)
      || Object.keys(layouts).sort().join(",")
        !== [...MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS]
          .sort()
          .join(",")
      || MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.some(
        (zoneKey) => !isEditorialVisualFamily(
          layouts[zoneKey],
        ),
      )
    ) {
      throw new Error(
        "matchday-editorial-profile-page-controls-invalid-zone-layouts",
      );
    }

    thematicZoneLayouts = Object.fromEntries(
      MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.map(
        (zoneKey) => [
          zoneKey,
          layouts[zoneKey] as EditorialVisualFamily,
        ],
      ),
    ) as EditorialProfileZoneLayouts;

    const blocks = value.thematicBlockOrder;

    const isCurrentBlockOrder =
      Array.isArray(blocks)
      && blocks.length
        === MATCHDAY_EDITORIAL_PROFILE_THEMATIC_BLOCK_ORDER_KEYS.length
      && new Set(blocks).size
        === MATCHDAY_EDITORIAL_PROFILE_THEMATIC_BLOCK_ORDER_KEYS.length
      && blocks.every((block) => (
        typeof block === "string"
        && MATCHDAY_EDITORIAL_PROFILE_THEMATIC_BLOCK_ORDER_KEYS.includes(
          block as MatchdayEditorialProfileThematicBlockKey,
        )
      ));

    const isLegacyBlockOrder =
      Array.isArray(blocks)
      && blocks.length
        === MATCHDAY_EDITORIAL_PROFILE_LEGACY_THEMATIC_BLOCK_ORDER_KEYS.length
      && new Set(blocks).size
        === MATCHDAY_EDITORIAL_PROFILE_LEGACY_THEMATIC_BLOCK_ORDER_KEYS.length
      && blocks.every((block) => (
        typeof block === "string"
        && MATCHDAY_EDITORIAL_PROFILE_LEGACY_THEMATIC_BLOCK_ORDER_KEYS.includes(
          block as (typeof MATCHDAY_EDITORIAL_PROFILE_LEGACY_THEMATIC_BLOCK_ORDER_KEYS)[number],
        )
      ));

    if (!isCurrentBlockOrder && !isLegacyBlockOrder) {
      throw new Error(
        "matchday-editorial-profile-page-controls-invalid-block-order",
      );
    }

    thematicBlockOrder =
      isLegacyBlockOrder
        ? [
            ...blocks,
            "video",
          ] as MatchdayEditorialProfileThematicBlockKey[]
        : [...blocks] as MatchdayEditorialProfileThematicBlockKey[];

    const derivedZoneOrder =
      matchdayEditorialProfileThematicZoneOrderFromBlockOrder(
        thematicBlockOrder,
      );

    if (
      JSON.stringify(derivedZoneOrder)
      !== JSON.stringify(thematicZoneOrder)
    ) {
      throw new Error(
        "matchday-editorial-profile-page-controls-zone-order-mismatch",
      );
    }
  }

  let latestZoneTitle = "";

  if (keys === latestTitledKeys) {
    if (
      typeof value.latestZoneTitle !== "string"
      || value.latestZoneTitle.trim().length > 120
    ) {
      throw new Error(
        "matchday-editorial-profile-page-controls-invalid-latest-title",
      );
    }

    latestZoneTitle =
      value.latestZoneTitle.trim();
  }

  let thematicZoneTitles =
    emptyMatchdayEditorialProfileThematicZoneTitles();

  if (
    keys === titledKeys
    || keys === latestTitledKeys
  ) {
    const titles = value.thematicZoneTitles;

    if (
      !isRecord(titles)
      || Object.keys(titles).sort().join(",")
        !== [...MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS]
          .sort()
          .join(",")
      || MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.some(
        (zoneKey) => (
          typeof titles[zoneKey] !== "string"
          || (titles[zoneKey] as string).trim().length > 120
        ),
      )
    ) {
      throw new Error(
        "matchday-editorial-profile-page-controls-invalid-zone-titles",
      );
    }

    thematicZoneTitles =
      Object.fromEntries(
        MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.map(
          (zoneKey) => [
            zoneKey,
            (titles[zoneKey] as string).trim(),
          ],
        ),
      ) as MatchdayEditorialProfileThematicZoneTitles;
  }

  return {
    headlineTitleColor:
      typeof headlineTitleColor === "string"
        ? headlineTitleColor.trim().toUpperCase()
        : null,
    latestZonePlacement: value.latestZonePlacement,
    latestZoneTitle,
    thematicZoneOrder,
    thematicZoneLayouts,
    thematicBlockOrder,
    thematicZoneTitles,
  };
}

export function normalizeMatchdayEditorialProfileThematicZoneOrder(
  value: unknown,
): readonly EditorialProfileZoneKey[] {
  if (
    !Array.isArray(value)
    || value.length
      !== MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.length
    || new Set(value).size
      !== MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.length
    || value.some((key) => (
      typeof key !== "string"
      || !MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.includes(
        key as EditorialProfileZoneKey,
      )
    ))
  ) {
    return [
      ...MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS,
    ];
  }

  return [...value] as EditorialProfileZoneKey[];
}

export function normalizeMatchdayEditorialProfileThematicZoneTitles(
  value: unknown,
): MatchdayEditorialProfileThematicZoneTitles {
  const empty =
    emptyMatchdayEditorialProfileThematicZoneTitles();

  if (
    !isRecord(value)
    || Object.keys(value).sort().join(",")
      !== [...MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS]
        .sort()
        .join(",")
    || MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.some(
      (zoneKey) => (
        typeof value[zoneKey] !== "string"
        || (value[zoneKey] as string).trim().length > 120
      ),
    )
  ) {
    return empty;
  }

  return Object.fromEntries(
    MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.map(
      (zoneKey) => [
        zoneKey,
        (value[zoneKey] as string).trim(),
      ],
    ),
  ) as MatchdayEditorialProfileThematicZoneTitles;
}

export function normalizeMatchdayEditorialProfileThematicZoneLayouts(
  value: unknown,
): EditorialProfileZoneLayouts {
  const defaults =
    editorialProfileDefaultZoneLayouts(
      EDITORIAL_PROFILES.liga_portugal_v1,
    );

  if (
    !isRecord(value)
    || Object.keys(value).sort().join(",")
      !== [...MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS]
        .sort()
        .join(",")
    || MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.some(
      (zoneKey) => !isEditorialVisualFamily(
        value[zoneKey],
      ),
    )
  ) {
    return defaults;
  }

  return Object.fromEntries(
    MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.map(
      (zoneKey) => [
        zoneKey,
        value[zoneKey] as EditorialVisualFamily,
      ],
    ),
  ) as EditorialProfileZoneLayouts;
}

export function normalizeMatchdayEditorialProfileThematicBlockOrder(
  value: unknown,
  thematicZoneOrder: unknown =
    MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS,
): readonly MatchdayEditorialProfileThematicBlockKey[] {
  const zoneOrder =
    normalizeMatchdayEditorialProfileThematicZoneOrder(
      thematicZoneOrder,
    );

  const isCurrentBlockOrder =
    Array.isArray(value)
    && value.length
      === MATCHDAY_EDITORIAL_PROFILE_THEMATIC_BLOCK_ORDER_KEYS.length
    && new Set(value).size
      === MATCHDAY_EDITORIAL_PROFILE_THEMATIC_BLOCK_ORDER_KEYS.length
    && value.every((block) => (
      typeof block === "string"
      && MATCHDAY_EDITORIAL_PROFILE_THEMATIC_BLOCK_ORDER_KEYS.includes(
        block as MatchdayEditorialProfileThematicBlockKey,
      )
    ));

  const isLegacyBlockOrder =
    Array.isArray(value)
    && value.length
      === MATCHDAY_EDITORIAL_PROFILE_LEGACY_THEMATIC_BLOCK_ORDER_KEYS.length
    && new Set(value).size
      === MATCHDAY_EDITORIAL_PROFILE_LEGACY_THEMATIC_BLOCK_ORDER_KEYS.length
    && value.every((block) => (
      typeof block === "string"
      && MATCHDAY_EDITORIAL_PROFILE_LEGACY_THEMATIC_BLOCK_ORDER_KEYS.includes(
        block as (typeof MATCHDAY_EDITORIAL_PROFILE_LEGACY_THEMATIC_BLOCK_ORDER_KEYS)[number],
      )
    ));

  if (!isCurrentBlockOrder && !isLegacyBlockOrder) {
    return [
      ...zoneOrder,
      "latest",
      "video",
    ];
  }

  const normalized =
    isLegacyBlockOrder
      ? [
          ...value,
          "video",
        ] as MatchdayEditorialProfileThematicBlockKey[]
      : [...value] as MatchdayEditorialProfileThematicBlockKey[];

  if (
    JSON.stringify(
      matchdayEditorialProfileThematicZoneOrderFromBlockOrder(
        normalized,
      ),
    ) !== JSON.stringify(zoneOrder)
  ) {
    return [
      ...zoneOrder,
      "latest",
      "video",
    ];
  }

  return normalized;
}

export function matchdayEditorialProfileThematicZoneOrderFromBlockOrder(
  value: readonly MatchdayEditorialProfileThematicBlockKey[],
): readonly EditorialProfileZoneKey[] {
  return value.filter(
    (
      block,
    ): block is EditorialProfileZoneKey =>
      block !== "latest" && block !== "video",
  );
}

export function moveMatchdayEditorialProfileThematicZone(
  currentValue: unknown,
  zone: EditorialProfileZoneKey,
  direction: "up" | "down",
): readonly EditorialProfileZoneKey[] {
  const current =
    normalizeMatchdayEditorialProfileThematicZoneOrder(
      currentValue,
    );

  const currentIndex = current.indexOf(zone);
  const targetIndex =
    direction === "up"
      ? currentIndex - 1
      : currentIndex + 1;

  if (
    currentIndex < 0
    || targetIndex < 0
    || targetIndex >= current.length
  ) {
    return current;
  }

  const next = [...current];

  [next[currentIndex], next[targetIndex]] =
    [next[targetIndex], next[currentIndex]];

  return next;
}

export function moveMatchdayEditorialProfileThematicBlock(
  currentValue: unknown,
  block: MatchdayEditorialProfileThematicBlockKey,
  direction: "up" | "down",
): readonly MatchdayEditorialProfileThematicBlockKey[] {
  const current =
    normalizeMatchdayEditorialProfileThematicBlockOrder(
      currentValue,
      Array.isArray(currentValue)
        ? currentValue.filter(
            (
              candidate,
            ): candidate is EditorialProfileZoneKey =>
              candidate !== "latest"
              && candidate !== "video"
              && typeof candidate === "string"
              && MATCHDAY_EDITORIAL_PROFILE_THEMATIC_ZONE_ORDER_KEYS.includes(
                candidate as EditorialProfileZoneKey,
              ),
          )
        : undefined,
    );

  const currentIndex = current.indexOf(block);
  const targetIndex =
    direction === "up"
      ? currentIndex - 1
      : currentIndex + 1;

  if (
    currentIndex < 0
    || targetIndex < 0
    || targetIndex >= current.length
  ) {
    return current;
  }

  const next = [...current];

  [next[currentIndex], next[targetIndex]] =
    [next[targetIndex], next[currentIndex]];

  return next;
}
export function matchdayEditorialProfileOpeningSourceIds(
  opening: MatchdayEditorialProfileOpening,
): readonly string[] {
  return MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.flatMap((slot) => {
    const sourceId = opening[slot];
    return sourceId === null ? [] : [sourceId];
  });
}

export function moveMatchdayEditorialProfileItemToOpening(
  current: MatchdayEditorialProfileOpening,
  sourceIdValue: string,
  targetSlot: MatchdayEditorialProfileOpeningSlotKey,
): MatchdayEditorialProfileOpeningMove {
  const sourceId = cleanSourceId(sourceIdValue);
  if (!sourceId) throw new Error("matchday-editorial-profile-opening-invalid-source");
  const opening = validateMatchdayEditorialProfileOpening(current);
  const previousSlot = MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS.find(
    (slot) => opening[slot] === sourceId,
  ) ?? null;
  if (previousSlot === targetSlot) {
    return { opening, displacedSourceId: null, previousSlot };
  }

  const displacedSourceId = opening[targetSlot];
  const next = { ...opening };
  if (previousSlot !== null) next[previousSlot] = null;
  next[targetSlot] = sourceId;
  return {
    opening: validateMatchdayEditorialProfileOpening(next),
    displacedSourceId,
    previousSlot,
  };
}

export function removeMatchdayEditorialProfileItemFromOpening(
  current: MatchdayEditorialProfileOpening,
  sourceIdValue: string,
): MatchdayEditorialProfileOpening {
  const sourceId = cleanSourceId(sourceIdValue);
  const opening = validateMatchdayEditorialProfileOpening(current);
  const next = { ...opening };
  for (const slot of MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS) {
    if (next[slot] === sourceId) next[slot] = null;
  }
  return validateMatchdayEditorialProfileOpening(next);
}

export function withoutMatchdayEditorialProfileOpeningOverrides(
  profile: EditorialProfile,
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  opening: MatchdayEditorialProfileOpening,
): readonly MatchdayEditorialProfileManualOverride[] {
  const openingIdentities = new Set(matchdayEditorialProfileOpeningSourceIds(opening).map((sourceId) => (
    thematicEditorialIdentity("editorial_article", sourceId)
  )));
  return validateMatchdayEditorialProfileManualOverrides(
    profile,
    overrides.filter((override) => !openingIdentities.has(
      thematicEditorialIdentity(override.sourceType, override.sourceId),
    )),
  );
}

export function reconcileMatchdayEditorialProfileWorkspace(
  profile: EditorialProfile,
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  manualOverrides: readonly MatchdayEditorialProfileManualOverride[],
  openingValue: MatchdayEditorialProfileOpening,
  appliedZoneItems: readonly MatchdayEditorialProfileAppliedZoneItem[],
  hasAppliedSnapshot: boolean,
  currentFaixa: readonly MatchdayEditorialProfileFaixaItem[],
): MatchdayEditorialProfileReconcileResult {
  const opening = validateMatchdayEditorialProfileOpening(openingValue);
  const activeIdentitySet = new Set(activeItems.map((item) => (
    thematicEditorialIdentity(item.sourceType, item.sourceId)
  )));
  const openingIdentities = new Set(matchdayEditorialProfileOpeningSourceIds(opening).map((sourceId) => (
    thematicEditorialIdentity("editorial_article", sourceId)
  )));
  for (const identity of openingIdentities) {
    if (!activeIdentitySet.has(identity)) {
      throw new Error("matchday-editorial-profile-opening-source-not-active");
    }
  }

  const circuitItems = activeItems.filter((item) => !openingIdentities.has(
    thematicEditorialIdentity(item.sourceType, item.sourceId),
  ));
  const circuitOverrides = withoutMatchdayEditorialProfileOpeningOverrides(
    profile,
    manualOverrides,
    opening,
  );
  const circuitFaixa = currentFaixa.filter((item) => !openingIdentities.has(
    thematicEditorialIdentity(item.sourceType, item.sourceId),
  ));

  return reconcileMatchdayEditorialProfileDistribution(
    profile,
    circuitItems,
    circuitOverrides,
    appliedZoneItems,
    hasAppliedSnapshot,
    circuitFaixa,
  );
}
