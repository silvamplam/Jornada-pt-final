import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260912152810_mesa_production_workspace_v2_provenance.sql";
const migration = readFileSync(migrationPath, "utf8");
const sharedScopeMigration = readFileSync(
  "supabase/migrations/20260912175044_mesa_workspace_shared_output_scope_v2.sql",
  "utf8",
);

function sqlFunction(name: string, nextName: string): string {
  const start = migration.indexOf(`function public.${name}`);
  const end = migration.indexOf(`function public.${nextName}`, start + 1);
  assert.ok(start >= 0, `${name} em falta`);
  assert.ok(end > start, `${nextName} em falta depois de ${name}`);
  return migration.slice(start, end);
}

test("migration é aditiva, marca explicitamente o workspace e não reinterpreta histórico", () => {
  assert.match(migration, /add column workspace_role text/);
  assert.match(migration, /add column workspace_contract_version smallint/);
  assert.match(migration, /add column workspace_state text/);
  assert.match(migration, /Null means historical\/unchanged/);
  assert.doesNotMatch(migration, /update\s+public\.newsroom_mesa_production_contexts\s+set[^;]*workspace_contract_version/i);
  assert.doesNotMatch(migration, /delete from public\.(?:newsroom_articles|newsroom_article_snapshots|editorial_articles|newsroom_editorial_dossiers)/i);
});

test("PREPARAR cria só workspace técnico e nunca alarga o Tema", () => {
  const prepare = sqlFunction(
    "newsroom_prepare_mesa_materials_v2",
    "newsroom_preview_abandon_mesa_production_v2",
  );
  assert.match(prepare, /'technical',2,'active'/);
  assert.match(prepare, /'contractVersion',2/);
  assert.doesNotMatch(prepare, /insert into public\.newsroom_editorial_theme_(?:sources|dossiers)/i);
  assert.doesNotMatch(prepare, /insert into public\.newsroom_mesa_theme_materials/i);
});

test("ABANDONAR bloqueia publicações, restaura apenas o efeito lateral exato e preserva auditoria", () => {
  const abandon = sqlFunction(
    "newsroom_abandon_mesa_production_v2",
    "newsroom_mesa_consolidate_publication_v3",
  );
  assert.match(abandon, /newsroom_preview_abandon_mesa_production_v2/);
  assert.match(abandon, /mesa-production-already-published/);
  assert.match(abandon, /m\.added_at=v_context\.created_at/);
  assert.match(abandon, /abandonment_snapshot=v_snapshot/);
  assert.match(abandon, /workspace_state='abandoned'/);
  assert.doesNotMatch(abandon, /delete from public\.(?:newsroom_mesa_production_contexts|newsroom_editorial_dossiers|newsroom_editorial_dossier_sources|newsroom_articles|newsroom_article_snapshots|editorial_articles)/i);
});

test("consolidação usa proveniência final por output/origem e nunca assignments ou lote inteiro", () => {
  const consolidate = sqlFunction(
    "newsroom_mesa_consolidate_publication_v3",
    "newsroom_mesa_consolidate_publication_v2",
  );
  assert.match(consolidate, /newsroom_mesa_output_source_usage/);
  assert.doesNotMatch(consolidate, /article_plan_source_assignments/i);
  assert.doesNotMatch(consolidate, /v_context\.source_refs\s*\|\|/);
  assert.match(consolidate, /case when op\.origin_kind='source' then op\.article_plan_id else null end/);
  assert.match(consolidate, /elsif jsonb_array_length\(v_refs\)>=2 then/);
  assert.match(consolidate, /v_key:='output:'\|\|\(v_group\.plan_ids\)\[1\]/);
  assert.match(consolidate, /where theme_id=v_context\.theme_id and material_key=v_origin\.material_key\s+and version_id=v_origin\.id/);
});

test("publicação v2 valida, persiste artigo e proveniência e consolida na mesma RPC", () => {
  const publishStart = migration.indexOf("function public.newsroom_publish_mesa_output_v2");
  const publish = migration.slice(publishStart);
  assert.match(publish, /workspace_contract_version<>2/);
  assert.match(publish, /lower\(o->>'outputId'\)=p_output_id::text/);
  assert.match(publish, /s\.id=requested\.id and s\.dossier_id=p_dossier_id and s\.included/);
  assert.match(publish, /jsonb_array_elements\(v_context\.source_refs\)/);
  assert.match(publish, /lower\(e->>'provenanceSourceId'\)=requested\.id::text/);
  assert.doesNotMatch(publish, /article_plan_source_assignments/i);
  assert.match(publish, /insert into public\.editorial_articles/);
  assert.match(publish, /insert into public\.newsroom_mesa_output_publications/);
  assert.match(publish, /insert into public\.newsroom_mesa_output_source_usage/);
  assert.match(publish, /newsroom_mesa_consolidate_publication_v3\(p_dossier_id\)/);
});

