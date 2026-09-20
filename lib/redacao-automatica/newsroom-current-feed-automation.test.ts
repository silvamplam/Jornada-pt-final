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

test("cron da Redação usa endpoint técnico autenticado sem expor o Vault", () => {
  const route = readFileSync(routePath, "utf8");
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(route, /x-sync-secret/);
  assert.match(route, /rpc\/newsroom_verify_automatic_feed_secret_v1/);
  assert.match(route, /refreshNewsroomCurrentFeed\(null, "automatic"\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 503/);
  assert.doesNotMatch(route, /vault\.|decrypted_secret|process\.env\.[A-Z_]*SECRET/);

  assert.match(migration, /jornada_newsroom_current_feed_secret/);
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /extensions\.gen_random_bytes\(32\)/);
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
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated)/);
});

test("feed automático reutiliza o writer existente e reconsulta links conhecidos", () => {
  const feed = readFileSync(feedPath, "utf8");

  assert.match(
    feed,
    /executionMode: SourceExecutionMode = "manual"/,
  );
  assert.match(feed, /evaluateSourceExecution\(source, executionMode\)\.ok/);
  assert.match(feed, /executionMode,/);
  assert.match(
    feed,
    /ingestHttpNewsroomArticle\([\s\S]*executionMode/,
  );
  assert.doesNotMatch(feed, /setInterval|setTimeout|cron\.schedule/);
});

test("só Record e A Bola ficam autorizados para monitorização automática", () => {
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

  for (const active of [record, abola]) {
    assert.match(active, /operationalStatus: "active"/);
    assert.match(active, /monitoringEnabled: true/);
    assert.match(active, /manualCollectionEnabled: true/);
  }

  assert.match(maisfutebol, /monitoringEnabled: false/);
  assert.match(maisfutebol, /manualCollectionEnabled: false/);
  assert.match(ojogo, /operationalStatus: "legal_hold"/);
  assert.match(ojogo, /monitoringEnabled: false/);
  assert.match(ojogo, /manualCollectionEnabled: false/);
});
