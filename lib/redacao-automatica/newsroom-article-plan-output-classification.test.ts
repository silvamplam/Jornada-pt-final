import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260924200000_newsroom_article_plan_output_classification_authority.sql";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function functionBody(sql: string, functionName: string): string {
  return sql.match(new RegExp(
    `create(?: or replace)? function public\\.${functionName}\\([\\s\\S]*?\\$function\\$;`,
    "i",
  ))?.[0] ?? "";
}

test("Article Plan é a autoridade explícita e limitada às cinco classificações", () => {
  const sql = read(migrationPath);
  assert.match(sql, /alter table public\.newsroom_editorial_dossier_article_plans[\s\S]*add column if not exists classification_key text/i);
  for (const key of [
    "benfica",
    "sporting",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
  ]) {
    assert.match(sql, new RegExp(`'${key}'`));
  }
  assert.match(sql, /newsroom_save_dossier_article_plan_state_v2[\s\S]*p_classification_key text/i);
  assert.match(sql, /production_workspace_article_plan_classification_invalid/i);
  assert.doesNotMatch(sql, /alter table public\.editorial_articles/i);
});

test("classificação pode ficar nula no draft mas é obrigatória e congelada ao produzir", () => {
  const sql = read(migrationPath);
  const freeze = functionBody(sql, "newsroom_freeze_output_classification_v1");
  assert.match(sql, /classification_key is null\s+or classification_key in/i);
  assert.match(freeze, /article_plan_classification_required/i);
  assert.match(freeze, /articlePlan' ->> 'classificationKey'[\s\S]*is distinct from v_plan\.classification_key/i);
  assert.match(freeze, /article_plan_classification_package_stale/i);
  assert.match(freeze, /new\.classification_fingerprint := v_fingerprint/i);
  assert.match(freeze, /new\.payload := pg_catalog\.jsonb_set/i);

  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  assert.match(route, /Escolhe a classificação do artigo antes de produzir\./);
  assert.match(route, /classificationKey: plan\.classificationKey!/);
  assert.match(route, /classificationsByOutputId/);
});

test("classificação confirmada não pode mudar depois da publicação", () => {
  const sql = read(migrationPath);
  const guard = functionBody(
    sql,
    "newsroom_guard_published_article_plan_classification_v1",
  );
  assert.match(guard, /new\.classification_key is distinct from old\.classification_key/i);
  assert.match(guard, /old\.editorial_article_id is not null/i);
  assert.match(guard, /newsroom_mesa_output_publications/i);
  assert.match(guard, /article_plan_classification_already_published/i);

  const client = read(
    "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx",
  );
  assert.match(client, /classificationTouchedRef\.current = true/);
  assert.match(client, /if \(!classificationTouchedRef\.current\)/);
  assert.match(client, /articlePlanClassificationDefault\(assignedSources\)/);
});

test("publicação aplica a autoridade do plano ao Bank como manual na mesma transação", () => {
  const sql = read(migrationPath);
  const apply = functionBody(sql, "newsroom_apply_output_classification_to_bank_v1");
  assert.match(sql, /create trigger newsroom_output_classification_to_bank_v1\s+after insert/i);
  assert.match(apply, /set classification_key = new\.classification_key/i);
  assert.match(apply, /classification_source = 'manual'/i);
  assert.match(apply, /automatic_eligible = false/i);
  assert.match(apply, /article_plan_classification_bank_item_missing/i);

  const disable = functionBody(
    sql,
    "newsroom_disable_editorial_bank_automatic_fallback_v1",
  );
  assert.match(disable, /source_type[\s\S]*= 'editorial_article'/i);
  assert.match(disable, /new\.automatic_eligible := false/i);
  assert.doesNotMatch(sql, /update public\.editorial_articles[\s\S]*classification_key/i);
});

test("fontes continuam N:N, classificáveis manualmente e opcionais para produzir", () => {
  const sql = read(migrationPath);
  const source = functionBody(sql, "newsroom_mesa_intent_source_v1");
  const preview = functionBody(sql, "newsroom_mesa_preview_intents_v1");
  assert.match(source, /newsroom_editorial_article_classifications/i);
  assert.match(source, /when classification_row\.classification_key is null then '\{\}'::jsonb/i);
  assert.doesNotMatch(source, /newsroom_apply_automatic_article_classification_v1/i);
  assert.doesNotMatch(preview, /classification_required/i);
  assert.match(preview, /jsonb_array_elements\(\s*v_request -> 'selection' -> 'sourceIds'\s*\)/i);

  const classificationRoute = read(
    "app/api/admin/editorial/redacao-automatica/mesa/classification/route.ts",
  );
  const selectionClient = read(
    "app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx",
  );
  const pageModel = read("lib/redacao-automatica/newsroom-mesa-page-read-model.ts");
  assert.match(classificationRoute, /setManualNewsroomArticleClassification/);
  assert.match(selectionClient, /CLASSIFICATION_ROUTE/);
  assert.match(classificationRoute, /setManualNewsroomArticleClassifications/);
  assert.match(pageModel, /p_classification_filter/);
  assert.match(pageModel, /input\.classification\.mode === "unclassified"/);
});

test("a classificação congelada atravessa package, transfer e preflight", () => {
  const packageInternal = read(
    "lib/redacao-automatica/editorial-source-package-internal.ts",
  );
  const transfer = read("lib/redacao-automatica/editorial-batch-transfer.ts");
  const preflight = read(
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
  );
  assert.match(packageInternal, /classificationKey\?: ArticleClassificationKey/);
  assert.match(packageInternal, /articleClassificationLabel\(output\.articlePlan\.classificationKey\)/);
  assert.match(transfer, /classificationsByOutputId\?: Readonly<Record<string, ArticleClassificationKey>>/);
  assert.match(transfer, /batchContract\.outputIds\.some\(\(id\) => !classificationsByOutputId\?\.\[id\]\)/);
  assert.match(preflight, /articleClassificationLabel\(frozenClassification\)/);
});

test("cor da Manchete deriva do artigo e da classificação no checkpoint físico", () => {
  const reducer = read("lib/editorial-matchday-live-layout-desk-state.ts");
  assert.match(reducer, /previousHeadlineBankItemId !== nextHeadlineBankItemId/);
  assert.match(reducer, /previousHeadlineClassificationKey !== nextHeadlineClassificationKey/);
  assert.match(reducer, /headlineTitleColorForClassification\(\s*nextHeadlineClassificationKey/);
  assert.match(reducer, /history: \[\.\.\.state\.history, state\.current\]/);
});
