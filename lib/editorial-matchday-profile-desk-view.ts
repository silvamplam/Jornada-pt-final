export type MatchdayEditorialProfileDeskView = "focus" | "full";

export type MatchdayEditorialProfileDeskViewPreference = Readonly<{
  view: MatchdayEditorialProfileDeskView;
  focusZone: string;
}>;

export function matchdayEditorialProfileDeskViewStorageKey(
  matchdayId: string,
  profileKey: string,
): string {
  return `jornada:thematic-desk-view:${matchdayId.trim().toLowerCase()}:${profileKey.trim().toLowerCase()}`;
}

export function parseMatchdayEditorialProfileDeskViewPreference(
  value: string | null,
  zoneKeys: readonly string[],
): MatchdayEditorialProfileDeskViewPreference | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;

    if (
      (parsed.view !== "focus" && parsed.view !== "full")
      || typeof parsed.focusZone !== "string"
      || !zoneKeys.includes(parsed.focusZone)
    ) {
      return null;
    }

    return {
      view: parsed.view,
      focusZone: parsed.focusZone,
    };
  } catch {
    return null;
  }
}
