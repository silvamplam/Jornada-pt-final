import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sqlIndexOf, assertSqlMatch, assertSqlDoesNotMatch } from "./migration-test-helpers";

const migrationPath =
  "supabase/migrations/20260905135209_matchday_live_layout_physical_carryover_v18.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-layout-physical-carryover-pg17.sql";

const migration = readFileSync(migrationPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = sqlIndexOf(migration, startNeedle);
  assert.ok(start >= 0, `missing section start: ${startNeedle}`);
  const end = sqlIndexOf(migration, endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing section end: ${endNeedle}`);
  return migration.slice(start, end);
}

const materializer = section(
  "jornada_private.materialize_matchday_live_layout_physical_carryover_v18(",
  "revoke all on function\n  jornada_private.materialize_matchday_live_layout_physical_carryover_v18(",
);

test("v18 persists one private content certificate and a contextual Bank map", () => {
  assertSqlMatch(
    migration,
    /create table jornada_private\.matchday_live_layout_physical_carryovers/u,
  );
  assertSqlMatch(
    migration,
    /create table jornada_private\.matchday_live_layout_physical_bank_maps/u,
  );
  assertSqlMatch(migration, /unique \(topology_transition_id\)/u);
  assertSqlMatch(migration, /source_bank_item_id <> target_bank_item_id/u);
  assertSqlMatch(
    migration,
    /foreign key \(source_bank_item_id, source_matchday_id\)/u,
  );
  assertSqlMatch(
    migration,
    /foreign key \(target_bank_item_id, target_matchday_id\)/u,
  );
  assertSqlDoesNotMatch(
    section(
      "create table jornada_private.matchday_live_layout_physical_bank_maps (",
      "create index matchday_live_layout_physical_bank_maps_source_idx",
    ),
    /legacy_zone_key/u,
  );
});

test("materializer is physical-only and remains outside handoff", () => {
  assertSqlMatch(
    materializer,
    /language plpgsql\s+volatile\s+security definer\s+set search_path = ''/u,
  );
  assertSqlMatch(materializer, /assert_matchday_live_layout_physical_carryover_v18/u);
  assertSqlMatch(materializer, /topology_transition_id/u);
  assertSqlDoesNotMatch(materializer, /sync_matchday_live_layout_shadow/u);
  assertSqlDoesNotMatch(materializer, /retire_matchday_live_layout_source/u);
  assertSqlDoesNotMatch(materializer, /recover_matchday_live_layout_continuity/u);
  assertSqlDoesNotMatch(materializer, /is_managed\s*=\s*true/u);
  assertSqlDoesNotMatch(
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
  assertSqlMatch(materializer, /status\)\) = 'active'/u);
  assertSqlMatch(materializer, /automatic_eligible,[\s\S]*?false,/u);
});

test("classification and NOVA/worked are copied independently from placement", () => {
  assertSqlMatch(
    materializer,
    /source_bank\.classification_key,[\s\S]*?'continuity_assisted'/u,
  );
  assertSqlMatch(
    materializer,
    /source_bank\.editorially_worked_at,[\s\S]*?source_bank\.classification_key/u,
  );
  assertSqlDoesNotMatch(materializer, /coalesce\(source_bank\.editorially_worked_at/u);
  assertSqlDoesNotMatch(materializer, /target_zone[^\n]*classification_key/u);
  assertSqlDoesNotMatch(materializer, /placement[^\n]*classification_key\s*=/u);
});

test("zone placements use only the persistent physical zone map", () => {
  assertSqlMatch(
    materializer,
    /zone_map\.topology_transition_id = p_topology_transition_id[\s\S]*?zone_map\.source_zone_id = source_placement\.zone_id/u,
  );
  assertSqlMatch(materializer, /then zone_map\.target_zone_id else null end/u);
  assertSqlDoesNotMatch(materializer, /source_projection/u);
  assertSqlDoesNotMatch(materializer, /legacy_zone_key/u);
});

test("Latest, roundup and functional layout snapshots cannot become placement authority", () => {
  assertSqlMatch(materializer, /insert into public\.matchday_latest_news/u);
  assertSqlMatch(materializer, /insert into public\.matchday_roundup_items/u);
  assertSqlMatch(
    materializer,
    /slot_type !~ '\^live_four_news:\[1-4\]\$'/u,
  );
  assertSqlMatch(
    migration,
    /is_matchday_live_layout_carryover_v18\(new\.matchday_id\)[\s\S]*?return new;/u,
  );
  assertSqlMatch(
    materializer,
    /project_matchday_live_layout_placements_downstream_v14/u,
  );
});

test("one transaction preserves source and leaves no reverse sync", () => {
  assertSqlMatch(materializer, /acquire_matchday_live_desk_handoff_lock/u);
  assertSqlDoesNotMatch(materializer, /pg_advisory_xact_lock/u);
  assertSqlMatch(materializer, /order by lock_row\.id\s+for update;/u);
  assertSqlMatch(materializer, /v_source_hash_before/u);
  assertSqlMatch(materializer, /v_source_hash_after/u);
  assertSqlMatch(materializer, /source-changed/u);
  assertSqlMatch(migration, /'physical_cutover',[\s\S]*?'zone_projection',[\s\S]*?'assignment'/u);
  assertSqlMatch(materializer, /reverse-sync-enqueued/u);
  assertSqlMatch(materializer, /state-items-created/u);
  assertSqlMatch(materializer, /token-unchanged/u);
});

test("temporary authority is private and scoped to backend, xid and exact target", () => {
  const contextTable = section(
    "create table jornada_private.matchday_live_layout_physical_carryover_context (",
    "create index matchday_live_layout_physical_carryover_context_id_idx",
  );
  assertSqlMatch(contextTable, /backend_pid integer not null/u);
  assertSqlMatch(contextTable, /transaction_id xid8 not null/u);
  assertSqlMatch(contextTable, /target_matchday_id uuid not null/u);
  assertSqlMatch(contextTable, /carryover_id uuid not null/u);
  assertSqlMatch(contextTable, /foreign key \(carryover_id, target_matchday_id\)/u);
  assertSqlMatch(
    migration,
    /context_row\.backend_pid = pg_catalog\.pg_backend_pid\(\)[\s\S]*?context_row\.transaction_id = pg_catalog\.pg_current_xact_id\(\)[\s\S]*?context_row\.target_matchday_id = p_matchday_id/u,
  );
  assertSqlMatch(materializer, /begin_matchday_live_layout_downstream_v14/u);
  assertSqlMatch(materializer, /end_matchday_live_layout_downstream_v14/u);
  assertSqlMatch(
    materializer,
    /delete from jornada_private\.matchday_live_layout_physical_carryover_context[\s\S]*?target_matchday_id = p_target_matchday_id/u,
  );
  assertSqlDoesNotMatch(
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
    assertSqlDoesNotMatch(migration, new RegExp(`create(?: or replace)? function[^;]*${name}`));
  }
});

test("PG17 fixture covers seven zones, states, failure injection and retry", () => {
  assertSqlMatch(fixture, /zone six placement was not remapped by the physical map/u);
  assertSqlMatch(fixture, /zone seven placement was not remapped by the physical map/u);
  assertSqlMatch(fixture, /Faixa gaps were compacted/u);
  assertSqlMatch(fixture, /NOVA worked timestamp changed/u);
  assertSqlMatch(fixture, /archived Bank participation was carried/u);
  assertSqlMatch(fixture, /Latest created lateral physical placement/u);
  assertSqlMatch(fixture, /failure after Bank did not roll back to topology-only/u);
  assertSqlMatch(fixture, /failure after placements did not roll back to topology-only/u);
  assertSqlMatch(fixture, /successful retry did not fail closed/u);
  assertSqlMatch(fixture, /authorization leaked to matchday B/u);
  assertSqlMatch(fixture, /automatic_eligible or worked timestamp changed after final triggers/u);
  assertSqlMatch(fixture, /memory was not preserved exactly/u);
  assertSqlMatch(fixture, /pg_advisory_xact_lock\(6026, 2\)/u);
});
