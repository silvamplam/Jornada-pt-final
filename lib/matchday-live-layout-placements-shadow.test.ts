import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260901140411_matchday_live_layout_placements_shadow.sql";
const migration = readFileSync(migrationPath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `secao inicial nao encontrada: ${startNeedle}`);

  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `secao final nao encontrada: ${endNeedle}`);

  return migration.slice(start, end);
}

test("cria a candidate key contextual e a tabela publica minima", () => {
  assert.match(
    migration,
    /alter table public\.matchday_editorial_bank_items[\s\S]*unique \(id, matchday_id\)/,
  );

  const table = section(
    "create table public.matchday_live_layout_placements (",
    "create unique index matchday_live_layout_placements_non_zone_slot_key",
  );
  assert.match(table, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(table, /matchday_id uuid not null/);
  assert.match(table, /bank_item_id uuid not null/);
  assert.match(table, /placement_type text not null/);
  assert.match(table, /zone_id uuid/);
  assert.match(table, /slot_position integer not null/);
  assert.match(table, /created_at timestamptz not null default now\(\)/);
  assert.match(table, /updated_at timestamptz not null default now\(\)/);
});

test("FKs contextuais do Banco e da zona fazem cascade e sao deferiveis", () => {
  assert.match(
    migration,
    /foreign key \(bank_item_id, matchday_id\)[\s\S]*references public\.matchday_editorial_bank_items\(id, matchday_id\)[\s\S]*on delete cascade[\s\S]*deferrable initially deferred/,
  );
  assert.match(
    migration,
    /foreign key \(zone_id, matchday_id\)[\s\S]*references public\.matchday_live_layout_zones\(id, matchday_id\)[\s\S]*on delete cascade[\s\S]*deferrable initially deferred/,
  );
  assert.match(
    migration,
    /foreign key \(matchday_id\)[\s\S]*references public\.matchdays\(id\)[\s\S]*on delete cascade/,
  );
});

test("existem apenas cinco placement types", () => {
  const table = section(
    "create table public.matchday_live_layout_placements (",
    "create unique index matchday_live_layout_placements_non_zone_slot_key",
  );
  assert.match(
    table,
    /placement_type in \(\s*'opening',\s*'faixa',\s*'selection',\s*'video_highlight',\s*'zone'\s*\)/,
  );
  assert.doesNotMatch(table, /'context'|'latest'|'headline'|'highlight'|'side_block'/);
});

test("Abertura tem cinco slots e Contexto e opening 5", () => {
  const table = section(
    "create table public.matchday_live_layout_placements (",
    "create unique index matchday_live_layout_placements_non_zone_slot_key",
  );
  const derive = section(
    "create function jornada_private.derive_matchday_live_layout_placement_shadow(",
    "revoke all on function\n  jornada_private.derive_matchday_live_layout_placement_shadow(uuid[])",
  );

  assert.match(table, /placement_type = 'opening'[\s\S]*slot_position between 1 and 5/);
  assert.match(derive, /Abertura 1: Manchete/);
  assert.match(derive, /Abertura 2\.\.4: três notícias/);
  assert.match(
    derive,
    /Abertura 5: Contexto[\s\S]*'opening',[\s\S]*\n\s*null,[\s\S]*\n\s*5,[\s\S]*'context'/,
  );
  assert.match(derive, /editorial_row\.side_block_status/);
  assert.match(derive, /editorial_row\.side_block_link_url/);
  assert.doesNotMatch(table, /placement_type = 'context'/);
});

test("selection video faixa e zone respeitam as identidades fechadas", () => {
  const table = section(
    "create table public.matchday_live_layout_placements (",
    "create unique index matchday_live_layout_placements_non_zone_slot_key",
  );
  assert.match(table, /placement_type = 'selection'[\s\S]*slot_position between 1 and 4/);
  assert.match(table, /placement_type = 'video_highlight'[\s\S]*slot_position = 1/);
  assert.match(table, /placement_type = 'faixa'[\s\S]*slot_position > 0/);
  assert.match(table, /placement_type = 'zone'[\s\S]*zone_id is not null[\s\S]*slot_position > 0/);
  assert.match(table, /placement_type = 'opening'[\s\S]*zone_id is null/);
  assert.match(table, /placement_type = 'faixa'[\s\S]*zone_id is null/);
  assert.match(table, /placement_type = 'selection'[\s\S]*zone_id is null/);
  assert.match(table, /placement_type = 'video_highlight'[\s\S]*zone_id is null/);
});

test("slots vazios sao ausencia de row e nao ha compactacao", () => {
  const table = section(
    "create table public.matchday_live_layout_placements (",
    "-- ============================================================\n-- 3. FILA TRANSACIONAL PRIVADA",
  );
  const sync = section(
    "create function jornada_private.sync_matchday_live_layout_placement_shadow(",
    "-- ============================================================\n-- 6. DIAGNÓSTICOS PRIVADOS DERIVADOS",
  );
  assert.doesNotMatch(table, /is_empty|empty_slot|bank_item_id uuid\s+null/i);
  assert.doesNotMatch(sync, /row_number\s*\(|dense_rank\s*\(|normalize.*order/i);
  assert.match(sync, /delete from public\.matchday_live_layout_placements/);
});

test("uniques protegem slots mas nao impõem exclusividade transversal", () => {
  assert.match(
    migration,
    /create unique index matchday_live_layout_placements_non_zone_slot_key[\s\S]*\(\s*matchday_id,\s*placement_type,\s*slot_position\s*\)[\s\S]*where zone_id is null/,
  );
  assert.match(
    migration,
    /create unique index matchday_live_layout_placements_zone_slot_key[\s\S]*\(\s*matchday_id,\s*zone_id,\s*slot_position\s*\)[\s\S]*where placement_type = 'zone'/,
  );
  assert.doesNotMatch(migration, /unique\s*\(\s*matchday_id\s*,\s*bank_item_id\s*\)/i);
  assert.doesNotMatch(migration, /unique\s*\(\s*bank_item_id\s*,\s*matchday_id\s*\)/i);
});

test("apenas live_four entra como selection e estruturas legacy ficam excluidas", () => {
  const derive = section(
    "create function jornada_private.derive_matchday_live_layout_placement_shadow(",
    "revoke all on function\n  jornada_private.derive_matchday_live_layout_placement_shadow(uuid[])",
  );
  assert.match(derive, /live_row\.slot_type ~ '\^live_four_news:\[1-4\]\$'/);
  assert.doesNotMatch(derive, /live_row\.slot_type\s+(?:like|~)[^\n]*live_hierarchical/i);
  assert.doesNotMatch(derive, /live_row\.slot_type\s+(?:like|~)[^\n]*live_beyond_matchday/i);
  assert.doesNotMatch(derive, /from public\.matchday_latest_news/i);
  assert.doesNotMatch(derive, /from public\.matchday_live_layout_blocks/i);
  assert.doesNotMatch(derive, /from public\.matchday_live_layout_zones/i);
});

test("roundup items sao fonte funcional e video highlight e placement", () => {
  const derive = section(
    "create function jornada_private.derive_matchday_live_layout_placement_shadow(",
    "revoke all on function\n  jornada_private.derive_matchday_live_layout_placement_shadow(uuid[])",
  );
  assert.doesNotMatch(derive, /from public\.matchday_roundup_items/i);
  assert.match(derive, /editorial_row\.complementary_mode/);
  assert.match(derive, /= 'roundup_video'/);
  assert.match(derive, /editorial_row\.complementary_status/);
  assert.match(derive, /'video_highlight'/);
});

test("resolucao forte e por URL e contextual e nunca escolhe por LIMIT 1", () => {
  const derive = section(
    "create function jornada_private.derive_matchday_live_layout_placement_shadow(",
    "revoke all on function\n  jornada_private.derive_matchday_live_layout_placement_shadow(uuid[])",
  );
  assert.match(derive, /bank_row\.matchday_id = source_row\.matchday_id/);
  assert.match(derive, /bank_row\.source_type[\s\S]*source_row\.source_type/);
  assert.match(derive, /bank_row\.source_id[\s\S]*source_row\.source_id/);
  assert.match(derive, /split_part\([\s\S]*'\?'[\s\S]*split_part\([\s\S]*'#'/);
  assert.match(derive, /regexp_replace\([\s\S]*'\/\+\$'/);
  assert.match(derive, /when pg_catalog\.count\(candidate_row\.bank_item_id\) = 1/);
  assert.doesNotMatch(derive, /\blimit\s+1\b/i);
  assert.doesNotMatch(derive, /distinct on|row_number\s*\(/i);
});

test("bank item arquivado permanece projetavel e e diagnosticado", () => {
  const sync = section(
    "create function jornada_private.sync_matchday_live_layout_placement_shadow(",
    "-- ============================================================\n-- 6. DIAGNÓSTICOS PRIVADOS DERIVADOS",
  );
  const diagnostics = section(
    "create view jornada_private.matchday_live_layout_placement_shadow_diagnostics",
    "-- ============================================================\n-- 7. COALESCING TRANSACIONAL",
  );
  assert.doesNotMatch(sync, /bank_status\s*=\s*'active'/);
  assert.match(diagnostics, /'inactive_bank_item'/);
  assert.match(diagnostics, /bank_candidate_count = 1[\s\S]*bank_status <> 'active'/);
});

test("projector e set-based preserva id do slot e remove apenas obsoletos", () => {
  const sync = section(
    "create function jornada_private.sync_matchday_live_layout_placement_shadow(",
    "-- ============================================================\n-- 6. DIAGNÓSTICOS PRIVADOS DERIVADOS",
  );
  assert.match(sync, /with desired as materialized/);
  assert.match(sync, /on conflict \([\s\S]*matchday_id,[\s\S]*placement_type,[\s\S]*slot_position/);
  assert.match(sync, /on conflict \([\s\S]*matchday_id,[\s\S]*zone_id,[\s\S]*slot_position/);
  assert.match(sync, /do update[\s\S]*bank_item_id = excluded\.bank_item_id/);
  assert.match(sync, /delete from public\.matchday_live_layout_placements/);
  assert.doesNotMatch(sync, /\bloop\b|\bforeach\b/i);
});

test("diagnosticos privados cobrem gaps conflitos e duplicacao sem winner", () => {
  const diagnostics = section(
    "create view jornada_private.matchday_live_layout_placement_shadow_diagnostics",
    "-- ============================================================\n-- 7. COALESCING TRANSACIONAL",
  );
  for (const code of [
    "unresolved_bank_item",
    "ambiguous_bank_item",
    "inactive_bank_item",
    "unresolved_zone",
    "slot_conflict",
    "transversal_duplicate",
  ]) {
    assert.match(diagnostics, new RegExp(`'${code}'`));
  }
  assert.match(
    diagnostics,
    /group by placement_row\.matchday_id, placement_row\.bank_item_id[\s\S]*having pg_catalog\.count\(\*\) > 1/,
  );
  assert.match(diagnostics, /'slots'[\s\S]*jsonb_agg/);
  assert.match(diagnostics, /No winner is selected/i);
  assert.doesNotMatch(diagnostics, /row_number\s*\(|distinct on|\blimit\b/i);
});

test("diagnostico adicional cobre posicao legacy impossivel de materializar", () => {
  assert.match(migration, /'invalid_slot_position'/);
  assert.match(migration, /invalid_slot_position boolean/);
  assert.match(migration, /and not derived_row\.invalid_slot_position/);
});

test("queue privada usa pid xid8 jornada e flush deferred", () => {
  const queue = section(
    "create table jornada_private.matchday_live_layout_placement_shadow_sync_queue (",
    "-- ============================================================\n-- 4. DERIVAÇÃO SET-BASED",
  );
  const flush = section(
    "create function jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()",
    "revoke all on function\n  jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()",
  );
  assert.match(queue, /backend_pid integer not null/);
  assert.match(queue, /transaction_id xid8 not null/);
  assert.match(queue, /primary key \(backend_pid, transaction_id, matchday_id\)/);
  assert.match(migration, /pg_catalog\.pg_backend_pid\(\)/);
  assert.match(migration, /pg_catalog\.pg_current_xact_id\(\)/);
  assert.match(
    migration,
    /on conflict \(backend_pid, transaction_id, matchday_id\)[\s\S]*do nothing/,
  );
  assert.match(
    migration,
    /create constraint trigger matchday_live_layout_placement_shadow_flush[\s\S]*deferrable initially deferred/,
  );
  const syncCall = flush.indexOf("sync_matchday_live_layout_placement_shadow(");
  const queueDelete = flush.indexOf(
    "delete from\n    jornada_private.matchday_live_layout_placement_shadow_sync_queue",
  );
  assert.ok(syncCall >= 0);
  assert.ok(queueDelete > syncCall);
});

test("triggers observam apenas colunas que mudam identidade ou ocupacao", () => {
  const triggers = section(
    "create trigger matchday_live_layout_placement_editorials_enqueue",
    "create constraint trigger matchday_live_layout_placement_shadow_flush",
  );
  assert.match(triggers, /on public\.matchday_editorials/);
  assert.match(triggers, /headline_link_url/);
  assert.match(triggers, /side_block_status/);
  assert.match(triggers, /side_block_link_url/);
  assert.match(triggers, /complementary_mode/);
  assert.match(triggers, /complementary_status/);
  assert.match(triggers, /complementary_link_url/);
  assert.doesNotMatch(triggers, /side_block_title|side_block_text|complementary_title/);
  assert.match(triggers, /on public\.matchday_highlights/);
  assert.match(triggers, /on public\.matchday_horizontal_news/);
  assert.match(triggers, /on public\.matchday_live_layout_items/);
  assert.match(triggers, /on public\.matchday_editorial_profile_zone_items/);
  assert.match(triggers, /on public\.matchday_editorial_bank_items/);
  assert.match(triggers, /on jornada_private\.matchday_live_layout_zone_legacy_projection/);
});

test("backfill usa uniao dinamica e a mesma funcao central", () => {
  const backfill = section(
    "-- 8. BACKFILL PELA MESMA PROJEÇÃO CENTRAL",
    "-- ============================================================\n-- 9. FECHO DE SEGURANÇA",
  );
  assert.match(backfill, /sync_matchday_live_layout_placement_shadow\(/);
  assert.match(backfill, /select editorial_row\.matchday_id/);
  assert.match(backfill, /select highlight_row\.matchday_id/);
  assert.match(backfill, /select faixa_row\.matchday_id/);
  assert.match(backfill, /select live_row\.matchday_id/);
  assert.match(backfill, /select zone_item\.matchday_id/);
  assert.match(backfill, /select bank_row\.matchday_id/);
  assert.doesNotMatch(backfill, /J0[1-5]|Jornada 0[1-5]|\b326\b|\b323\b|\b305\b/);
});

test("RLS e ACL deixam placements sem escrita pela Data API", () => {
  assert.match(
    migration,
    /alter table public\.matchday_live_layout_placements[\s\S]*enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.matchday_live_layout_placements[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant select on table public\.matchday_live_layout_placements[\s\S]*to service_role/,
  );
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete)[\s\S]{0,120}matchday_live_layout_placements/i,
  );
});

test("helpers privados usam definer search_path vazio e nenhum RPC publico", () => {
  const privateFunctionCount =
    migration.match(/create function jornada_private\./g)?.length ?? 0;
  const definerCount = migration.match(/security definer/g)?.length ?? 0;
  const emptySearchPathCount = migration.match(/set search_path = ''/g)?.length ?? 0;
  assert.equal(privateFunctionCount, 4);
  assert.ok(definerCount >= privateFunctionCount);
  assert.ok(emptySearchPathCount >= privateFunctionCount);
  assert.doesNotMatch(migration, /create function public\./i);
  assert.doesNotMatch(migration, /grant execute/i);
  assert.match(
    migration,
    /revoke all on table[\s\S]*matchday_live_layout_placement_shadow_diagnostics[\s\S]*from public, anon, authenticated, service_role/,
  );
});

test("Lote 4 nao redefine cutover continuidade tokens readers ou renderer", () => {
  assert.doesNotMatch(
    migration,
    /create or replace function\s+public\.apply_matchday_editorial_profile_workspace_v(?:8|9|10)/i,
  );
  assert.doesNotMatch(migration, /publish_matchday_reference_composition_with_continuity/i);
  assert.doesNotMatch(migration, /initialize_matchday_editorial_thematic_continuity_v3/i);
  assert.doesNotMatch(migration, /matchday_editorial_profile_workspace_token\s*\(/i);
  assert.doesNotMatch(migration, /matchday_editorial_profile_reconcile_token\s*\(/i);
  assert.doesNotMatch(migration, /source_cache/i);
  assert.doesNotMatch(migration, /public_matchday|PublicEditorialLayout|renderer/i);
});

test("migration e transacional e apenas recarrega schema cache", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
});
