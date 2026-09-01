import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260901153022_matchday_live_layout_displaced_state_shadow.sql";
const migration = readFileSync(migrationPath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `secao inicial nao encontrada: ${startNeedle}`);

  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `secao final nao encontrada: ${endNeedle}`);

  return migration.slice(start, end);
}

test("cria apenas a memoria contextual minima sem surrogate id", () => {
  const table = section(
    "create table public.matchday_live_layout_bank_item_state_memory (",
    "alter table public.matchday_live_layout_bank_item_state_memory",
  );

  assert.match(table, /matchday_id uuid not null/);
  assert.match(table, /bank_item_id uuid not null/);
  assert.match(table, /memory_kind text not null/);
  assert.match(
    table,
    /recorded_at timestamptz not null default statement_timestamp\(\)/,
  );
  assert.match(table, /primary key \(matchday_id, bank_item_id\)/);
  assert.doesNotMatch(table, /\bid uuid\b|classification|placement_type|slot_position|snapshot|article_id/);
});

test("memory_kind admite somente baseline neutro e displaced", () => {
  const table = section(
    "create table public.matchday_live_layout_bank_item_state_memory (",
    "alter table public.matchday_live_layout_bank_item_state_memory",
  );
  assert.match(
    table,
    /check \(memory_kind in \('legacy_unknown', 'displaced'\)\)/,
  );
  assert.doesNotMatch(table, /'NOVA'|'FAIXA'|'COLOCADA'|'DESALOJADA'/);
});

test("FK contextual do Banco faz cascade e e deferivel", () => {
  assert.match(
    migration,
    /foreign key \(bank_item_id, matchday_id\)[\s\S]*references public\.matchday_editorial_bank_items\(id, matchday_id\)[\s\S]*on delete cascade[\s\S]*deferrable initially deferred/,
  );
});

test("PK cobre Jornada e FK sem indice redundante", () => {
  assert.match(migration, /primary key \(matchday_id, bank_item_id\)/);
  assert.doesNotMatch(migration, /create (?:unique )?index/i);
});

test("RLS e ACL fecham todo DML pela Data API", () => {
  assert.match(
    migration,
    /alter table public\.matchday_live_layout_bank_item_state_memory[\s\S]*enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.matchday_live_layout_bank_item_state_memory[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant select on table public\.matchday_live_layout_bank_item_state_memory[\s\S]*to service_role/,
  );
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete|truncate)[\s\S]{0,160}matchday_live_layout_bank_item_state_memory/i,
  );
});

test("baseline bloqueia Banco e placements ate ao commit", () => {
  const lock = migration.indexOf("lock table");
  const triggers = migration.indexOf(
    "create trigger matchday_live_layout_bank_item_memory_after_insert",
  );
  const backfill = migration.indexOf(
    "insert into public.matchday_live_layout_bank_item_state_memory (",
    migration.indexOf("-- 5. BASELINE CONSISTENTE E NEUTRO"),
  );

  assert.ok(lock >= 0);
  assert.ok(triggers > lock);
  assert.ok(backfill > triggers);
  assert.match(
    migration,
    /lock table\s+public\.matchday_editorial_bank_items,\s+public\.matchday_live_layout_placements\s+in share row exclusive mode/,
  );
});

