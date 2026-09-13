import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260913134418_newsroom_mesa_contexts_production_2c.sql";
const sqlTestPath =
  "supabase/sql/test-newsroom-mesa-contexts-production-2c-pg17.sql";
const migration = readFileSync(migrationPath, "utf8");
const sqlContractTest = readFileSync(sqlTestPath, "utf8");

function functionBody(name: string, nextMarker: string) {
  const start = migration.indexOf(`create function public.${name}`);
  const end = migration.indexOf(nextMarker, start);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${name} must have a bounded body`);
  return migration.slice(start, end);
}

test("2C adds normalized context relations without rewriting historical rows", () => {
  assert.match(migration, /create table public\.newsroom_mesa_production_context_items/);
  assert.match(migration, /create table public\.newsroom_mesa_production_context_sources/);
  assert.match(migration, /create table public\.newsroom_mesa_article_plan_contexts/);
  assert.match(
    migration,
    /alter table public\.newsroom_mesa_output_publications\s+add column production_context_id uuid/,
  );
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(
    migration,
    /update public\.newsroom_mesa_output_publications\s+set/i,
  );
  assert.doesNotMatch(
    migration,
    /update public\.newsroom_editorial_source_packages\s+set/i,
  );
  assert.match(
    migration,
    /alter table public\.newsroom_mesa_output_publications\s+add column production_context_id uuid;/,
  );
  assert.doesNotMatch(
    migration,
    /alter table public\.newsroom_mesa_output_publications\s+add column production_context_id uuid not null/i,
  );
});

test("a context has one explicit kind and can occur only once per workspace", () => {
  assert.match(
    migration,
    /context_kind = 'source'[\s\S]*source_newsroom_article_id is not null[\s\S]*theme_id is null/,
  );
  assert.match(
    migration,
    /context_kind = 'theme'[\s\S]*source_newsroom_article_id is null[\s\S]*theme_id is not null/,
  );
  assert.match(migration, /newsroom_mesa_context_items_source_uidx/);
  assert.match(migration, /newsroom_mesa_context_items_theme_uidx/);
});

test("frozen context sources reuse the exact workspace dossier source snapshot", () => {
  assert.match(
    migration,
    /foreign key \(dossier_id, dossier_source_id\)[\s\S]*references public\.newsroom_editorial_dossier_sources\(dossier_id, id\)[\s\S]*on delete restrict/,
  );
  assert.match(migration, /newsroom_mesa_context_sources_immutable_v1/);
  assert.match(migration, /newsroom_mesa_protect_frozen_dossier_source_v1/);
  assert.match(migration, /new\.newsroom_snapshot_id is distinct from old\.newsroom_snapshot_id/);
  assert.match(migration, /newsroom_mesa_context_item_sources_valid_v1/);
  assert.match(migration, /select count\(\*\) = 1[\s\S]*item\.source_newsroom_article_id/);
  assert.doesNotMatch(
    migration,
    /unique \(dossier_id, dossier_source_id\)/,
    "the same frozen source must be reusable by multiple contexts",
  );
});

test("Article Plan points to exactly one context in its own workspace", () => {
  assert.match(
    migration,
    /primary key \(dossier_id, article_plan_id\)/,
  );
  assert.match(
    migration,
    /foreign key \(dossier_id, article_plan_id\)[\s\S]*references public\.newsroom_editorial_dossier_article_plans\(dossier_id, id\)/,
  );
  assert.match(
    migration,
    /foreign key \(dossier_id, production_context_id\)[\s\S]*references public\.newsroom_mesa_production_context_items\(dossier_id, id\)/,
  );
  assert.match(migration, /newsroom_mesa_plan_context_sources_valid_v1/);
  assert.match(migration, /select context_source\.dossier_source_id[\s\S]*except[\s\S]*select plan_source\.dossier_source_id/i);
  assert.match(migration, /select plan_source\.dossier_source_id[\s\S]*except[\s\S]*select context_source\.dossier_source_id/i);
  assert.match(migration, /deferrable initially deferred/);
});

test("v3 preparation is idempotent and incorporation plus freezing is one transaction", () => {
  const body = functionBody(
    "newsroom_prepare_mesa_contexts_v3",
    "revoke all on function public.newsroom_prepare_mesa_contexts_v3",
  );
  const membershipWrite = body.indexOf(
    "newsroom_set_editorial_theme_source_membership_v1",
  );
  const workspacePrepare = body.indexOf("newsroom_prepare_mesa_materials_v2");
  const frozenInsert = body.indexOf(
    "insert into public.newsroom_mesa_production_context_sources",
  );

  assert.ok(membershipWrite >= 0);
  assert.ok(workspacePrepare > membershipWrite);
  assert.ok(frozenInsert > workspacePrepare);
  assert.match(body, /contextRequestFingerprint/);
  assert.match(body, /'reused'::text/);
  assert.match(body, /mesa-context-theme-membership-stale/);
  assert.match(body, /mesa-context-source-not-loose/);
  assert.match(body, /jsonb_array_length\(v_contexts\) <> 1/);
  assert.doesNotMatch(body, /commit\s*;/i);
  assert.doesNotMatch(body, /exception\s+when others[\s\S]*return/i);
});

test("saving a 2C Article Plan composes the existing writer and context assignment atomically", () => {
  const body = functionBody(
    "newsroom_save_mesa_context_article_plan_v1",
    "revoke all on function public.newsroom_save_mesa_context_article_plan_v1",
  );
  const existingWriter = body.indexOf("newsroom_save_editorial_dossier_article_plan");
  const contextAssignment = body.indexOf("newsroom_assign_mesa_article_plan_context_v1");

  assert.ok(existingWriter >= 0);
  assert.ok(contextAssignment > existingWriter);
  assert.match(body, /selection_payload ->> 'contractVersion' = '3'/);
  assert.match(body, /selection_payload ->> 'contextContractVersion' = '1'/);
  assert.doesNotMatch(body, /insert into public\.newsroom_editorial_dossier_article_plans/i);
  assert.doesNotMatch(body, /commit\s*;/i);
});

test("sourceScope=context is opt-in and historical source scopes stay valid", () => {
  const checkStart = migration.indexOf(
    "add constraint newsroom_mesa_output_publications_source_scope_check",
  );
  const checkEnd = migration.indexOf(
    "comment on table public.newsroom_mesa_production_context_items",
    checkStart,
  );
  const check = migration.slice(checkStart, checkEnd);

  assert.match(check, /source_scope is null/);
  assert.match(check, /source_scope is not null[\s\S]*source_scope = 'workspace'/);
  assert.match(check, /source_scope = 'workspace'/);
  assert.match(check, /source_scope = 'context'/);
  assert.match(check, /source_scope = 'context'[\s\S]*production_context_id is not null/);
  assert.match(
    migration,
    /foreign key \(dossier_id, article_plan_id, production_context_id\)[\s\S]*newsroom_mesa_article_plan_contexts/,
  );
});

test("shared outputs require context assignments only for opt-in 2C workspaces", () => {
  const start = migration.indexOf(
    "create or replace function public.newsroom_set_mesa_shared_outputs_v2",
  );
  const end = migration.indexOf(
    "revoke all on function public.newsroom_set_mesa_shared_outputs_v2",
    start,
  );
  const body = migration.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(body, /newsroom_mesa_production_context_items context_item/);
  assert.match(body, /newsroom_mesa_article_plan_contexts assignment/);
  assert.match(body, /mesa-shared-outputs-plan-context-invalid/);
  assert.match(
    body,
    /if exists \([\s\S]*newsroom_mesa_production_context_items[\s\S]*\) and exists \(/,
  );
});

test("FONTES_UTILIZADAS is a non-empty subset of the assigned frozen context", () => {
  assert.match(migration, /newsroom_mesa_output_usage_context_scope_v1/);
  assert.match(migration, /mesa-output-source-outside-context/);
  assert.match(migration, /newsroom_mesa_context_output_usage_valid_v1/);
  assert.match(migration, /not exists \([\s\S]*newsroom_mesa_output_source_usage usage/);
  assert.match(
    migration,
    /context_source\.production_context_id = publication\.production_context_id[\s\S]*context_source\.dossier_source_id = p_dossier_source_id/,
  );
});

test("Mesa v2 publication keeps workspace compatibility and enforces context scope when opted in", () => {
  const start = migration.lastIndexOf(
    "create or replace function public.newsroom_publish_mesa_output_v2",
  );
  const end = migration.indexOf(
    "revoke all on function public.newsroom_publish_mesa_output_v2",
    start,
  );
  const body = migration.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(body, /v_source_scope text := 'workspace'/);
  assert.match(body, /selection_payload ->> 'contractVersion' = '3'/);
  assert.match(body, /newsroom_mesa_plan_context_sources_valid_v1/);
  assert.match(body, /v_declared_context_source_ids is distinct from v_frozen_context_source_ids/);
  assert.match(body, /production_context_id, origin_kind/);
  assert.match(body, /v_existing\.production_context_id is distinct from v_production_context_id/);
});

test("consolidation preserves old engines and links outputs from Theme contexts without closing Themes", () => {
  const start = migration.lastIndexOf(
    "create or replace function public.newsroom_mesa_consolidate_publication_v4",
  );
  const end = migration.indexOf(
    "revoke all on function public.newsroom_mesa_consolidate_publication_v4",
    start,
  );
  const body = migration.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(body, /return public\.newsroom_mesa_consolidate_publication_v3/);
  assert.match(body, /v_source_scope not in \('workspace', 'context'\)/);
  assert.match(body, /join public\.newsroom_mesa_production_context_items context_item/);
  assert.match(body, /insert into public\.newsroom_editorial_theme_articles/);
  assert.doesNotMatch(body, /update public\.newsroom_editorial_themes/);
});

test("context manifests declare the exact frozen source set for each output", () => {
  assert.match(
    migration,
    /newsroom_editorial_source_package_manifest_v5_valid[\s\S]*or public\.newsroom_editorial_source_package_manifest_v5_context_valid/,
  );
  assert.match(migration, /sourceScope', 'workspace'/);
  assert.match(migration, /contextSourceIds/);
  assert.match(migration, /mesa-context-package-assignment-invalid/);
  assert.match(migration, /v_declared_source_ids is distinct from v_frozen_source_ids/);
  assert.match(migration, /mesa-context-package-mixed-source-scope/);
});

test("new structural tables are private and RPC access is service-role only", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(
    migration,
    /revoke all on public\.%I from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.newsroom_prepare_mesa_contexts_v3[\s\S]*to service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.newsroom_assign_mesa_article_plan_context_v1[\s\S]*to service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.newsroom_save_mesa_context_article_plan_v1[\s\S]*to service_role/,
  );
});

test("the disposable SQL contract test covers the installed catalog", () => {
  assert.match(sqlContractTest, /begin;/);
  assert.match(sqlContractTest, /rollback;/);
  assert.match(sqlContractTest, /test-2c-normalized-context-tables-missing/);
  assert.match(sqlContractTest, /test-2c-cross-workspace-fkeys-missing/);
  assert.match(sqlContractTest, /test-2c-atomic-prepare-contract-invalid/);
  assert.match(sqlContractTest, /test-2c-output-source-scope-contract-invalid/);
  assert.match(sqlContractTest, /test-2c-context-plan-writer-contract-invalid/);
  assert.match(sqlContractTest, /test-2c-context-publication-contract-invalid/);
});
