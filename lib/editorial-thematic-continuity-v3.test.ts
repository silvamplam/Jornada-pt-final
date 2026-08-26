import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260826140515_initialize_matchday_editorial_thematic_continuity_v3.sql",
  ),
  "utf8",
);

const functionStart = migration.indexOf(
  "create function public.initialize_matchday_editorial_thematic_continuity_v3(",
);
const functionEnd = migration.indexOf("\n$function$;", functionStart);

assert.ok(functionStart >= 0, "continuity initializer must exist");
assert.ok(functionEnd > functionStart, "continuity initializer must terminate");

const initializer = migration.slice(functionStart, functionEnd);
const normalized = initializer.replace(/\s+/g, " ");

test("1: primeira inicialização regista a transição v3 antes de materializar", () => {
  assert.match(
    normalized,
    /insert into public\.matchday_editorial_continuity_transitions \( source_matchday_id, target_matchday_id, source_composition_id, continuity_version \) values \( p_source_matchday_id, p_target_matchday_id, p_source_composition_id, 3 \) on conflict do nothing/i,
  );

  const marker = initializer.indexOf(
    "insert into public.matchday_editorial_continuity_transitions",
  );
  const firstMaterialization = initializer.indexOf(
    "update public.matchday_editorial_bank_items",
  );
  assert.ok(marker >= 0 && firstMaterialization > marker);
});

test("2: segunda chamada é no-op absoluto", () => {
  assert.match(
    normalized,
    /where transition_row\.source_matchday_id = p_source_matchday_id or transition_row\.target_matchday_id = p_target_matchday_id \) then return query select false,[\s\S]*?0, 0, 0, 0; return;/i,
  );
  assert.match(
    normalized,
    /get diagnostics v_transition_inserted = row_count; if v_transition_inserted = 0 then return query select false,[\s\S]*?0, 0, 0, 0; return;/i,
  );
});

test("3: mudar a composição não contorna a idempotência por source/target", () => {
  const earlyNoOp = initializer.slice(
    initializer.indexOf("-- A completed transition"),
    initializer.indexOf("select\n    source_matchday.season_id"),
  );
  assert.match(earlyNoOp, /source_matchday_id = p_source_matchday_id/i);
  assert.match(earlyNoOp, /target_matchday_id = p_target_matchday_id/i);
  assert.doesNotMatch(
    earlyNoOp,
    /transition_row\.source_composition_id\s*=\s*p_source_composition_id/i,
  );
});

test("4 e 5: target consecutiva e mesma season são obrigatórias", () => {
  assert.match(
    normalized,
    /if v_source_season_id <> v_target_season_id then raise exception 'matchday-editorial-thematic-continuity-v3-season-mismatch'/i,
  );
  assert.match(
    normalized,
    /if v_target_number <> v_source_number \+ 1 then raise exception 'matchday-editorial-thematic-continuity-v3-target-not-consecutive'/i,
  );
});

test("6: target com reconcile, zonas ou overrides aplicados é protegida", () => {
  assert.match(
    normalized,
    /from public\.matchday_editorial_profile_reconcile_control[\s\S]*?p_target_matchday_id[\s\S]*?from public\.matchday_editorial_profile_zone_items[\s\S]*?p_target_matchday_id[\s\S]*?from public\.matchday_editorial_profile_manual_overrides[\s\S]*?p_target_matchday_id[\s\S]*?target-already-applied/i,
  );
});

test("7: trabalho real de Abertura na target é protegido", () => {
  assert.match(
    normalized,
    /from public\.matchday_editorials[\s\S]*?headline_link_url[\s\S]*?side_block_link_url[\s\S]*?from public\.matchday_highlights[\s\S]*?target-opening-not-empty/i,
  );
});

