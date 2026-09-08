import {
  readPublicMatchdayPhysicalSnapshot,
  type PublicMatchdayInvalidPhysicalSnapshot,
  type PublicMatchdayPhysicalDependencies,
  type PublicMatchdayPhysicalSnapshot,
} from "@/lib/public-matchday-physical";
import {
  readPublicMatchdayThematicSnapshot,
  type PublicMatchdayThematicSnapshot,
} from "@/lib/public-matchday-thematic";

export type PublicMatchdayEditorialReadResult =
  | PublicMatchdayPhysicalSnapshot
  | PublicMatchdayInvalidPhysicalSnapshot
  | Readonly<{
      kind: "legacy_thematic";
      snapshot: PublicMatchdayThematicSnapshot;
    }>
  | Readonly<{
      kind: "legacy";
    }>
  | Readonly<{
      kind: "invalid_legacy_snapshot";
      profileKey: string | null;
      reason: string;
    }>;

export type PublicMatchdayEditorialAuthority =
  | "editorial_snapshot"
  | "published_reference_composition";

export function resolvePublicMatchdayEditorialAuthority({
  editorialReadKind,
  hasPublishedReferenceComposition,
  historicalRepublishedReferenceComposition,
  sourceDeskIsManaged,
}: Readonly<{
  editorialReadKind: PublicMatchdayEditorialReadResult["kind"];
  hasPublishedReferenceComposition: boolean;
  historicalRepublishedReferenceComposition: boolean;
  sourceDeskIsManaged: boolean | null;
}>): PublicMatchdayEditorialAuthority {
  if (
    !hasPublishedReferenceComposition
    || sourceDeskIsManaged !== false
  ) {
    return "editorial_snapshot";
  }

  if (historicalRepublishedReferenceComposition) {
    return "published_reference_composition";
  }

  return editorialReadKind === "physical"
    || editorialReadKind === "invalid_physical_snapshot"
    ? "editorial_snapshot"
    : "published_reference_composition";
}

export async function readPublicMatchdayEditorialSnapshot(
  matchdayId: string,
  dependencies: PublicMatchdayPhysicalDependencies = {},
): Promise<PublicMatchdayEditorialReadResult> {
  const physical = await readPublicMatchdayPhysicalSnapshot(
    matchdayId,
    dependencies,
  );

  if (physical.kind === "physical" || physical.kind === "invalid_physical_snapshot") {
    return physical;
  }

  const legacy = await readPublicMatchdayThematicSnapshot(
    matchdayId,
    dependencies,
  );

  if (legacy === null) return { kind: "legacy" };
  if (legacy.kind === "thematic") {
    return {
      kind: "legacy_thematic",
      snapshot: legacy,
    };
  }
  if (legacy.kind === "unsupported_profile") {
    return {
      kind: "invalid_legacy_snapshot",
      profileKey: legacy.profileKey,
      reason: "unsupported-profile",
    };
  }

  return {
    kind: "invalid_legacy_snapshot",
    profileKey: legacy.profileKey,
    reason: legacy.reason,
  };
}
