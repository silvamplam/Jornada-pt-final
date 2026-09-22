import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routePath =
  "app/api/cron/redacao-automatica/current-feed/route.ts";
const migrationPath =
  "supabase/migrations/20260920093500_newsroom_current_feed_automation_v1.sql";
const feedPath =
  "lib/redacao-automatica/newsroom-current-feed.ts";
const registryPath =
  "lib/redacao-automatica/source-registry.ts";
const ingestionPath =
  "lib/redacao-automatica/http-newsroom-ingestion.ts";
const classificationPath =
  "lib/redacao-automatica/newsroom-current-feed-classification.ts";
const deskPagePath =
  "app/admin/editorial/redacao-automatica/page.tsx";
const operationalReadModelPath =
  "lib/redacao-automatica/newsroom-operational-desk-read-model.ts";

test("cron da Redação usa token efémero de uma só utilização", () => {
  const route = readFileSync(routePath, "utf8");
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(route, /payload\?\.token/);
  assert.match(route, /rpc\/newsroom_consume_automatic_feed_token_v1/);
  assert.match(route, /refreshNewsroomCurrentFeed\(null, "automatic"\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 503/);
  assert.doesNotMatch(route, /vault\.|decrypted_secret|process\.env\.[A-Z_]*SECRET/);

  assert.match(migration, /newsroom_automatic_feed_tokens/);
  assert.match(migration, /newsroom_consume_automatic_feed_token_v1/);
  assert.match(migration, /extensions\.gen_random_bytes\(32\)/);
  assert.match(migration, /extensions\.digest/);
  assert.match(migration, /interval '5 minutes'/);
  assert.doesNotMatch(migration, /vault\.|decrypted_secret|create_secret/);
  assert.doesNotMatch(migration, /create extension/i);
  assert.match(migration, /security definer/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(
    migration,
    /jornada-newsroom-current-feed-quarter-hour[\s\S]*'\*\/15 \* \* \* \*'/,
  );
  assert.match(
    migration,
    /https:\/\/jornada\.pt\/api\/cron\/redacao-automatica\/current-feed/,
  );
  assert.match(migration, /net\.http_post/);
  assert.match(migration, /jsonb_build_object\([\s\S]*'token'/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated)/);
});

test("feed automático reutiliza o writer e deixa fontes novas sem classificação", () => {
  const feed = readFileSync(feedPath, "utf8");
  const ingestion = readFileSync(ingestionPath, "utf8");

  assert.match(
    feed,
    /executionMode: SourceExecutionMode = "manual"/,
  );
  assert.match(feed, /evaluateSourceExecution\(source, executionMode\)\.ok/);
  assert.match(feed, /executionMode,/);
  assert.match(
    feed,
    /ingestHttpNewsroomCurrentFeedArticle\([\s\S]*executionMode/,
  );
  assert.match(ingestion, /persistNewsroomCurrentFeedArticle/);
  assert.doesNotMatch(feed, /classifyNewsroomCurrentFeedArticles/);
  assert.doesNotMatch(feed, /applyAutomaticNewsroomArticleClassification/);
  assert.match(feed, /classificationFailedCount/);
  assert.doesNotMatch(feed, /setInterval|setTimeout|cron\.schedule/);
});

test("classificador determinístico permanece disponível, mas fora do feed operacional", () => {
  const feed = readFileSync(feedPath, "utf8");
  const classification = readFileSync(classificationPath, "utf8");

  assert.doesNotMatch(feed, /knownArticleIdentities/);
  assert.doesNotMatch(feed, /fetchSupabaseAdminTable/);
  assert.doesNotMatch(feed, /newsroom_articles\?select=source_code/);
  assert.doesNotMatch(feed, /order=id\.asc[\s\S]*offset=/);
  assert.doesNotMatch(feed, /attemptOperationalDeskAutomaticClassification/);
  assert.doesNotMatch(feed, /newsroom-current-feed-classification/);
  assert.match(classification, /getNewsroomArticleClassificationsByIds\(articleIds\)/);
  assert.match(classification, /prepareNewsroomDeterministicClassifications\(/);
  assert.match(classification, /applyAutomaticNewsroomArticleClassification\(input\)/);
});

test("pertença ao ciclo é particionada numa leitura scoped sem mudar o validator existente", () => {
  const classification = readFileSync(classificationPath, "utf8");
  const readModel = readFileSync(operationalReadModelPath, "utf8");

  assert.match(classification, /partitionOperationalDeskCycleSourceIds\(articleIds\)/);
  assert.doesNotMatch(classification, /validateOperationalDeskCycleSourceIds/);
  assert.match(readModel, /export async function validateOperationalDeskCycleSourceIds\(/);
  assert.match(readModel, /export async function partitionOperationalDeskCycleSourceIds\(/);
  assert.match(
    readModel,
    /partitionOperationalDeskCycleSourceIds[\s\S]*newsroom_articles\?select=id,first_detected_at[\s\S]*&id=in\.\(\$\{idList\(ids\)\}\)/,
  );
});

test("consumidor do feed não soma updated duas vezes no total disponível", () => {
  const page = readFileSync(deskPagePath, "utf8");

  assert.match(page, /const feedClassified = feedAvailable;/);
  assert.doesNotMatch(
    page,
    /const feedClassified = feedCreated \+ feedUpdated \+ feedExisting;/,
  );
});

test("Record e A Bola ficam apenas em recolha manual", () => {
  const registry = readFileSync(registryPath, "utf8");

  const record = registry.slice(
    registry.indexOf('code: "record"'),
    registry.indexOf('code: "abola"'),
  );
  const abola = registry.slice(
    registry.indexOf('code: "abola"'),
    registry.indexOf('code: "maisfutebol"'),
  );
  const maisfutebol = registry.slice(
    registry.indexOf('code: "maisfutebol"'),
    registry.indexOf('code: "ojogo"'),
  );
  const ojogo = registry.slice(registry.indexOf('code: "ojogo"'));

  for (const source of [record, abola]) {
    assert.match(source, /operationalStatus: "active"/);
    assert.match(source, /monitoringEnabled: false/);
    assert.match(source, /manualCollectionEnabled: true/);
    assert.match(source, /atualização apenas manual/);
  }

  assert.match(maisfutebol, /monitoringEnabled: false/);
  assert.match(maisfutebol, /manualCollectionEnabled: false/);
  assert.match(ojogo, /operationalStatus: "legal_hold"/);
  assert.match(ojogo, /monitoringEnabled: false/);
  assert.match(ojogo, /manualCollectionEnabled: false/);
});
