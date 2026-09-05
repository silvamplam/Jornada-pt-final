import PublicMatchdayEditorialSectionFrame from "./PublicMatchdayEditorialSectionFrame";
import {
  PublicFlexibleZoneContent,
  type PublicFlexibleZone,
} from "./PublicFlexibleZoneRenderers";

export {
  createPublicFlexibleZone,
} from "./PublicFlexibleZoneRenderers";
export type {
  PublicFlexibleZone,
  PublicFlexibleZoneInput,
  PublicFlexibleZoneItem,
  PublicFlexibleZoneSlot,
} from "./PublicFlexibleZoneRenderers";

export default function PublicFlexibleZoneLayout({
  zone,
  matchdayNumber,
}: {
  zone: PublicFlexibleZone;
  matchdayNumber: number;
}) {
  return (
    <PublicMatchdayEditorialSectionFrame kind="zone">
      <PublicFlexibleZoneContent
        matchdayNumber={matchdayNumber}
        zone={zone}
      />
    </PublicMatchdayEditorialSectionFrame>
  );
}
