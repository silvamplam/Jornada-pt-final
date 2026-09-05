import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260905110018_matchday_publication_physical_placement_boundary_v15.sql";
const migration = readFileSync(migrationPath, "utf8");
const newsFlow = readFileSync("lib/editorial-matchday-news-flow.ts", "utf8");
const snapshotSync = readFileSync(
  "lib/editorial-article-live-snapshot-sync.ts",
  "utf8",
);
const contentSnapshotSync = readFileSync(
  "lib/editorial-content-snapshot-sync.ts",
  "utf8",
);
const physicalCommand = readFileSync(
  "lib/editorial-matchday-physical-placement.ts",
  "utf8",
);
const batchRoute = readFileSync(
  "app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts",
  "utf8",
);
const articleRoute = readFileSync(
  "app/api/admin/editorial/artigos/route.ts",
  "utf8",
);
const gestorRoute = readFileSync("app/api/admin/gestor/route.ts", "utf8");
const gestorImageRoute = readFileSync(
  "app/api/admin/gestor/editorial-image/route.ts",
  "utf8",
);
const deskResolution = readFileSync(
  "lib/editorial-matchday-desk-resolution.ts",
  "utf8",
);
const guardMigration = readFileSync(
  "supabase/migrations/20260904140000_matchday_live_layout_physical_apply_facade.sql",
  "utf8",
);
const fixture = readFileSync(
  "supabase/sql/test-matchday-publication-physical-placement-boundary-pg17.sql",
  "utf8",
);

function sqlSection(start: string, end: string) {
  const startAt = migration.indexOf(start);
  assert.ok(startAt >= 0, `missing SQL section: ${start}`);
  const endAt = migration.indexOf(end, startAt + start.length);
  assert.ok(endAt > startAt, `missing SQL section end: ${end}`);
  return migration.slice(startAt, endAt);
}

const latestSettings = sqlSection(
  "create function public.set_matchday_latest_news_settings_v15(",
  "revoke all on function public.set_matchday_latest_news_settings_v15(",
);
const singlePlacement = sqlSection(
  "create function public.apply_matchday_live_layout_single_placement_v15(",
  "revoke all on function public.apply_matchday_live_layout_single_placement_v15(",
);
const atomicSnapshot = sqlSection(
  "create function public.sync_editorial_article_live_snapshots_v15(",
  "revoke all on function public.sync_editorial_article_live_snapshots_v15(",
);

