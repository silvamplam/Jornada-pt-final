import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260905230000_matchday_live_layout_physical_crud_v20.sql";
const atomicMigrationPath =
  "supabase/migrations/20260920045217_matchday_live_layout_additional_zone_atomic_apply.sql";
const v21MigrationPath =
  "supabase/migrations/20260906220000_matchday_live_layout_four_news_optional_titles_v21.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-layout-physical-crud-v20-pg17.sql";
const routePath =
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts";
const v14Path =
  "supabase/migrations/20260904140000_matchday_live_layout_physical_apply_facade.sql";
const v17Path =
  "supabase/migrations/20260905132044_matchday_live_layout_physical_topology_constructor_v17.sql";
const v18Path =
  "supabase/migrations/20260905135209_matchday_live_layout_physical_carryover_v18.sql";
const v19Path =
  "supabase/migrations/20260905142832_matchday_live_layout_physical_handoff_v19.sql";

const migration = readFileSync(migrationPath, "utf8");
const atomicMigration = readFileSync(atomicMigrationPath, "utf8");
const v21Migration = readFileSync(v21MigrationPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");
const route = readFileSync(routePath, "utf8");
const v14 = readFileSync(v14Path, "utf8");
const v18 = readFileSync(v18Path, "utf8");
const v19 = readFileSync(v19Path, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `missing section start: ${startNeedle}`);
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing section end: ${endNeedle}`);
  return migration.slice(start, end);
}

function sectionOf(value: string, startNeedle: string, endNeedle: string): string {
  const start = value.indexOf(startNeedle);
  assert.ok(start >= 0, `missing section start: ${startNeedle}`);
  const end = value.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing section end: ${endNeedle}`);
  return value.slice(start, end);
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const capacity = section(
  "create function jornada_private.matchday_live_layout_layout_capacity_v20(",
  "revoke all on function\n  jornada_private.matchday_live_layout_layout_capacity_v20",
);
const legacyValidator = section(
  "jornada_private.validate_matchday_live_layout_legacy_projection_v14(",
  "revoke all on function\n  jornada_private.validate_matchday_live_layout_legacy_projection_v14",
);
const topologyValidator = section(
  "jornada_private.assert_matchday_live_layout_physical_topology_source_v17(",
  "revoke all on function\n  jornada_private.assert_matchday_live_layout_physical_topology_source_v17",
);
const historicalCore = section(
  "jornada_private.apply_matchday_live_layout_physical_workspace_v20_core(",
  "revoke all on function\n  jornada_private.apply_matchday_live_layout_physical_workspace_v20_core",
);
const core = sectionOf(
  atomicMigration,
  "create or replace function\njornada_private.apply_matchday_live_layout_physical_workspace_v20_core(",
  "comment on function\n  jornada_private.apply_matchday_live_layout_physical_workspace_v20_core",
);
const effectivePreviousCore = sectionOf(
  v21Migration,
  "create or replace function\njornada_private.apply_matchday_live_layout_physical_workspace_v20_core(",
  "\n\ncommit;",
);
const facade = section(
  "create function public.apply_matchday_live_layout_physical_v20(",
  "revoke all on function public.apply_matchday_live_layout_physical_v20(",
);

test("v20 is one forward-only migration and leaves historical migrations untouched", () => {
  assert.match(migration, /^begin;/u);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/u);
  assert.equal(migration.match(/^commit;$/gmu)?.length, 1);

  const historicalChanges = execFileSync(
    "git",
    ["diff", "--name-only", "--", v14Path, v17Path, v18Path, v19Path],
    { encoding: "utf8" },
  );
  assert.equal(historicalChanges.trim(), "");
});

