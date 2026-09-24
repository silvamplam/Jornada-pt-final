import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260922195433_newsroom_manual_classification_theme_authority.sql";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function functionBody(sql: string, functionName: string): string {
  return sql.match(new RegExp(
    `create(?: or replace)? function public\\.${functionName}\\([\\s\\S]*?\\$function\\$;`,
    "i",
  ))?.[0] ?? "";
}

test("as quatro entradas operacionais não invocam classificação automática", () => {
  for (const path of [
    "lib/redacao-automatica/newsroom-current-feed.ts",
    "lib/redacao-automatica/newsroom-article-persistence.ts",
    "lib/redacao-automatica/manual-newsroom-entry-service.ts",
    "lib/redacao-automatica/manual-newsroom-source-service.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /attemptOperationalDeskAutomaticClassification/);
    assert.doesNotMatch(source, /classifyNewsroomCurrentFeedArticles/);
    assert.doesNotMatch(source, /applyAutomaticNewsroomArticleClassification/);
    assert.doesNotMatch(source, /newsroom_apply_automatic_article_classification_v1/);
  }
});

test("batch manual valida o conjunto completo antes de uma única escrita atómica", () => {
  const sql = read(migrationPath);
  const batch = functionBody(sql, "newsroom_set_manual_article_classifications_v2");
  assert.match(batch, /cardinality\(p_newsroom_article_ids\) < 1/i);
  assert.match(batch, /cardinality\(p_newsroom_article_ids\) > 20/i);
  assert.match(batch, /count\(distinct requested_row\.newsroom_article_id\)/i);
  assert.match(batch, /newsroom_article_classification_source_not_found/i);
  assert.match(batch, /2026-09-09T14:02:00Z/i);
  assert.match(batch, /newsroom_article_classification_source_outside_cycle/i);
  assert.match(batch, /newsroom_article_classification_theme_conflict/i);
  assert.match(batch, /if p_classification_key is null then[\s\S]*delete from public\.newsroom_editorial_article_classifications/i);
  assert.match(batch, /classification_source[\s\S]*'manual'/i);
  assert.match(batch, /on conflict on constraint[\s\S]*newsroom_editorial_article_classifications_pkey/i);
  assert.doesNotMatch(batch, /newsroom_apply_automatic_article_classification_v1/i);
});

test("membership classifica pelo Tema na mesma transação e sair não desfaz", () => {
  const sql = read(migrationPath);
  const membership = functionBody(
    sql,
    "newsroom_set_editorial_theme_source_membership_v1",
  );
  const insertAt = membership.indexOf("insert into public.newsroom_editorial_theme_sources");
  const classifyAt = membership.indexOf("newsroom_set_manual_article_classification_v1");
  assert.ok(insertAt >= 0 && classifyAt > insertAt);
  assert.match(membership, /editorial_theme_source_classification_conflict/i);
  const removal = membership.slice(membership.indexOf("else"));
  assert.match(removal, /delete from public\.newsroom_editorial_theme_sources/i);
  assert.doesNotMatch(removal, /newsroom_clear_article_classification_v1/i);
  assert.doesNotMatch(removal, /classification_source\s*=\s*'automatic'/i);
});

test("mudar a classificação do Tema reclassifica todos os membros atomicamente", () => {
  const sql = read(migrationPath);
  const update = functionBody(sql, "newsroom_update_editorial_theme_v1");
  assert.match(update, /for update/i);
  assert.match(update, /editorial_theme_source_classification_conflict/i);
  assert.match(update, /update public\.newsroom_editorial_themes/i);
  assert.match(update, /for v_newsroom_article_id in[\s\S]*newsroom_editorial_theme_sources/i);
  assert.match(update, /newsroom_set_manual_article_classification_v1\([\s\S]*p_classification_key/i);
});

test("memberships múltiplas incompatíveis abortam no preflight e nas mutações", () => {
  const sql = read(migrationPath);
  const preflightAt = sql.indexOf("newsroom-manual-classification-preflight-theme-conflict");
  const firstDmlAt = sql.indexOf("delete from public.newsroom_editorial_article_classifications");
  assert.ok(preflightAt >= 0 && firstDmlAt > preflightAt);
  assert.match(sql.slice(0, preflightAt), /lock table public\.newsroom_editorial_theme_sources/i);
  assert.match(
    sql.slice(0, preflightAt),
    /count\(distinct theme_row\.classification_key\) > 1/i,
  );
  assert.match(
    functionBody(sql, "newsroom_set_editorial_theme_source_membership_v1"),
    /theme_row\.classification_key is distinct from[\s\S]*v_classification_key/i,
  );
});

test("reset é limitado ao ciclo, preserva manual e promove membros de Tema a manual", () => {
  const sql = read(migrationPath);
  const reset = sql.slice(sql.indexOf("-- Reset controlado"));
  assert.match(reset, /first_detected_at[\s\S]*>= '2026-09-09T14:02:00Z'/i);
  assert.match(reset, /classification_source = 'automatic'/i);
  assert.doesNotMatch(
    reset.slice(0, reset.indexOf("insert into public.newsroom_editorial_article_classifications")),
    /classification_source = 'manual'/i,
  );
  assert.match(reset, /from public\.newsroom_editorial_theme_sources/i);
  assert.match(reset, /'manual'/i);
  assert.match(reset, /on conflict on constraint[\s\S]*newsroom_editorial_article_classifications_pkey/i);
});

test("produção aceita fontes sem classificação e não as recalcula automaticamente", () => {
  const authorityMigration = read(
    "supabase/migrations/20260924200000_newsroom_article_plan_output_classification_authority.sql",
  );
  const prepareRoute = read(
    "app/api/admin/editorial/redacao-automatica/mesa/preparar/route.ts",
  );
  const preview = functionBody(authorityMigration, "newsroom_mesa_preview_intents_v1");
  assert.match(authorityMigration, /newsroom_editorial_article_classifications/i);
  assert.match(authorityMigration, /classificationKey/i);
  assert.doesNotMatch(preview, /classification_required/i);
  assert.doesNotMatch(prepareRoute, /classification_required/i);
  assert.doesNotMatch(authorityMigration, /newsroom_apply_automatic_article_classification_v1/i);
  assert.doesNotMatch(authorityMigration, /deterministic.classif/i);
});

test("UI batch usa uma chamada e só aparece para uma seleção totalmente classificável", () => {
  const client = read(
    "app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx",
  );
  const organizationClient = read(
    "app/admin/editorial/redacao-automatica/mesa/_mesa-organization-client.tsx",
  );
  const route = read(
    "app/api/admin/editorial/redacao-automatica/mesa/classification/route.ts",
  );
  assert.match(client, /classificationBatchAvailable = buffer\.sources\.length > 0/);
  assert.match(client, /selectedThemes\.length === 0/);
  assert.match(client, /dossiers\.length === 0/);
  assert.match(client, /newsroomArticleIds: selectedSources\.map/);
  assert.match(client, /Sem classificação/);
  assert.doesNotMatch(client, /Promise\.all\([\s\S]*CLASSIFICATION_ROUTE/);
  assert.match(route, /setManualNewsroomArticleClassifications/);
  assert.doesNotMatch(route, /newsroom_apply_automatic_article_classification_v1/);
  assert.match(
    organizationClient,
    /const currentClassification = classificationChange[\s\S]*\? classificationChange\.current[\s\S]*: material\.classificationKey/,
  );
});

test("UI batch limpa a seleção apenas depois de classificar com sucesso", () => {
  const client = read(
    "app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx",
  );
  const start = client.indexOf("async function classifySelection()");
  const end = client.indexOf("async function prepare()", start);
  const batch = client.slice(start, end);
  const catchAt = batch.indexOf("} catch (error) {");
  const success = batch.slice(0, catchAt);
  const failure = batch.slice(catchAt);
  const classificationAt = success.indexOf("updateClassification(");
  const clearAt = success.indexOf("removeSources(selectedSources.map(");

  assert.ok(start >= 0 && end > start && catchAt > 0);
  assert.match(success, /!response\.ok[\s\S]*!result\?\.ok[\s\S]*throw new Error/);
  assert.ok(classificationAt >= 0 && clearAt > classificationAt);
  assert.equal((batch.match(/removeSources\(selectedSources\.map\(/g) ?? []).length, 1);
  assert.doesNotMatch(failure, /removeSources\(/);
  assert.match(
    client,
    /removeSources\(newsroomArticleIds\) \{[\s\S]*removeMesaMaterials/,
  );
});

test("fixture PG17 cobre atomicidade, Temas, conflitos e reset com rollback", () => {
  const smoke = read(
    "supabase/sql/test-newsroom-manual-classification-theme-authority-pg17.sql",
  );
  assert.match(smoke, /^begin;/i);
  assert.match(smoke, /rollback;\s*$/i);
  assert.doesNotMatch(smoke, /\bcommit;/i);
  assert.match(smoke, /manual_classification_batch_partially_applied/i);
  assert.match(smoke, /outside_cycle_source_was_accepted/i);
  assert.match(smoke, /leaving_theme_restored_old_classification/i);
  assert.match(smoke, /conflicting_theme_membership_partially_applied/i);
  assert.match(smoke, /automatic_current_cycle_was_not_removed/i);
  assert.match(smoke, /manual_current_cycle_was_not_preserved/i);
  assert.match(smoke, /automatic_outside_cycle_was_not_preserved/i);
  assert.match(smoke, /theme_member_was_not_promoted_to_manual/i);
});

test("a migration não toca na Histórica, Mesa Viva ou classificação contextual", () => {
  const sql = read(migrationPath);
  assert.doesNotMatch(sql, /matchday_historical_article_decisions/i);
  assert.doesNotMatch(sql, /matchday_live_layout/i);
  assert.doesNotMatch(sql, /matchday_editorial_bank_items/i);
});
