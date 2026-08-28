import assert from "node:assert/strict";
import test from "node:test";

import {
  validateMatchdayEditorialProfileApplyState,
} from "@/lib/editorial-matchday-profile-apply-guard";

type Zone = Parameters<
  typeof validateMatchdayEditorialProfileApplyState
>[0]["zonesAfter"][number];

function zone(
  key: string,
  capacity: number,
  positions: readonly number[],
): Zone {
  return {
    key,
    label: key,
    capacity,
    visualFamily:
      capacity === 6
        ? "six_news"
        : "five_news_balanced",
    placementMode: "automatic_actuality",
    items: positions.map((sortOrder, index) => ({
      sourceType: "editorial_article",
      sourceId: `${key}-${index + 1}`,
      classifiedZoneKey: key,
      label: null,
      title: `${key} ${index + 1}`,
      subtitle: null,
      imageUrl: null,
      publishedAt: null,
      updatedAt: null,
      manualOverride: null,
      sortOrder,
    })),
  } as Zone;
}

const validZones = [
  zone("fc_porto", 6, [1, 2, 3, 4, 5, 6]),
  zone("sporting", 6, [1, 2, 3, 4, 5, 6]),
  zone("other_liga_clubs", 6, [1, 2, 3, 4, 5, 6]),
  zone("benfica", 5, [1, 2, 3, 4, 5]),
  zone("outside_liga_other", 5, [1, 2, 3, 4, 5]),
];

const validSelection = [
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
  "00000000-0000-0000-0000-000000000004",
] as const;

test("estado publicável aceita zonas completas e Seleção 4/4", () => {
  assert.deepEqual(
    validateMatchdayEditorialProfileApplyState(
      { zonesAfter: validZones },
      validSelection,
    ),
    [],
  );
});

test("revisão 27: FC Porto 5/6 bloqueia Apply", () => {
  const zones = validZones.map((entry) =>
    entry.key === "fc_porto"
      ? zone("fc_porto", 6, [2, 3, 4, 5, 6])
      : entry,
  );

  const issues =
    validateMatchdayEditorialProfileApplyState(
      { zonesAfter: zones },
      validSelection,
    );

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "incomplete-zone"
        && issue.zoneKey === "fc_porto"
        && issue.actual === 5
        && issue.expected === 6,
    ),
  );
});

test("buraco posicional bloqueia Apply mesmo com cardinalidade completa", () => {
  const zones = validZones.map((entry) =>
    entry.key === "fc_porto"
      ? zone("fc_porto", 6, [1, 2, 3, 4, 5, 7])
      : entry,
  );

  const issues =
    validateMatchdayEditorialProfileApplyState(
      { zonesAfter: zones },
      validSelection,
    );

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "invalid-zone-positions"
        && issue.zoneKey === "fc_porto",
    ),
  );
});

test("revisão 28: Seleção 3/4 bloqueia Apply", () => {
  const issues =
    validateMatchdayEditorialProfileApplyState(
      { zonesAfter: validZones },
      [
        null,
        validSelection[1],
        validSelection[2],
        validSelection[3],
      ],
    );

  assert.deepEqual(
    issues,
    [{
      code: "incomplete-selection",
      actual: 3,
      expected: 4,
    }],
  );
});

test("Seleção repetida bloqueia Apply", () => {
  const issues =
    validateMatchdayEditorialProfileApplyState(
      { zonesAfter: validZones },
      [
        validSelection[0],
        validSelection[1],
        validSelection[2],
        validSelection[2],
      ],
    );

  assert.deepEqual(
    issues,
    [{
      code: "duplicate-selection",
    }],
  );
});