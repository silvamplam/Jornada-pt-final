import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260909100000_newsroom_editorial_production_workspace_foundation.sql";
const smokePath =
  "supabase/sql/jornada-redacao-workspace-producao-fundacao-1-smoke-rollback.sql";
const servicePath =
  "lib/redacao-automatica/editorial-dossier-production-workspace-service.ts";
const internalPath =
  "lib/redacao-automatica/editorial-dossier-production-workspace-service-internal.ts";
const repositoryPath =
  "lib/redacao-automatica/editorial-dossier-production-workspace-repository.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function functionBody(sql: string, functionName: string): string {
  return sql.match(new RegExp(
    `create function public\\.${functionName}\\([\\s\\S]*?\\$function\\$;`,
    "i",
  ))?.[0] ?? "";
}

function tableBody(sql: string, tableName: string, nextStatement: string): string {
  const start = sql.indexOf(`create table public.${tableName}`);
  const end = sql.indexOf(nextStatement, start);
  return start >= 0 && end > start ? sql.slice(start, end) : "";
}

test("cria as duas memberships normalizadas de PUBLICADAS sem duplicar o artigo", () => {
  const sql = read(migrationPath);
  const planContexts = tableBody(
    sql,
    "newsroom_editorial_dossier_article_plan_published_contexts",
    "create table public.newsroom_editorial_dossier_images",
  );

  assert.match(sql, /create table public\.newsroom_editorial_dossier_published_contexts/i);
  assert.match(sql, /unique \(dossier_id, editorial_article_id\)/i);
  assert.match(sql, /references public\.editorial_articles\(id\)\s*on delete restrict/i);
  assert.match(
    planContexts,
    /foreign key \(dossier_id, article_plan_id\)[\s\S]*references public\.newsroom_editorial_dossier_article_plans\(dossier_id, id\)/i,
  );
  assert.match(
    planContexts,
    /foreign key \(dossier_id, dossier_published_context_id\)[\s\S]*references public\.newsroom_editorial_dossier_published_contexts\(dossier_id, id\)/i,
  );
  assert.doesNotMatch(planContexts, /\beditorial_article_id\b/i);
  assert.match(sql, /This relation never means UPDATE/i);
});

test("destination e escolha de imagem vivem uma vez no Article Plan", () => {
  const sql = read(migrationPath);
  assert.match(sql, /add column destination text not null default 'new'/i);
  assert.match(sql, /add column update_target_editorial_article_id uuid/i);
  assert.match(sql, /add column image_choice text not null default 'unselected'/i);
  assert.match(sql, /add column dossier_image_id uuid/i);
  assert.match(
    sql,
    /destination = 'new'[\s\S]*update_target_editorial_article_id is null[\s\S]*destination = 'update'[\s\S]*update_target_editorial_article_id is not null/i,
  );
  assert.match(
    sql,
    /image_choice = 'preserve_published'[\s\S]*destination = 'update'[\s\S]*dossier_image_id is null/i,
  );
  assert.match(
    sql,
    /image_choice = 'dossier_image'[\s\S]*dossier_image_id is not null/i,
  );
  assert.doesNotMatch(sql, /image_choice = '(none|no_image|without_image)'/i);
  assert.match(sql, /editorial_article_id keeps its separate materialized-output meaning/i);
});

test("writer do plano valida target publicado e mantém revalidação futura explícita", () => {
  const sql = read(migrationPath);
  const writer = functionBody(sql, "newsroom_save_dossier_article_plan_state_v1");
  assert.match(writer, /article_row\.id = p_update_target_editorial_article_id/i);
  assert.match(writer, /article_row\.status = 'published'/i);
  assert.match(writer, /production_workspace_update_target_not_published/i);
  assert.match(sql, /future Source Package writer must revalidate it/i);
  assert.doesNotMatch(
    sql,
    /add column (update_target_status|published_status|target_status)/i,
  );
});

