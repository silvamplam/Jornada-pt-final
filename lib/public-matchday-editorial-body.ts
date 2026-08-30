import type {
  MatchdayEditorialProfileThematicBlockKey,
} from "@/lib/editorial-matchday-profile-workspace";
import type {
  MatchdayLivePublicZoneKey,
} from "@/lib/editorial-matchday-live-zone-order";
import type {
  EditorialProfileZoneKey,
  EditorialVisualFamily,
} from "@/lib/editorial-profiles";

export type PublicEditorialBodyZone = Readonly<{
  key: string;
  visualFamily: EditorialVisualFamily;
}>;

export type PublicEditorialZoneBodyBlock<
  Zone extends PublicEditorialBodyZone,
> = Readonly<{
  kind: "zone";
  zone: Zone;
}>;

export type PublicEditorialLatestBodyBlock =
  Readonly<{
    kind: "latest";
  }>;

export type PublicEditorialVideoBodyBlock =
  Readonly<{
    kind: "video";
  }>;

export type PublicEditorialBodyBlock<
  Zone extends PublicEditorialBodyZone,
> =
  | PublicEditorialZoneBodyBlock<Zone>
  | PublicEditorialLatestBodyBlock
  | PublicEditorialVideoBodyBlock;

export type HistoricalPublicEditorialBodyBlock<
  Zone extends PublicEditorialBodyZone,
> =
  | PublicEditorialZoneBodyBlock<Zone>
  | PublicEditorialVideoBodyBlock;

type ThematicPublicEditorialZone =
  PublicEditorialBodyZone
  & Readonly<{
    key: EditorialProfileZoneKey;
  }>;

type LivePublicEditorialZoneKey = Exclude<
  MatchdayLivePublicZoneKey,
  "four_news" | "video"
>;

export type LivePublicEditorialZone = Readonly<{
  key: LivePublicEditorialZoneKey;
  visualFamily: LivePublicEditorialZoneKey;
}>;

export function composeThematicPublicEditorialBody<
  Zone extends ThematicPublicEditorialZone,
>(
  order: readonly MatchdayEditorialProfileThematicBlockKey[],
  zones: readonly Zone[],
): PublicEditorialBodyBlock<Zone>[] {
  const zoneByKey = new Map(
    zones.map((zone) => [zone.key, zone] as const),
  );
  const body: PublicEditorialBodyBlock<Zone>[] = [];

  for (const block of order) {
    if (block === "latest" || block === "video") {
      body.push({ kind: block });
      continue;
    }

    const zone = zoneByKey.get(block);

    if (zone) {
      body.push({ kind: "zone", zone });
    }
  }

  return body;
}

export function composeHistoricalPublicEditorialBody<
  Zone extends PublicEditorialBodyZone,
>(
  zones: readonly Zone[],
  videoPosition: number,
): HistoricalPublicEditorialBodyBlock<Zone>[] {
  if (zones.length === 0) {
    return [];
  }

  const clampedVideoPosition = Math.min(
    Math.max(videoPosition, 0),
    zones.length,
  );
  const zoneBlocks: PublicEditorialZoneBodyBlock<Zone>[] =
    zones.map((zone) => ({
      kind: "zone",
      zone,
    }));

  return [
    ...zoneBlocks.slice(0, clampedVideoPosition),
    { kind: "video" },
    ...zoneBlocks.slice(clampedVideoPosition),
  ];
}

export function composeLivePublicEditorialBody(
  order: readonly MatchdayLivePublicZoneKey[],
): PublicEditorialBodyBlock<LivePublicEditorialZone>[] {
  return order.map((block) => {
    if (block === "video") {
      return { kind: "video" };
    }

    if (block === "four_news") {
      return { kind: "latest" };
    }

    return {
      kind: "zone",
      zone: {
        key: block,
        visualFamily: block,
      },
    };
  });
}
