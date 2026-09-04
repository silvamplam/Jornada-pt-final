import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildLiveLayoutLegacyCompatibility,
  legacyZoneKeyForLiveLayoutZoneId,
  liveLayoutZoneIdForLegacyZoneKey,
} from "@/lib/editorial-matchday-live-layout-compatibility-adapter";
import {
  parseLiveLayoutZoneId,
  type MatchdayLiveLayoutZone,
} from "@/lib/editorial-matchday-live-layout-physical";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

const MATCHDAY_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_MATCHDAY_ID = "10000000-0000-4000-8000-000000000002";
const profile = EDITORIAL_PROFILES.liga_portugal_v1;

function zone(index: number): MatchdayLiveLayoutZone {
  return {
    id: parseLiveLayoutZoneId(
      `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ),
    publicTitle: index < 5 ? `Titulo enganador ${4 - index}` : "Benfica",
    visualFamily: index % 2 === 0 ? "five_news_secondary" : "six_news",
    capacity: index % 2 === 0 ? 5 : 6,
    sortOrder: 100 - index,
    items: [],
  };
}

function projectionRow(index: number, zoneIndex = index, matchdayId = MATCHDAY_ID) {
  return {
    matchday_id: matchdayId,
    legacy_zone_key: profile.zones[index].key,
    zone_id: zone(zoneIndex).id,
  };
}

test("cinco zonas com projection explicita perfeita sao representaveis", () => {
  const compatibility = buildLiveLayoutLegacyCompatibility(
    MATCHDAY_ID,
    Array.from({ length: 5 }, (_, index) => zone(index)),
    Array.from({ length: 5 }, (_, index) => projectionRow(index)),
  );

  assert.equal(compatibility.compatibility, "representable");
  assert.deepEqual(compatibility.additionalPhysicalZoneIds, []);
  assert.equal(
    liveLayoutZoneIdForLegacyZoneKey(compatibility, "fc_porto"),
    zone(2).id,
  );
  assert.equal(
    legacyZoneKeyForLiveLayoutZoneId(compatibility, zone(3).id),
    "other_liga_clubs",
  );
});

test("sexta zona permanece visivel e torna o legacy nao representavel", () => {
  const zones = Array.from({ length: 6 }, (_, index) => zone(index));
  const compatibility = buildLiveLayoutLegacyCompatibility(
    MATCHDAY_ID,
    zones,
    Array.from({ length: 5 }, (_, index) => projectionRow(index)),
  );

  assert.equal(zones.length, 6);
  assert.equal(compatibility.compatibility, "notLegacyRepresentable");
  assert.deepEqual(compatibility.additionalPhysicalZoneIds, [zone(5).id]);
  assert.throws(
    () => legacyZoneKeyForLiveLayoutZoneId(compatibility, zone(5).id),
    /matchday-live-layout-compatibility-physical-zone-not-legacy-representable/,
  );
});

test("mapping legacy ausente falha fechado", () => {
  assert.throws(
    () => buildLiveLayoutLegacyCompatibility(
      MATCHDAY_ID,
      Array.from({ length: 5 }, (_, index) => zone(index)),
      Array.from({ length: 4 }, (_, index) => projectionRow(index)),
    ),
    /matchday-live-layout-compatibility-projection-key-missing/,
  );
});

test("mapping duplicado ou cruzado falha fechado", () => {
  const rows = Array.from({ length: 5 }, (_, index) => projectionRow(index));
  assert.throws(
    () => buildLiveLayoutLegacyCompatibility(
      MATCHDAY_ID,
      Array.from({ length: 5 }, (_, index) => zone(index)),
      [...rows, projectionRow(0, 1)],
    ),
    /matchday-live-layout-compatibility-projection-key-duplicate/,
  );
  assert.throws(
    () => buildLiveLayoutLegacyCompatibility(
      MATCHDAY_ID,
      Array.from({ length: 5 }, (_, index) => zone(index)),
      [rows[0], projectionRow(1, 0), ...rows.slice(2)],
    ),
    /matchday-live-layout-compatibility-projection-zone-duplicate/,
  );
});

test("mapping de outra Jornada e projection para zona inexistente falham fechado", () => {
  const zones = Array.from({ length: 5 }, (_, index) => zone(index));
  const rows = Array.from({ length: 5 }, (_, index) => projectionRow(index));
  assert.throws(
    () => buildLiveLayoutLegacyCompatibility(
      MATCHDAY_ID,
      zones,
      [projectionRow(0, 0, OTHER_MATCHDAY_ID), ...rows.slice(1)],
    ),
    /matchday-live-layout-compatibility-projection-matchday-mismatch/,
  );
  assert.throws(
    () => buildLiveLayoutLegacyCompatibility(
      MATCHDAY_ID,
      zones,
      [
        ...rows.slice(0, 4),
        {
          ...rows[4],
          zone_id: "29999999-0000-4000-8000-000000000099",
        },
      ],
    ),
    /matchday-live-layout-compatibility-projection-zone-unknown/,
  );
});

test("adapter nao infere por titulo, ordem, visual family, classificacao ou placements", () => {
  const source = readFileSync(
    fileURLToPath(new URL(
      "./editorial-matchday-live-layout-compatibility-adapter.ts",
      import.meta.url,
    )),
    "utf8",
  );
  const compatibility = buildLiveLayoutLegacyCompatibility(
    MATCHDAY_ID,
    Array.from({ length: 5 }, (_, index) => zone(index)),
    Array.from({ length: 5 }, (_, index) => projectionRow(index)),
  );

  assert.equal(compatibility.projection[0].legacyZoneKey, "benfica");
  assert.doesNotMatch(source, /\.publicTitle|\.sortOrder|\.visualFamily|classification|\.items/);
  assert.match(source, /row\.legacy_zone_key/);
  assert.match(source, /row\.zone_id/);
});
