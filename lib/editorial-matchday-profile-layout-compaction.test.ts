import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITORIAL_PROFILES,
  editorialProfileDefaultZoneLayouts,
  editorialProfileWithZoneLayouts,
} from "@/lib/editorial-profiles";

import {
  compactMatchdayEditorialProfileManualOverridesForLayoutChange,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";

const baseProfile =
  EDITORIAL_PROFILES.liga_portugal_v1;

const sixLayouts = {
  ...editorialProfileDefaultZoneLayouts(
    baseProfile,
  ),
  benfica: "six_news" as const,
};

const fiveLayouts = {
  ...sixLayouts,
  benfica: "five_news_balanced" as const,
};

const sixProfile =
  editorialProfileWithZoneLayouts(
    baseProfile,
    sixLayouts,
  );

const fiveProfile =
  editorialProfileWithZoneLayouts(
    baseProfile,
    fiveLayouts,
  );

function zoneOverride(
  sourceId: string,
  sortOrder: number | null,
): MatchdayEditorialProfileManualOverride {
  return {
    sourceType: "editorial_article",
    sourceId,
    placementTarget: "zone",
    zoneKey: "benfica",
    sortOrder,
  };
}

test(
  "6→5 compacta posição manual 6 para 5 sem tocar nas restantes decisões",
  () => {
    const next =
      compactMatchdayEditorialProfileManualOverridesForLayoutChange(
        sixProfile,
        fiveProfile,
        [
          zoneOverride("manual-2", 2),
          zoneOverride("manual-6", 6),
        ],
        "benfica",
      );

    assert.deepEqual(
      next.find(
        (override) =>
          override.sourceId === "manual-2",
      )?.sortOrder,
      2,
    );

    assert.deepEqual(
      next.find(
        (override) =>
          override.sourceId === "manual-6",
      )?.sortOrder,
      5,
    );
  },
);

test(
  "posição automática 5 não é representada por override e pode ser desalojada",
  () => {
    const next =
      compactMatchdayEditorialProfileManualOverridesForLayoutChange(
        sixProfile,
        fiveProfile,
        [
          zoneOverride("manual-6", 6),
        ],
        "benfica",
      );

    assert.equal(next.length, 1);
    assert.equal(next[0].sourceId, "manual-6");
    assert.equal(next[0].sortOrder, 5);
  },
);

test(
  "posição manual 5 mais posição manual 6 bloqueia redução",
  () => {
    assert.throws(
      () =>
        compactMatchdayEditorialProfileManualOverridesForLayoutChange(
          sixProfile,
          fiveProfile,
          [
            zoneOverride("manual-5", 5),
            zoneOverride("manual-6", 6),
          ],
          "benfica",
        ),
      /layout-compaction-manual-conflict/,
    );
  },
);

test(
  "seis decisões manuais de zona não cabem num layout de cinco",
  () => {
    const overrides =
      Array.from(
        { length: 6 },
        (_, index) =>
          zoneOverride(
            `manual-zone-${index + 1}`,
            null,
          ),
      );

    assert.throws(
      () =>
        compactMatchdayEditorialProfileManualOverridesForLayoutChange(
          sixProfile,
          fiveProfile,
          overrides,
          "benfica",
        ),
      /zone-capacity-exceeded/,
    );
  },
);

test(
  "aumentar capacidade não altera decisões manuais",
  () => {
    const overrides = [
      zoneOverride("manual-2", 2),
    ];

    const next =
      compactMatchdayEditorialProfileManualOverridesForLayoutChange(
        fiveProfile,
        sixProfile,
        overrides,
        "benfica",
      );

    assert.deepEqual(
      next,
      overrides,
    );
  },
);