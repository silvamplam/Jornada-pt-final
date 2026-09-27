import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sqlIndexOf, assertSqlMatch, assertSqlDoesNotMatch } from "./migration-test-helpers";

const migrationPath =
  "supabase/migrations/20260901182545_matchday_live_layout_write_core_preparation.sql";
const migration = readFileSync(migrationPath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = sqlIndexOf(migration, startNeedle);
  assert.ok(start >= 0, `secao inicial nao encontrada: ${startNeedle}`);

  const end = sqlIndexOf(migration, endNeedle, start + 1);
  assert.ok(end > start, `secao final nao encontrada: ${endNeedle}`);

  return migration.slice(start, end);
}

const forward = section(
  "create function jornada_private.project_matchday_live_layout_placements_to_legacy(",
  "revoke all on function\n  jornada_private.project_matchday_live_layout_placements_to_legacy(uuid[])",
);

const core = section(
  "create function jornada_private.apply_matchday_live_layout_placement_plan(",
  "revoke all on function\n  jornada_private.apply_matchday_live_layout_placement_plan(",
);

const continuity = section(
  "create function jornada_private.materialize_matchday_live_layout_continuity(",
  "revoke all on function\n  jornada_private.materialize_matchday_live_layout_continuity(",
);

test("migration e integralmente transacional", () => {
  assertSqlMatch(migration, /^begin;/);
  assertSqlMatch(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
});

test("formaliza Jornada viva por epoca sem current_matchday paralelo", () => {
  assertSqlMatch(migration, /add column season_id uuid/);
  assertSqlMatch(
    migration,
    /foreign key \(matchday_id, season_id\)[\s\S]*references public\.matchdays\(id, season_id\)/,
  );
  assertSqlMatch(
    migration,
    /create unique index matchday_editorial_desk_control_one_live_per_season_idx[\s\S]*on public\.matchday_editorial_desk_control\(season_id\)[\s\S]*where is_managed = true/,
  );
  assertSqlDoesNotMatch(migration, /create table[^;]*current_matchday/i);
});

test("season_id e preenchida e validada para writers antigos", () => {
  const seasonTrigger = section(
    "create function jornada_private.set_matchday_editorial_desk_control_season()",
    "revoke all on function\n  jornada_private.set_matchday_editorial_desk_control_season()",
  );
  assertSqlMatch(seasonTrigger, /from public\.matchdays/);
  assertSqlMatch(seasonTrigger, /new\.season_id := v_season_id/);
  assertSqlMatch(migration, /before insert or update of matchday_id, season_id/);
});

test("normalizador e core aceitam plano set-based de place e clear", () => {
  assertSqlMatch(
    migration,
    /create function jornada_private\.normalize_matchday_live_layout_placement_plan\([\s\S]*jsonb_array_elements\(p_plan\)[\s\S]*with ordinality/,
  );
  assertSqlMatch(core, /plan_row\.action not in \('place', 'clear'\)/);
  assertSqlMatch(core, /insert into public\.matchday_live_layout_placements/);
  assertSqlDoesNotMatch(core, /\bloop\b|\bforeach\b|\blimit\s+1\b|row_number\s*\(/i);
});

test("core valida os cinco targets e slots sparse", () => {
  for (const placementType of [
    "opening",
    "faixa",
    "selection",
    "video_highlight",
    "zone",
  ]) {
    assertSqlMatch(core, new RegExp(`'${placementType}'`));
  }
  assertSqlMatch(core, /placement_type = 'opening'[\s\S]*slot_position between 1 and 5/);
  assertSqlMatch(core, /placement_type = 'selection'[\s\S]*slot_position between 1 and 4/);
  assertSqlMatch(core, /placement_type = 'video_highlight'[\s\S]*slot_position = 1/);
  assertSqlMatch(core, /placement_type = 'faixa'[\s\S]*slot_position > 0/);
  assertSqlMatch(core, /placement_type = 'zone'[\s\S]*zone_id is not null[\s\S]*slot_position > 0/);
  assertSqlDoesNotMatch(core, /slot_position\s*<=\s*10|generate_series|compact|shift|autofill/i);
});

test("core valida Bank e zona no contexto da mesma Jornada", () => {
  assertSqlMatch(
    core,
    /bank_row\.id = plan_row\.bank_item_id[\s\S]*bank_row\.matchday_id = p_matchday_id/,
  );
  assertSqlMatch(
    core,
    /zone_row\.id = plan_row\.zone_id[\s\S]*zone_row\.matchday_id = p_matchday_id/,
  );
});

test("movement remove origem e ocupante target sem swap ou cascata", () => {
  assertSqlMatch(
    core,
    /delete from public\.matchday_live_layout_placements[\s\S]*plan_row\.bank_item_id = placement_row\.bank_item_id[\s\S]*plan_row\.placement_type = placement_row\.placement_type/,
  );
  assertSqlMatch(core, /where plan_row\.action = 'place'/);
  assertSqlDoesNotMatch(core, /swap|reorder|send.*faixa|move.*occupant/i);
  assertSqlDoesNotMatch(
    core,
    /matchday_live_layout_bank_item_state_memory|classification_key|classification_source/,
  );
});

test("clear remove apenas o target e ausencia de row continua slot vazio", () => {
  assertSqlMatch(
    core,
    /plan_row\.placement_type = placement_row\.placement_type[\s\S]*plan_row\.slot_position = placement_row\.slot_position[\s\S]*plan_row\.zone_id is not distinct from placement_row\.zone_id/,
  );
  assertSqlMatch(core, /plan_row\.action = 'clear'[\s\S]*plan_row\.bank_item_id is not null/);
  assertSqlDoesNotMatch(core, /insert[^;]*(?:empty|vacant|null::uuid)/i);
});

test("locks sao por Jornada e rows em ordem deterministica", () => {
  assertSqlMatch(core, /from public\.matchdays[\s\S]*for update/);
  assertSqlMatch(core, /order by bank_row\.id[\s\S]*for key share/);
  assertSqlMatch(core, /order by placement_row\.id[\s\S]*for update/);
  assertSqlDoesNotMatch(core, /lock table/i);
});

test("core nao escolhe winner para duplicacao legacy", () => {
  assertSqlMatch(core, /having pg_catalog\.count\(\*\) > 1/);
  assertSqlMatch(core, /existing-transversal-conflict/);
  assertSqlDoesNotMatch(core, /distinct on|row_number\s*\(|\blimit\b/i);
});

test("forward projector cobre todas as superficies placement", () => {
  for (const legacyTable of [
    "matchday_editorials",
    "matchday_highlights",
    "matchday_horizontal_news",
    "matchday_live_layout_items",
    "matchday_editorial_profile_zone_items",
  ]) {
    assertSqlMatch(forward, new RegExp(`public\\.${legacyTable}`));
  }
  assertSqlMatch(forward, /slot_position = 5/);
  assertSqlMatch(forward, /'live_four_news:' \|\| placement_row\.slot_position/);
  assertSqlMatch(forward, /placement_type = 'video_highlight'/);
  assertSqlMatch(forward, /jornada_private\.matchday_live_layout_zone_legacy_projection/);
});

test("forward separa ocupacao de snapshots e suprime resync Bank redundante", () => {
  assertSqlMatch(forward, /join public\.matchday_editorial_bank_items/);
  assertSqlMatch(forward, /bank_row\.title/);
  assertSqlMatch(forward, /bank_row\.image_url/);
  assertSqlMatch(forward, /bank_row\.link_url/);
  assertSqlMatch(forward, /'jornada\.thematic_workspace_apply'/);
  assertSqlMatch(forward, /'jornada\.thematic_faixa_reconcile'/);
});

test("forward nao e ativado por trigger e reverse do Lote 4 nao e removido", () => {
  assertSqlDoesNotMatch(
    migration,
    /create (?:constraint )?trigger[\s\S]{0,240}project_matchday_live_layout_placements_to_legacy/i,
  );
  assertSqlDoesNotMatch(migration, /drop trigger[^;]*matchday_live_layout_placement/i);
  assertSqlDoesNotMatch(migration, /drop function[^;]*sync_matchday_live_layout_placement_shadow/i);
});

test("continuidade exige composicao publicada e source viva ou recovery explicito", () => {
  assertSqlMatch(continuity, /composition_row\.status = 'published'/);
  assertSqlMatch(continuity, /composition_row\.is_current = true/);
  assertSqlMatch(continuity, /desk_row\.is_managed = true/);
  assertSqlMatch(continuity, /carryover_source_composition_id = p_source_composition_id/);
  assertSqlMatch(continuity, /matchday-live-continuity-source-not-live/);
});

test("continuidade rejeita target materializado e duplicacao source", () => {
  assertSqlMatch(continuity, /matchday-live-continuity-target-incompatible/);
  assertSqlMatch(continuity, /source-transversal-conflict/);
  assertSqlMatch(continuity, /having pg_catalog\.count\(\*\) > 1/);
});

test("Bank N+1 usa IDs proprios identidade forte e proveniencia", () => {
  assertSqlMatch(
    continuity,
    /insert into public\.matchday_editorial_bank_items[\s\S]*p_target_matchday_id/,
  );
  assertSqlMatch(
    continuity,
    /lower\(pg_catalog\.btrim\(target_bank\.source_type\)\)[\s\S]*lower\(pg_catalog\.btrim\(target_bank\.source_id\)\)/,
  );
  assertSqlMatch(continuity, /continuity_source_matchday_id/);
  assertSqlMatch(continuity, /continuity_source_composition_id/);
  assertSqlMatch(continuity, /gen_random_uuid\(\)/);
  assertSqlDoesNotMatch(continuity, /p_source_matchday_id,[\s\S]{0,80}placement_row\.bank_item_id/);
});

test("zone map reutiliza o construtor Lote 3 mas gera IDs contextuais target", () => {
  assertSqlMatch(continuity, /jornada_private\.sync_matchday_live_layout_shadow/);
  assertSqlMatch(
    continuity,
    /target_projection\.legacy_zone_key[\s\S]*source_projection\.legacy_zone_key/,
  );
  assertSqlMatch(continuity, /'zone_id', target_projection\.zone_id/);
});

test("placement map preserva tipo posicao e cria novos IDs", () => {
  assertSqlMatch(continuity, /'placement_type', placement_row\.placement_type/);
  assertSqlMatch(continuity, /'slot_position', placement_row\.slot_position/);
  assertSqlMatch(
    continuity,
    /apply_matchday_live_layout_placement_plan\([\s\S]*p_target_matchday_id[\s\S]*v_plan[\s\S]*false/,
  );
  assertSqlDoesNotMatch(continuity, /'placement_id'|placement_row\.id[\s\S]{0,80}'action'/);
});

test("Latest Roundup e compatibility nao sao confundidos com placements", () => {
  assertSqlMatch(continuity, /insert into public\.matchday_latest_news/);
  assertSqlMatch(continuity, /insert into public\.matchday_roundup_items/);
  assertSqlMatch(continuity, /source_row\.slot_type not in \(/);
  assertSqlMatch(migration, /matchday_roundup_items_matchday_youtube_video_id_uidx/);
  assertSqlMatch(migration, /matchday_roundup_items_matchday_source_candidate_id_uidx/);
  assertSqlDoesNotMatch(forward, /matchday_latest_news|insert into public\.matchday_roundup_items/);
});

test("memoria Lote 5 nunca e copiada para N+1", () => {
  assertSqlDoesNotMatch(continuity, /matchday_live_layout_bank_item_state_memory/);
  assertSqlDoesNotMatch(continuity, /legacy_unknown|'displaced'/);
});

test("zero placements continua a criar Mesa target funcional", () => {
  assertSqlMatch(continuity, /v_plan jsonb := '\[\]'::jsonb/);
  assertSqlMatch(continuity, /insert into public\.matchday_editorial_desk_control/);
  assertSqlMatch(continuity, /insert into public\.matchday_editorial_profile_assignments/);
  assertSqlMatch(continuity, /insert into public\.matchday_editorial_profile_reconcile_control/);
  assertSqlMatch(continuity, /if v_placement_count > 0 then/);
  assertSqlMatch(
    continuity,
    /project_matchday_live_layout_placements_to_legacy\([\s\S]*p_target_matchday_id/,
  );
});

test("continuidade preparada nao publica nem muda Jornada viva", () => {
  assertSqlDoesNotMatch(continuity, /update public\.matchday_reference_compositions/);
  assertSqlDoesNotMatch(
    continuity,
    /update public\.matchday_editorial_desk_control[\s\S]*is_managed/,
  );
  assertSqlDoesNotMatch(
    migration,
    /create or replace function public\.publish_matchday_reference_composition_with_continuity/i,
  );
});

test("decisoes J03 e J04 nao sao executadas nem hardcoded", () => {
  assertSqlDoesNotMatch(
    migration,
    /6f826bbe-88ef-42e2-8e4d-350e97752ade|6bdb34a8-fc26-44fa-8342-5ae71d7adb0a|faixa\s*:?\s*87/i,
  );
  assertSqlDoesNotMatch(migration, /delete[^;]*where[^;]*slot_position\s*=\s*87/i);
});

test("UNIQUE transversal e cutover continuam ausentes", () => {
  assertSqlDoesNotMatch(
    migration,
    /(?:unique|create unique index)[\s\S]{0,180}\(matchday_id, bank_item_id\)/i,
  );
  assertSqlDoesNotMatch(migration, /revoke[^;]*matchday_(?:editorials|highlights|horizontal_news|live_layout_items)/i);
  assertSqlDoesNotMatch(migration, /create table[^;]*_queue/i);
});

test("funcoes sao privadas search_path seguro e sem EXECUTE externo", () => {
  assertSqlDoesNotMatch(migration, /create (?:or replace )?function public\./i);
  assertSqlDoesNotMatch(migration, /grant execute/i);
  for (const functionName of [
    "project_matchday_live_layout_placements_to_legacy",
    "normalize_matchday_live_layout_placement_plan",
    "apply_matchday_live_layout_placement_plan",
    "materialize_matchday_live_layout_continuity",
  ]) {
    assertSqlMatch(migration, new RegExp(`jornada_private\\.${functionName}`));
  }
  assert.ok((migration.match(/set search_path\s*=\s*''/g)?.length ?? 0) >= 4);
});

test("v8 v9 v10 tokens readers renderer UI e writers nao sao redefinidos", () => {
  assertSqlDoesNotMatch(
    migration,
    /create or replace function\s+public\.apply_matchday_editorial_profile_workspace_v(?:8|9|10)/i,
  );
  assertSqlDoesNotMatch(migration, /workspace_token|reconcile_token|source_cache|token_cache/i);
  assertSqlDoesNotMatch(
    migration,
    /create (?:or replace )?(?:function|view|table)[^\n]*(?:reader|renderer|drag|fallback|shell)/i,
  );
});

test("working tree contem apenas os dois ficheiros do Passo 1 e artefactos antigos", () => {
  const allowed = new Set([
    "baseline-testes-20260829.txt",
    "jornada-codex-parcial.zip",
    "supabase/.temp/",
    migrationPath,
    "lib/matchday-live-layout-write-core-preparation.test.ts",
  ]);
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=normal"],
    { encoding: "utf8" },
  );
  const unexpected = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"))
    .filter((path) => !allowed.has(path));

  assert.deepEqual(unexpected, []);
});
