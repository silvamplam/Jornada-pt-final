import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260901211957_matchday_live_layout_source_retirement.sql";
const bridgePath =
  "supabase/migrations/20260901201453_matchday_live_layout_cutover_bridge.sql";
const activationPath =
  "supabase/migrations/20260901201455_matchday_live_layout_authoritative_activation.sql";
const migration = readFileSync(migrationPath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `secao inicial nao encontrada: ${startNeedle}`);
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `secao final nao encontrada: ${endNeedle}`);
  return migration.slice(start, end);
}

const retirement = section(
  "create function jornada_private.retire_matchday_live_layout_source(",
  "revoke all on function\n  jornada_private.retire_matchday_live_layout_source",
);
const publication = section(
  "create or replace function\n  public.publish_matchday_reference_composition_with_continuity(",
  "revoke all on function\n  public.publish_matchday_reference_composition_with_continuity",
);
const recovery = section(
  "create or replace function public.recover_matchday_live_layout_continuity(",
  "revoke all on function public.recover_matchday_live_layout_continuity(",
);
const repair = section(
  "create temporary table matchday_live_layout_source_retirement_repair",
  "notify pgrst, 'reload schema';",
);

test("migration corretiva e integralmente transacional", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
  assert.equal((migration.match(/^begin;/gm) ?? []).length, 1);
  assert.equal((migration.match(/^commit;/gm) ?? []).length, 1);
});

