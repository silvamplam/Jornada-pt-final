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

test("Article Plan aceita sugestão opcional e a produção não exige decisão final", () => {
  const sql = read(migrationPath);
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");
  const client = read(
    "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx",
  );

  assert.match(sql, /classification_key is null\s+or classification_key in/i);
  assert.doesNotMatch(route, /Escolhe a classificação do artigo antes de produzir/);
  assert.doesNotMatch(route, /classificationKey: plan\.classificationKey!/);
  assert.match(route, /plan\.classificationKey \? \{ classificationKey: plan\.classificationKey \} : \{\}/);
  assert.match(client, /Sugestão de classificação \(opcional\)/);
  assert.match(client, /A classificação final é confirmada na Publicação em lote\./);
  assert.doesNotMatch(client, /articlePlanClassificationDefault|assignedClassificationDefault/);
});

test("Publicação em lote mostra cinco escolhas junto de Histórica e bloqueia sem escolha", () => {
  const client = read(
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
  );
  const route = read("app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts");
  const classifications = read("lib/editorial-classifications.ts");

  assert.match(client, /<span>Histórica<\/span>/);
  assert.match(client, /<legend>CLASSIFICAÇÃO<\/legend>/);
  assert.match(client, /ARTICLE_CLASSIFICATIONS\.map/);
  assert.match(client, /type="radio"/);
  assert.match(client, /Escolhe a classificação do artigo\./);
  assert.match(client, /publicationCanPublish[\s\S]*classificationsComplete/);
  assert.match(client, /articleOutputClassificationsComplete/);
  assert.match(route, /prepareThemeContinuityPublication\(payload, false\)/);
  assert.match(route, /requireImages && articles\.some\(\(article\)[\s\S]*classificationsByOutputId\.has/);
  assert.match(route, /Escolhe a classificação do artigo\./);
  for (const label of ["Benfica", "Sporting", "FC Porto", "1.ª Liga", "Outros assuntos"]) {
    assert.match(classifications, new RegExp(label.replace(".", "\\.")));
  }
});

test("default usa apenas FONTES_UTILIZADAS validadas por output", () => {
  const route = read("app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts");
  const parser = read("lib/redacao-automatica/editorial-batch-parser.ts");

  assert.match(route, /articleOutputClassificationDefault\(article\.sourceIds, sources\)/);
  assert.match(route, /entry\.provenanceSourceId/);
  assert.match(route, /getNewsroomArticleClassificationsByIds/);
  assert.match(route, /classificationSource:[\s\S]*state\.classification\.classificationSource/);
  assert.match(parser, /FONTES_UTILIZADAS/);
  assert.match(parser, /sourceIdsByOutput/);
  assert.doesNotMatch(route, /assignedContext\.sources|Tema|title.*classification|body.*classification/i);
});

test("a escolha humana substitui o default e é a enviada para publicação", () => {
  const client = read(
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
  );

  assert.match(client, /touchedClassificationKeysRef\.current\.add\(articleKey\)/);
  assert.match(client, /setClassificationChoices\(\(current\)[\s\S]*\[articleKey\]: classificationKey/);
  assert.match(client, /classificationChoicesRef\.current\[article\.key\]/);
  assert.match(client, /classificationKey: classificationChoicesRef\.current\[article\.key\]/);
  assert.match(client, /classificationsByOutputId\[article\.outputId\] = classificationKey/);
});

test("freeze recebe a escolha final explicitamente e liga-a à proveniência", () => {
  const sql = read(migrationPath);
  const freeze = functionBody(sql, "newsroom_freeze_output_classification_v1");
  const normalPublisher = functionBody(sql, "newsroom_publish_mesa_output_v3");
  const intentPublisher = functionBody(sql, "newsroom_publish_mesa_intent_output_v2");

  assert.match(normalPublisher, /p_classification_key text/);
  assert.match(intentPublisher, /p_classification_key text/);
  assert.match(normalPublisher, /set_config\([\s\S]*jornada\.output_classification_key/);
  assert.match(intentPublisher, /set_config\([\s\S]*jornada\.output_classification_key/);
  assert.match(freeze, /current_setting\([\s\S]*jornada\.output_classification_key/);
  assert.match(freeze, /publicationFingerprint', new\.fingerprint/);
  assert.match(freeze, /new\.classification_key := v_classification_key/);
  assert.match(freeze, /set classification_key = v_classification_key/);
  assert.doesNotMatch(freeze, /articlePlan' ->> 'classificationKey'[\s\S]*is distinct/);
});

test("Bank recebe exatamente a key final como manual sem tocar em editorial_articles", () => {
  const sql = read(migrationPath);
  const apply = functionBody(sql, "newsroom_apply_output_classification_to_bank_v1");

  assert.match(sql, /create trigger newsroom_output_classification_to_bank_v1\s+after insert/i);
  assert.match(apply, /set classification_key = new\.classification_key/i);
  assert.match(apply, /classification_source = 'manual'/i);
  assert.match(apply, /automatic_eligible = false/i);
  assert.doesNotMatch(sql, /alter table public\.editorial_articles/i);
  assert.doesNotMatch(sql, /update public\.editorial_articles[\s\S]*classification_key/i);
});

test("retry preserva a classificação congelada e rejeita outra escolha", () => {
  const sql = read(migrationPath);
  const client = read(
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
  );
  const immutableGuard = functionBody(sql, "newsroom_guard_frozen_output_classification_v1");
  assert.match(client, /publicationStatus === "published"/);
  assert.match(client, /publicationStatus === "published_missing_latest"/);
  assert.match(client, /if \(lockedClassificationKeys\.has\(articleKey\)\) return/);
  assert.match(immutableGuard, /new\.classification_key is distinct from old\.classification_key/);
  assert.match(immutableGuard, /new\.classification_fingerprint is distinct from old\.classification_fingerprint/);
  assert.match(immutableGuard, /mesa-publication-classification-already-frozen/);
  for (const functionName of [
    "newsroom_publish_mesa_output_v3",
    "newsroom_publish_mesa_intent_output_v2",
  ]) {
    const publisher = functionBody(sql, functionName);
    assert.match(publisher, /select publication\.classification_key/);
    assert.match(publisher, /v_frozen_classification_key is distinct from p_classification_key/);
    assert.match(publisher, /mesa-publication-provenance-conflict/);
  }
});

test("UPDATE mantém o id canónico e aplica a classificação escolhida nesse output", () => {
  const service = read("lib/redacao-automatica/editorial-dossier-article-plan-service.ts");
  const intentService = read(
    "lib/redacao-automatica/newsroom-mesa-production-intents-service-internal.ts",
  );
  const route = read("app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts");

  assert.match(service, /rpc\/newsroom_publish_mesa_output_v3/);
  assert.match(service, /p_classification_key: input\.article\.classificationKey/);
  assert.match(intentService, /newsroom_publish_mesa_intent_output_v2/);
  assert.match(intentService, /p_classification_key:a\.classificationKey/);
  assert.match(route, /mode: updateTarget \? "update" : "create"/);
  assert.match(route, /classificationKey: selectedClassification/);
});

test("package pode levar sugestões parciais mas não exige decisão prévia", () => {
  const transfer = read("lib/redacao-automatica/editorial-batch-transfer.ts");
  const route = read("app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts");

  assert.match(transfer, /classificationsByOutputId\?: Readonly<Record<string, ArticleClassificationKey>>/);
  assert.match(transfer, /Object\.keys\(classificationsByOutputId\)\.some/);
  assert.doesNotMatch(transfer, /Object\.keys\(classificationsByOutputId\)\.length !== batchContract\.outputIds\.length/);
  assert.match(route, /output\.articlePlan\?\.classificationKey/);
});

test("Histórica continua independente da classificação final", () => {
  const client = read(
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
  );
  const migration = read(migrationPath);

  assert.match(client, /setHistoricalChoice/);
  assert.match(client, /setFinalClassificationChoice/);
  assert.match(client, /historicalChoices=\{historicalChoices\}/);
  assert.match(client, /classificationChoices=\{classificationChoices\}/);
  assert.doesNotMatch(migration, /matchday_historical_article_decisions/i);
});

test("fontes permanecem N:N e a classificação não restringe source usage", () => {
  const sql = read(migrationPath);
  const source = functionBody(sql, "newsroom_mesa_intent_source_v1");
  const preview = functionBody(sql, "newsroom_mesa_preview_intents_v1");

  assert.match(source, /newsroom_editorial_article_classifications/i);
  assert.doesNotMatch(preview, /classification_required/i);
  assert.match(preview, /jsonb_array_elements\(\s*v_request -> 'selection' -> 'sourceIds'\s*\)/i);
  assert.doesNotMatch(sql, /delete from public\.newsroom_mesa_output_source_usage/i);
});

test("cor da Manchete continua a derivar da classificação do Bank", () => {
  const reducer = read("lib/editorial-matchday-live-layout-desk-state.ts");
  assert.match(reducer, /previousHeadlineClassificationKey !== nextHeadlineClassificationKey/);
  assert.match(reducer, /headlineTitleColorForClassification\(\s*nextHeadlineClassificationKey/);
  assert.match(reducer, /history: \[\.\.\.state\.history, state\.current\]/);
});
