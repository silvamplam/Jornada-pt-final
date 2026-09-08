export type MatchdayLatestPlacement =
  | Readonly<{ kind: "headline" }>
  | Readonly<{ kind: "hidden" }>
  | Readonly<{ kind: "zone"; zoneId: string }>;

export type MatchdayLatestPlacementStorage =
  "top"
  | "four_news"
  | "hidden";

export type MatchdayLatestPlacementResolution =
  | MatchdayLatestPlacement
  | Readonly<{
      kind: "legacy_incomplete";
      storagePlacement: MatchdayLatestPlacementStorage;
      companionZoneId: string | null;
    }>;

export function resolveMatchdayLatestPlacement(
  storagePlacement: MatchdayLatestPlacementStorage,
  companionZoneId: string | null,
): MatchdayLatestPlacementResolution {
  if (storagePlacement === "top" && companionZoneId === null) {
    return { kind: "headline" };
  }
  if (storagePlacement === "hidden" && companionZoneId === null) {
    return { kind: "hidden" };
  }
  if (storagePlacement === "four_news" && companionZoneId !== null) {
    return { kind: "zone", zoneId: companionZoneId };
  }

  return {
    kind: "legacy_incomplete",
    storagePlacement,
    companionZoneId,
  };
}

export function storeMatchdayLatestPlacement(
  placement: MatchdayLatestPlacement,
): Readonly<{
  latestZonePlacement: MatchdayLatestPlacementStorage;
  latestCompanionZoneId: string | null;
}> {
  if (placement.kind === "zone") {
    return {
      latestZonePlacement: "four_news",
      latestCompanionZoneId: placement.zoneId,
    };
  }

  return {
    latestZonePlacement: placement.kind === "headline" ? "top" : "hidden",
    latestCompanionZoneId: null,
  };
}
