import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260907203000_matchday_live_layout_latest_companion_handoff_v25.sql",
  "utf8",
);
const destinationMigration = readFileSync(
  "supabase/migrations/20260908204307_matchday_live_layout_latest_destination_authority_v29.sql",
  "utf8",
);

test("V25 transporta companion apenas pelo mapa de UUIDs físicos", () => {
  assert.match(
    migration,
    /matchday_live_layout_physical_zone_maps[\s\S]*source_zone_id = v_source_zone_id/,
  );
  assert.match(
    migration,
    /insert into public\.matchday_live_layout_latest_companion[\s\S]*v_target_zone_id/,
  );
  assert.doesNotMatch(migration, /public_title|visual_family|classification/);
});

test("V25 preserva a relação da source retirada como arquivo", () => {
  assert.match(
    migration,
    /matchday_live_layout_physical_handoffs[\s\S]*source_matchday_id = v_matchday_id[\s\S]*source-frozen/,
  );
  assert.match(
    migration,
    /before insert or update or delete[\s\S]*matchday_live_layout_latest_companion/,
  );
});

test("V29 não redefine nem contorna o handoff V25", () => {
  assert.doesNotMatch(
    destinationMigration,
    /carry_matchday_live_layout_latest_companion_v25|freeze_handed_off_source_companion_v25|physical_handoffs/,
  );
});
