import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260831203151_matchday_live_layout_zones_blocks_shadow.sql";
const migration = readFileSync(migrationPath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `secao inicial nao encontrada: ${startNeedle}`);

  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `secao final nao encontrada: ${endNeedle}`);

  return migration.slice(start, end);
}

test("cria apenas as duas fundacoes publicas shadow", () => {
  assert.match(migration, /create table public\.matchday_live_layout_zones \(/);
  assert.match(migration, /create table public\.matchday_live_layout_blocks \(/);
  assert.doesNotMatch(migration, /create table public\.[^\n]*placement/i);
  assert.doesNotMatch(migration, /alter table public\.matchday_live_layout_items/i);
});

test("zone_id e a identidade; classificacao e legacy key nao entram na tabela publica", () => {
  const zones = section(
    "create table public.matchday_live_layout_zones (",
    "create index matchday_live_layout_zones_matchday_idx",
  );

  assert.match(zones, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(zones, /unique \(id, matchday_id\)/);
  assert.match(zones, /public_title text not null default ''/);
  assert.match(zones, /char_length\(pg_catalog\.btrim\(public_title\)\) <= 120/);
  assert.match(
    zones,
    /'six_news',[\s\S]*'five_news_balanced',[\s\S]*'five_news_secondary'/,
  );
  assert.doesNotMatch(zones, /legacy_zone_key/);
  assert.doesNotMatch(zones, /classification/i);
  assert.doesNotMatch(zones, /sort_order/);
  assert.doesNotMatch(zones, /is_hidden|is_active/);
  assert.doesNotMatch(zones, /bank_item_id/);
  assert.doesNotMatch(zones, /unique \(public_title\)/);
});

test("limite de titulo shadow replica o contrato legacy de 120", () => {
  const validation = section(
    "create function jornada_private.validate_matchday_live_layout_shadow_inputs(",
    "-- ============================================================\n-- 2. TABELAS PÚBLICAS SHADOW",
  );
  assert.match(validation, /btrim\(control_row\.thematic_zone_titles ->> 'benfica'\)[\s\S]*> 120/);
  assert.match(migration, /char_length\(pg_catalog\.btrim\(public_title\)\) <= 120/);
});

test("blocks separam zone latest video e impoem FK contextual", () => {
  const blocks = section(
    "create table public.matchday_live_layout_blocks (",
    "alter table public.matchday_live_layout_zones",
  );

  assert.match(blocks, /block_type in \('zone', 'latest', 'video'\)/);
  assert.match(blocks, /block_type = 'zone'[\s\S]*zone_id is not null/);
  assert.match(blocks, /block_type in \('latest', 'video'\)[\s\S]*zone_id is null/);
  assert.match(blocks, /check \(sort_order > 0\)/);
  assert.match(blocks, /unique \(matchday_id, sort_order\)/);
  assert.match(
    blocks,
    /foreign key \(zone_id, matchday_id\)[\s\S]*references public\.matchday_live_layout_zones\(id, matchday_id\)[\s\S]*on delete cascade/,
  );
  assert.match(blocks, /where block_type = 'zone'/);
  assert.match(blocks, /where block_type = 'latest'/);
  assert.match(blocks, /where block_type = 'video'/);
});

test("titulo duplicado e permitido", () => {
  const zones = section(
    "create table public.matchday_live_layout_zones (",
    "create index matchday_live_layout_zones_matchday_idx",
  );
  assert.doesNotMatch(zones, /unique[^\n]*public_title/i);
});

test("ponte legacy e estritamente privada e removivel", () => {
  const bridge = section(
    "create table jornada_private.matchday_live_layout_zone_legacy_projection (",
    "create table jornada_private.matchday_live_layout_shadow_sync_queue (",
  );

  assert.match(bridge, /primary key \(matchday_id, legacy_zone_key\)/);
  assert.match(bridge, /unique \(zone_id\)/);
  assert.match(
    bridge,
    /foreign key \(zone_id, matchday_id\)[\s\S]*references public\.matchday_live_layout_zones\(id, matchday_id\)[\s\S]*on delete cascade[\s\S]*deferrable initially deferred/,
  );
  assert.match(
    bridge,
    /'benfica',[\s\S]*'sporting',[\s\S]*'fc_porto',[\s\S]*'other_liga_clubs',[\s\S]*'outside_liga_other'/,
  );
});

test("sync preserva zone_id em rename layout e reorder", () => {
  const sync = section(
    "create function jornada_private.sync_matchday_live_layout_shadow(",
    "-- ============================================================\n-- 5. COALESCING TRANSACIONAL",
  );

  assert.match(sync, /on conflict \(matchday_id, legacy_zone_key\)[\s\S]*do nothing/);
  assert.match(sync, /on conflict \(id\)[\s\S]*do update/);
  assert.match(sync, /public_title = excluded\.public_title/);
  assert.match(sync, /visual_family = excluded\.visual_family/);
  assert.doesNotMatch(sync, /delete from jornada_private\.matchday_live_layout_zone_legacy_projection[\s\S]{0,120}thematic_zone_titles/);
});

test("formato legacy de seis blocos acrescenta video apenas no fim", () => {
  const sync = section(
    "create function jornada_private.sync_matchday_live_layout_shadow(",
    "-- ============================================================\n-- 5. COALESCING TRANSACIONAL",
  );
  assert.match(
    sync,
    /cardinality\(control_row\.thematic_block_order\) = 6[\s\S]*control_row\.thematic_block_order \|\| array\['video'\]::text\[\]/,
  );
});

test("preflight bloqueia divergencia entre zone order e subsequencia de blocks", () => {
  const validation = section(
    "create function jornada_private.validate_matchday_live_layout_shadow_inputs(",
    "revoke all on function\n  jornada_private.validate_matchday_live_layout_shadow_inputs",
  );
  assert.match(
    validation,
    /coalesce\([\s\S]*thematic_zone_layouts ->> 'benfica'[\s\S]*''[\s\S]*\) not in/,
  );
  assert.match(validation, /block_key not in \('latest', 'video'\)/);
  assert.match(validation, /thematic_zone_order is distinct from/);
  assert.match(validation, /matchday-live-layout-shadow-zone-block-order-mismatch/);
});

test("sync e set-based e nao contem loop por jornada ou zona", () => {
  const sync = section(
    "create function jornada_private.sync_matchday_live_layout_shadow(",
    "-- ============================================================\n-- 5. COALESCING TRANSACIONAL",
  );
  assert.match(sync, /with targets as materialized/);
  assert.match(sync, /cross join lateral pg_catalog\.unnest/);
  assert.doesNotMatch(sync, /\bloop\b/i);
  assert.doesNotMatch(sync, /\bforeach\b/i);
});

test("reorder evita colisao sem tocar timestamps de rows ja corretas", () => {
  const sync = section(
    "create function jornada_private.sync_matchday_live_layout_shadow(",
    "-- Zone blocks: identidade = zone_id.",
  );
  assert.match(sync, /pg_catalog\.max\(existing_row\.sort_order\), 0\) \+ 100/);
  assert.match(sync, /set sort_order = existing_row\.sort_order \+ offset_row\.sort_offset/);
  assert.match(sync, /desired_row\.sort_order = existing_row\.sort_order/);
  assert.doesNotMatch(
    sync,
    /set sort_order = existing_row\.sort_order \+ offset_row\.sort_offset,[\s\n]*updated_at/,
  );
});

test("zone latest e video preservam block id quando apenas mudam de ordem", () => {
  assert.match(migration, /on conflict \(zone_id\) where block_type = 'zone'[\s\S]*do update[\s\S]*sort_order = excluded\.sort_order/);
  assert.match(migration, /on conflict \(matchday_id\) where block_type = 'latest'[\s\S]*do update[\s\S]*sort_order = excluded\.sort_order/);
  assert.match(migration, /on conflict \(matchday_id\) where block_type = 'video'[\s\S]*do update[\s\S]*sort_order = excluded\.sort_order/);
});

test("delete do reconcile control limpa blocks zones e ponte por cascade", () => {
  const sync = section(
    "create function jornada_private.sync_matchday_live_layout_shadow(",
    "-- Cria apenas correspondências em falta.",
  );
  assert.match(sync, /not exists \([\s\S]*matchday_editorial_profile_reconcile_control/);
  assert.match(sync, /delete from public\.matchday_live_layout_blocks/);
  assert.match(sync, /delete from public\.matchday_live_layout_zones/);
  assert.match(
    migration,
    /matchday_live_layout_zone_legacy_projection_zone_fk[\s\S]*on delete cascade/,
  );
});

test("recriacao do control pode criar novos zone ids apos a projecao antiga morrer", () => {
  assert.match(migration, /zone_id uuid not null default gen_random_uuid\(\)/);
  assert.match(migration, /on delete cascade[\s\S]*deferrable initially deferred/);
  assert.doesNotMatch(migration, /uuid_generate_v5|md5\([^\n]*legacy_zone_key/i);
});

test("fila faz coalescing por backend transacao e jornada", () => {
  const queue = section(
    "create table jornada_private.matchday_live_layout_shadow_sync_queue (",
    "-- ============================================================\n-- 4. PROJEÇÃO CENTRAL SET-BASED",
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
});

test("flush e deferred e drena a fila apenas depois do sync", () => {
  const flush = section(
    "create function jornada_private.flush_matchday_live_layout_shadow_sync_queue()",
    "revoke all on function\n  jornada_private.flush_matchday_live_layout_shadow_sync_queue()",
  );
  const syncCall = flush.indexOf("sync_matchday_live_layout_shadow(");
  const deleteQueue = flush.indexOf(
    "delete from jornada_private.matchday_live_layout_shadow_sync_queue",
  );
  assert.ok(syncCall >= 0);
  assert.ok(deleteQueue > syncCall);
  assert.match(
    migration,
    /create constraint trigger matchday_live_layout_shadow_flush[\s\S]*deferrable initially deferred/,
  );
});

test("enqueue observa insert delete e apenas as quatro colunas estruturais", () => {
  const trigger = section(
    "create trigger matchday_live_layout_shadow_enqueue",
    "create constraint trigger matchday_live_layout_shadow_flush",
  );
  assert.match(trigger, /after insert/);
  assert.match(trigger, /or delete/);
  assert.match(trigger, /thematic_zone_order/);
  assert.match(trigger, /thematic_zone_layouts/);
  assert.match(trigger, /thematic_zone_titles/);
  assert.match(trigger, /thematic_block_order/);
});

test("backfill usa a mesma funcao central e nao hardcoda jornadas ou counts de dados", () => {
  const backfill = section(
    "-- 6. BACKFILL PELA MESMA PROJEÇÃO CENTRAL",
    "-- ============================================================\n-- 7. FECHO DE SEGURANÇA",
  );
  assert.match(backfill, /sync_matchday_live_layout_shadow\(/);
  assert.match(backfill, /array_agg\([\s\S]*control_row\.matchday_id/);
  assert.doesNotMatch(backfill, /Jornada 0[34]|J03|J04|453|599/);
});

test("postcondicoes verificam zonas blocks ordem e cross-matchday", () => {
  const post = section(
    "do $postconditions$",
    "$postconditions$;",
  );
  assert.match(post, /backfill-zone-count-mismatch/);
  assert.match(post, /backfill-block-count-mismatch/);
  assert.match(post, /backfill-zone-data-mismatch/);
  assert.match(post, /backfill-block-order-mismatch/);
  assert.match(post, /backfill-cross-matchday/);
});

test("RLS e ACL deixam as tabelas publicas read-only para service_role", () => {
  assert.match(migration, /alter table public\.matchday_live_layout_zones[\s\S]*enable row level security/);
  assert.match(migration, /alter table public\.matchday_live_layout_blocks[\s\S]*enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.matchday_live_layout_zones[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /revoke all on table public\.matchday_live_layout_blocks[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(migration, /grant select on table public\.matchday_live_layout_zones[\s\S]*to service_role/);
  assert.match(migration, /grant select on table public\.matchday_live_layout_blocks[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[\s\S]{0,100}matchday_live_layout_/i);
});

test("helpers privados sao security definer com search_path vazio e sem execute externo", () => {
  const functionCount = migration.match(/create function jornada_private\./g)?.length ?? 0;
  const definerCount = migration.match(/security definer/g)?.length ?? 0;
  const searchPathCount = migration.match(/set search_path = ''/g)?.length ?? 0;

  assert.equal(functionCount, 4);
  assert.ok(definerCount >= functionCount);
  assert.ok(searchPathCount >= functionCount);
  assert.match(
    migration,
    /revoke all on all functions in schema jornada_private[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]{0,120}jornada_private/i);
});

test("Lote 3 nao redefine v8 v9 v10 continuidade readers renderer token ou cache", () => {
  assert.doesNotMatch(migration, /create or replace function\s+public\.apply_matchday_editorial_profile_workspace_v(?:8|9|10)/i);
  assert.doesNotMatch(migration, /initialize_matchday_editorial_thematic_continuity_v3/i);
  assert.doesNotMatch(migration, /matchday_editorial_profile_workspace_token\s*\(/i);
  assert.doesNotMatch(migration, /source_cache|reconcile_token/i);
  assert.doesNotMatch(migration, /matchday_live_layout_items/i);
});

test("contrato shadow nao contem classification nem bank item", () => {
  const publicTables = section(
    "-- 2. TABELAS PÚBLICAS SHADOW",
    "-- ============================================================\n-- 3. PONTE LEGACY PRIVADA",
  );
  assert.doesNotMatch(publicTables, /classification_key|ArticleClassificationKey/i);
  assert.doesNotMatch(publicTables, /bank_item_id/i);
});

test("migration e transacional e recarrega apenas schema cache", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
});
