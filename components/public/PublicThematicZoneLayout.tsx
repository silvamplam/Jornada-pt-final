import type {
  PublicMatchdayThematicZone,
} from "@/lib/public-matchday-thematic";

import PublicFlexibleZoneLayout, {
  createPublicFlexibleZone,
} from "./PublicFlexibleZoneLayout";

export default function PublicThematicZoneLayout({
  zone,
  matchdayNumber,
}: {
  zone: PublicMatchdayThematicZone;
  matchdayNumber: number;
}) {
  const flexibleZone = createPublicFlexibleZone({
    key: zone.key,
    visualFamily: zone.visualFamily,
    publicTitle: zone.publicTitle,
    items: zone.items,
  });

  return (
    <PublicFlexibleZoneLayout
      matchdayNumber={matchdayNumber}
      zone={flexibleZone}
    />
  );
}