test("8: fontes novas herdadas ficam ativas e inelegíveis", () => {
  assert.match(
    normalized,
    /insert into public\.matchday_editorial_bank_items \([\s\S]*?status, automatic_eligible, continuity_source_matchday_id, continuity_source_composition_id \) values \([\s\S]*?'active', false, p_source_matchday_id, p_source_composition_id \)/i,
  );
});

test("9: fonte canónica já existente não duplica nem perde automatic_eligible=true", () => {
  const existingBranchStart = initializer.indexOf(
    "if v_existing_bank_id is not null then",
  );
  const insertBranch = initializer.indexOf(
    "insert into public.matchday_editorial_bank_items",
    existingBranchStart,
  );
  const existingBranch = initializer.slice(existingBranchStart, insertBranch);

  assert.match(existingBranch, /update public\.matchday_editorial_bank_items/i);
  assert.doesNotMatch(existingBranch, /automatic_eligible\s*=/i);
  assert.doesNotMatch(existingBranch, /status\s*=/i);
  assert.doesNotMatch(existingBranch, /insert into public\.matchday_editorial_bank_items/i);
});

test("10: proveniência completa é guardada e conflitos anteriores falham fechados", () => {
  assert.match(
    normalized,
    /set continuity_source_matchday_id = p_source_matchday_id, continuity_source_composition_id = p_source_composition_id/i,
  );
  assert.match(
    normalized,
    /matchday-editorial-thematic-continuity-v3-bank-provenance-conflict/i,
  );
});

test("11: zone_items são copiados sem IDs e overrides não são copiados", () => {
  assert.match(
    normalized,
    /insert into public\.matchday_editorial_profile_zone_items \( matchday_id, profile_key, source_type, source_id, zone_key, sort_order, created_at, updated_at \) select p_target_matchday_id,[\s\S]*?from public\.matchday_editorial_profile_zone_items/i,
  );
  assert.doesNotMatch(
    normalized,
    /insert into public\.matchday_editorial_profile_manual_overrides/i,
  );
  assert.match(normalized, /revision, last_applied_at,[\s\S]*?\) values \( p_target_matchday_id, v_source_profile_key, 1, v_now/i);
});

test("12: Faixa publicada inteira é copiada por ordem, sem limite 10", () => {
  const faixaInsert = initializer.slice(
    initializer.indexOf("insert into public.matchday_horizontal_news"),
    initializer.indexOf("-- Supersede only the obsolete v2 snapshot"),
  );
  assert.match(faixaInsert, /source_faixa\.sort_order/i);
  assert.match(faixaInsert, /order by source_faixa\.sort_order/i);
  assert.doesNotMatch(faixaInsert, /\blimit\s+10\b/i);
  assert.match(normalized, /source-faixa-invalid/i);
});

test("13: Últimas próprias da target não sofrem qualquer DML", () => {
  assert.match(normalized, /v_target_has_own_latest/i);
  assert.match(normalized, /slot_type[\s\S]*?like 'live_four_news:%'/i);
  assert.doesNotMatch(
    normalized,
    /(?:insert into|update|delete from) public\.matchday_live_layout_items/i,
  );
  assert.doesNotMatch(
    normalized,
    /(?:insert into|update|delete from) public\.matchday_latest_news/i,
  );
});

