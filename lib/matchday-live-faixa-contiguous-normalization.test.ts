import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260903215200_matchday_live_faixa_contiguous_normalization.sql";

const migration = readFileSync(migrationPath, "utf8");

test("7C2.1 is forward-only and does not hardcode production identities", () => {
  assert.match(migration, /^begin;/u);
  assert.match(migration, /commit;\s*$/u);
  assert.doesNotMatch(
    migration,
    /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/iu,
  );
});

test("7C2.1 scopes normalization to managed live Faixa rows with gaps", () => {
  assert.match(
    migration,
    /matchday_editorial_desk_control[\s\S]*is_managed = true/u,
  );
  assert.match(
    migration,
    /placement_row\.placement_type = 'faixa'/u,
  );
  assert.match(
    migration,
    /gap_matchdays[\s\S]*min\(faixa_row\.old_position\) <> 1/u,
  );
  assert.match(
    migration,
    /max\(faixa_row\.old_position\) <> pg_catalog\.count\(\*\)/u,
  );
});

test("normalization preserves relative editorial order and uses a collision-safe two-phase move", () => {
  assert.match(
    migration,
    /row_number\(\) over \([\s\S]*order by[\s\S]*placement_row\.slot_position,[\s\S]*placement_row\.created_at,[\s\S]*placement_row\.id/u,
  );
  assert.match(
    migration,
    /max_position \+ faixa_row\.final_position as temporary_position/u,
  );
  const temporaryUpdate =
    migration.indexOf(
      "set slot_position = normalization_row.temporary_position",
    );
  const finalUpdate =
    migration.indexOf(
      "set slot_position = normalization_row.final_position",
    );
  assert.ok(temporaryUpdate >= 0);
  assert.ok(finalUpdate > temporaryUpdate);
});

test("7C2.1 updates slot only and never deletes or reinserts authoritative placements", () => {
  assert.doesNotMatch(
    migration,
    /delete from public\.matchday_live_layout_placements/iu,
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.matchday_live_layout_placements/iu,
  );
  assert.doesNotMatch(
    migration,
    /set[\s\S]{0,120}created_at\s*=/iu,
  );
  assert.doesNotMatch(
    migration,
    /set[\s\S]{0,120}updated_at\s*=/iu,
  );
});

test("7C2.1 serializes with handoff and preserves placement identity plus event clocks", () => {
  assert.match(
    migration,
    /acquire_matchday_live_layout_cutover_writer_lock/u,
  );
  assert.match(
    migration,
    /for update;/u,
  );
  assert.match(
    migration,
    /placement_row\.created_at is distinct from[\s\S]*normalization_row\.created_at/u,
  );
  assert.match(
    migration,
    /placement_row\.updated_at is distinct from[\s\S]*normalization_row\.updated_at/u,
  );
});

test("7C2.1 projects compatibility and fails closed unless both Faixa representations are contiguous", () => {
  assert.match(
    migration,
    /project_matchday_live_layout_placements_to_legacy/u,
  );
  assert.match(
    migration,
    /matchday-live-faixa-normalization-still-sparse/u,
  );
  assert.match(
    migration,
    /matchday-live-faixa-normalization-legacy-mismatch/u,
  );
});