test("a forward-only migration removes only the new-zone empty guard", () => {
  const newZoneGuard = /\n  -- A newly introduced zone is a topology-only operation and must be born\n  -- empty\. A later Apply may explicitly place content there\.\n  if exists \([\s\S]*?\n    raise exception 'matchday-live-layout-physical-v20-new-zone-not-empty';\n  end if;\n/u;

  assert.match(atomicMigration, /^begin;/u);
  assert.match(atomicMigration, /commit;\s*$/u);
  assert.equal(atomicMigration.match(/^commit;$/gmu)?.length, 1);
  assert.match(historicalCore, /new-zone-not-empty/u);
  assert.match(effectivePreviousCore, newZoneGuard);
  assert.doesNotMatch(core, /new-zone-not-empty/u);
  assert.equal(core.trim(), effectivePreviousCore.replace(newZoneGuard, "\n").trim());
});

test("one SQL function owns the three persistable layout capacities", () => {
  assert.match(capacity, /when 'six_news' then 6/u);
  assert.match(capacity, /when 'five_news_balanced' then 5/u);
  assert.match(capacity, /when 'five_news_secondary' then 5/u);
  assert.match(capacity, /else null/u);
  for (const layoutId of [
    "six_news",
    "five_news_balanced",
    "five_news_secondary",
  ]) {
    assert.equal(occurrences(migration, `'${layoutId}'`), 1);
  }
  assert.match(
    migration,
    /matchday_live_layout_zones_visual_family_check[\s\S]*?matchday_live_layout_layout_capacity_v20/u,
  );
  assert.match(
    migration,
    /create or replace function[\s\S]*?matchday_live_layout_visual_family_capacity_v13[\s\S]*?matchday_live_layout_layout_capacity_v20/u,
  );
});

test("final topology supports create, update, delete and block reordering", () => {
  assert.match(core, /insert into public\.matchday_live_layout_zones/u);
  assert.match(core, /update public\.matchday_live_layout_zones/u);
  assert.match(core, /delete from public\.matchday_live_layout_zones/u);
  assert.match(core, /insert into public\.matchday_live_layout_blocks/u);
  assert.match(core, /delete from public\.matchday_live_layout_blocks/u);
  assert.match(core, /v_block_offset integer := 1100000000/u);
  assert.match(core, /set sort_order = desired_row\.sort_order/u);
  assert.match(core, /retained-zone-block-changed/u);
  assert.doesNotMatch(core, /new-zone-not-empty/u);
  assert.match(core, /zone-owned-by-other-matchday/u);
});

test("deleted-zone content is server-enforced as DISPLACED unless explicitly moved", () => {
  assert.match(core, /Deleted-zone items have a stricter server-side contract/u);
  assert.match(core, /desired_placement\.bank_item_id = current_row\.bank_item_id/u);
  assert.match(core, /deleted-zone-items-not-displaced/u);
  assert.match(core, /deleted-zone-displaced-arrival-missing/u);
  assert.match(core, /memory_kind = 'displaced'/u);
  assert.match(core, /p_displaced_arrival_bank_item_ids/u);
  assert.match(core, /displaced-postcondition/u);
});

test("classification is an absolute before/after invariant", () => {
  for (const field of [
    "classification_key",
    "classification_source",
    "classified_at",
    "automatic_eligible",
  ]) {
    assert.match(core, new RegExp(field));
  }
  assert.match(core, /v_classification_before is distinct from/u);
  assert.match(core, /physical-v20-classification-changed/u);
  assert.doesNotMatch(
    core,
    /set\s+(?:classification_key|classification_source|classified_at|automatic_eligible)\s*=/iu,
  );
});

test("legacy is optional and only the representable subset is projected", () => {
  assert.doesNotMatch(legacyValidator, /v_keys|cardinality|array\[/u);
  assert.doesNotMatch(core, /jsonb_array_length\(p_zones\)\s*<>\s*5/u);
  assert.match(
    migration,
    /project_matchday_live_layout_workspace_best_effort_v20/u,
  );
  assert.match(migration, /if v_projection_count = 5/u);
  assert.match(
    migration,
    /project_matchday_live_layout_placements_downstream_v14/u,
  );
  assert.match(
    v14,
    /delete from public\.matchday_editorial_profile_zone_items[\s\S]*?matchday_live_layout_zone_legacy_projection/u,
  );
  assert.match(
    v14,
    /insert into public\.matchday_editorial_profile_zone_items[\s\S]*?matchday_live_layout_zone_legacy_projection/u,
  );
});

test("sparse occupancy is valid but invalid placement targets fail closed", () => {
  assert.match(core, /zone-capacity-invalid/u);
  assert.match(core, /block-topology-invalid/u);
  assert.match(core, /placement-duplicate/u);
  assert.match(core, /placement-target-invalid/u);
  assert.doesNotMatch(core, /items\.length|item_count\s*<>\s*capacity/u);
  assert.doesNotMatch(core, /min_position|max_position/u);
});

test("OCC, validation order and rollback boundary precede topology DML", () => {
  const writerLock = core.indexOf(
    "acquire_matchday_live_layout_cutover_writer_lock()",
  );
  const rowLock = core.indexOf("for update;");
  const tokenRead = core.indexOf(
    "from public.matchday_editorial_profile_workspace_token_v13(",
  );
  const staleCheck = core.indexOf("physical-v20-concurrent-write");
  const deleteGuard = core.indexOf("deleted-zone-items-not-displaced");
  const firstDml = core.indexOf("-- FIRST DML.");
  assert.ok(writerLock >= 0);
  assert.ok(rowLock > writerLock);
  assert.ok(tokenRead > rowLock);
  assert.ok(staleCheck > tokenRead);
  assert.ok(deleteGuard > staleCheck);
  assert.ok(firstDml > deleteGuard);
});

test("zone, block and placements share the existing transaction and postconditions", () => {
  const capacityValidation = core.indexOf("physical-v20-zone-capacity-invalid");
  const firstDml = core.indexOf("-- FIRST DML.");
  const zoneInsert = core.indexOf("insert into public.matchday_live_layout_zones");
  const blockInsert = core.indexOf("insert into public.matchday_live_layout_blocks");
  const placementPlan = core.indexOf("apply_matchday_live_layout_placement_plan(");
  const zonePostcondition = core.indexOf("physical-v20-zone-postcondition");
  const blockPostcondition = core.indexOf("physical-v20-block-postcondition");
  const placementPostcondition = core.indexOf("physical-v20-placement-postcondition");
  const finalToken = core.indexOf("into v_final_state_token");

  assert.ok(capacityValidation >= 0 && capacityValidation < firstDml);
  assert.ok(firstDml < zoneInsert);
  assert.ok(zoneInsert < blockInsert);
  assert.ok(blockInsert < placementPlan);
  assert.ok(placementPlan < zonePostcondition);
  assert.ok(zonePostcondition < blockPostcondition);
  assert.ok(blockPostcondition < placementPostcondition);
  assert.ok(placementPostcondition < finalToken);
  assert.match(core, /exception when others then[\s\S]*?raise;/u);
});

test("v17/v18/v19 inherit arbitrary topology without legacy fallback", () => {
  assert.match(topologyValidator, /matchday_live_layout_layout_capacity_v20/u);
  assert.doesNotMatch(
    topologyValidator,
    /validate_matchday_live_layout_legacy_projection_v14|source-zones-missing/u,
  );
  assert.match(
    v18,
    /assert_matchday_live_layout_physical_topology_source_v17/u,
  );
  assert.match(
    v18,
    /map_row\.source_zone_id = placement_row\.zone_id/u,
  );
  assert.match(
    v19,
    /matchday_live_layout_continuity_authority_v19[\s\S]*?source-physical-incoherent/u,
  );
  assert.match(
    v19,
    /assert_matchday_live_layout_physical_topology_source_v17/u,
  );
});

test("public facade is service-role-only and preserves the video guard", () => {
  assert.match(
    facade,
    /language plpgsql\s+volatile\s+security definer\s+set search_path = ''/u,
  );
  assert.match(facade, /for update of bank_row/u);
  assert.match(facade, /physical-v20-video-required/u);
  assert.match(facade, /physical-v20-highlight-required/u);
  assert.match(
    migration,
    /revoke all on function public\.apply_matchday_live_layout_physical_v20[\s\S]*?from public, anon, authenticated, service_role;/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.apply_matchday_live_layout_physical_v20[\s\S]*?to service_role;/u,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.apply_matchday_live_layout_physical_v20[\s\S]*?to (?:public|anon|authenticated);/u,
  );
});

test("physical Apply usa a autoridade de destino v29 sem fallback", () => {
  const post = route.slice(route.indexOf("export async function POST("));
  assert.equal(
    occurrences(post, "rpc/apply_matchday_live_layout_physical_v29"),
    1,
  );
  assert.doesNotMatch(post, /apply_matchday_live_layout_physical_workspace_v14/u);
  assert.doesNotMatch(post, /fallback|retry/iu);
});

test("PG17 fixture covers physical CRUD and atomic populated-zone proofs", () => {
  for (const evidence of [
    "normal zone update preserves identity",
    "sixth empty zone and block without projection",
    "cross-Jornada zone UUID fails atomically",
    "empty zone deletion",
    "sparse gap and incompatible shrink",
    "occupied delete requires displaced contract",
    "occupied delete, DISPLACED, move and legacy subset",
    "arbitrary block order",
    "stale token fails without writes",
    "mid-transaction error rolls back",
    "classification and eligibility remain identical",
    "v17/v18 arbitrary topology without legacy projection",
    "v19 remains marker-first and fail-closed",
    "service-role-only facade",
    "single Apply creates populated four_news zone",
    "single Apply creates populated five_news_balanced zone",
    "single Apply creates populated five_news_secondary zone",
    "single Apply creates populated six_news zone",
    "over-capacity new zone rolls back atomically",
    "public.apply_matchday_live_layout_physical_v29",
    "v_failure_attempts = 1",
    "slot_position = 1",
    "slot_position = 2",
    "slot_position = 3",
    "zone-capacity-invalid",
    "deleted-zone-items-not-displaced",
    "editorial_state = 'DESALOJADA'",
    "editorial_state = 'COLOCADA'",
    "legacy_projection_count = 0",
    "inherited_placement_count = 2",
    "source-physical-incoherent",
    "classification_hash",
    "automatic_eligible",
  ]) {
    assert.match(fixture, new RegExp(evidence, "iu"));
  }
  assert.match(fixture, /^\\set ON_ERROR_STOP on/u);
  assert.match(fixture, /rollback;\s*$/iu);
});
