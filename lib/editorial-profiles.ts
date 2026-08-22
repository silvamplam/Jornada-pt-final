export const EDITORIAL_VISUAL_FAMILIES = [
  "six_news",
  "five_news_balanced",
  "five_news_secondary",
] as const;

export type EditorialVisualFamily =
  (typeof EDITORIAL_VISUAL_FAMILIES)[number];

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
export type EditorialProfile =
  (typeof EDITORIAL_PROFILES)[EditorialProfileKey];
export type EditorialProfileZone = EditorialProfile["zones"][number];
export type EditorialProfileZoneKey = EditorialProfileZone["key"];

export const EDITORIAL_PROFILE_KEYS: readonly EditorialProfileKey[] = Object.freeze(
  Object.keys(EDITORIAL_PROFILES) as EditorialProfileKey[],
);

export function isEditorialProfileKey(
  value: unknown,
): value is EditorialProfileKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(EDITORIAL_PROFILES, value)
  );
}

export function editorialProfile(key: EditorialProfileKey): EditorialProfile;
export function editorialProfile(key: string): EditorialProfile | null;
export function editorialProfile(key: string): EditorialProfile | null {
  return isEditorialProfileKey(key) ? EDITORIAL_PROFILES[key] : null;
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

  return profile?.zones.find((zone) => zone.key === zoneKey) ?? null;
}
