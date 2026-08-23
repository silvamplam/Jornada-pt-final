import {
  EDITORIAL_PROFILE_KEYS,
  EDITORIAL_PROFILES,
  type EditorialProfileKey,
} from "@/lib/editorial-profiles";

export const MATCHDAY_EDITORIAL_CIRCUITS = ["legacy", "thematic"] as const;

export type MatchdayEditorialCircuit = (typeof MATCHDAY_EDITORIAL_CIRCUITS)[number];

export type MatchdayEditorialCircuitOption = Readonly<{
  circuit: MatchdayEditorialCircuit;
  label: string;
  profileKey: EditorialProfileKey | null;
}>;

const LEGACY_OPTION: MatchdayEditorialCircuitOption = Object.freeze({
  circuit: "legacy",
  label: "Atual / Legacy",
  profileKey: null,
});

export function isEditorialProfileCompatibleWithCompetition(
  profileKey: EditorialProfileKey,
  competitionSlug: string,
): boolean {
  return EDITORIAL_PROFILES[profileKey].competitionSlug === competitionSlug.trim();
}

export function matchdayEditorialCircuitOptions(
  competitionSlug: string,
): readonly MatchdayEditorialCircuitOption[] {
  const thematicOptions = EDITORIAL_PROFILE_KEYS
    .filter((profileKey) => isEditorialProfileCompatibleWithCompetition(profileKey, competitionSlug))
    .map((profileKey): MatchdayEditorialCircuitOption => ({
      circuit: "thematic",
      label: EDITORIAL_PROFILES[profileKey].displayName,
      profileKey,
    }));

  return [LEGACY_OPTION, ...thematicOptions];
}

export function activeMatchdayEditorialCircuit(
  profileKey: string | null,
): MatchdayEditorialCircuit {
  return profileKey === null ? "legacy" : "thematic";
}

export function matchdayEditorialCircuitAssignment(
  circuit: MatchdayEditorialCircuit,
  competitionSlug: string,
): EditorialProfileKey | null {
  if (circuit === "legacy") {
    return null;
  }

  const thematicOption = matchdayEditorialCircuitOptions(competitionSlug)
    .find((option) => option.circuit === "thematic");

  if (!thematicOption?.profileKey) {
    throw new Error("matchday-editorial-circuit-incompatible-competition");
  }

  return thematicOption.profileKey;
}
