import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sqlRoot = "supabase/sql";
const preflightPath = `${sqlRoot}/jornada-backoffice-redacao-automatica-dossie-editorial-schema-1-preflight.sql`;
const applyPath = `${sqlRoot}/jornada-backoffice-redacao-automatica-dossie-editorial-schema-1-aplicar.sql`;
const postflightPath = `${sqlRoot}/jornada-backoffice-redacao-automatica-dossie-editorial-schema-1-postflight.sql`;
const smokePath = `${sqlRoot}/jornada-backoffice-redacao-automatica-dossie-editorial-schema-1-smoke-rollback.sql`;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("o preflight do Dossiê editorial é read-only e bloqueia conflitos", () => {
  const sql = read(preflightPath);

  assert.match(sql, /set local transaction_read_only = on/i);
  assert.match(sql, /to_regclass\('public\.newsroom_articles'\)/i);
  assert.match(sql, /to_regclass\('public\.newsroom_article_snapshots'\)/i);
  assert.match(sql, /preflight_target_table_exists/i);
  assert.match(sql, /rollback;/i);
  assert.doesNotMatch(sql, /create table|alter table|insert into|update public|delete from/i);
});

test("o schema cria Dossiês persistentes com orientações editoriais e preferências controladas", () => {
  const sql = read(applyPath);

  assert.match(sql, /create table public\.newsroom_editorial_dossiers/i);
  assert.match(sql, /editorial_instructions text not null default ''/i);
  assert.match(sql, /context_instructions text not null default ''/i);
  assert.match(sql, /output_mode text not null default 'single'/i);
  assert.match(sql, /output_count smallint not null default 1/i);
  assert.match(sql, /length_mode text not null default 'standard'/i);
  assert.match(sql, /article_kind text not null default 'news'/i);
  assert.match(sql, /output_language text not null default 'pt-PT'/i);
  assert.match(sql, /status in \('draft', 'ready_for_generation', 'completed', 'archived'\)/i);
  assert.match(sql, /output_mode = 'single' and output_count = 1/i);
  assert.match(sql, /output_mode = 'multiple' and output_count between 2 and 5/i);
});

test("as fontes do Dossiê congelam o snapshot e preservam ordem, papel e nota editorial", () => {
  const sql = read(applyPath);

  assert.match(sql, /create table public\.newsroom_editorial_dossier_sources/i);
  assert.match(sql, /newsroom_article_id uuid not null/i);
  assert.match(sql, /newsroom_snapshot_id uuid not null/i);
  assert.match(sql, /source_role text not null default 'complementary'/i);
  assert.match(sql, /sort_order integer not null default 10/i);
  assert.match(sql, /editorial_note text/i);
  assert.match(sql, /included boolean not null default true/i);
  assert.match(sql, /unique \(article_id, id\)/i);
  assert.match(sql, /foreign key \(newsroom_article_id, newsroom_snapshot_id\)/i);
  assert.match(sql, /references public\.newsroom_article_snapshots\(article_id, id\)/i);
  assert.match(sql, /unique \(dossier_id, newsroom_article_id\)/i);
  assert.match(sql, /source_role in \('primary', 'corroboration', 'context', 'complementary'\)/i);
});

test("o schema mantém escrita exclusivamente server-side através de service_role", () => {
  const sql = read(applyPath);

  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all privileges on table public\.newsroom_editorial_dossiers from public, anon, authenticated/i);
  assert.match(sql, /revoke all privileges on table public\.newsroom_editorial_dossier_sources from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.newsroom_editorial_dossiers to service_role/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.newsroom_editorial_dossier_sources to service_role/i);
});

test("postflight e smoke validam segurança, invariantes, idempotência e rollback", () => {
  const postflight = read(postflightPath);
  const smoke = read(smokePath);

  assert.match(postflight, /postflight_snapshot_identity_foreign_key_missing/i);
  assert.match(postflight, /postflight_rls_not_forced/i);
  assert.match(postflight, /postflight_unexpected_client_privilege/i);
  assert.match(postflight, /rollback;/i);

  assert.match(smoke, /smoke_requires_existing_newsroom_snapshot/i);
  assert.match(smoke, /when unique_violation/i);
  assert.match(smoke, /when check_violation/i);
  assert.match(smoke, /smoke_dossier_source_cascade_failed/i);
  assert.match(smoke, /persistent_writes', false/i);
  assert.match(smoke, /rollback;/i);
});

test("a fase de schema não introduz IA, tradução, publicação ou escrita editorial", () => {
  const sql = [read(preflightPath), read(applyPath), read(postflightPath), read(smokePath)].join("\n");

  assert.doesNotMatch(sql, /openai|anthropic|gemini|translation|translate|prompt_version|generation_run/i);
  assert.doesNotMatch(sql, /insert into public\.editorial_articles|update public\.editorial_articles|status\s*=\s*'published'/i);
  assert.doesNotMatch(sql, /cron|worker|webhook|http_post|net\./i);
});
