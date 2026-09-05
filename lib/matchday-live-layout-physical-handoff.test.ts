import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260905142832_matchday_live_layout_physical_handoff_v19.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-layout-physical-handoff-pg17.sql";

const migration = readFileSync(migrationPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `missing section start: ${startNeedle}`);
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing section end: ${endNeedle}`);
  return migration.slice(start, end);
}

const core = section(
  "jornada_private.materialize_matchday_live_layout_physical_handoff_v19(",
  "revoke all on function\n  jornada_private.materialize_matchday_live_layout_physical_handoff_v19(",
);
const dispatcher = section(
  "public.publish_matchday_reference_composition_with_continuity(",
  "revoke all on function\n  public.publish_matchday_reference_composition_with_continuity(",
);
const retirement = section(
  "jornada_private.retire_matchday_live_layout_physical_source_v19(",
  "revoke all on function\n  jornada_private.retire_matchday_live_layout_physical_source_v19(",
);

test("v19 has one explicit physical/legacy decision before materialization", () => {
  assert.match(
    migration,
    /matchday_live_layout_continuity_authority_v19[\s\S]*?return 'physical'[\s\S]*?return 'legacy'/u,
  );
  assert.match(dispatcher, /v_authority :=[\s\S]*?continuity_authority_v19/u);
  assert.match(dispatcher, /if v_authority = 'physical'/u);
  assert.match(dispatcher, /physical_handoff_v19/u);
  assert.match(dispatcher, /publish_matchday_continuity_legacy_v6/u);
  assert.doesNotMatch(dispatcher, /exception when/u);
  assert.match(
    migration,
    /source-physical-incoherent/u,
  );
});

test("physical core composes v17 and v18 under the existing barrier", () => {
  assert.match(core, /acquire_matchday_live_desk_handoff_lock/u);
  assert.match(core, /acquire_matchday_live_layout_cutover_core_lock/u);
  assert.match(core, /order by lock_row\.id\s+for update/u);
  assert.match(core, /materialize_matchday_live_layout_physical_topology_v17/u);
  assert.match(core, /materialize_matchday_live_layout_physical_carryover_v18/u);
  assert.doesNotMatch(core, /pg_advisory_xact_lock/u);
  assert.doesNotMatch(core, /legacy_zone_key/u);
  assert.doesNotMatch(core, /sync_matchday_live_layout_shadow/u);
});

test("final certificate is written only after carryover validation and ownership switch", () => {
  const ready = core.indexOf(
    "assert_matchday_live_layout_physical_handoff_ready_v19",
  );
  const retire = core.indexOf(
    "retire_matchday_live_layout_physical_source_v19",
  );
  const publicCertificate = core.indexOf(
    "insert into public.matchday_editorial_continuity_transitions",
  );
  const finalCertificate = core.indexOf(
    "insert into jornada_private.matchday_live_layout_physical_handoffs",
  );
  assert.ok(ready >= 0);
  assert.ok(retire > ready);
  assert.ok(publicCertificate > retire);
  assert.ok(finalCertificate > publicCertificate);
  assert.match(core, /continuity_version,[\s\S]*?19,/u);
});

test("physical retirement preserves the historical physical archive", () => {
  assert.match(retirement, /source_archive_hash/u);
  assert.match(retirement, /set is_managed = false/u);
  assert.match(retirement, /set is_managed = true/u);
  assert.doesNotMatch(retirement, /delete from/u);
  assert.doesNotMatch(retirement, /legacy_zone_key/u);
  assert.doesNotMatch(retirement, /project_matchday/u);
  assert.match(
    migration,
    /'zones'[\s\S]*?'blocks'[\s\S]*?'settings'[\s\S]*?'bank'[\s\S]*?'placements'[\s\S]*?'memory'[\s\S]*?'latest'[\s\S]*?'roundup'/u,
  );
});

test("normal and recovery converge on the same private physical core", () => {
  assert.match(core, /v_operation not in \('normal', 'recovery'\)/u);
  assert.match(core, /recovery-topology-missing/u);
  assert.match(core, /resumed_after_topology/u);
  assert.match(core, /resumed_after_carryover/u);
  assert.match(core, /already_complete/u);
  assert.match(
    migration,
    /public\.recover_matchday_live_layout_continuity[\s\S]*?materialize_matchday_live_layout_physical_handoff_v19/u,
  );
});

test("v6 survives only behind private legacy wrappers", () => {
  assert.match(
    migration,
    /alter function[\s\S]*?rename to publish_matchday_continuity_legacy_v6/u,
  );
  assert.match(
    migration,
    /alter function[\s\S]*?rename to recover_matchday_continuity_legacy_v6/u,
  );
  assert.match(
    migration,
    /revoke all on function\s+jornada_private\.publish_matchday_continuity_legacy_v6/u,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function\s+jornada_private\.materialize_matchday_live_layout_continuity/u,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function\s+jornada_private\.retire_matchday_live_layout_source/u,
  );
});

test("physical republication validates and preserves the completed transition", () => {
  assert.match(migration, /continuity_version not in \(6, 19\)/u);
  assert.match(
    migration,
    /assert_matchday_live_layout_physical_handoff_complete_v19/u,
  );
  assert.match(migration, /composition_historical_physical_archive_changed/u);
  assert.match(migration, /'publicationKind', 'historical_republish'/u);
});

test("private authority stays private and public API remains service-role only", () => {
  assert.match(
    migration,
    /security definer\s+set search_path = ''/u,
  );
  assert.match(
    migration,
    /revoke all on table\s+jornada_private\.matchday_live_layout_physical_handoffs/u,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function\s+jornada_private\./u,
  );
  assert.match(
    migration,
    /grant execute on function\s+public\.publish_matchday_reference_composition/u,
  );
});

test("PG17 fixture exercises real publication, seven zones and rollback/recovery", () => {
  for (const proof of [
    "real publication did not choose physical v19",
    "seven-zone target topology was not preserved",
    "zone six placement was not remapped by the physical map",
    "physical retirement changed the source archive",
    "failure after v17 did not roll back the normal handoff",
    "failure after v18 did not roll back the normal handoff",
    "failure after target activation did not roll back the normal handoff",
    "legacy source did not use continuity v6",
    "physical corruption fell back to legacy",
    "topology-only recovery did not converge",
    "carryover-complete recovery did not converge",
    "historical republication duplicated physical materialization",
  ]) {
    assert.match(fixture, new RegExp(proof));
  }
});
