import type {
  MatchdayEditorialProfileReconcileResult,
} from "@/lib/editorial-matchday-profile-reconcile";

export type MatchdayEditorialProfileApplyIssue =
  | Readonly<{
      code: "incomplete-zone";
      zoneKey: string;
      zoneLabel: string;
      actual: number;
      expected: number;
    }>
  | Readonly<{
      code: "invalid-zone-positions";
      zoneKey: string;
      zoneLabel: string;
      actualPositions: readonly number[];
      expectedPositions: readonly number[];
    }>
  | Readonly<{
      code: "incomplete-selection";
      actual: number;
      expected: 4;
    }>
  | Readonly<{
      code: "duplicate-selection";
    }>;

export function validateMatchdayEditorialProfileApplyState(
  reconcile: Pick<MatchdayEditorialProfileReconcileResult, "zonesAfter">,
  selectionBankItemIds: readonly (string | null)[],
): readonly MatchdayEditorialProfileApplyIssue[] {
  const issues: MatchdayEditorialProfileApplyIssue[] = [];

  for (const zone of reconcile.zonesAfter) {
    if (zone.items.length !== zone.capacity) {
      issues.push({
        code: "incomplete-zone",
        zoneKey: zone.key,
        zoneLabel: zone.label,
        actual: zone.items.length,
        expected: zone.capacity,
      });
    }

    const actualPositions = [...zone.items]
      .map((item) => item.sortOrder)
      .sort((left, right) => left - right);

    const expectedPositions = Array.from(
      { length: zone.capacity },
      (_, index) => index + 1,
    );

    if (
      actualPositions.length !== expectedPositions.length
      || actualPositions.some(
        (position, index) => position !== expectedPositions[index],
      )
    ) {
      issues.push({
        code: "invalid-zone-positions",
        zoneKey: zone.key,
        zoneLabel: zone.label,
        actualPositions,
        expectedPositions,
      });
    }
  }

  const selected = selectionBankItemIds
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (selected.length !== 4) {
    issues.push({
      code: "incomplete-selection",
      actual: selected.length,
      expected: 4,
    });
  } else if (new Set(selected).size !== 4) {
    issues.push({
      code: "duplicate-selection",
    });
  }

  return issues;
}