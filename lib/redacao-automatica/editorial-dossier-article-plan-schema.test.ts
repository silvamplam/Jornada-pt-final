import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sqlRoot = "supabase/sql";
const phase = "jornada-backoffice-redacao-automatica-dossie-editorial-artigos-planeados-schema-1";
const preflightPath = `${sqlRoot}/${phase}-preflight.sql`;
const applyPath = `${sqlRoot}/${phase}-aplicar.sql`;
const postflightPath = `${sqlRoot}/${phase}-postflight.sql`;
const smokePath = `${sqlRoot}/${phase}-smoke-rollback.sql`;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("o preflight dos artigos planeados é read-only e bloqueia conflitos", () => {
  const sql = read(preflightPath);

  assert.match(sql, /set local transaction_read_only = on/i);
  assert.match(sql, /to_regclass\('public\.newsroom_editorial_dossiers'\)/i);
  assert.match(sql, /to_regclass\('public\.newsroom_editorial_dossier_sources'\)/i);
  assert.match(sql, /preflight_target_table_exists/i);
  assert.match(sql, /preflight_target_constraint_exists/i);
  assert.match(sql, /rollback;/i);
  assert.doesNotMatch(sql, /create table|alter table|insert into|update public|delete from/i);
});

test("o schema cria artigos planeados com identidade e orientação editorial próprias", () => {
  const sql = read(applyPath);

  assert.match(sql, /create table public\.newsroom_editorial_dossier_article_plans/i);
  assert.match(sql, /working_title text not null/i);
  assert.match(sql, /status text not null default 'planned'/i);
  assert.match(sql, /sort_order integer not null default 10/i);
  assert.match(sql, /article_kind text not null default 'news'/i);
  assert.match(sql, /length_mode text not null default 'standard'/i);
  assert.match(sql, /editorial_instructions text not null default ''/i);
  assert.match(sql, /status in \('planned', 'ready', 'cancelled'\)/i);
  assert.match(sql, /article_kind in \('news', 'analysis', 'preview', 'summary'\)/i);
  assert.match(sql, /length_mode in \('brief', 'standard', 'developed'\)/i);
  assert.doesNotMatch(sql, /status in \([^)]*drafted/i);
});

test("as atribuições referenciam fontes congeladas pertencentes ao mesmo Dossiê", () => {
  const sql = read(applyPath);

  assert.match(sql, /create table public\.newsroom_editorial_dossier_article_plan_sources/i);
  assert.match(sql, /article_plan_id uuid not null/i);
  assert.match(sql, /dossier_source_id uuid not null/i);
  assert.match(sql, /unique \(dossier_id, id\)/i);
  assert.match(sql, /foreign key \(dossier_id, article_plan_id\)/i);
  assert.match(sql, /references public\.newsroom_editorial_dossier_article_plans\(dossier_id, id\)/i);
  assert.match(sql, /foreign key \(dossier_id, dossier_source_id\)/i);
  assert.match(sql, /references public\.newsroom_editorial_dossier_sources\(dossier_id, id\)/i);
  assert.match(sql, /unique \(article_plan_id, dossier_source_id\)/i);
  assert.doesNotMatch(sql, /newsroom_snapshot_id uuid|newsroom_article_id uuid/i);
});

test("o schema limita cada Dossiê a quatro planos ativos e permite cancelados", () => {
  const apply = read(applyPath);
  const smoke = read(smokePath);

  assert.match(apply, /create function public\.newsroom_validate_editorial_dossier_article_plan_limit/i);
  assert.match(apply, /plan\.status <> 'cancelled'/i);
  assert.match(apply, /v_active_plan_count >= 4/i);
  assert.match(apply, /for update/i);
  assert.match(apply, /editorial_dossier_article_plan_limit_exceeded/i);

  assert.match(smoke, /Quinto artigo ativo/i);
  assert.match(smoke, /when check_violation/i);
  assert.match(smoke, /Plano cancelado fora do limite ativo/i);
});

test("a escrita permanece exclusivamente server-side através de service_role", () => {
  const sql = read(applyPath);

  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(
    sql,
    /revoke all privileges on table public\.newsroom_editorial_dossier_article_plans\s+from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /revoke all privileges on table public\.newsroom_editorial_dossier_article_plan_sources\s+from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant select, insert, update, delete\s+on table public\.newsroom_editorial_dossier_article_plans\s+to service_role/i,
  );
  assert.match(
    sql,
    /grant select, insert, update, delete\s+on table public\.newsroom_editorial_dossier_article_plan_sources\s+to service_role/i,
  );
});

test("postflight e smoke validam relações, isolamento, limite, cascata e rollback", () => {
  const postflight = read(postflightPath);
  const smoke = read(smokePath);

  assert.match(postflight, /postflight_plan_identity_foreign_key_missing/i);
  assert.match(postflight, /postflight_dossier_source_identity_foreign_key_missing/i);
  assert.match(postflight, /postflight_article_plan_limit_trigger_missing/i);
  assert.match(postflight, /postflight_rls_not_forced/i);
  assert.match(postflight, /postflight_unexpected_client_privilege/i);
  assert.match(postflight, /rollback;/i);

  assert.match(smoke, /smoke_cross_dossier_source_was_not_blocked/i);
  assert.match(smoke, /when foreign_key_violation/i);
  assert.match(smoke, /smoke_duplicate_plan_source_was_not_blocked/i);
  assert.match(smoke, /smoke_dossier_plan_cascade_failed/i);
  assert.match(smoke, /persistent_writes', false/i);
  assert.match(smoke, /rollback;/i);
});

test("a fase de schema não gera texto, não traduz e não cria artigos editoriais", () => {
  const sql = [read(preflightPath), read(applyPath), read(postflightPath), read(smokePath)].join("\n");

  assert.doesNotMatch(sql, /openai|anthropic|gemini|translation|translate|prompt_version|generation_run/i);
  assert.doesNotMatch(sql, /insert into public\.editorial_articles|update public\.editorial_articles/i);
  assert.doesNotMatch(sql, /cron|worker|webhook|http_post|net\./i);
});
