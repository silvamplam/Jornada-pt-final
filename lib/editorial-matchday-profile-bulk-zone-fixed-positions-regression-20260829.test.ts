import assert from "node:assert/strict";
import test from "node:test";

import type { EditorialProfileZoneKey } from "@/lib/editorial-profiles";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";
import type {
  MatchdayEditorialProfileDeskAutomaticItem,
} from "@/lib/editorial-matchday-profile-desk";
import {
  fixMatchdayEditorialItemsInZone,
  thematicEditorialIdentity,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";

const profile = EDITORIAL_PROFILES.liga_portugal_v1;
const zoneKey: EditorialProfileZoneKey = "other_liga_clubs";

function identity(sourceId: string): string {
  return thematicEditorialIdentity(
    "editorial_article",
    sourceId,
  );
}

function automaticItem(
  sourceId: string,
  actuality: number,
): MatchdayEditorialProfileDeskAutomaticItem {
  const hour = String(actuality).padStart(2, "0");

  return {
    sourceType: "editorial_article",
    sourceId,
    sortOrder: null,
    classifiedZoneKey: null,
    circuitOrder: null,
    label: `Label ${sourceId}`,
    title: `Título ${sourceId}`,
    subtitle: null,
    imageUrl: null,
    publishedAt: `2026-08-29T${hour}:00:00.000Z`,
    updatedAt: `2026-08-29T${hour}:00:00.000Z`,
  };
}

function zoneOverride(
  sourceId: string,
  sortOrder: number,
): MatchdayEditorialProfileManualOverride {
  return {
    sourceType: "editorial_article",
    sourceId,
    placementTarget: "zone",
    zoneKey,
    sortOrder,
  };
}

test("quatro entradas externas ocupam 1-4 e o fundo da zona passa para o topo da Faixa", () => {
  const existing = [
    automaticItem("a", 10),
    automaticItem("b", 11),
    automaticItem("c", 12),
    automaticItem("d", 13),
    automaticItem("e", 14),
    automaticItem("f", 15),
  ];

  const incoming = [
    automaticItem("n1", 1),
    automaticItem("n2", 20),
    automaticItem("n3", 2),
    automaticItem("n4", 19),
  ];

  const faixaExisting =
    automaticItem("faixa-existing", 5);

  const overrides:
    MatchdayEditorialProfileManualOverride[] = [
      ...existing.map((item, index) =>
        zoneOverride(item.sourceId, index + 1)),
      {
        sourceType: "editorial_article",
        sourceId: faixaExisting.sourceId,
        placementTarget: "faixa",
        zoneKey: null,
        sortOrder: 1,
      },
    ];

  const next = fixMatchdayEditorialItemsInZone(
    profile,
    [...existing, ...incoming, faixaExisting],
    overrides,
    incoming.map((item) => identity(item.sourceId)),
    zoneKey,
  );

  const zone = next
    .filter(
      (item) =>
        item.placementTarget === "zone"
        && item.zoneKey === zoneKey,
    )
    .sort(
      (left, right) =>
        (left.sortOrder ?? 0)
        - (right.sortOrder ?? 0),
    );

  assert.deepEqual(
    zone.map((item) => [
      item.sourceId,
      item.sortOrder,
    ]),
    [
      ["n1", 1],
      ["n2", 2],
      ["n3", 3],
      ["n4", 4],
      ["a", 5],
      ["b", 6],
    ],
  );

  assert.equal(
    zone.every((item) => item.sortOrder !== null),
    true,
  );

  const faixa = next
    .filter(
      (item) => item.placementTarget === "faixa",
    )
    .sort(
      (left, right) =>
        (left.sortOrder ?? 0)
        - (right.sortOrder ?? 0),
    );

  assert.deepEqual(
    faixa.map((item) => [
      item.sourceId,
      item.sortOrder,
    ]),
    [
      ["c", 1],
      ["d", 2],
      ["e", 3],
      ["f", 4],
      ["faixa-existing", 5],
    ],
  );
});

test("lote normaliza sobreviventes legacy manual-zona para posições concretas", () => {
  const existing = [
    automaticItem("legacy-a", 10),
    automaticItem("legacy-b", 11),
    automaticItem("legacy-c", 12),
    automaticItem("legacy-d", 13),
    automaticItem("legacy-e", 14),
    automaticItem("legacy-f", 15),
  ];

  const incoming = [
    automaticItem("legacy-n1", 1),
    automaticItem("legacy-n2", 20),
    automaticItem("legacy-n3", 2),
    automaticItem("legacy-n4", 19),
  ];

  const overrides: MatchdayEditorialProfileManualOverride[] =
    existing.map((entry) => ({
      sourceType: "editorial_article",
      sourceId: entry.sourceId,
      placementTarget: "zone",
      zoneKey,
      sortOrder: null,
    }));

  const currentZoneItems = existing.map((entry, index) => ({
    ...entry,
    sortOrder: index + 1,
    manualOverride: "zone" as const,
  }));

  const next = fixMatchdayEditorialItemsInZone(
    profile,
    [...existing, ...incoming],
    overrides,
    incoming.map((entry) => identity(entry.sourceId)),
    zoneKey,
    currentZoneItems,
  );

  const zone = next
    .filter(
      (entry) =>
        entry.placementTarget === "zone"
        && entry.zoneKey === zoneKey,
    )
    .sort(
      (left, right) =>
        (left.sortOrder ?? 0)
        - (right.sortOrder ?? 0),
    );

  assert.deepEqual(
    zone.map((entry) => [
      entry.sourceId,
      entry.sortOrder,
    ]),
    [
      ["legacy-n1", 1],
      ["legacy-n2", 2],
      ["legacy-n3", 3],
      ["legacy-n4", 4],
      ["legacy-a", 5],
      ["legacy-b", 6],
    ],
  );

  assert.equal(
    zone.every((entry) => entry.sortOrder !== null),
    true,
  );

  const faixa = next
    .filter(
      (entry) => entry.placementTarget === "faixa",
    )
    .sort(
      (left, right) =>
        (left.sortOrder ?? 0)
        - (right.sortOrder ?? 0),
    );

  assert.deepEqual(
    faixa.map((entry) => [
      entry.sourceId,
      entry.sortOrder,
    ]),
    [
      ["legacy-c", 1],
      ["legacy-d", 2],
      ["legacy-e", 3],
      ["legacy-f", 4],
    ],
  );
});