test("a migration e forward-only, transacional e service-role-only", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
  for (const functionName of [
    "set_matchday_latest_news_settings_v15",
    "set_matchday_latest_zone_placement_v15",
    "set_matchday_roundup_presentation_v15",
    "set_matchday_below_headline_presentation_v15",
    "matchday_live_layout_single_placement_authority_v15",
    "apply_matchday_live_layout_single_placement_v15",
    "sync_editorial_article_live_snapshots_v15",
    "sync_editorial_content_live_snapshots_v15",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function\\s+public\\.${functionName}`));
    assert.match(migration, new RegExp(`grant execute on function\\s+public\\.${functionName}`));
  }
  assert.doesNotMatch(
    migration,
    /grant execute[^;]*to\s+(?:public|anon|authenticated)/i,
  );
});

test("Ultimas deixa de fazer DML externo em matchday_editorials", () => {
  const setMode = newsFlow.slice(
    newsFlow.indexOf("async function setLatestNewsMode"),
    newsFlow.indexOf("async function readLatestNewsRows"),
  );
  assert.match(setMode, /rpc\/set_matchday_latest_news_settings_v15/);
  assert.doesNotMatch(setMode, /matchday_editorials\?|on_conflict=matchday_id/);
  assert.match(latestSettings, /matchday_live_layout_physical_cutovers/);
  assert.match(latestSettings, /matchday_live_layout_workspace_settings/);
  assert.match(latestSettings, /begin_matchday_live_layout_downstream_v14/);
  assert.match(latestSettings, /insert into public\.matchday_editorials/);
});

test("finalize preserva a ordem: settings autorizado e depois normalize", () => {
  const finalize = newsFlow.slice(
    newsFlow.indexOf("export async function finalizePublishedArticlesInLatestBatch"),
    newsFlow.indexOf("export async function placePublishedArticleInitially"),
  );
  assert.ok(finalize.indexOf("setLatestNewsMode") >= 0);
  assert.ok(finalize.indexOf("normalizeLatestNewsOrder") > finalize.indexOf("setLatestNewsMode"));
  assert.match(batchRoute, /initialPlacement:\s*"none"/);
  assert.match(batchRoute, /finalizePublishedArticlesInLatestBatch/);
});

test("o facade single exige marker, OCC e destino fisico explicito", () => {
  assert.match(singlePlacement, /matchday_live_layout_physical_cutovers/);
  assert.match(singlePlacement, /physical-cutover-required/);
  assert.match(singlePlacement, /matchday_editorial_profile_workspace_token_v13/);
  assert.match(singlePlacement, /single-v15-stale/);
  assert.match(singlePlacement, /p_placement_type = 'zone'/);
  assert.match(singlePlacement, /matchday_live_layout_zones/);
  assert.match(singlePlacement, /faixa_slot_count/);
  assert.match(singlePlacement, /video_module_active/);
});

test("no-op sai antes de DML e movement usa o kernel uma unica vez", () => {
  const noOpAt = singlePlacement.indexOf("if v_is_no_op then");
  const downstreamAt = singlePlacement.indexOf(
    "begin_matchday_live_layout_downstream_v14",
  );
  assert.ok(noOpAt >= 0 && downstreamAt > noOpAt);
  assert.equal(
    (singlePlacement.match(/apply_matchday_live_layout_placement_plan\(/g) ?? []).length,
    1,
  );
  assert.match(singlePlacement, /return query select\s+v_current_state_token,\s+true/);
  assert.match(singlePlacement, /v_current_placement\.id/);
});

test("Banco, Desalojada, NOVA e classificacao conservam as invariantes v14", () => {
  assert.match(singlePlacement, /v_action not in \('place', 'displace', 'bank'\)/);
  assert.match(singlePlacement, /placement_target,\s+zone_key,\s+sort_order/);
  assert.match(singlePlacement, /memory_kind,\s+recorded_at/);
  assert.match(singlePlacement, /editorially_worked_at = pg_catalog\.statement_timestamp\(\)/);
  for (const field of [
    "classification_key",
    "classification_source",
    "classified_at",
  ]) {
    assert.match(singlePlacement, new RegExp(field));
  }
  assert.match(singlePlacement, /single-v15-classification-changed/);
});

test("legacy e projetado apenas downstream na mesma transacao", () => {
  assert.match(singlePlacement, /begin_matchday_live_layout_downstream_v14/);
  assert.match(singlePlacement, /project_matchday_live_layout_placements_downstream_v14/);
  assert.match(singlePlacement, /assert_matchday_live_layout_downstream_v14/);
  assert.match(singlePlacement, /end_matchday_live_layout_downstream_v14/);
  assert.match(guardMigration, /matchday-live-layout-legacy-placement-after-physical-cutover/);
  assert.doesNotMatch(migration, /create or replace function\s+jornada_private\.assert_matchday_live_layout_projection_write_v14/i);
});

test("snapshot runtime e um unico RPC e nao altera occupancy fisica", () => {
  const runtime = snapshotSync.slice(
    snapshotSync.indexOf("export async function syncEditorialArticleLiveSnapshots"),
  );
  assert.match(runtime, /rpc\/sync_editorial_article_live_snapshots_v15/);
  assert.equal((runtime.match(/writeSupabaseAdminReturning/g) ?? []).length, 1);
  assert.doesNotMatch(runtime, /Promise\.all/);
  assert.match(atomicSnapshot, /begin_matchday_live_layout_downstream_v14/);
  assert.match(atomicSnapshot, /refresh_matchday_live_layout_legacy/);
  assert.match(atomicSnapshot, /update public\.matchday_editorial_bank_items/);
  assert.match(atomicSnapshot, /source_id[\s\S]*p_article_id::text/);
  assert.doesNotMatch(atomicSnapshot, /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.matchday_live_layout_placements/i);
  assert.doesNotMatch(atomicSnapshot, /classification_(?:key|source)|classified_at/);
  assert.match(contentSnapshotSync, /rpc\/sync_editorial_content_live_snapshots_v15/);
  assert.doesNotMatch(contentSnapshotSync, /Promise\.all|matchday_editorials\?/);
});

test("news flow, Gestor e Desk convergem no mesmo command facade", () => {
  assert.match(newsFlow, /applyMatchdaySinglePlacement/);
  assert.match(gestorRoute, /applyMatchdayPlacementByLink/);
  assert.match(deskResolution, /applyMatchdayPlacementByLink/);
  assert.match(physicalCommand, /authority\.is_physical/);
  assert.match(physicalCommand, /rpc\/apply_matchday_live_layout_single_placement_v15/);
  assert.match(physicalCommand, /rpc\/apply_matchday_live_layout_legacy_slot/);
  assert.match(physicalCommand, /p_expected_physical_state_token/);
  assert.match(articleRoute, /physicalPlacementTargetForLinkRemoval/);
  assert.match(articleRoute, /applyMatchdayPlacementByLink/);
});

test("configuracao do Gestor nao usa matchday_editorials como writer externo", () => {
  const roundup = gestorRoute.slice(
    gestorRoute.indexOf("async function saveMatchdayRoundupSettings"),
    gestorRoute.indexOf("async function saveMatchdayBelowHeadline"),
  );
  const belowHeadline = gestorRoute.slice(
    gestorRoute.indexOf("async function saveMatchdayBelowHeadline"),
    gestorRoute.indexOf("async function saveMatchdayHighlights"),
  );
  assert.match(roundup, /rpc\/set_matchday_roundup_presentation_v15/);
  assert.doesNotMatch(roundup, /matchday_editorials\?/);
  assert.match(belowHeadline, /rpc\/set_matchday_below_headline_presentation_v15/);
  assert.doesNotMatch(belowHeadline, /matchday_editorials\?/);
  assert.match(migration, /set video_module_active = \(p_complementary_mode = 'roundup_video'\)/);
  assert.match(migration, /begin_matchday_live_layout_downstream_v14/);
});

test("upload legacy de imagem falha antes do storage numa Jornada fisica", () => {
  const authorityAt = gestorImageRoute.indexOf(
    "isMatchdayPhysicalPlacementAuthority(matchdayId)",
  );
  const uploadAt = gestorImageRoute.indexOf("await uploadToStorage");
  assert.ok(authorityAt >= 0 && uploadAt > authorityAt);
  assert.match(
    gestorImageRoute,
    /editorial-image-canonical-required-after-physical-cutover/,
  );
});

test("publicar em Ultimas nao cria placement fisico", () => {
  const ensureLatest = newsFlow.slice(
    newsFlow.indexOf("export async function ensurePublishedArticleInLatest"),
    newsFlow.indexOf("export async function finalizePublishedArticlesInLatestBatch"),
  );
  assert.match(ensureLatest, /matchday_latest_news/);
  assert.doesNotMatch(
    ensureLatest,
    /applyMatchdaySinglePlacement|apply_matchday_live_layout_single_placement_v15/,
  );
});

test("normalizadores legacy da Faixa falham fechados depois do cutover", () => {
  const normalizeHorizontal = newsFlow.slice(
    newsFlow.indexOf("export async function normalizeMatchdayHorizontalNewsOrder"),
    newsFlow.indexOf("async function prioritizeMatchdayHorizontalNewsItem"),
  );
  const moveHorizontal = newsFlow.slice(
    newsFlow.indexOf("export async function moveMatchdayHorizontalNewsItem"),
    newsFlow.indexOf("async function readLatestNewsRows"),
  );

  for (const legacyWriter of [normalizeHorizontal, moveHorizontal]) {
    assert.match(legacyWriter, /isMatchdayPhysicalPlacementAuthority/);
    assert.match(
      legacyWriter,
      /news-flow-legacy-reorder-after-physical-cutover/,
    );
  }
});

test("a fixture PG17 cobre rollback, stale, no-op, estados e pre-cutover", () => {
  assert.match(fixture, /\\set ON_ERROR_STOP on/);
  for (const evidence of [
    "physical Latest without prior compatibility row",
    "single physical placement and classification invariant",
    "real no-op preserves id clocks and token",
    "target replacement displaces and stale rolls back",
    "explicit Bank remains distinct from displaced",
    "Desalojada and NOVA monotonic state",
    "v14 legacy writer sentinel remains active",
    "placed snapshot refresh preserves physical identity",
    "unplaced Bank snapshot refresh does not create movement",
    "canonical content snapshots stay downstream of physical",
    "Gestor presentation settings use explicit physical boundary",
    "pre-cutover presentation settings remain functional",
    "pre-cutover Latest remains functional",
  ]) {
    assert.match(fixture, new RegExp(evidence));
  }
  assert.match(fixture, /rollback;\s*$/i);
});
