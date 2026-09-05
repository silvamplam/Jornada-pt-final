import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260905135209_matchday_live_layout_physical_carryover_v18.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-layout-physical-carryover-pg17.sql";

const migration = readFileSync(migrationPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `missing section start: ${startNeedle}`);
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing section end: ${endNeedle}`);
  return migration.slice(start, end);
}

const materializer = section(
  "jornada_private.materialize_matchday_live_layout_physical_carryover_v18(",
  "revoke all on function\n  jornada_private.materialize_matchday_live_layout_physical_carryover_v18(",
);

test("v18 persists one private content certificate and a contextual Bank map", () => {
  assert.match(
    migration,
    /create table jornada_private\.matchday_live_layout_physical_carryovers/u,
  );
  assert.match(
    migration,
    /create table jornada_private\.matchday_live_layout_physical_bank_maps/u,
  );
  assert.match(migration, /unique \(topology_transition_id\)/u);
  assert.match(migration, /source_bank_item_id <> target_bank_item_id/u);
  assert.match(
    migration,
    /foreign key \(source_bank_item_id, source_matchday_id\)/u,
  );
  assert.match(
    migration,
    /foreign key \(target_bank_item_id, target_matchday_id\)/u,
  );
  assert.doesNotMatch(
    section(
      "create table jornada_private.matchday_live_layout_physical_bank_maps (",
      "create index matchday_live_layout_physical_bank_maps_source_idx",
    ),
    /legacy_zone_key/u,
  );
});

test("materializer is physical-only and remains outside handoff", () => {
  assert.match(
    materializer,
    /language plpgsql\s+volatile\s+security definer\s+set search_path = ''/u,
  );
  assert.match(materializer, /assert_matchday_live_layout_physical_carryover_v18/u);
  assert.match(materializer, /topology_transition_id/u);
  assert.doesNotMatch(materializer, /sync_matchday_live_layout_shadow/u);
  assert.doesNotMatch(materializer, /retire_matchday_live_layout_source/u);
  assert.doesNotMatch(materializer, /recover_matchday_live_layout_continuity/u);
  assert.doesNotMatch(materializer, /is_managed\s*=\s*true/u);
  assert.doesNotMatch(
    migration,
    /grant execute on function\s+jornada_private\.materialize_matchday_live_layout_physical_carryover_v18/u,
  );
});

test("active Bank identity is remapped before any state or placement", () => {
  const mapInsert = materializer.indexOf(
    "insert into jornada_private.matchday_live_layout_physical_bank_maps",
  );
  const bankInsert = materializer.indexOf(
    "insert into public.matchday_editorial_bank_items",
  );
  const overrideInsert = materializer.indexOf(
    "insert into public.matchday_editorial_profile_manual_overrides",
  );
  const placementApply = materializer.indexOf(
    "apply_matchday_live_layout_placement_plan",
  );
  const memoryInsert = materializer.indexOf(
    "insert into public.matchday_live_layout_bank_item_state_memory",
  );
  assert.ok(mapInsert >= 0);
  assert.ok(bankInsert > mapInsert);
  assert.ok(overrideInsert > bankInsert);
  assert.ok(placementApply > overrideInsert);
  assert.ok(memoryInsert > placementApply);
  assert.match(materializer, /status\)\) = 'active'/u);
  assert.match(materializer, /automatic_eligible,[\s\S]*?false,/u);
});

test("classification and NOVA/worked are copied independently from placement", () => {
  assert.match(
    materializer,
    /source_bank\.classification_key,[\s\S]*?'continuity_assisted'/u,
  );
  assert.match(
    materializer,
    /source_bank\.editorially_worked_at,[\s\S]*?source_bank\.classification_key/u,
  );
  assert.match(migration, /NULL is intentionally preserved because it is the observable NOVA/u);
  assert.doesNotMatch(materializer, /target_zone[^\n]*classification_key/u);
  assert.doesNotMatch(materializer, /placement[^\n]*classification_key\s*=/u);
});

test("zone placements use only the persistent physical zone map", () => {
  assert.match(
    materializer,
    /zone_map\.topology_transition_id = p_topology_transition_id[\s\S]*?zone_map\.source_zone_id = source_placement\.zone_id/u,
  );
  assert.match(materializer, /then zone_map\.target_zone_id else null end/u);
  assert.doesNotMatch(materializer, /source_projection/u);
  assert.doesNotMatch(materializer, /legacy_zone_key/u);
});

test("Latest, roundup and functional layout snapshots cannot become placement authority", () => {
  assert.match(materializer, /insert into public\.matchday_latest_news/u);
  assert.match(materializer, /insert into public\.matchday_roundup_items/u);
  assert.match(
    materializer,
    /slot_type !~ '\^live_four_news:\[1-4\]\$'/u,
  );
  assert.match(
    migration,
    /is_matchday_live_layout_carryover_v18\(new\.matchday_id\)[\s\S]*?return new;/u,
  );
  assert.match(
    materializer,
    /project_matchday_live_layout_placements_downstream_v14/u,
  );
});

test("one transaction preserves source and leaves no reverse sync", () => {
  assert.match(materializer, /acquire_matchday_live_desk_handoff_lock/u);
  assert.doesNotMatch(materializer, /pg_advisory_xact_lock/u);
  assert.match(materializer, /order by lock_row\.id\s+for update;/u);
  assert.match(materializer, /v_source_hash_before/u);
  assert.match(materializer, /v_source_hash_after/u);
  assert.match(materializer, /source-changed/u);
  assert.match(migration, /'physical_cutover',[\s\S]*?'zone_projection',[\s\S]*?'assignment'/u);
  assert.match(materializer, /reverse-sync-enqueued/u);
  assert.match(materializer, /state-items-created/u);
  assert.match(materializer, /token-unchanged/u);
});

test("temporary authority is private and scoped to backend, xid and exact target", () => {
  const contextTable = section(
    "create table jornada_private.matchday_live_layout_physical_carryover_context (",
    "create index matchday_live_layout_physical_carryover_context_id_idx",
  );
  assert.match(contextTable, /backend_pid integer not null/u);
  assert.match(contextTable, /transaction_id xid8 not null/u);
  assert.match(contextTable, /target_matchday_id uuid not null/u);
  assert.match(contextTable, /carryover_id uuid not null/u);
  assert.match(contextTable, /foreign key \(carryover_id, target_matchday_id\)/u);
  assert.match(
    migration,
    /context_row\.backend_pid = pg_catalog\.pg_backend_pid\(\)[\s\S]*?context_row\.transaction_id = pg_catalog\.pg_current_xact_id\(\)[\s\S]*?context_row\.target_matchday_id = p_matchday_id/u,
  );
  assert.match(materializer, /begin_matchday_live_layout_downstream_v14/u);
  assert.match(materializer, /end_matchday_live_layout_downstream_v14/u);
  assert.match(
    materializer,
    /delete from jornada_private\.matchday_live_layout_physical_carryover_context[\s\S]*?target_matchday_id = p_target_matchday_id/u,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function\s+jornada_private\.is_matchday_live_layout_carryover_v18/u,
  );
});

test("v18 migration does not wire or replace the existing orchestrators", () => {
  for (const name of [
    "publish_matchday_reference_composition_with_continuity",
    "recover_matchday_live_layout_continuity",
    "retire_matchday_live_layout_source",
    "materialize_matchday_live_layout_continuity",
  ]) {
    assert.doesNotMatch(migration, new RegExp(`create(?: or replace)? function[^;]*${name}`));
  }
});

test("PG17 fixture covers seven zones, states, failure injection and retry", () => {
  assert.match(fixture, /zone six placement was not remapped by the physical map/u);
  assert.match(fixture, /zone seven placement was not remapped by the physical map/u);
  assert.match(fixture, /Faixa gaps were compacted/u);
  assert.match(fixture, /NOVA worked timestamp changed/u);
  assert.match(fixture, /archived Bank participation was carried/u);
  assert.match(fixture, /Latest created lateral physical placement/u);
  assert.match(fixture, /failure after Bank did not roll back to topology-only/u);
  assert.match(fixture, /failure after placements did not roll back to topology-only/u);
  assert.match(fixture, /successful retry did not fail closed/u);
  assert.match(fixture, /authorization leaked to matchday B/u);
  assert.match(fixture, /automatic_eligible or worked timestamp changed after final triggers/u);
  assert.match(fixture, /memory was not preserved exactly/u);
  assert.match(fixture, /pg_advisory_xact_lock\(6026, 2\)/u);
});
