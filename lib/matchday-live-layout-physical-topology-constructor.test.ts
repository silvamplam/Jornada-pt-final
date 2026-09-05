import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260905132044_matchday_live_layout_physical_topology_constructor_v17.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-layout-physical-topology-constructor-pg17.sql";

const migration = readFileSync(migrationPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `missing section start: ${startNeedle}`);
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing section end: ${endNeedle}`);
  return migration.slice(start, end);
}

const constructor = section(
  "jornada_private.materialize_matchday_live_layout_physical_topology_v17(",
  "revoke all on function\n  jornada_private.materialize_matchday_live_layout_physical_topology_v17(",
);

test("v17 keeps a permanent UUID-to-UUID physical zone map", () => {
  assert.match(
    migration,
    /create table jornada_private\.matchday_live_layout_physical_topology_transitions/u,
  );
  assert.match(
    migration,
    /create table jornada_private\.matchday_live_layout_physical_zone_maps/u,
  );
  const mapTable = section(
    "create table jornada_private.matchday_live_layout_physical_zone_maps (",
    "create index matchday_live_layout_physical_zone_maps_source_idx",
  );
  assert.match(mapTable, /source_zone_id uuid not null/u);
  assert.match(mapTable, /target_zone_id uuid not null/u);
  assert.match(mapTable, /source_zone_id <> target_zone_id/u);
  assert.match(mapTable, /foreign key \(source_zone_id, source_matchday_id\)/u);
  assert.match(mapTable, /foreign key \(target_zone_id, target_matchday_id\)/u);
  assert.doesNotMatch(mapTable, /legacy_zone_key/u);
  assert.match(migration, /enable row level security/u);
  assert.match(
    migration,
    /revoke all on table[\s\S]*?matchday_live_layout_physical_zone_maps[\s\S]*?service_role;/u,
  );
});

test("constructor is private, physical-only and has no legacy fallback", () => {
  assert.match(
    constructor,
    /language plpgsql\s+volatile\s+security definer\s+set search_path = ''/u,
  );
  assert.match(constructor, /source-not-physical/u);
  assert.match(constructor, /source-authority-incoherent/u);
  assert.match(constructor, /target-not-virgin/u);
  assert.match(constructor, /target-not-consecutive/u);
  assert.doesNotMatch(constructor, /sync_matchday_live_layout_shadow/u);
  assert.doesNotMatch(constructor, /legacy_zone_key\s*=\s*['"]/u);
  assert.doesNotMatch(
    migration,
    /grant execute on function\s+jornada_private\.materialize_matchday_live_layout_physical_topology_v17/u,
  );
});

test("locks and all validation precede the first topology DML", () => {
  const writerLock = constructor.indexOf(
    "acquire_matchday_live_layout_cutover_writer_lock",
  );
  const rowLock = constructor.indexOf("order by lock_row.id\n  for update;");
  const sourceValidation = constructor.indexOf(
    "assert_matchday_live_layout_physical_topology_source_v17",
  );
  const targetValidation = constructor.indexOf("target-not-virgin");
  const firstDml = constructor.indexOf(
    "insert into\n    jornada_private.matchday_live_layout_physical_topology_transitions",
  );
  assert.ok(writerLock >= 0);
  assert.ok(rowLock > writerLock);
  assert.ok(sourceValidation > rowLock);
  assert.ok(targetValidation > sourceValidation);
  assert.ok(firstDml > targetValidation);
});

test("zones and blocks receive new UUIDs and preserve physical shape", () => {
  assert.match(constructor, /source_zone\.id,\s+gen_random_uuid\(\)/u);
  assert.match(
    constructor,
    /insert into public\.matchday_live_layout_zones[\s\S]*?zone_map\.target_zone_id[\s\S]*?source_zone\.public_title[\s\S]*?source_zone\.visual_family/u,
  );
  assert.match(
    constructor,
    /insert into public\.matchday_live_layout_blocks[\s\S]*?gen_random_uuid\(\)[\s\S]*?source_block\.sort_order/u,
  );
  assert.match(
    constructor,
    /when source_block\.block_type = 'zone' then zone_map\.target_zone_id/u,
  );
  assert.doesNotMatch(
    constructor,
    /select\s+source_zone\.id,\s+p_target_matchday_id/u,
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
    assert.match(constructor, new RegExp(field));
  }
  assert.match(
    constructor,
    /source_projection\.legacy_zone_key,\s+zone_map\.target_zone_id/u,
  );
  assert.match(
    constructor,
    /zone_map\.source_zone_id = source_projection\.zone_id/u,
  );
  assert.doesNotMatch(constructor, /where[\s\S]*?legacy_zone_key\s*=/u);
});

test("marker ordering prevents assignment from reopening v16 distribution", () => {
  const settings = constructor.indexOf(
    "insert into public.matchday_live_layout_workspace_settings",
  );
  const projection = constructor.indexOf(
    "insert into jornada_private.matchday_live_layout_zone_legacy_projection",
  );
  const marker = constructor.indexOf(
    "insert into jornada_private.matchday_live_layout_physical_cutovers",
  );
  const assignment = constructor.indexOf(
    "insert into public.matchday_editorial_profile_assignments",
  );
  const downstream = constructor.indexOf(
    "begin_matchday_live_layout_downstream_v14",
  );
  assert.ok(settings >= 0 && marker > settings);
  assert.ok(downstream > marker && projection > downstream);
  assert.ok(assignment > projection);
  assert.match(constructor, /reverse-sync-enqueued/u);
  assert.match(constructor, /v_source_state_items_before/u);
  assert.match(constructor, /v_target_state_items_after/u);
});

test("constructor never carries content or placements", () => {
  assert.doesNotMatch(
    constructor,
    /insert into public\.matchday_editorial_bank_items/u,
  );
  assert.doesNotMatch(
    constructor,
    /insert into public\.matchday_live_layout_placements/u,
  );
  assert.doesNotMatch(constructor, /insert into public\.matchday_latest_news/u);
  assert.doesNotMatch(constructor, /insert into public\.matchday_roundup_items/u);
  assert.match(constructor, /content-postcondition/u);
  assert.match(constructor, /classification_before/u);
  assert.match(constructor, /source_placement_before/u);
});

test("reader exposes every current v15 setting without changing its contract", () => {
  const reader = section(
    "create or replace function public.read_matchday_live_layout_workspace_v13(",
    "revoke all on function\n  public.read_matchday_live_layout_workspace_v13",
  );
  assert.match(reader, /'latest_zone_mode', settings_row\.latest_zone_mode/u);
  assert.match(
    reader,
    /'latest_zone_title_color', settings_row\.latest_zone_title_color/u,
  );
  assert.doesNotMatch(reader, /\b(?:insert|update|delete|merge|truncate)\b/iu);
});

test("PG17 fixture proves seven zones, failures and rollback", () => {
  assert.match(fixture, /exactly seven target zones/u);
  assert.match(fixture, /source and target zone UUID sets overlap/u);
  assert.match(fixture, /source and target block UUID sets overlap/u);
  assert.match(fixture, /physical zone map is not complete 7\/7/u);
  assert.match(fixture, /only five compatibility projections/u);
  assert.match(fixture, /target unexpectedly received placements/u);
  assert.match(fixture, /source marker without settings did not fail closed/u);
  assert.match(fixture, /orphan source block did not fail closed/u);
  assert.match(fixture, /invalid source projection did not fail closed/u);
  assert.match(fixture, /invalid source order did not fail closed/u);
  assert.match(fixture, /partial target did not fail closed/u);
  assert.match(fixture, /preexisting topology map did not fail closed/u);
  assert.match(fixture, /rollback left target physical residue/u);
  assert.match(fixture, /constructor retry did not fail closed/u);
});