test("repetição exata é idempotente e proveniência diferente entra em conflito", () => {
  const publish = migration.slice(migration.indexOf("function public.newsroom_publish_mesa_output_v2"));
  assert.match(publish, /v_existing\.fingerprint<>v_fingerprint/);
  assert.match(publish, /mesa-publication-provenance-conflict/);
  assert.match(publish, /'reused'::text/);
  assert.match(migration, /primary key \(dossier_id, article_plan_id, dossier_source_id\)/);
});

test("código não usa preparation_key como autoridade editorial", () => {
  const organization = readFileSync(
    "lib/redacao-automatica/newsroom-mesa-organization-internal.ts",
    "utf8",
  );
  const operational = readFileSync(
    "lib/redacao-automatica/newsroom-operational-desk-read-model-internal.ts",
    "utf8",
  );
  assert.doesNotMatch(organization, /preparation_key/);
  assert.match(organization, /workspace_role === "technical"/);
  const authority = operational.slice(
    operational.indexOf("const publishedDossierIds"),
    operational.indexOf("const hiddenPreparationThemeMemberships"),
  );
  assert.doesNotMatch(authority, /preparation_key/);
  assert.match(authority, /workspace_role === "technical"/);
});

test("source_scope workspace é aditivo, exclusivo e não faz backfill histórico", () => {
  assert.match(sharedScopeMigration, /add column source_scope text/);
  assert.match(sharedScopeMigration, /source_scope is null\s+and origin_kind is not null/);
  assert.match(sharedScopeMigration, /source_scope is not null\s+and source_scope='workspace'/);
  assert.match(
    sharedScopeMigration,
    /source_scope='workspace'[\s\S]*?origin_kind is null[\s\S]*?origin_dossier_source_id is null[\s\S]*?material_key is null[\s\S]*?material_version_id is null/,
  );
  assert.doesNotMatch(
    sharedScopeMigration,
    /update\s+public\.newsroom_mesa_output_publications\s+set\s+source_scope/i,
  );
});

test("assignments e grupo documental são disponibilidade técnica, nunca utilização", () => {
  const consolidateStart = sharedScopeMigration.indexOf(
    "function public.newsroom_mesa_consolidate_publication_v4",
  );
  const publishStart = sharedScopeMigration.indexOf(
    "function public.newsroom_publish_mesa_output_v2",
    consolidateStart,
  );
  assert.ok(consolidateStart >= 0 && publishStart > consolidateStart);
  const consolidate = sharedScopeMigration.slice(consolidateStart, publishStart);
  assert.match(consolidate, /newsroom_mesa_output_source_usage/);
  assert.doesNotMatch(consolidate, /newsroom_editorial_dossier_article_plan_sources/);
  assert.doesNotMatch(consolidate, /newsroom_editorial_source_packages|articlePosition|sourceArticlePosition/);
  assert.doesNotMatch(consolidate, /newsroom_mesa_output_origins/);
  assert.doesNotMatch(consolidate, /v_context\.source_refs\s*\|\|/);
});

test("publicação workspace persiste apenas proveniência final e origem exclusiva nula", () => {
  const publish = sharedScopeMigration.slice(
    sharedScopeMigration.indexOf("function public.newsroom_publish_mesa_output_v2"),
  );
  assert.match(publish, /sourceScope'='workspace'/);
  assert.match(publish, /not \(o->'articlePlan' \? 'origin'\)/);
  assert.match(publish, /insert into public\.newsroom_mesa_output_source_usage/);
  assert.match(publish, /p_dossier_source_ids/);
  assert.doesNotMatch(publish, /newsroom_editorial_dossier_article_plan_sources/);
  assert.match(
    publish,
    /p_dossier_id,p_output_id,p_package_id,v_article_id,'workspace',\s*null,null,null,null,v_fingerprint,v_payload/,
  );
});