test("backfill e dinamico neutro e usa um instante consistente", () => {
  const backfill = section(
    "-- 5. BASELINE CONSISTENTE E NEUTRO",
    "-- 6. FECHO DE SEGURANCA",
  );

  assert.match(backfill, /from public\.matchday_editorial_bank_items as bank_row/);
  assert.match(backfill, /not exists \([\s\S]*from public\.matchday_live_layout_placements/);
  assert.match(backfill, /'legacy_unknown'/);
  assert.match(backfill, /statement_timestamp\(\)/);
  assert.doesNotMatch(backfill, /bank_row\.status\s*=/);
  assert.doesNotMatch(backfill, /\b348\b|\b339\b|\b9\b|J0[1-5]/);
  assert.match(backfill, /baseline-missing/);
  assert.match(backfill, /baseline-conflict/);
});

test("triggers usam transition tables OLD e NEW por statement", () => {
  const triggers = section(
    "create trigger matchday_live_layout_bank_item_memory_after_insert",
    "-- 4. PROJECAO PRIVADA, DERIVADA E SET-BASED",
  );

  assert.match(triggers, /after insert[\s\S]*referencing new table as new_placement_rows[\s\S]*for each statement/);
  assert.match(triggers, /after update[\s\S]*referencing old table as old_placement_rows[\s\S]*new table as new_placement_rows[\s\S]*for each statement/);
  assert.match(triggers, /after delete[\s\S]*referencing old table as old_placement_rows[\s\S]*for each statement/);
  assert.doesNotMatch(triggers, /for each row/);
});

test("reconciler deduplica OLD e NEW e consulta o estado final", () => {
  const reconcile = section(
    "jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()",
    "revoke all on function\n  jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()",
  );

  assert.match(reconcile, /select distinct[\s\S]*from new_placement_rows/);
  assert.match(reconcile, /from old_placement_rows[\s\S]*union[\s\S]*from new_placement_rows/);
  assert.match(reconcile, /exists \([\s\S]*from public\.matchday_live_layout_placements as current_row/);
  assert.match(reconcile, /not exists \([\s\S]*from public\.matchday_live_layout_placements as current_row/);
  assert.match(reconcile, /join public\.matchday_editorial_bank_items as bank_row/);
  assert.doesNotMatch(reconcile, /\bloop\b|\bforeach\b|\blimit\s+1\b|distinct on|row_number\s*\(/i);
});

test("chegada limpa memoria e perda do ultimo placement marca displaced", () => {
  const reconcile = section(
    "jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()",
    "revoke all on function\n  jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()",
  );

  assert.match(
    reconcile,
    /delete from public\.matchday_live_layout_bank_item_state_memory[\s\S]*and exists \(/,
  );
  assert.match(
    reconcile,
    /insert into public\.matchday_live_layout_bank_item_state_memory[\s\S]*'displaced'/,
  );
  assert.match(reconcile, /where not exists \(/);
});

test("DELETE limpa memoria quando outro placement do par contextual permanece", () => {
  const reconcile = section(
    "jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()",
    "revoke all on function\n  jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()",
  );
  const deleteStart = reconcile.indexOf("if tg_op = 'DELETE' then");
  const deleteEnd = reconcile.indexOf("end if;", deleteStart);

  assert.ok(deleteStart >= 0, "ramo DELETE nao encontrado");
  assert.ok(deleteEnd > deleteStart, "fim do ramo DELETE nao encontrado");

  const deleteBranch = reconcile.slice(deleteStart, deleteEnd);

  assert.match(
    deleteBranch,
    /with affected as materialized \([\s\S]*select distinct[\s\S]*from old_placement_rows as placement_row[\s\S]*delete from public\.matchday_live_layout_bank_item_state_memory[\s\S]*using affected as affected_row[\s\S]*and exists \([\s\S]*from public\.matchday_live_layout_placements as current_row/,
  );
  assert.match(
    deleteBranch,
    /with affected as materialized \([\s\S]*unplaced as materialized \([\s\S]*where not exists \([\s\S]*insert into public\.matchday_live_layout_bank_item_state_memory/,
  );
  assert.doesNotMatch(deleteBranch, /new_placement_rows/);
});

test("recorded_at de displaced nao e renovado por reconciliacao repetida", () => {
  const reconcile = section(
    "jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()",
    "revoke all on function\n  jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()",
  );

  assert.match(
    reconcile,
    /on conflict \(matchday_id, bank_item_id\)[\s\S]*do update[\s\S]*recorded_at = excluded\.recorded_at[\s\S]*where memory_row\.memory_kind <> 'displaced'/,
  );
});

test("projecao e privada derivada e recebe Jornadas em conjunto", () => {
  const projection = section(
    "jornada_private.project_matchday_live_layout_bank_item_states(",
    "revoke all on function\n  jornada_private.project_matchday_live_layout_bank_item_states(uuid[])",
  );

  assert.match(projection, /p_matchday_ids uuid\[\]/);
  assert.match(projection, /language sql/);
  assert.match(projection, /stable/);
  assert.match(projection, /security definer/);
  assert.match(projection, /set search_path = ''/);
  assert.match(projection, /bank_row\.matchday_id = any\(p_matchday_ids\)/);
  assert.doesNotMatch(projection, /\bloop\b|\bforeach\b|\blimit\s+1\b/i);
});

test("projecao expoe Banco classificacao placements memoria e diagnosticos", () => {
  const projection = section(
    "jornada_private.project_matchday_live_layout_bank_item_states(",
    "revoke all on function\n  jornada_private.project_matchday_live_layout_bank_item_states(uuid[])",
  );

  for (const field of [
    "matchday_id uuid",
    "bank_item_id uuid",
    "bank_status text",
    "classification_key text",
    "classification_source text",
    "classified_at timestamptz",
    "placement_count bigint",
    "placements jsonb",
    "has_faixa boolean",
    "has_non_faixa_placement boolean",
    "transversal_conflict boolean",
    "memory_kind text",
    "history_unknown boolean",
    "memory_placement_conflict boolean",
    "editorial_state text",
  ]) {
    assert.match(projection, new RegExp(field));
  }
  assert.match(projection, /jsonb_agg\([\s\S]*'placement_id'[\s\S]*'placement_type'[\s\S]*'zone_id'[\s\S]*'slot_position'/);
});

test("estados sao derivados sem persistir NOVA FAIXA ou COLOCADA", () => {
  const table = section(
    "create table public.matchday_live_layout_bank_item_state_memory (",
    "alter table public.matchday_live_layout_bank_item_state_memory",
  );
  const projection = section(
    "jornada_private.project_matchday_live_layout_bank_item_states(",
    "revoke all on function\n  jornada_private.project_matchday_live_layout_bank_item_states(uuid[])",
  );

  assert.doesNotMatch(table, /NOVA|FAIXA|COLOCADA|DESALOJADA/);
  assert.match(projection, /placement_row\.placement_count[\s\S]*> 1[\s\S]*then null::text/);
  assert.match(projection, /= 1[\s\S]*placement_row\.has_faixa[\s\S]*then 'FAIXA'/);
  assert.match(projection, /= 1[\s\S]*then 'COLOCADA'/);
  assert.match(projection, /memory_row\.memory_kind = 'displaced'[\s\S]*then 'DESALOJADA'/);
  assert.match(projection, /memory_row\.memory_kind = 'legacy_unknown'[\s\S]*then null::text/);
  assert.match(projection, /else 'NOVA'/);
});

test("duplicacoes preservam todos os slots e nunca escolhem winner", () => {
  const projection = section(
    "jornada_private.project_matchday_live_layout_bank_item_states(",
    "revoke all on function\n  jornada_private.project_matchday_live_layout_bank_item_states(uuid[])",
  );

  assert.match(projection, /pg_catalog\.count\(\*\) as placement_count/);
  assert.match(projection, /pg_catalog\.jsonb_agg\(/);
  assert.match(projection, /placement_count, 0::bigint\) > 1/);
  assert.doesNotMatch(projection, /distinct on|row_number\s*\(|\blimit\b/i);
  assert.doesNotMatch(
    migration,
    /alter table public\.matchday_live_layout_placements[\s\S]{0,240}unique/i,
  );
});

test("placement com memoria e diagnosticado mas nao vira Desalojada", () => {
  const projection = section(
    "jornada_private.project_matchday_live_layout_bank_item_states(",
    "revoke all on function\n  jornada_private.project_matchday_live_layout_bank_item_states(uuid[])",
  );

  assert.match(
    projection,
    /placement_row\.placement_count, 0::bigint\) > 0[\s\S]*memory_row\.bank_item_id is not null/,
  );
  const placedState = projection.indexOf("then 'COLOCADA'::text");
  const displacedState = projection.indexOf("then 'DESALOJADA'::text");
  assert.ok(placedState >= 0 && displacedState > placedState);
});

test("nao cria event ledger tabela de estados ou queue adicional", () => {
  assert.equal(migration.match(/create table /g)?.length, 1);
  assert.doesNotMatch(migration, /create materialized view/i);
  assert.doesNotMatch(migration, /event|ledger|_queue/i);
});

test("helpers privados nao criam RPC publica nem grants de EXECUTE", () => {
  assert.doesNotMatch(migration, /create (?:or replace )?function public\./i);
  assert.doesNotMatch(migration, /grant execute/i);
  assert.match(
    migration,
    /revoke all on function[\s\S]*reconcile_matchday_live_layout_bank_item_state_memory/,
  );
  assert.match(
    migration,
    /revoke all on function[\s\S]*project_matchday_live_layout_bank_item_states\(uuid\[\]\)/,
  );
});

test("nao redefine Lotes anteriores cutover continuidade ou caches", () => {
  assert.doesNotMatch(
    migration,
    /create or replace function\s+public\.apply_matchday_editorial_profile_workspace_v(?:8|9|10)/i,
  );
  assert.doesNotMatch(migration, /publish_matchday_reference_composition_with_continuity/i);
  assert.doesNotMatch(migration, /initialize_matchday_editorial_thematic_continuity_v3/i);
  assert.doesNotMatch(migration, /workspace_token|reconcile_token|source_cache|token_cache/i);
  assert.doesNotMatch(
    migration,
    /create (?:or replace )?(?:function|view|table)[^\n]*(?:reader|renderer|drag|fallback|shell)/i,
  );
});

test("working tree do Lote 5 nao contem ficheiros inesperados", () => {
  const allowed = new Set([
    "baseline-testes-20260829.txt",
    "jornada-codex-parcial.zip",
    "supabase/.temp/",
    migrationPath,
    "lib/matchday-live-layout-displaced-state-shadow.test.ts",
  ]);
  const status = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=normal"], {
    encoding: "utf8",
  });
  const unexpected = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"))
    .filter((path) => !allowed.has(path));

  assert.deepEqual(unexpected, []);
});

test("migration e transacional e apenas recarrega o schema cache", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
});
