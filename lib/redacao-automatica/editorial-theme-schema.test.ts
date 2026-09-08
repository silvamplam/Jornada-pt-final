import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ARTICLE_CLASSIFICATION_KEYS } from "@/lib/editorial-classifications";

const migrationPath =
  "supabase/migrations/20260908112602_newsroom_editorial_themes_foundation.sql";
const servicePath =
  "lib/redacao-automatica/editorial-theme-service.ts";
const repositoryPath =
  "lib/redacao-automatica/editorial-theme-repository.ts";
const smokePath =
  "supabase/sql/jornada-redacao-tema-fundacao-1-smoke-rollback.sql";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function functionBody(sql: string, functionName: string): string {
  const pattern = new RegExp(
    `create function public\\.${functionName}\\([\\s\\S]*?\\$function\\$;`,
    "i",
  );
  return sql.match(pattern)?.[0] ?? "";
}

function tableDefinition(sql: string, tableName: string): string {
  const pattern = new RegExp(
    `create table public\\.${tableName}\\s*\\([\\s\\S]*?\\n\\);`,
    "i",
  );
  return sql.match(pattern)?.[0] ?? "";
}

test("o schema cria apenas Tema, membership de fontes e membership de artigos", () => {
  const sql = read(migrationPath);

  assert.match(sql, /create table public\.newsroom_editorial_themes\s*\(/i);
  assert.match(sql, /create table public\.newsroom_editorial_theme_sources\s*\(/i);
  assert.match(sql, /create table public\.newsroom_editorial_theme_articles\s*\(/i);
  assert.match(sql, /status text not null default 'open'/i);
  assert.match(sql, /check \(status in \('open', 'archived'\)\)/i);
  assert.match(sql, /context_text text/i);
  assert.match(sql, /competition_id uuid/i);
  assert.match(sql, /season_id uuid/i);
  assert.match(sql, /matchday_id uuid/i);
  assert.match(sql, /match_id uuid/i);
  assert.doesNotMatch(sql, /create table public\.newsroom_editorial_dossiers/i);
  assert.doesNotMatch(sql, /source_package|article_plan|generation_run/i);
});

test("a classificação do Tema usa exatamente as cinco chaves existentes", () => {
  const sql = read(migrationPath);
  const check = sql.match(
    /constraint newsroom_editorial_themes_classification_check[\s\S]*?\)\s*\),/i,
  )?.[0] ?? "";
  const persistedKeys = [...check.matchAll(/'([a-z_]+)'/g)]
    .map((match) => match[1]);

  assert.deepEqual(persistedKeys, ARTICLE_CLASSIFICATION_KEYS);
  assert.doesNotMatch(sql, /alter table public\.editorial_articles[\s\S]*classification_key/i);
});

test("membership referencia identidades reais, não snapshots nem cópias", () => {
  const sql = read(migrationPath);
  const memberships = [
    tableDefinition(sql, "newsroom_editorial_theme_sources"),
    tableDefinition(sql, "newsroom_editorial_theme_articles"),
  ].join("\n");

  assert.match(
    sql,
    /primary key \(theme_id, newsroom_article_id\)/i,
  );
  assert.match(
    sql,
    /references public\.newsroom_articles\(id\)/i,
  );
  assert.match(
    sql,
    /primary key \(theme_id, editorial_article_id\)/i,
  );
  assert.match(
    sql,
    /references public\.editorial_articles\(id\)/i,
  );
  assert.doesNotMatch(memberships, /\b(used|consumed|processed)\b/i);
  assert.doesNotMatch(memberships, /newsroom_snapshot_id/i);
  assert.doesNotMatch(
    memberships,
    /title_snapshot|published_slug|published_at_snapshot/i,
  );
  assert.doesNotMatch(memberships, /\b(created|updated|related)\s+text\b/i);
});

test("o contexto opcional usa autoridades reais e rejeita hierarquias incoerentes", () => {
  const sql = read(migrationPath);

  for (const table of ["competitions", "seasons", "matchdays", "matches"]) {
    assert.match(sql, new RegExp(`references public\\.${table}\\(id\\)`, "i"));
  }
  assert.match(sql, /create function public\.newsroom_prepare_editorial_theme_v1/i);
  assert.match(sql, /editorial_theme_context_mismatch/i);
  assert.match(sql, /match_row\.competition_id = new\.competition_id/i);
  assert.match(sql, /match_row\.season_id = new\.season_id/i);
  assert.match(sql, /match_row\.matchday_id = new\.matchday_id/i);
});

test("RLS e privilégios mantêm a fundação exclusivamente server-side", () => {
  const sql = read(migrationPath);

  for (const table of [
    "newsroom_editorial_themes",
    "newsroom_editorial_theme_sources",
    "newsroom_editorial_theme_articles",
  ]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} force row level security`, "i"),
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all privileges\\s+on table public\\.${table}\\s+from public, anon, authenticated, service_role`,
        "i",
      ),
    );
  }

  assert.match(sql, /grant select, insert, update\s+on table public\.newsroom_editorial_themes\s+to service_role/i);
  assert.match(sql, /grant select, insert, delete\s+on table public\.newsroom_editorial_theme_sources\s+to service_role/i);
  assert.match(sql, /grant select, insert, delete\s+on table public\.newsroom_editorial_theme_articles\s+to service_role/i);
  assert.doesNotMatch(
    sql,
    /grant[^;]*delete[^;]*on table public\.newsroom_editorial_themes\s+to service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant[^;]*update[^;]*on table public\.newsroom_editorial_theme_(sources|articles)\s+to service_role/i,
  );
  assert.doesNotMatch(sql, /grant[^;]+to (anon|authenticated)/i);

  assert.match(read(servicePath), /^import "server-only";/);
  assert.match(read(repositoryPath), /^import "server-only";/);
});

