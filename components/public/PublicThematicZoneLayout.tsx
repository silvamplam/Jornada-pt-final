import type {
  PublicMatchdayThematicZone,
} from "@/lib/public-matchday-thematic";

import PublicFlexibleZoneLayout from "./PublicFlexibleZoneLayout";

export default function PublicThematicZoneLayout({
  zone,
  matchdayNumber,
}: {
  zone: PublicMatchdayThematicZone;
  matchdayNumber: number;
}) {
  return (
    <PublicFlexibleZoneLayout
      matchdayNumber={matchdayNumber}
      zone={zone}
    />
  );
}