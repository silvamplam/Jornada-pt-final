import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sqlIndexOf, assertSqlMatch, assertSqlDoesNotMatch } from "./migration-test-helpers";

const bridgeMigrationPath =
  "supabase/migrations/20260901205409_matchday_live_layout_cutover_bridge.sql";
const activationMigrationPath =
  "supabase/migrations/20260901210438_matchday_live_layout_authoritative_activation.sql";
const historicalRepublishMigrationPath =
  "supabase/migrations/20260902091016_matchday_historical_republish_independence.sql";
const bridgeMigration = readFileSync(bridgeMigrationPath, "utf8");
const activationMigration = readFileSync(activationMigrationPath, "utf8");

function source(path: string) {
  return readFileSync(path, "utf8");
}

function section(sql: string, startNeedle: string, endNeedle: string): string {
  const start = sqlIndexOf(sql, startNeedle);
  assert.ok(start >= 0, `secao inicial nao encontrada: ${startNeedle}`);
  const end = sqlIndexOf(sql, endNeedle, start + 1);
  assert.ok(end > start, `secao final nao encontrada: ${endNeedle}`);
  return sql.slice(start, end);
}

const flush = section(
  activationMigration,
  "create or replace function\n  jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()",
  "revoke all on function\n  jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()",
);
const movement = section(
  bridgeMigration,
  "create function public.apply_matchday_live_layout_movement(",
  "revoke all on function public.apply_matchday_live_layout_movement(",
);
const adapter = section(
  activationMigration,
  "create function jornada_private.reconcile_matchday_live_layout_from_legacy_adapter(",
  "revoke all on function\n  jornada_private.reconcile_matchday_live_layout_from_legacy_adapter(uuid)",
);
const publisher = section(
  activationMigration,
  "create or replace function\n  public.publish_matchday_reference_composition_with_continuity(",
  "revoke all on function\n  public.publish_matchday_reference_composition_with_continuity(uuid, uuid)",
);

