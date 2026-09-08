import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260908142701_historical_republish_v19_certificate_archive_integrity.sql";
const v19MigrationPath =
  "supabase/migrations/20260905142832_matchday_live_layout_physical_handoff_v19.sql";
const smokePath =
  "supabase/sql/test-matchday-live-layout-physical-handoff-pg17.sql";

const migration = readFileSync(migrationPath, "utf8");
const v19Migration = readFileSync(v19MigrationPath, "utf8");
const smoke = readFileSync(smokePath, "utf8");

function section(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `inicio ausente: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `fim ausente: ${endNeedle}`);
  return source.slice(start, end);
}

const historicalValidator = section(
  migration,
  "create function\njornada_private.assert_matchday_live_layout_historical_republish_v19(",
  "revoke all on function\n  jornada_private.assert_matchday_live_layout_historical_republish_v19(",
);
const patchBlock = section(migration, "do $patch$", "do $postconditions$");
const originalPublish = section(
  v19Migration,
  "create or replace function public.publish_matchday_reference_composition(",
  "revoke all on function\n  public.publish_matchday_reference_composition(uuid, uuid)",
);
const originalHistoricalBranch = section(
  originalPublish,
  "  if v_has_transition then",
  "  if not v_source_is_managed then",
);

test("correcao e forward-only, transacional e sem editar o contrato v19 aplicado", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
  assert.equal((migration.match(/^begin;/gm) ?? []).length, 1);
  assert.equal((migration.match(/^commit;/gm) ?? []).length, 1);
  assert.ok(migrationPath > v19MigrationPath);

  const protectedChanges = execFileSync(
    "git",
    ["diff", "--name-only", "--", v19MigrationPath],
    { encoding: "utf8" },
  ).trim();
  assert.equal(protectedChanges, "");
});

test("validador historico prova a cadeia v19 e o arquivo congelado da origem", () => {
  for (const authority of [
    "matchday_live_layout_physical_handoffs",
    "matchday_live_layout_physical_topology_transitions",
    "matchday_live_layout_physical_carryovers",
    "matchday_editorial_continuity_transitions",
    "matchday_editorial_desk_control",
    "matchday_live_layout_physical_archive_hash_v19",
  ]) {
    assert.match(historicalValidator, new RegExp(authority));
  }

  assert.match(historicalValidator, /source_matchday_id = p_source_matchday_id/);
  assert.match(historicalValidator, /target_matchday_id = p_target_matchday_id/);
  assert.match(historicalValidator, /source_composition_id = p_source_composition_id/);
  assert.match(historicalValidator, /topology_transition_id =\s*\n?\s*v_handoff\.topology_transition_id/);
  assert.match(historicalValidator, /carryover_row\.id = v_handoff\.carryover_id/);
  assert.match(historicalValidator, /continuity_version = 19/);
  assert.match(historicalValidator, /not source_desk\.is_managed/);
  assert.match(historicalValidator, /carryover_source_composition_id is null/);
  assert.match(historicalValidator, /carryover_snapshot is null/);
  assert.match(historicalValidator, /is distinct from v_handoff\.source_archive_hash/);
});

test("validador historico nao le nem compara o estado vivo atual do target", () => {
  for (const forbidden of [
    "assert_matchday_live_layout_physical_handoff_ready_v19",
    "assert_matchday_live_layout_physical_handoff_complete_v19",
    "read_matchday_live_layout_workspace",
    "matchday_live_layout_workspace_settings",
    "matchday_live_layout_zones",
    "matchday_live_layout_blocks",
    "matchday_editorial_bank_items",
    "matchday_live_layout_placements",
    "matchday_latest_news",
  ]) {
    assert.doesNotMatch(historicalValidator, new RegExp(forbidden));
  }

  assert.doesNotMatch(historicalValidator, /v_handoff\.target_state_token\s*(?:=|is distinct from)\s*v_current/i);
});

test("patch substitui apenas os dois asserts do ramo historical republish", () => {
  assert.equal(
    (
      originalHistoricalBranch.match(
        /assert_matchday_live_layout_physical_handoff_complete_v19/g,
      ) ?? []
    ).length,
    2,
  );
  assert.match(patchBlock, /v_occurrences <> 2/);
  assert.match(patchBlock, /pg_catalog\.replace\(v_definition, v_old_name, v_new_name\)/);
  assert.match(patchBlock, /execute v_fixed/);

  for (const protectedFunction of [
    "assert_matchday_live_layout_physical_handoff_ready_v19",
    "assert_matchday_live_layout_physical_handoff_complete_v19",
    "materialize_matchday_live_layout_physical_handoff_v19",
    "recover_matchday_live_layout_continuity",
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`create(?: or replace)? function\\s+(?:public|jornada_private)\\.${protectedFunction}\\(`),
    );
  }
});

test("postconditions preservam os asserts fortes no handoff e na recovery", () => {
  assert.match(
    migration,
    /v_core_definition[\s\S]*assert_matchday_live_layout_physical_handoff_complete_v19/,
  );
  assert.match(
    migration,
    /v_recovery_definition[\s\S]*materialize_matchday_live_layout_physical_handoff_v19/,
  );
  assert.match(
    migration,
    /matchday-live-layout-historical-v19-function-boundary-invalid/,
  );
});

test("republicacao continua sem writes para transition ou superficies live do target", () => {
  assert.doesNotMatch(
    originalHistoricalBranch,
    /(?:insert into|update|delete from)\s+(?:public|jornada_private)\.(?:matchday_editorial_continuity_transitions|matchday_live_layout_physical_topology_transitions|matchday_live_layout_physical_carryovers|matchday_live_layout_physical_handoffs|matchday_live_layout_workspace_settings|matchday_live_layout_zones|matchday_live_layout_blocks|matchday_editorial_bank_items|matchday_live_layout_placements|matchday_latest_news)/i,
  );
  assert.doesNotMatch(
    historicalValidator,
    /(?:insert into|update|delete from)\s+/i,
  );
  assert.match(originalHistoricalBranch, /v_transition_after is distinct from v_transition_before/);
  assert.match(originalHistoricalBranch, /v_source_archive_after is distinct from v_source_archive_before/);
});

test("RPC corrigida e validador privado mantem privilegios minimos", () => {
  assert.match(historicalValidator, /stable\s+security definer\s+set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function\s+jornada_private\.assert_matchday_live_layout_historical_republish_v19\([\s\S]*?from public, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /revoke all on function\s+public\.publish_matchday_reference_composition\(uuid, uuid\)[\s\S]*?from public, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /grant execute on function\s+public\.publish_matchday_reference_composition\(uuid, uuid\)\s+to service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function\s+jornada_private\.assert_matchday_live_layout_historical_republish_v19/i,
  );
});

test("smoke prova target evoluido, republicacao permitida e nenhuma mutacao colateral", () => {
  assert.match(smoke, /update public\.matchday_live_layout_workspace_settings as target_settings/);
  assert.match(smoke, /Últimas J06 depois do handoff/);
  assert.match(smoke, /workspace_row\.state_token is distinct from\s+handoff_row\.target_state_token/);
  assert.match(smoke, /select public\.publish_matchday_reference_composition\([\s\S]*?as result/);
  assert.match(smoke, /historical republication accepts evolved target without writes/);
  assert.match(smoke, /matchday_live_layout_physical_archive_hash_v19\([\s\S]*?= \(select source_hash from republish_before\)/);
  assert.match(smoke, /target_live_state_v19\([\s\S]*?= \(select target_state from republish_before\)/);

  for (const frozenSurface of [
    "transition",
    "topology",
    "carryover",
    "handoff",
    "settings",
    "zones",
    "blocks",
    "bank",
    "placements",
    "latest",
    "state_token",
  ]) {
    assert.match(smoke, new RegExp(`'${frozenSurface}'`));
  }

  assert.match(smoke, /normal physical handoff with seven zones/);
  assert.match(smoke, /normal handoff rollback and retry/);
  assert.match(smoke, /physical recovery states converge on v19/);
  assert.match(smoke, /rollback;/);
});
