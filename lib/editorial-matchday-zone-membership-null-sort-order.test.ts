import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";
import { validateMatchdayEditorialProfileManualOverrides } from "@/lib/editorial-matchday-profile-desk-operations";

const migration = readFileSync(
  fileURLToPath(new URL(
    "../supabase/migrations/20260829143000_restore_thematic_zone_membership_null_sort_order.sql",
    import.meta.url,
  )),
  "utf8",
);

const sql = migration.replace(/\s+/g, " ").trim();

test("a constraint aceita pertença manual a zona sem posição fixa", () => {
  assert.match(
    sql,
    /placement_target = 'zone' and zone_key is not null and \( sort_order is null or sort_order > 0 \)/i,
  );

  assert.match(
    sql,
    /placement_target = 'bank' and zone_key is null and sort_order is null/i,
  );

  assert.match(
    sql,
    /placement_target = 'faixa' and zone_key is null and \( sort_order is null or sort_order > 0 \)/i,
  );
});

test("o contrato TypeScript aceita zone com sortOrder null", () => {
  const [override] = validateMatchdayEditorialProfileManualOverrides(
    EDITORIAL_PROFILES.liga_portugal_v1,
    [{
      sourceType: "editorial_article",
      sourceId: "00000000-0000-0000-0000-000000000001",
      placementTarget: "zone",
      zoneKey: "other_liga_clubs",
      sortOrder: null,
    }],
  );

  assert.equal(override.placementTarget, "zone");
  assert.equal(override.zoneKey, "other_liga_clubs");
  assert.equal(override.sortOrder, null);
});