test("helper e privado SECURITY DEFINER com search_path seguro", () => {
  assert.match(retirement, /security definer\s+set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function\s+jornada_private\.retire_matchday_live_layout_source\(uuid, uuid, uuid\)\s+from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(migration, /grant execute on function\s+jornada_private\.retire/);
  assert.doesNotMatch(migration, /create (?:or replace )?function public\.retire/);
});

test("retirement valida autoridade contexto historico e transition v6", () => {
  assert.match(retirement, /authority_mode = 'authoritative'/);
  assert.match(retirement, /source_row\.season_id[\s\S]*target_row\.season_id/);
  assert.match(retirement, /v_target_number <> v_source_number \+ 1/);
  assert.match(retirement, /source_desk\.is_managed = false/);
  assert.match(retirement, /target_desk\.is_managed = true/);
  assert.match(retirement, /composition_row\.matchday_id = p_source_matchday_id/);
  assert.match(retirement, /composition_row\.status = 'published'/);
  assert.match(retirement, /composition_row\.is_current = true/);
  assert.match(retirement, /transition_row\.source_matchday_id = p_source_matchday_id/);
  assert.match(retirement, /transition_row\.target_matchday_id = p_target_matchday_id/);
  assert.match(retirement, /transition_row\.source_composition_id = p_source_composition_id/);
  assert.match(retirement, /transition_row\.continuity_version = 6/);
});

test("target materializada e provada sem winner arbitrario", () => {
  assert.match(retirement, /with source_state as materialized/);
  assert.match(retirement, /target_state as materialized/);
  assert.match(retirement, /continuity_source_matchday_id = p_source_matchday_id/);
  assert.match(retirement, /continuity_source_composition_id =[\s\S]*p_source_composition_id/);
  assert.match(retirement, /source_zone\.legacy_zone_key/);
  assert.match(retirement, /target_zone\.legacy_zone_key/);
  assert.match(retirement, /\s+except\s+/);
  assert.match(retirement, /retirement-target-not-materialized/);
  assert.doesNotMatch(retirement, /\blimit\s+1\b/i);
});

test("lock global precede rows de Jornada", () => {
  const coreLock = retirement.indexOf(
    "acquire_matchday_live_layout_cutover_core_lock()",
  );
  const matchdayLock = retirement.indexOf("for update;");
  assert.ok(coreLock >= 0 && matchdayLock > coreLock);
  assert.match(retirement, /order by matchday_row\.id\s+for update/);
  assert.ok(
    publication.indexOf("acquire_matchday_live_layout_cutover_core_lock()")
      < publication.indexOf("for update;"),
  );
  assert.ok(
    recovery.indexOf("acquire_matchday_live_layout_cutover_core_lock()")
      < recovery.indexOf("for update;"),
  );
});

test("cleanup segue placements memoria forward e postconditions", () => {
  const deletePlacements = retirement.indexOf(
    "delete from public.matchday_live_layout_placements",
  );
  const deleteMemory = retirement.indexOf(
    "delete from public.matchday_live_layout_bank_item_state_memory",
  );
  const forward = retirement.indexOf(
    "project_matchday_live_layout_placements_to_legacy",
  );
  const postcondition = retirement.indexOf(
    "matchday-live-layout-retirement-postcondition-failed",
  );
  assert.ok(
    deletePlacements >= 0
      && deleteMemory > deletePlacements
      && forward > deleteMemory
      && postcondition > forward,
  );
  assert.doesNotMatch(retirement, /update[\s\S]+memory_kind/i);
  assert.doesNotMatch(retirement, /delete from public\.matchday_editorial_bank_items/);
  assert.doesNotMatch(retirement, /delete from public\.matchday_reference/);
});

test("publicacao aposenta source apenas depois da materializacao e troca live", () => {
  const materialize = publication.indexOf(
    "materialize_matchday_live_layout_continuity",
  );
  const sourceHistorical = publication.indexOf("set is_managed = false");
  const targetLive = publication.indexOf("set is_managed = true");
  const retire = publication.indexOf("retire_matchday_live_layout_source");
  assert.ok(
    materialize >= 0
      && sourceHistorical > materialize
      && targetLive > sourceHistorical
      && retire > targetLive,
  );
  assert.match(publication, /'sourceRetired', true/);
});

test("recovery limpa carryover antes de aposentar source", () => {
  const materialize = recovery.indexOf(
    "materialize_matchday_live_layout_continuity",
  );
  const clearCarryover = recovery.indexOf(
    "set carryover_source_composition_id = null",
  );
  const retire = recovery.indexOf("retire_matchday_live_layout_source");
  assert.ok(
    materialize >= 0 && clearCarryover > materialize && retire > clearCarryover,
  );
  assert.match(recovery, /'sourceRetired', true/);
});

test("repair deriva exatamente um candidato v6 e usa o mesmo helper", () => {
  assert.match(repair, /transition_row\.continuity_version = 6/);
  assert.match(repair, /source_desk\.is_managed = false/);
  assert.match(repair, /target_desk\.is_managed = true/);
  assert.match(repair, /composition_row\.status = 'published'/);
  assert.match(repair, /composition_row\.is_current = true/);
  assert.match(repair, /exists \([\s\S]*matchday_live_layout_placements/);
  assert.match(repair, /if v_candidate_count <> 1 then/);
  assert.match(repair, /retire_matchday_live_layout_source\(/);
  assert.doesNotMatch(repair, /\blimit\s+1\b/i);
  assert.doesNotMatch(migration, /6f826bbe|6bdb34a8|\b131\b|\b214\b/);
});

test("repair prova historico e target byte-logicamente intactos", () => {
  assert.match(repair, /source_composition_hash/);
  assert.match(repair, /source_items_hash/);
  assert.match(repair, /source_bank_hash/);
  assert.match(repair, /source_zones_hash/);
  assert.match(repair, /source_blocks_hash/);
  assert.match(repair, /target_placements_hash/);
  assert.match(repair, /target_bank_hash/);
  assert.match(repair, /target_latest_hash/);
  assert.match(repair, /target_roundup_hash/);
  assert.match(repair, /retirement-repair-history-mutated/);
  assert.match(repair, /retirement-repair-target-mutated/);
});

test("repair fecha queue e preserva autoridade e UNIQUE deferivel", () => {
  assert.match(repair, /set constraints all immediate/);
  assert.match(repair, /retirement-repair-queue-not-empty/);
  assert.match(repair, /authority_mode = 'authoritative'/);
  assert.match(repair, /conname =[\s\S]*matchday_live_layout_placements_matchday_bank_key/);
  assert.match(repair, /condeferrable = true/);
  assert.match(repair, /condeferred = true/);
  assert.match(repair, /having pg_catalog\.count\(\*\) > 1/);
});

test("migrations Bridge e Activation aplicadas permanecem intocadas", () => {
  const changed = execFileSync(
    "git",
    ["diff", "--name-only", "--", bridgePath, activationPath],
    { encoding: "utf8" },
  ).trim();
  assert.equal(changed, "");
  assert.ok(readFileSync(bridgePath, "utf8").length > 0);
  assert.ok(readFileSync(activationPath, "utf8").length > 0);
});