test("as operações mínimas existem e as associações são idempotentes", () => {
  const sql = read(migrationPath);
  const service = read(servicePath);

  for (const operation of [
    "newsroom_create_editorial_theme_v1",
    "newsroom_update_editorial_theme_v1",
    "newsroom_set_editorial_theme_status_v1",
    "newsroom_set_editorial_theme_source_membership_v1",
    "newsroom_set_editorial_theme_article_membership_v1",
  ]) {
    assert.match(sql, new RegExp(`create function public\\.${operation}`, "i"));
    assert.match(service, new RegExp(operation));
  }
  assert.match(service, /`rpc\/\$\{functionName\}`/);

  assert.match(
    sql,
    /on conflict on constraint newsroom_editorial_theme_sources_pkey\s+do nothing/i,
  );
  assert.match(
    sql,
    /on conflict on constraint newsroom_editorial_theme_articles_pkey\s+do nothing/i,
  );
  assert.match(sql, /p_associated boolean/i);
});

test("o repositório lista por classificação e lê os dois tipos de membro", () => {
  const repository = read(repositoryPath);

  assert.match(repository, /export async function listEditorialThemes/);
  assert.match(repository, /classification_key=eq\.\$\{encodeURIComponent\(input\.classificationKey\)\}/);
  assert.match(repository, /export async function getEditorialThemeById/);
  assert.match(repository, /newsroom_editorial_theme_sources/);
  assert.match(repository, /newsroom_editorial_theme_articles/);
  assert.match(
    repository,
    /readAllEditorialThemeMembershipRows<ThemeSourceRow>/,
  );
  assert.match(
    repository,
    /readAllEditorialThemeMembershipRows<ThemeArticleRow>/,
  );
  assert.match(repository, /newsroomArticleId: row\.newsroom_article_id/);
  assert.match(repository, /editorialArticleId: row\.editorial_article_id/);
});

