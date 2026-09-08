import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveMatchdayLatestPlacement,
  storeMatchdayLatestPlacement,
} from "./editorial-matchday-latest-placement";

const ZONE_A = "10000000-0000-4000-8000-000000000001";

test("HEADLINE e HIDDEN não conservam companion", () => {
  assert.deepEqual(storeMatchdayLatestPlacement({ kind: "headline" }), {
    latestZonePlacement: "top",
    latestCompanionZoneId: null,
  });
  assert.deepEqual(storeMatchdayLatestPlacement({ kind: "hidden" }), {
    latestZonePlacement: "hidden",
    latestCompanionZoneId: null,
  });
  assert.deepEqual(resolveMatchdayLatestPlacement("top", null), {
    kind: "headline",
  });
  assert.deepEqual(resolveMatchdayLatestPlacement("hidden", null), {
    kind: "hidden",
  });
});

test("ZONE é armazenado apenas como four_news técnico mais UUID", () => {
  assert.deepEqual(
    storeMatchdayLatestPlacement({ kind: "zone", zoneId: ZONE_A }),
    {
      latestZonePlacement: "four_news",
      latestCompanionZoneId: ZONE_A,
    },
  );
  assert.deepEqual(resolveMatchdayLatestPlacement("four_news", ZONE_A), {
    kind: "zone",
    zoneId: ZONE_A,
  });
});

test("four_news sem UUID é legado incompleto e não infere uma zona", () => {
  assert.deepEqual(resolveMatchdayLatestPlacement("four_news", null), {
    kind: "legacy_incomplete",
    storagePlacement: "four_news",
    companionZoneId: null,
  });
});

test("top/hidden com UUID também são reconhecidos como incoerência legada", () => {
  for (const placement of ["top", "hidden"] as const) {
    assert.deepEqual(resolveMatchdayLatestPlacement(placement, ZONE_A), {
      kind: "legacy_incomplete",
      storagePlacement: placement,
      companionZoneId: ZONE_A,
    });
  }
});