test("PREPARAR compara todo o pedido lógico antes de reutilizar", () => {
  const sql = read(migrationPath);
  const prepare = functionBody(
    sql,
    "newsroom_prepare_editorial_dossier_workspace_v1",
  );
  assert.match(sql, /preparation_key uuid/i);
  assert.match(sql, /unique \(preparation_key\)/i);
  assert.match(prepare, /v_existing_title is distinct from pg_catalog\.btrim\(p_title\)/i);
  assert.match(prepare, /v_existing_article_ids is distinct from p_newsroom_article_ids/i);
  assert.match(prepare, /v_existing_snapshot_ids is distinct from p_newsroom_snapshot_ids/i);
  assert.match(prepare, /v_existing_published_ids is distinct from p_published_context_article_ids/i);
  assert.match(prepare, /production_workspace_prepare_idempotency_conflict/i);
  assert.match(prepare, /case when v_created then 'created' else 'reused' end/i);
});

test("PREPARAR usa o snapshot explícito e não cria estado downstream", () => {
  const sql = read(migrationPath);
  const prepare = functionBody(
    sql,
    "newsroom_prepare_editorial_dossier_workspace_v1",
  );
  assert.match(prepare, /p_newsroom_article_ids uuid\[\]/i);
  assert.match(prepare, /p_newsroom_snapshot_ids uuid\[\]/i);
  assert.match(
    prepare,
    /snapshot_row\.article_id = requested_row\.newsroom_article_id[\s\S]*snapshot_row\.id = requested_row\.newsroom_snapshot_id/i,
  );
  assert.match(
    prepare,
    /insert into public\.newsroom_editorial_dossier_sources[\s\S]*requested_row\.newsroom_snapshot_id/i,
  );
  assert.doesNotMatch(
    prepare,
    /insert into public\.(newsroom_editorial_dossier_article_plans|editorial_articles|newsroom_editorial_source_packages|newsroom_editorial_dossier_article_plan_generations)/i,
  );
  assert.doesNotMatch(prepare, /openai|anthropic|gemini|http_post|net\./i);
});

test("imagem de NOVA congela a autoridade atual sem fingir pertença ao snapshot", () => {
  const sql = read(migrationPath);
  const imageTable = tableBody(
    sql,
    "newsroom_editorial_dossier_images",
    "create unique index ned_images_newsroom_origin_uidx",
  );
  const prepare = functionBody(
    sql,
    "newsroom_prepare_editorial_dossier_workspace_v1",
  );

  assert.match(imageTable, /newsroom_article_id uuid/i);
  assert.doesNotMatch(imageTable, /newsroom_snapshot_id/i);
  assert.doesNotMatch(sql, /ned_images_newsroom_snapshot_fkey/i);
  assert.match(prepare, /pg_catalog\.btrim\(article_row\.image_url\)/i);
  assert.match(sql, /newsroom_articles is the image authority/i);
  assert.match(sql, /textual snapshot remains only on the dossier source/i);
});

test("banco guarda proveniência exclusiva e fecha upload ao bucket oficial", () => {
  const sql = read(migrationPath);
  const uploadWriter = functionBody(sql, "newsroom_add_dossier_upload_image_v1");
  assert.match(sql, /origin_kind = 'newsroom'[\s\S]*newsroom_article_id is not null/i);
  assert.match(sql, /origin_kind = 'published'[\s\S]*editorial_article_id is not null/i);
  assert.match(
    sql,
    /origin_kind = 'upload'[\s\S]*storage_bucket is not null[\s\S]*storage_path is not null[\s\S]*file_name is not null/i,
  );
  assert.match(sql, /frozen_url text not null/i);
  assert.match(sql, /unique \(dossier_id, storage_bucket, storage_path\)/i);
  assert.match(
    sql,
    /foreign key \(dossier_id, dossier_image_id\)[\s\S]*references public\.newsroom_editorial_dossier_images\(dossier_id, id\)/i,
  );
  assert.match(sql, /ned_images_upload_bucket_check[\s\S]*storage_bucket = 'editorial-images'/i);
  assert.match(
    uploadWriter,
    /pg_catalog\.btrim\(coalesce\(p_storage_bucket, ''\)\) <> 'editorial-images'/i,
  );
  assert.doesNotMatch(sql, /add column (image_url|frozen_url) text/i);
});