test("14: state_items e o automático existente da target não são tocados", () => {
  assert.doesNotMatch(
    normalized,
    /matchday_editorial_profile_state_items/i,
  );
  assert.match(
    migration,
    /current_setting\(\s*'jornada\.thematic_continuity_initialize',[\s\S]*?return null;/i,
  );
  assert.match(
    normalized,
    /set_config\( 'jornada\.thematic_continuity_initialize', 'on', true \)/i,
  );
});

test("15 e 16: Vídeo/Destaque não transitam e complementar fica inativo", () => {
  assert.doesNotMatch(
    normalized,
    /insert into public\.matchday_roundup_items/i,
  );
  assert.doesNotMatch(normalized, /live_video/i);
  assert.match(
    normalized,
    /complementary_mode = 'none', complementary_status = 'draft', complementary_roundup_item_id = null, complementary_label = null, complementary_title = null, complementary_text = null, complementary_image_url = null, complementary_link_url = null, complementary_text_color = null, roundup_video_heading = null, roundup_video_heading_color = null/i,
  );
});

test("17: carryover v2 é limpo apenas no final e sem alterar o resto do controlo", () => {
  const carryoverUpdate = initializer.indexOf(
    "update public.matchday_editorial_desk_control as desk_row\n  set carryover_source_composition_id = null",
  );
  const faixaInsert = initializer.indexOf(
    "insert into public.matchday_horizontal_news",
  );
  assert.ok(carryoverUpdate > faixaInsert);

  const update = initializer.slice(
    carryoverUpdate,
    initializer.indexOf("return query", carryoverUpdate),
  );
  const setClause = update.slice(
    update.indexOf("set "),
    update.indexOf("where "),
  );
  assert.match(update, /carryover_snapshot = null/i);
  assert.doesNotMatch(setClause, /is_managed\s*=/i);
  assert.doesNotMatch(setClause, /faixa_visible\s*=/i);
  assert.doesNotMatch(setClause, /live_public_zone_order\s*=/i);
});

test("18: erro intermédio reverte também o marcador", () => {
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/i);
  assert.doesNotMatch(initializer, /exception\s+when/i);

  const marker = initializer.indexOf(
    "insert into public.matchday_editorial_continuity_transitions",
  );
  const bank = initializer.indexOf(
    "insert into public.matchday_editorial_bank_items",
    marker,
  );
  const opening = initializer.indexOf(
    "update public.matchday_editorials as target_editorial",
    marker,
  );
  const zones = initializer.indexOf(
    "insert into public.matchday_editorial_profile_zone_items",
    marker,
  );
  const faixa = initializer.indexOf(
    "insert into public.matchday_horizontal_news",
    marker,
  );
  assert.ok(marker >= 0 && bank > marker && opening > marker && zones > marker && faixa > marker);
});

test("validações de assignment, composição, gestão e source aplicada estão fechadas", () => {
  assert.match(normalized, /source-assignment-invalid/i);
  assert.match(normalized, /target-assignment-mismatch/i);
  assert.match(normalized, /source-not-applied/i);
  assert.match(
    normalized,
    /composition_row\.id = p_source_composition_id[\s\S]*?composition_row\.matchday_id = p_source_matchday_id[\s\S]*?composition_row\.status = 'published'[\s\S]*?composition_row\.is_current = true/i,
  );
  assert.match(normalized, /source-still-managed/i);
  assert.match(normalized, /target-not-managed/i);
});

test("RPC é security definer com search_path vazio e execução exclusiva do service_role", () => {
  assert.match(
    normalized,
    /language plpgsql security definer set search_path = ''/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.initialize_matchday_editorial_thematic_continuity_v3\([\s\S]*?\) from public, anon, authenticated, service_role;/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.initialize_matchday_editorial_thematic_continuity_v3\([\s\S]*?\) to service_role;/i,
  );
  assert.doesNotMatch(
    migration,
    /(?:select|perform) public\.initialize_matchday_editorial_thematic_continuity_v3\(/i,
  );
});

test("assinatura e contagens públicas seguem o contrato v3", () => {
  assert.match(
    normalized,
    /p_source_matchday_id uuid, p_target_matchday_id uuid, p_source_composition_id uuid \) returns table \( initialized boolean, source_matchday_id uuid, target_matchday_id uuid, source_composition_id uuid, inherited_bank_count integer, inherited_zone_item_count integer, inherited_faixa_count integer, inherited_opening_count integer \)/i,
  );
  assert.match(
    normalized,
    /pg_catalog\.cardinality\(v_required_source_ids\)::integer, v_source_zone_count, v_source_faixa_count, 5;/i,
  );
});
