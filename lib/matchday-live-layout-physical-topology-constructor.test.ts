import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sqlIndexOf, assertSqlMatch, assertSqlDoesNotMatch } from "./migration-test-helpers";

const migrationPath =
  "supabase/migrations/20260905132044_matchday_live_layout_physical_topology_constructor_v17.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-layout-physical-topology-constructor-pg17.sql";

const migration = readFileSync(migrationPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = sqlIndexOf(migration, startNeedle);
  assert.ok(start >= 0, `missing section start: ${startNeedle}`);
  const end = sqlIndexOf(migration, endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing section end: ${endNeedle}`);
  return migration.slice(start, end);
}

const constructor = section(
  "jornada_private.materialize_matchday_live_layout_physical_topology_v17(",
  "revoke all on function\n  jornada_private.materialize_matchday_live_layout_physical_topology_v17(",
);

test("v17 keeps a permanent UUID-to-UUID physical zone map", () => {
  assertSqlMatch(
    migration,
    /create table jornada_private\.matchday_live_layout_physical_topology_transitions/u,
  );
  assertSqlMatch(
    migration,
    /create table jornada_private\.matchday_live_layout_physical_zone_maps/u,
  );
  const mapTable = section(
    "create table jornada_private.matchday_live_layout_physical_zone_maps (",
    "create index matchday_live_layout_physical_zone_maps_source_idx",
  );
  assertSqlMatch(mapTable, /source_zone_id uuid not null/u);
  assertSqlMatch(mapTable, /target_zone_id uuid not null/u);
  assertSqlMatch(mapTable, /source_zone_id <> target_zone_id/u);
  assertSqlMatch(mapTable, /foreign key \(source_zone_id, source_matchday_id\)/u);
  assertSqlMatch(mapTable, /foreign key \(target_zone_id, target_matchday_id\)/u);
  assertSqlDoesNotMatch(mapTable, /legacy_zone_key/u);
  assertSqlMatch(migration, /enable row level security/u);
  assertSqlMatch(
    migration,
    /revoke all on table[\s\S]*?matchday_live_layout_physical_zone_maps[\s\S]*?service_role;/u,
  );
});

test("constructor is private, physical-only and has no legacy fallback", () => {
  assertSqlMatch(
    constructor,
    /language plpgsql\s+volatile\s+security definer\s+set search_path = ''/u,
  );
  assertSqlMatch(constructor, /source-not-physical/u);
  assertSqlMatch(constructor, /source-authority-incoherent/u);
  assertSqlMatch(constructor, /target-not-virgin/u);
  assertSqlMatch(constructor, /target-not-consecutive/u);
  assertSqlDoesNotMatch(constructor, /sync_matchday_live_layout_shadow/u);
  assertSqlDoesNotMatch(constructor, /legacy_zone_key\s*=\s*['"]/u);
  assertSqlDoesNotMatch(
    migration,
    /grant execute on function\s+jornada_private\.materialize_matchday_live_layout_physical_topology_v17/u,
  );
});

test("locks and all validation precede the first topology DML", () => {
  const writerLock = sqlIndexOf(constructor,
    "acquire_matchday_live_layout_cutover_writer_lock",
  );
  const rowLock = sqlIndexOf(constructor, "order by lock_row.id\n  for update;");
  const sourceValidation = sqlIndexOf(constructor,
    "assert_matchday_live_layout_physical_topology_source_v17",
  );
  const targetValidation = sqlIndexOf(constructor, "target-not-virgin");
  const firstDml = sqlIndexOf(constructor,
    "insert into\n    jornada_private.matchday_live_layout_physical_topology_transitions",
  );
  assert.ok(writerLock >= 0);
  assert.ok(rowLock > writerLock);
  assert.ok(sourceValidation > rowLock);
  assert.ok(targetValidation > sourceValidation);
  assert.ok(firstDml > targetValidation);
});

test("zones and blocks receive new UUIDs and preserve physical shape", () => {
  assertSqlMatch(constructor, /source_zone\.id,\s*gen_random_uuid\(\)/u);
  assertSqlMatch(
    constructor,
    /insert into public\.matchday_live_layout_zones[\s\S]*?zone_map\.target_zone_id[\s\S]*?source_zone\.public_title[\s\S]*?source_zone\.visual_family/u,
  );
  assertSqlMatch(
    constructor,
    /insert into public\.matchday_live_layout_blocks[\s\S]*?gen_random_uuid\(\)[\s\S]*?source_block\.sort_order/u,
  );
  assertSqlMatch(
    constructor,
    /when source_block\.block_type = 'zone' then zone_map\.target_zone_id/u,
  );
  assertSqlDoesNotMatch(
    constructor,
    /select\s+source_zone\.id,\s*p_target_matchday_id/u,
  );
});

test("settings and compatibility projection are copied through physical identities", () => {
  for (const field of [
    "faixa_slot_count",
    "headline_title_color",
    "latest_zone_placement",
    "latest_zone_title",
    "latest_zone_mode",
    "latest_zone_title_color",
    "video_module_active",
  ]) {
    assertSqlMatch(constructor, new RegExp(field));
  }
  assertSqlMatch(
    constructor,
    /source_projection\.legacy_zone_key,\s*zone_map\.target_zone_id/u,
  );
  assertSqlMatch(
    constructor,
    /zone_map\.source_zone_id = source_projection\.zone_id/u,
  );
  assertSqlDoesNotMatch(constructor, /where[\s\S]*?legacy_zone_key\s*=/u);
});

test("marker ordering prevents assignment from reopening v16 distribution", () => {
  const settings = sqlIndexOf(constructor,
    "insert into public.matchday_live_layout_workspace_settings",
  );
  const projection = sqlIndexOf(constructor,
    "insert into jornada_private.matchday_live_layout_zone_legacy_projection",
  );
  const marker = sqlIndexOf(constructor,
    "insert into jornada_private.matchday_live_layout_physical_cutovers",
  );
  const assignment = sqlIndexOf(constructor,
    "insert into public.matchday_editorial_profile_assignments",
  );
  const downstream = sqlIndexOf(constructor,
    "begin_matchday_live_layout_downstream_v14",
  );
  assert.ok(settings >= 0 && marker > settings);
  assert.ok(downstream > marker && projection > downstream);
  assert.ok(assignment > projection);
  assertSqlMatch(constructor, /reverse-sync-enqueued/u);
  assertSqlMatch(constructor, /v_source_state_items_before/u);
  assertSqlMatch(constructor, /v_target_state_items_after/u);
});

test("constructor never carries content or placements", () => {
  assertSqlDoesNotMatch(
    constructor,
    /insert into public\.matchday_editorial_bank_items/u,
  );
  assertSqlDoesNotMatch(
    constructor,
    /insert into public\.matchday_live_layout_placements/u,
  );
  assertSqlDoesNotMatch(constructor, /insert into public\.matchday_latest_news/u);
  assertSqlDoesNotMatch(constructor, /insert into public\.matchday_roundup_items/u);
  assertSqlMatch(constructor, /content-postcondition/u);
  assertSqlMatch(constructor, /classification_before/u);
  assertSqlMatch(constructor, /source_placement_before/u);
});

test("reader exposes every current v15 setting without changing its contract", () => {
  const reader = section(
    "create or replace function public.read_matchday_live_layout_workspace_v13(",
    "revoke all on function\n  public.read_matchday_live_layout_workspace_v13",
  );
  assertSqlMatch(reader, /'latest_zone_mode', settings_row\.latest_zone_mode/u);
  assertSqlMatch(
    reader,
    /'latest_zone_title_color', settings_row\.latest_zone_title_color/u,
  );
  assertSqlDoesNotMatch(reader, /\b(?:insert|update|delete|merge|truncate)\b/iu);
});

test("PG17 fixture proves seven zones, failures and rollback", () => {
  assertSqlMatch(fixture, /exactly seven target zones/u);
  assertSqlMatch(fixture, /source and target zone UUID sets overlap/u);
  assertSqlMatch(fixture, /source and target block UUID sets overlap/u);
  assertSqlMatch(fixture, /physical zone map is not complete 7\/7/u);
  assertSqlMatch(fixture, /only five compatibility projections/u);
  assertSqlMatch(fixture, /target unexpectedly received placements/u);
  assertSqlMatch(fixture, /source marker without settings did not fail closed/u);
  assertSqlMatch(fixture, /orphan source block did not fail closed/u);
  assertSqlMatch(fixture, /invalid source projection did not fail closed/u);
  assertSqlMatch(fixture, /invalid source order did not fail closed/u);
  assertSqlMatch(fixture, /partial target did not fail closed/u);
  assertSqlMatch(fixture, /preexisting topology map did not fail closed/u);
  assertSqlMatch(fixture, /rollback left target physical residue/u);
  assertSqlMatch(fixture, /constructor retry did not fail closed/u);
});
