export const EDITORIAL_VISUAL_FAMILIES = [
  "six_news",
  "five_news_balanced",
  "five_news_secondary",
] as const;

export type EditorialVisualFamily =
  (typeof EDITORIAL_VISUAL_FAMILIES)[number];

export const EDITORIAL_VISUAL_FAMILY_DEFINITIONS: Readonly<
  Record<
    EditorialVisualFamily,
    Readonly<{
      label: string;
      capacity: number;
    }>
  >
> = Object.freeze({
  six_news: {
    label: "6 notícias",
    capacity: 6,
  },
  five_news_balanced: {
    label: "5 notícias equilibradas",
    capacity: 5,
  },
  five_news_secondary: {
    label: "5 notícias secundárias",
    capacity: 5,
  },
});

export function editorialVisualFamilyCapacity(
  family: EditorialVisualFamily,
): number {
  return EDITORIAL_VISUAL_FAMILY_DEFINITIONS[family].capacity;
}

export const EDITORIAL_PLACEMENT_MODES = ["automatic_actuality"] as const;

export type EditorialPlacementMode =
  (typeof EDITORIAL_PLACEMENT_MODES)[number];

type EditorialProfileDefinitionShape = Readonly<{
  displayName: string;
  competitionSlug: string;
  zones: readonly Readonly<{
    key: string;
    label: string;
    capacity: number;
    visualFamily: EditorialVisualFamily;
    placementMode: EditorialPlacementMode;
  }>[];
}>;

export const EDITORIAL_PROFILES = {
  liga_portugal_v1: {
    displayName: "Temático · Liga Portugal",
    competitionSlug: "liga-portugal",
    zones: [
      {
        key: "benfica",
        label: "Benfica",
        capacity: 6,
        visualFamily: "six_news",
        placementMode: "automatic_actuality",
      },
      {
        key: "sporting",
        label: "Sporting",
        capacity: 5,
        visualFamily: "five_news_balanced",
        placementMode: "automatic_actuality",
      },
      {
        key: "fc_porto",
        label: "FC Porto",
        capacity: 5,
        visualFamily: "five_news_balanced",
        placementMode: "automatic_actuality",
      },
      {
        key: "other_liga_clubs",
        label: "Outros clubes",
        capacity: 6,
        visualFamily: "six_news",
        placementMode: "automatic_actuality",
      },
      {
        key: "outside_liga_other",
        label: "Fora da Liga / outros",
        capacity: 5,
        visualFamily: "five_news_secondary",
        placementMode: "automatic_actuality",
      },
    ],
  },
} as const satisfies Readonly<Record<string, EditorialProfileDefinitionShape>>;

export type EditorialProfileKey = keyof typeof EDITORIAL_PROFILES;

export type EditorialProfileZoneKey =
  (typeof EDITORIAL_PROFILES)[EditorialProfileKey]["zones"][number]["key"];

export type EditorialProfileZone = Readonly<{
  key: EditorialProfileZoneKey;
  label: string;
  capacity: number;
  visualFamily: EditorialVisualFamily;
  placementMode: EditorialPlacementMode;
}>;

export type EditorialProfile = Readonly<{
  displayName: string;
  competitionSlug: string;
  zones: readonly EditorialProfileZone[];
}>;

export type EditorialProfileZoneLayouts = Readonly<
  Record<EditorialProfileZoneKey, EditorialVisualFamily>
>;

export const EDITORIAL_PROFILE_KEYS: readonly EditorialProfileKey[] =
  Object.freeze(
    Object.keys(EDITORIAL_PROFILES) as EditorialProfileKey[],
  );

export function isEditorialProfileKey(
  value: unknown,
): value is EditorialProfileKey {
  return (
    typeof value === "string"
    && Object.prototype.hasOwnProperty.call(
      EDITORIAL_PROFILES,
      value,
    )
  );
}

export function editorialProfile(
  key: EditorialProfileKey,
): EditorialProfile;

export function editorialProfile(
  key: string,
): EditorialProfile | null;

export function editorialProfile(
  key: string,
): EditorialProfile | null {
  return isEditorialProfileKey(key)
    ? EDITORIAL_PROFILES[key]
    : null;
}

export function editorialProfileZones(
  key: EditorialProfileKey,
): readonly EditorialProfileZone[] {
  return EDITORIAL_PROFILES[key].zones;
}

export function editorialProfileZone(
  profileKey: string,
  zoneKey: string,
): EditorialProfileZone | null {
  const profile = editorialProfile(profileKey);

  return profile?.zones.find(
    (zone) => zone.key === zoneKey,
  ) ?? null;
}

export function editorialProfileDefaultZoneLayouts(
  profile: EditorialProfile,
): EditorialProfileZoneLayouts {
  return Object.fromEntries(
    profile.zones.map(
      (zone) => [zone.key, zone.visualFamily],
    ),
  ) as EditorialProfileZoneLayouts;
}

export function editorialProfileWithZoneLayouts(
  profile: EditorialProfile,
  layouts: EditorialProfileZoneLayouts,
): EditorialProfile {
  return {
    ...profile,
    zones: profile.zones.map((zone) => {
      const visualFamily = layouts[zone.key];

      return {
        ...zone,
        visualFamily,
        capacity: editorialVisualFamilyCapacity(
          visualFamily,
        ),
      };
    }),
  };
}