test("arquivar só altera o estado e não apaga relações", () => {
  const sql = read(migrationPath);
  const body = functionBody(
    sql,
    "newsroom_set_editorial_theme_status_v1",
  );

  assert.match(body, /set status = p_status/i);
  assert.doesNotMatch(body, /delete from/i);
  assert.doesNotMatch(body, /newsroom_editorial_theme_(sources|articles)/i);
});

test("membership não altera fontes, revisão, uso ou artigos canónicos", () => {
  const sql = read(migrationPath);
  const sourceBody = functionBody(
    sql,
    "newsroom_set_editorial_theme_source_membership_v1",
  );
  const articleBody = functionBody(
    sql,
    "newsroom_set_editorial_theme_article_membership_v1",
  );

  assert.doesNotMatch(sourceBody, /update\s+public\.newsroom_articles/i);
  assert.doesNotMatch(sourceBody, /newsroom_editorial_review_states/i);
  assert.doesNotMatch(sourceBody, /source_packages|\bused\b|consumed|processed/i);
  assert.doesNotMatch(articleBody, /update\s+public\.editorial_articles/i);
  assert.doesNotMatch(articleBody, /insert into\s+public\.editorial_articles/i);
});

test("nenhum fluxo existente recebe theme_id nem passa a criar Tema", () => {
  const sql = read(migrationPath);

  assert.doesNotMatch(sql, /\btheme_id\b\s+(uuid\s+)?(not null\s+)?references\s+public\.newsroom_editorial_themes/i);
  assert.doesNotMatch(
    sql,
    /alter table public\.(editorial_articles|newsroom_articles|newsroom_editorial_dossiers|newsroom_editorial_source_packages|newsroom_editorial_dossier_article_plans)/i,
  );
  assert.doesNotMatch(
    sql,
    /create trigger[^;]+on public\.(editorial_articles|newsroom_articles|newsroom_editorial_dossiers)/i,
  );
});

test("a camada entregue não implementa UI, IA, radar, produção ou publicação", () => {
  const contents = [
    read(migrationPath),
    read(servicePath),
    read(repositoryPath),
  ].join("\n");

  assert.doesNotMatch(contents, /openai|anthropic|gemini|prompt_version|generateArticle/i);
  assert.doesNotMatch(contents, /cron|worker|webhook|http_post|net\./i);
  assert.doesNotMatch(contents, /insert into public\.editorial_articles/i);
  assert.doesNotMatch(contents, /update public\.editorial_articles/i);
  assert.doesNotMatch(contents, /newsroom_editorial_dossiers\?|\brpc\/newsroom_.*dossier/i);
});

test("o smoke PostgreSQL segue a convenção transacional e cobre o contrato", () => {
  const smoke = read(smokePath);

  assert.match(smoke, /\bbegin;/i);
  assert.match(smoke, /\brollback;\s*$/i);
  assert.doesNotMatch(smoke, /\bcommit;/i);
  assert.match(smoke, /set local role service_role;/i);
  assert.match(smoke, /has_table_privilege\(/i);
  assert.match(smoke, /relrowsecurity/i);
  assert.match(smoke, /relforcerowsecurity/i);
  assert.match(smoke, /newsroom_create_editorial_theme_v1/i);
  assert.match(smoke, /newsroom_update_editorial_theme_v1/i);
  assert.match(smoke, /newsroom_set_editorial_theme_status_v1/i);
  assert.match(smoke, /newsroom_set_editorial_theme_source_membership_v1/i);
  assert.match(smoke, /newsroom_set_editorial_theme_article_membership_v1/i);
  assert.match(smoke, /when unique_violation then/i);
  assert.match(smoke, /when check_violation then/i);
  assert.match(smoke, /on delete cascade/i);
  assert.match(smoke, /on delete set null/i);
});

test("o teste contratual não contém caracteres de controlo inesperados", () => {
  assert.doesNotMatch(
    read("lib/redacao-automatica/editorial-theme-schema.test.ts"),
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u,
  );
});