test("Bridge e Activation sao migrations transacionais ordenadas", () => {
  assertSqlMatch(bridgeMigration, /^begin;/);
  assertSqlMatch(bridgeMigration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
  assertSqlMatch(activationMigration, /^begin;/);
  assertSqlMatch(activationMigration, /lock table[\s\S]*in share row exclusive mode;/);
  assertSqlMatch(activationMigration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
});

test("Bridge conserva autoridade legacy e expoe apenas compatibility", () => {
  assertSqlMatch(bridgeMigration, /authority_mode[\s\S]*'bridge'/);
  assertSqlMatch(bridgeMigration, /pg_advisory_xact_lock_shared\(6026, 2\)/);
  assertSqlMatch(
    bridgeMigration,
    /acquire_matchday_live_layout_cutover_core_lock[\s\S]*in row exclusive mode/,
  );
  assertSqlMatch(bridgeMigration, /apply_matchday_editorial_profile_workspace_v9_pre_bridge/);
  assertSqlMatch(bridgeMigration, /apply_matchday_editorial_desk_state_v2_pre_bridge/);
  assertSqlMatch(bridgeMigration, /publish_matchday_reference_composition_pre_bridge/);
  assertSqlMatch(bridgeMigration, /create function public\.apply_matchday_live_layout_movement/);
  assertSqlMatch(bridgeMigration, /create function public\.apply_matchday_live_layout_legacy_slot/);
  assertSqlMatch(bridgeMigration, /create function public\.refresh_matchday_live_layout_legacy/);
  assertSqlDoesNotMatch(bridgeMigration, /flush_matchday_live_layout_placement_shadow_sync_queue/);
  assertSqlDoesNotMatch(bridgeMigration, /matchday_live_layout_placements_matchday_bank_key/);
  assertSqlDoesNotMatch(bridgeMigration, /cutover_historical_matchdays|published_immutable/);
});

test("Activation drena writers antes dos table locks e muda o modo no commit", () => {
  const sourceLocks = activationMigration.indexOf("lock table");
  const exclusiveLock = activationMigration.indexOf("pg_advisory_xact_lock(6026, 2)");
  const remainingLocks = activationMigration.indexOf("lock table", sourceLocks + 1);
  const modeChange = sqlIndexOf(activationMigration, "authority_mode = 'authoritative'");
  assert.ok(
    sourceLocks >= 0
      && exclusiveLock > sourceLocks
      && remainingLocks > exclusiveLock
      && modeChange > remainingLocks,
  );
  assertSqlMatch(activationMigration, /activation-bridge-not-ready/);
  assertSqlMatch(activationMigration, /activation-not-authoritative/);
  assertSqlDoesNotMatch(
    activationMigration,
    /create function public\.apply_matchday_live_layout_movement/,
  );
});

test("reverse Lote 4 deixa de escrever placements e passa a drift guard", () => {
  assertSqlDoesNotMatch(flush, /sync_matchday_live_layout_placement_shadow\s*\(/);
  assertSqlMatch(flush, /derive_matchday_live_layout_placement_shadow/);
  assertSqlMatch(flush, /matchday-live-layout-legacy-write-rejected/);
  assertSqlMatch(flush, /project_matchday_live_layout_placements_to_legacy/);
  assertSqlMatch(activationMigration, /legacy_changed boolean[\s\S]*bank_changed boolean/);
});

test("cleanup historico fecha live sem escolher winners e limpa memoria", () => {
  assertSqlMatch(activationMigration, /create temporary table cutover_historical_matchdays/);
  assertSqlMatch(activationMigration, /status = 'published'[\s\S]*is_current = true[\s\S]*is_managed, false\) = false/);
  assertSqlMatch(activationMigration, /6f826bbe-88ef-42e2-8e4d-350e97752ade/);
  assertSqlMatch(activationMigration, /delete from public\.matchday_live_layout_placements[\s\S]*using cutover_historical_matchdays/);
  assertSqlMatch(activationMigration, /delete from public\.matchday_live_layout_bank_item_state_memory[\s\S]*using cutover_historical_matchdays/);
  assertSqlDoesNotMatch(activationMigration, /J03[\s\S]{0,200}(?:winner|order by.*limit)/i);
});

test("decisao Zekri e especifica e nao limita a Faixa", () => {
  assertSqlMatch(activationMigration, /6bdb34a8-fc26-44fa-8342-5ae71d7adb0a/);
  assertSqlMatch(activationMigration, /placement_type = 'faixa'[\s\S]*slot_position = 87[\s\S]*placement_type = 'video_highlight'[\s\S]*slot_position = 1/);
  assertSqlDoesNotMatch(activationMigration, /slot_position\s*(?:>|>=)\s*10|faixa[^;]*limit\s+10/i);
});

test("UNIQUE transversal so nasce depois da verificacao e e deferred", () => {
  const checkIndex = activationMigration.indexOf("matchday-live-layout-cutover-unexpected-transversal-duplicate");
  const uniqueIndex = activationMigration.indexOf("matchday_live_layout_placements_matchday_bank_key");
  assert.ok(checkIndex >= 0 && uniqueIndex > checkIndex);
  assertSqlMatch(
    activationMigration,
    /unique \(matchday_id, bank_item_id\)\s*\n\s*deferrable initially deferred/,
  );
});

test("movement fino valida Jornada viva concorrencia e delega no core", () => {
  assertSqlMatch(movement, /from public\.matchdays[\s\S]*for update/);
  assertSqlMatch(movement, /desk_row\.is_managed = true/);
  assertSqlMatch(movement, /p_expect_target_empty and found/);
  assertSqlMatch(movement, /p_expected_target_bank_item_id[\s\S]*is distinct from/);
  assertSqlMatch(movement, /apply_matchday_live_layout_placement_plan\([\s\S]*true/);
  assertSqlDoesNotMatch(movement, /swap|shift|compact|autofill|reorder/i);
});

test("adaptador legacy calcula estado final sem winner e chama o core uma vez", () => {
  assertSqlMatch(adapter, /derive_matchday_live_layout_placement_shadow/);
  assertSqlMatch(adapter, /bank_candidate_count <> 1/);
  assertSqlMatch(adapter, /slot_source_count <> 1/);
  assertSqlMatch(adapter, /having pg_catalog\.count\(\*\) > 1/);
  assertSqlMatch(adapter, /jsonb_agg\([\s\S]*order by/);
  assert.equal(
    (adapter.match(/apply_matchday_live_layout_placement_plan\s*\(/g) ?? []).length,
    1,
  );
  assertSqlDoesNotMatch(adapter, /\blimit\s+1\b|distinct on|row_number\s*\(/i);
});

test("v9 e Desk mantem envelopes mas entregam ocupacao ao core", () => {
  assertSqlMatch(activationMigration, /apply_matchday_editorial_profile_workspace_v9_pre_cutover/);
  assertSqlMatch(activationMigration, /create function public\.apply_matchday_editorial_profile_workspace_v9\(/);
  assertSqlMatch(activationMigration, /apply_matchday_editorial_desk_state_v2_pre_cutover/);
  assertSqlMatch(activationMigration, /create function public\.apply_matchday_editorial_desk_state_v2\(/);
  assert.ok(
    (activationMigration.match(/reconcile_matchday_live_layout_from_legacy_adapter\s*\(/g) ?? []).length >= 3,
  );
});

test("v10 e token cache nao sao redefinidos", () => {
  assertSqlDoesNotMatch(
    `${bridgeMigration}\n${activationMigration}`,
    /create (?:or replace )?function\s+public\.apply_matchday_editorial_profile_workspace_v10/i,
  );
  assertSqlDoesNotMatch(`${bridgeMigration}\n${activationMigration}`, /create[^;]*(?:workspace_token_cache|reconcile_token_cache)/i);
  assertSqlMatch(activationMigration, /revoke execute on function public\.apply_matchday_editorial_profile_workspace_v[2-8]/);
});

test("publicacao materializa antes da troca atomica da Jornada viva", () => {
  const publish = publisher.indexOf("activate_matchday_reference_composition");
  const materialize = publisher.indexOf("materialize_matchday_live_layout_continuity");
  const sourceOff = sqlIndexOf(publisher, "set is_managed = false");
  const targetOn = sqlIndexOf(publisher, "set is_managed = true");
  assert.ok(publish >= 0 && materialize > publish && sourceOff > materialize && targetOn > sourceOff);
  assertSqlMatch(publisher, /target_row\.number = v_source_number \+ 1/);
  assertSqlMatch(publisher, /order by lock_row\.id[\s\S]*for update/);
  assertSqlDoesNotMatch(publisher, /initialize_matchday_editorial_thematic_continuity_v3/);
});

test("recovery explicito materializa carryover existente sem usar J03", () => {
  const recovery = section(
    activationMigration,
    "create function public.recover_matchday_live_layout_continuity(",
    "revoke all on function public.recover_matchday_live_layout_continuity(",
  );
  assertSqlMatch(recovery, /carryover_source_composition_id[\s\S]*p_source_composition_id/);
  assertSqlMatch(recovery, /materialize_matchday_live_layout_continuity/);
  assertSqlMatch(recovery, /set carryover_source_composition_id = null/);
  assertSqlDoesNotMatch(recovery, /6f826bbe-88ef-42e2-8e4d-350e97752ade/);
});

test("Activation conserva byte-identico o erro de imutabilidade que a correcao posterior remove", () => {
  const correction = source(historicalRepublishMigrationPath);
  assertSqlMatch(activationMigration, /guard_published_reference_composition\(\)/);
  assertSqlMatch(activationMigration, /old\.status = 'published'/);
  for (const table of [
    "matchday_reference_composition_items",
    "matchday_hierarchical_composition_slots",
    "matchday_historical_composition_zones",
    "matchday_historical_composition_zone_items",
  ]) {
    assertSqlMatch(activationMigration, new RegExp(`on public\\.${table}`));
  }
  assertSqlMatch(correction, /drop function if exists\s+jornada_private\.guard_published_reference_composition\(\)/);
  assertSqlMatch(correction, /drop function if exists\s+jornada_private\.guard_published_reference_composition_child\(\)/);
});

test("RPCs publicas de cutover sao exclusivas do service_role", () => {
  for (const functionName of [
    "apply_matchday_live_layout_movement",
    "apply_matchday_live_layout_legacy_slot",
    "refresh_matchday_live_layout_legacy",
    "recover_matchday_live_layout_continuity",
  ]) {
    assertSqlMatch(
      `${bridgeMigration}\n${activationMigration}`,
      new RegExp(`grant execute on function public\\.${functionName}`),
    );
  }
  assertSqlDoesNotMatch(
    `${bridgeMigration}\n${activationMigration}`,
    /grant execute[^;]*to\s+(?:anon|authenticated|public)/i,
  );
});

test("transferencia de artigo chega ao movement RPC uma unica vez", () => {
  const flow = source("lib/editorial-matchday-news-flow.ts");
  const transfer = flow.slice(flow.indexOf("export async function transferPublishedArticleBetweenMatchdayZones"));
  assertSqlMatch(transfer, /applyMatchdaySinglePlacement\(\{/);
  assertSqlDoesNotMatch(transfer, /normalizeHorizontalNewsOrder|movePublishedArticleToFaixa/);
  assertSqlMatch(flow, /resolvePlacementTarget\(/);
});

test("Desk resolve placement pelo adapter atomico e nao compacta Faixa", () => {
  const resolution = source("lib/editorial-matchday-desk-resolution.ts");
  assertSqlMatch(resolution, /applyMatchdayPlacementByLink/);
  assertSqlMatch(resolution, /live_four_news[\s\S]*placementType: "selection"/);
  assertSqlDoesNotMatch(resolution, /normalizeHorizontalNewsOrder/);
});

test("Gestor delega slots unitarios e recusa bulk/reorder legacy", () => {
  const gestor = source("app/api/admin/gestor/route.ts");
  const page = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
  assertSqlMatch(gestor, /applyMatchdayPlacementByLink/);
  assertSqlMatch(gestor, /authoritative-placements-do-not-reorder/);
  assertSqlMatch(gestor, /authoritative-placements-use-(?:slot-writers|individual-slots)/);
  assertSqlDoesNotMatch(page, /value="move_matchday_horizontal_news_item"/);
  assertSqlDoesNotMatch(page, /entra automaticamente em primeiro na Faixa/);
  assertSqlMatch(page, /fica Desalojada quando perder o seu último placement/);
});

test("landing usa is_managed sem depender de carryover", () => {
  const landing = source("app/competicoes/[competitionSlug]/[seasonLabel]/page.tsx");
  assertSqlMatch(landing, /is_managed=is\.true/);
  assertSqlDoesNotMatch(landing, /carryover_source_composition_id=not\.is\.null/);
});

test("reopen historico volta por RPC independente e Latest four so faz forward refresh", () => {
  const route = source("app/api/admin/editorial/composicao/route.ts");
  const page = source("app/admin/editorial/composicao/[matchdayId]/page.tsx");
  const projection = source("lib/editorial-matchday-latest-four-projection.ts");
  assertSqlMatch(route, /rpc\/reopen_matchday_reference_composition/);
  assertSqlMatch(page, /reopen_reference_composition/);
  assertSqlMatch(page, /Reabrir para edi/);
  assertSqlMatch(projection, /rpc\/refresh_matchday_live_layout_legacy/);
});

test("working tree fica limitado ao cutover e artefactos protegidos", () => {
  const allowed = new Set([
    "({alt",
    "baseline-testes-20260829.txt",
    "jornada-codex-parcial.zip",
    "jornada-lote-7b-codex-parcial-20260902.zip",
    "supabase/.temp/",
    bridgeMigrationPath,
    activationMigrationPath,
    historicalRepublishMigrationPath,
    "lib/matchday-live-layout-authoritative-cutover.test.ts",
    "lib/matchday-live-layout-displaced-state-shadow.test.ts",
    "lib/matchday-historical-republish-independence.test.ts",
    "lib/matchday-live-desk-historical-bank-delta.test.ts",
    "lib/editorial-matchday-context-selector-ui.test.ts",
    "lib/editorial-historical-composition.test.ts",
    "supabase/sql/test-matchday-historical-republish-independence-pg17.sql",
    "supabase/sql/test-matchday-live-desk-historical-bank-delta-pg17.sql",
    "supabase/sql/test-matchday-live-layout-physical-handoff-pg17.sql",
    "supabase/migrations/20260908151027_historical_republish_v19_certificate_archive_integrity.sql",
    "lib/matchday-historical-republish-v19-certificate.test.ts",
    "lib/matchday-live-layout-physical-handoff.test.ts",
    "app/admin/editorial/artigos/_articleForm.tsx",
    "app/admin/editorial/composicao/[matchdayId]/page.tsx",
    "app/admin/editorial/jornada/[matchdayId]/page.tsx",
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialContextSelector.tsx",
    "app/admin/editorial/jornada/[matchdayId]/organizar/page.tsx",
    "app/api/admin/editorial/composicao/route.ts",
    "app/api/admin/editorial/artigos/route.ts",
    "app/api/admin/editorial/conteudos/route.ts",
    "app/api/admin/gestor/editorial-image/route.ts",
    "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
    "app/api/admin/gestor/route.ts",
    "app/competicoes/[competitionSlug]/[seasonLabel]/page.tsx",
    "lib/editorial-matchday-desk-resolution.ts",
    "lib/editorial-matchday-desk-resolution.test.ts",
    "lib/editorial-matchday-latest-four-projection.ts",
    "lib/editorial-matchday-latest-four-projection.test.ts",
    "lib/editorial-matchday-news-flow.ts",
    "lib/editorial-matchday-news-flow.test.ts",
    "lib/editorial-matchday-news-flow-runtime.test.ts",
    "lib/editorial-matchday-news-flow-ui.test.ts",
    "lib/editorial-article-canonical-delete.test.ts",
    "lib/editorial-article-live-snapshot-sync.ts",
    "lib/editorial-article-live-snapshot-sync.test.ts",
    "lib/editorial-article-live-snapshot-postgrest.test.ts",
    "lib/editorial-content-snapshot-sync.ts",
    "lib/editorial-matchday-latest-four-projection.test.ts",
    "lib/editorial-matchday-physical-placement.ts",
    "lib/matchday-live-layout-physical-apply-facade.test.ts",
    "lib/matchday-live-layout-physical-apply-video-guard.test.ts",
    "lib/matchday-live-layout-physical-writer-v13-shadow.test.ts",
    "lib/matchday-publication-physical-placement-boundary.test.ts",
    "lib/public-matchday-latest-zone-placement.test.ts",
    "supabase/migrations/20260905110018_matchday_publication_physical_placement_boundary_v15.sql",
    "supabase/sql/test-matchday-publication-physical-placement-boundary-pg17.sql",
  ]);
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=normal"],
    { encoding: "utf8" },
  );
  const unexpected = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"))
    .filter((path) => !allowed.has(path));
  assert.deepEqual(unexpected, []);
});