test("RLS forçado, grants mínimos e RPCs administrativas não abrem escrita pública", () => {
  const sql = read(migrationPath);
  for (const tableName of [
    "newsroom_editorial_dossier_published_contexts",
    "newsroom_editorial_dossier_article_plan_published_contexts",
    "newsroom_editorial_dossier_images",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${tableName}\\s+enable row level security`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${tableName}\\s+force row level security`, "i"));
    assert.match(sql, new RegExp(`grant select[\\s\\S]*on table public\\.${tableName}[\\s\\S]*to service_role`, "i"));
    assert.doesNotMatch(
      sql,
      new RegExp(`grant (insert|update|delete)[\\s\\S]*on table public\\.${tableName}`, "i"),
    );
  }

  for (const functionName of [
    "newsroom_prepare_editorial_dossier_workspace_v1",
    "newsroom_save_dossier_article_plan_state_v1",
    "newsroom_add_dossier_upload_image_v1",
  ]) {
    const body = functionBody(sql, functionName);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = ''/i);
    assert.match(
      sql,
      new RegExp(`revoke all[\\s\\S]*on function public\\.${functionName}[\\s\\S]*from public, anon, authenticated, service_role`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`grant execute[\\s\\S]*on function public\\.${functionName}[\\s\\S]*to service_role`, "i"),
    );
  }
  assert.doesNotMatch(sql, /grant[^;]+to (anon|authenticated)/i);
});

test("legacy recebe apenas defaults seguros e fundações fora do lote não mudam", () => {
  const sql = read(migrationPath);
  assert.match(sql, /preparation_key uuid/i);
  assert.doesNotMatch(sql, /set\s+preparation_key\s*=/i);
  assert.doesNotMatch(sql, /update public\.newsroom_editorial_dossier_article_plans\s+set\s+editorial_article_id/i);
  assert.doesNotMatch(sql, /alter table public\.newsroom_editorial_source_packages/i);
  assert.doesNotMatch(sql, /alter table public\.newsroom_editorial_themes/i);
  assert.doesNotMatch(sql, /\btheme_id\b/i);
});

test("serviços usam só as três RPCs e readers paginam relações em lote", () => {
  const service = read(servicePath);
  const internal = read(internalPath);
  const repository = read(repositoryPath);
  assert.match(service, /^import "server-only";/);
  assert.match(repository, /^import "server-only";/);
  assert.match(service, /rpc\/newsroom_prepare_editorial_dossier_workspace_v1/);
  assert.match(service, /rpc\/newsroom_save_dossier_article_plan_state_v1/);
  assert.match(service, /rpc\/newsroom_add_dossier_upload_image_v1/);
  assert.doesNotMatch([service, internal].join("\n"), /openai|anthropic|gemini|source-package/i);
  assert.match(repository, /while \(true\)/);
  assert.match(repository, /RELATION_PAGE_SIZE/);
  assert.match(repository, /Promise\.all\(/);
  assert.match(repository, /ARTICLE_CHUNK_SIZE/);
});

test("smoke usa rollback e cobre invariantes e ausência de efeitos downstream", () => {
  const smoke = read(smokePath);
  assert.match(smoke, /^begin;/i);
  assert.match(smoke, /rollback;\s*$/i);
  assert.doesNotMatch(smoke, /\bcommit;/i);
  assert.match(smoke, /workspace_smoke_prepare_retry_duplicated/i);
  assert.match(smoke, /workspace_smoke_retry_refreshed_frozen_image/i);
  assert.match(smoke, /workspace-source-changed\.jpg/i);
  assert.match(smoke, /workspace_smoke_idempotency_conflict_not_blocked/i);
  assert.match(smoke, /workspace_smoke_foreign_context_not_blocked/i);
  assert.match(smoke, /workspace_smoke_foreign_image_rpc_not_blocked/i);
  assert.match(smoke, /workspace_smoke_foreign_image_fk_not_blocked/i);
  assert.match(smoke, /workspace_smoke_foreign_image_changed_plan/i);
  assert.match(smoke, /workspace_smoke_upload_bucket_not_blocked/i);
  assert.match(smoke, /workspace_smoke_new_target_not_blocked/i);
  assert.match(smoke, /workspace_smoke_update_without_target_not_blocked/i);
  assert.match(smoke, /workspace_smoke_noncanonical_target_not_blocked/i);
  assert.match(smoke, /workspace_smoke_draft_update_target_not_blocked/i);
  assert.match(smoke, /workspace_smoke_preserve_on_new_not_blocked/i);
  assert.match(smoke, /workspace_smoke_unassigned_upload_failed/i);
  assert.match(smoke, /workspace_smoke_prepare_created_downstream_state/i);
  assert.match(smoke, /workspace_smoke_legacy_defaults_invalid/i);
});
