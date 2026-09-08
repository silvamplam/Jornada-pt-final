import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ARTICLE_CLASSIFICATION_KEYS } from "@/lib/editorial-classifications";

const migrationPath =
  "supabase/migrations/20260908122938_newsroom_editorial_article_classifications_foundation.sql";
const servicePath =
  "lib/redacao-automatica/newsroom-article-classification-service.ts";
const repositoryPath =
  "lib/redacao-automatica/newsroom-article-classification-repository.ts";
const smokePath =
  "supabase/sql/jornada-redacao-classificacao-prepublicacao-1-smoke-rollback.sql";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function functionBody(sql: string, functionName: string): string {
  return sql.match(new RegExp(
    `create function public\\.${functionName}\\([\\s\\S]*?\\$function\\$;`,
    "i",
  ))?.[0] ?? "";
}

test("schema cria uma única autoridade corrente e nenhuma tabela histórica", () => {
  const sql = read(migrationPath);
  assert.match(
    sql,
    /create table public\.newsroom_editorial_article_classifications\s*\(/i,
  );
  assert.match(sql, /newsroom_article_id uuid primary key/i);
  assert.doesNotMatch(sql, /classification_(events|history|audit)/i);
  assert.doesNotMatch(sql, /created_at/i);
});

test("ausência de linha representa por classificar, sem sexta chave", () => {
  const sql = read(migrationPath);
  assert.match(sql, /absence of a row means unclassified/i);
  assert.doesNotMatch(sql, /classification_key[^;]*'unclassified'/i);
  assert.doesNotMatch(sql, /classification_key[^;]*'por_classificar'/i);
  assert.match(sql, /classification_key text not null/i);
});

test("CHECK SQL usa exatamente as cinco chaves canónicas", () => {
  const sql = read(migrationPath);
  const check = sql.match(
    /constraint newsroom_editorial_article_classifications_key_check[\s\S]*?\n\s*\),/i,
  )?.[0] ?? "";
  const keys = [...check.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  assert.deepEqual(keys, ARTICLE_CLASSIFICATION_KEYS);
});

test("origem atual aceita apenas automatic e manual", () => {
  const sql = read(migrationPath);
  assert.match(
    sql,
    /classification_source in \('automatic', 'manual'\)/i,
  );
  assert.doesNotMatch(
    sql,
    /classification_source in \([^)]*(theme|dossier|package|url)/i,
  );
});

test("PK/FK garantem uma linha por fonte e cascade não bloqueia a identidade", () => {
  const sql = read(migrationPath);
  assert.match(sql, /newsroom_article_id uuid primary key/i);
  assert.match(sql, /references public\.newsroom_articles\(id\)\s*on delete cascade/i);
  assert.match(
    sql,
    /classification_key,\s*classified_at desc,\s*newsroom_article_id asc/i,
  );
});

test("os três RPCs de escrita separados fecham precedência e clear explícito", () => {
  const sql = read(migrationPath);
  const automatic = functionBody(
    sql,
    "newsroom_apply_automatic_article_classification_v1",
  );
  const manual = functionBody(
    sql,
    "newsroom_set_manual_article_classification_v1",
  );
  const clear = functionBody(sql, "newsroom_clear_article_classification_v1");

  assert.match(
    automatic,
    /classification_source\s*=\s*'automatic'[\s\S]*classification_key\s+is distinct from excluded\.classification_key/i,
  );
  assert.doesNotMatch(automatic, /classification_source\s*=\s*excluded\.classification_source/i);
  assert.match(manual, /classification_source = excluded\.classification_source/i);
  assert.match(clear, /delete from public\.newsroom_editorial_article_classifications/i);
  assert.match(clear, /false,\s*true,\s*v_row_count > 0/i);
});

test("RPCs são idempotentes por cláusulas condicionais e row_count", () => {
  const sql = read(migrationPath);
  assert.match(sql, /is distinct from excluded\.classification_key/i);
  assert.match(sql, /\) is distinct from \(\s*excluded\.classification_key,/i);
  assert.match(sql, /get diagnostics v_row_count = row_count/gi);
  assert.match(sql, /v_row_count > 0/gi);
});

test("RLS é enabled/forced e service_role tem apenas SELECT direto", () => {
  const sql = read(migrationPath);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(
    sql,
    /revoke all privileges[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant select\s+on table public\.newsroom_editorial_article_classifications\s+to service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant[^;]*(insert|update|delete|truncate|references|trigger)[^;]*on table public\.newsroom_editorial_article_classifications/i,
  );
  assert.doesNotMatch(sql, /grant[^;]+to (anon|authenticated)/i);
});

test("RPCs privilegiados têm search_path vazio e EXECUTE estritamente revogado", () => {
  const sql = read(migrationPath);
  for (const operation of [
    "newsroom_apply_automatic_article_classification_v1",
    "newsroom_set_manual_article_classification_v1",
    "newsroom_clear_article_classification_v1",
  ]) {
    const body = functionBody(sql, operation);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = ''/i);
    assert.match(
      sql,
      new RegExp(
        `revoke all[\\s\\S]*?on function public\\.${operation}[\\s\\S]*?from public, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute[\\s\\S]*?on function public\\.${operation}[\\s\\S]*?to service_role`,
        "i",
      ),
    );
  }
});

test("RPC de leitura devolve uma linha por fonte e não escreve dados", () => {
  const sql = read(migrationPath);
  const body = functionBody(
    sql,
    "newsroom_read_article_classification_states_v1",
  );
  assert.match(body, /security invoker/i);
  assert.match(body, /stable/i);
  assert.match(body, /with ordinality/i);
  assert.match(body, /left join public\.newsroom_editorial_article_classifications/i);
  assert.match(body, /order by requested_row\.requested_order/i);
  assert.doesNotMatch(
    body,
    /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i,
  );
});

test("migration não altera inbox, snapshots, revisão, uso, Artigos, Bank ou Tema", () => {
  const sql = read(migrationPath);
  const rpcBodies = [
    functionBody(sql, "newsroom_apply_automatic_article_classification_v1"),
    functionBody(sql, "newsroom_set_manual_article_classification_v1"),
    functionBody(sql, "newsroom_clear_article_classification_v1"),
  ].join("\n");

  assert.doesNotMatch(
    sql,
    /alter table public\.(newsroom_articles|newsroom_article_snapshots|newsroom_editorial_review_states|editorial_articles|matchday_editorial_bank_items|newsroom_editorial_themes)/i,
  );
  assert.doesNotMatch(
    rpcBodies,
    /(insert into|update|delete from) public\.(newsroom_articles|newsroom_article_snapshots|newsroom_editorial_review_states|newsroom_editorial_dossier_sources|newsroom_editorial_source_packages|editorial_articles|matchday_editorial_bank_items|newsroom_editorial_themes|newsroom_editorial_theme_sources)/i,
  );
  assert.doesNotMatch(sql, /openai|anthropic|gemini|prompt|team_alias|heuristic/i);
});

test("TypeScript é server-only e reutiliza o contrato canónico", () => {
  const service = read(servicePath);
  const repository = read(repositoryPath);
  assert.match(service, /^import "server-only";/);
  assert.match(repository, /^import "server-only";/);
  assert.match(service, /isArticleClassificationKey/);
  assert.match(repository, /isArticleClassificationKey/);
  assert.doesNotMatch(service, /ARTICLE_CLASSIFICATIONS\s*=\s*\[/);
  assert.doesNotMatch(repository, /ARTICLE_CLASSIFICATIONS\s*=\s*\[/);
});

test("repository oferece leitura singular, lote e listagem paginada", () => {
  const repository = read(repositoryPath);
  assert.match(repository, /export async function getNewsroomArticleClassification\(/);
  assert.match(repository, /export async function getNewsroomArticleClassificationsByIds\(/);
  assert.match(repository, /export async function listNewsroomArticleClassifications\(/);
  assert.match(repository, /readNewsroomArticleClassificationRowsByIds/);
  assert.match(repository, /newsroom_read_article_classification_states_v1/);
  assert.match(repository, /classification_key=eq\./);
});

test("smoke segue rollback e cobre estrutura, precedência e privilégios", () => {
  const smoke = read(smokePath);
  assert.match(smoke, /\bbegin;/i);
  assert.match(smoke, /\brollback;\s*$/i);
  assert.doesNotMatch(smoke, /\bcommit;/i);
  assert.match(smoke, /when foreign_key_violation then/i);
  assert.match(smoke, /when unique_violation then/i);
  assert.match(smoke, /when check_violation then/i);
  assert.match(smoke, /manual_precedence_failed/i);
  assert.match(smoke, /automatic_not_idempotent/i);
  assert.match(smoke, /clear_not_idempotent/i);
  assert.match(smoke, /service_direct_write_allowed/i);
  assert.match(smoke, /relrowsecurity/i);
  assert.match(smoke, /relforcerowsecurity/i);
  assert.match(smoke, /has_table_privilege/i);
  assert.match(smoke, /has_function_privilege/i);
});
