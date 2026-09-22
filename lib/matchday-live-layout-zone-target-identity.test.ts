import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260922114943_matchday_live_layout_zone_target_identity.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-layout-physical-handoff-pg17.sql";
const v17Path =
  "supabase/migrations/20260905132044_matchday_live_layout_physical_topology_constructor_v17.sql";
const v18Path =
  "supabase/migrations/20260905135209_matchday_live_layout_physical_carryover_v18.sql";
const v19Path =
  "supabase/migrations/20260905142832_matchday_live_layout_physical_handoff_v19.sql";
const v20ArchivePath =
  "supabase/migrations/20260908173933_matchday_historical_physical_archive_v20.sql";
const atomicApplyPath =
  "supabase/migrations/20260920045217_matchday_live_layout_additional_zone_atomic_apply.sql";

const migration = readFileSync(migrationPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `missing section start: ${startNeedle}`);
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing section end: ${endNeedle}`);
  return migration.slice(start, end);
}

const identityTable = section(
  "create table\n  jornada_private.matchday_live_layout_physical_target_zone_identities",
  "-- The persistent map is the sole authority",
);
const backfill = section(
  "insert into\n  jornada_private.matchday_live_layout_physical_target_zone_identities",
  "-- Keep source zones protected",
);
const targetForeignKey = section(
  "alter table jornada_private.matchday_live_layout_physical_zone_maps\n  drop constraint matchday_live_layout_physical_zone_maps_target_zone_fk;",
  "-- Clone the already-proven v17 implementation",
);
const materializer = section(
  "do $clone_v17$",
  "-- Clone the current v20 implementation",
);
const applyCore = section(
  "do $clone_v20$",
  "do $postconditions$",
);

test("the correction is one atomic forward-only private migration", () => {
  assert.match(migration, /^begin;/u);
  assert.match(migration, /commit;\s*$/u);
  assert.equal(migration.match(/^commit;$/gmu)?.length, 1);
  assert.doesNotMatch(migration, /create function public\./u);
  assert.doesNotMatch(migration, /apply_matchday_live_layout_physical_v30/u);
  assert.doesNotMatch(migration, /rename to (?:materialize_matchday|apply_matchday)/u);

  const historicalChanges = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--",
      v17Path,
      v18Path,
      v19Path,
      v20ArchivePath,
      atomicApplyPath,
    ],
    { encoding: "utf8" },
  );
  assert.equal(historicalChanges.trim(), "");
});

test("target identity is private, contextual and identity-only", () => {
  for (const column of [
    "topology_transition_id uuid not null",
    "source_matchday_id uuid not null",
    "target_matchday_id uuid not null",
    "target_zone_id uuid not null",
    "created_at timestamptz not null",
  ]) {
    assert.match(identityTable, new RegExp(column));
  }
  assert.match(
    identityTable,
    /foreign key \([\s\S]*?topology_transition_id,[\s\S]*?source_matchday_id,[\s\S]*?target_matchday_id[\s\S]*?physical_topology_transitions/u,
  );
  assert.match(identityTable, /enable row level security/u);
  assert.match(
    identityTable,
    /revoke all on table[\s\S]*?from public, anon, authenticated, service_role;/u,
  );
  for (const liveAttribute of [
    "public_title",
    "visual_family",
    "block_type",
    "placement_type",
  ]) {
    assert.doesNotMatch(identityTable, new RegExp(liveAttribute));
  }
});

test("backfill is map-authoritative and proves exact coverage before FK replacement", () => {
  assert.match(
    backfill,
    /from jornada_private\.matchday_live_layout_physical_zone_maps as map_row/u,
  );
  assert.doesNotMatch(backfill, /public\.matchday_live_layout_zones/u);
  assert.match(backfill, /physical-target-zone-identity-duplicate/u);
  assert.match(backfill, /physical-target-zone-identity-backfill-incomplete/u);
  assert.match(backfill, /left join jornada_private[\s\S]*?target_zone_identities/u);
});

test("only the target FK moves to immutable contextual identity", () => {
  assert.match(
    targetForeignKey,
    /drop constraint matchday_live_layout_physical_zone_maps_target_zone_fk/u,
  );
  assert.match(
    targetForeignKey,
    /foreign key \([\s\S]*?topology_transition_id,[\s\S]*?source_matchday_id,[\s\S]*?target_matchday_id,[\s\S]*?target_zone_id[\s\S]*?references[\s\S]*?matchday_live_layout_physical_target_zone_identities/u,
  );
  assert.match(targetForeignKey, /on delete restrict/u);
  assert.match(targetForeignKey, /deferrable initially deferred/u);
  assert.doesNotMatch(migration, /drop constraint matchday_live_layout_physical_zone_maps_source_zone_fk/u);
  assert.doesNotMatch(migration, /on delete cascade/iu);
  assert.match(
    migration,
    /v_source_reference is distinct from[\s\S]*?'public\.matchday_live_layout_zones'::regclass/u,
  );
});

test("v17 materialization registers every generated target UUID without remapping", () => {
  assert.match(
    materializer,
    /pg_get_functiondef[\s\S]*?materialize_matchday_live_layout_physical_topology_v17_impl/u,
  );
  assert.match(
    materializer,
    /create or replace function\njornada_private\.materialize_matchday_live_layout_physical_topology_v17/u,
  );
  assert.match(
    materializer,
    /materialize_matchday_live_layout_physical_topology_v17_impl\([\s\S]*?p_source_matchday_id,[\s\S]*?p_target_matchday_id/u,
  );
  assert.match(
    materializer,
    /insert into[\s\S]*?physical_target_zone_identities[\s\S]*?map_row\.target_zone_id/u,
  );
  assert.match(materializer, /physical-target-zone-identity-materialization-incomplete/u);
  assert.doesNotMatch(materializer, /public_title|visual_family/u);
});

test("Apply rejects deletion of outgoing source endpoints before delegating DML", () => {
  assert.match(
    applyCore,
    /pg_get_functiondef[\s\S]*?apply_matchday_live_layout_physical_workspace_v20_core_impl/u,
  );
  assert.match(
    applyCore,
    /create or replace function\njornada_private\.apply_matchday_live_layout_physical_workspace_v20_core/u,
  );
  const lock = applyCore.indexOf(
    "acquire_matchday_live_layout_cutover_writer_lock()",
  );
  const rowLock = applyCore.indexOf("for update;");
  const sourceMapRead = applyCore.indexOf(
    "matchday_live_layout_physical_zone_maps as map_row",
  );
  const domainError = applyCore.indexOf(
    "matchday-live-layout-physical-v20-zone-source-topology-locked",
  );
  const delegation = applyCore.indexOf(
    "from jornada_private\n    .apply_matchday_live_layout_physical_workspace_v20_core_impl(",
  );

  assert.ok(lock >= 0);
  assert.ok(rowLock > lock);
  assert.ok(sourceMapRead > rowLock);
  assert.ok(domainError > sourceMapRead);
  assert.ok(delegation > domainError);
  assert.match(applyCore, /map_row\.source_zone_id = current_zone\.id/u);
  assert.match(
    applyCore,
    /btrim\(desired_zone\.payload ->> 'id'\)::uuid =\s*current_zone\.id/u,
  );
  assert.doesNotMatch(applyCore, /delete from/u);
});

test("PG17 fixture proves delete, rollback, source lock and future topology", () => {
  for (const evidence of [
    "populated mapped target deletion preserves history",
    "target deletion failure rolls back all physical state",
    "empty mapped target deletion has no side effects",
    "removed companion is cleared before target deletion",
    "future topology materializes only surviving zones",
    "outgoing source zones fail before core DML",
    "public.apply_matchday_live_layout_physical_v29",
    "memory_kind = 'displaced'",
    "matchday_live_layout_latest_companion",
    "matchday_live_layout_physical_target_zone_identities",
    "assert_matchday_live_layout_historical_physical_archive_v20",
    "zone-target-identity-injected-after-delete-failure",
    "matchday-live-layout-physical-v20-zone-source-topology-locked",
  ]) {
    assert.match(fixture, new RegExp(evidence, "u"));
  }
  assert.match(fixture, /^\\set ON_ERROR_STOP on/u);
  assert.match(fixture, /rollback;\s*$/u);
});
