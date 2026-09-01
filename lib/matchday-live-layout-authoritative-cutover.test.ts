import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const bridgeMigrationPath =
  "supabase/migrations/20260901201453_matchday_live_layout_cutover_bridge.sql";
const activationMigrationPath =
  "supabase/migrations/20260901201455_matchday_live_layout_authoritative_activation.sql";
const bridgeMigration = readFileSync(bridgeMigrationPath, "utf8");
const activationMigration = readFileSync(activationMigrationPath, "utf8");

function source(path: string) {
  return readFileSync(path, "utf8");
}

function section(sql: string, startNeedle: string, endNeedle: string): string {
  const start = sql.indexOf(startNeedle);
  assert.ok(start >= 0, `secao inicial nao encontrada: ${startNeedle}`);
  const end = sql.indexOf(endNeedle, start + startNeedle.length);
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
  assert.match(bridgeMigration, /^begin;/);
  assert.match(bridgeMigration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
  assert.match(activationMigration, /^begin;/);
  assert.match(activationMigration, /lock table[\s\S]*in share row exclusive mode;/);
  assert.match(activationMigration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
});

test("Bridge conserva autoridade legacy e expoe apenas compatibility", () => {
  assert.match(bridgeMigration, /authority_mode[\s\S]*'bridge'/);
  assert.match(bridgeMigration, /pg_advisory_xact_lock_shared\(6026, 2\)/);
  assert.match(
    bridgeMigration,
    /acquire_matchday_live_layout_cutover_core_lock[\s\S]*in row exclusive mode/,
  );
  assert.match(bridgeMigration, /apply_matchday_editorial_profile_workspace_v9_pre_bridge/);
  assert.match(bridgeMigration, /apply_matchday_editorial_desk_state_v2_pre_bridge/);
  assert.match(bridgeMigration, /publish_matchday_reference_composition_pre_bridge/);
  assert.match(bridgeMigration, /create function public\.apply_matchday_live_layout_movement/);
  assert.match(bridgeMigration, /create function public\.apply_matchday_live_layout_legacy_slot/);
  assert.match(bridgeMigration, /create function public\.refresh_matchday_live_layout_legacy/);
  assert.doesNotMatch(bridgeMigration, /flush_matchday_live_layout_placement_shadow_sync_queue/);
  assert.doesNotMatch(bridgeMigration, /matchday_live_layout_placements_matchday_bank_key/);
  assert.doesNotMatch(bridgeMigration, /cutover_historical_matchdays|published_immutable/);
});

test("Activation drena writers antes dos table locks e muda o modo no commit", () => {
  const sourceLocks = activationMigration.indexOf("lock table");
  const exclusiveLock = activationMigration.indexOf("pg_advisory_xact_lock(6026, 2)");
  const remainingLocks = activationMigration.indexOf("lock table", sourceLocks + 1);
  const modeChange = activationMigration.indexOf("authority_mode = 'authoritative'");
  assert.ok(
    sourceLocks >= 0
      && exclusiveLock > sourceLocks
      && remainingLocks > exclusiveLock
      && modeChange > remainingLocks,
  );
  assert.match(activationMigration, /activation-bridge-not-ready/);
  assert.match(activationMigration, /activation-not-authoritative/);
  assert.doesNotMatch(
    activationMigration,
    /create function public\.apply_matchday_live_layout_movement/,
  );
});

test("reverse Lote 4 deixa de escrever placements e passa a drift guard", () => {
  assert.doesNotMatch(flush, /sync_matchday_live_layout_placement_shadow\s*\(/);
  assert.match(flush, /derive_matchday_live_layout_placement_shadow/);
  assert.match(flush, /matchday-live-layout-legacy-write-rejected/);
  assert.match(flush, /project_matchday_live_layout_placements_to_legacy/);
  assert.match(activationMigration, /legacy_changed boolean[\s\S]*bank_changed boolean/);
});

test("cleanup historico fecha live sem escolher winners e limpa memoria", () => {
  assert.match(activationMigration, /create temporary table cutover_historical_matchdays/);
  assert.match(activationMigration, /status = 'published'[\s\S]*is_current = true[\s\S]*is_managed, false\) = false/);
  assert.match(activationMigration, /6f826bbe-88ef-42e2-8e4d-350e97752ade/);
  assert.match(activationMigration, /delete from public\.matchday_live_layout_placements[\s\S]*using cutover_historical_matchdays/);
  assert.match(activationMigration, /delete from public\.matchday_live_layout_bank_item_state_memory[\s\S]*using cutover_historical_matchdays/);
  assert.doesNotMatch(activationMigration, /J03[\s\S]{0,200}(?:winner|order by.*limit)/i);
});

test("decisao Zekri e especifica e nao limita a Faixa", () => {
  assert.match(activationMigration, /6bdb34a8-fc26-44fa-8342-5ae71d7adb0a/);
  assert.match(activationMigration, /placement_type = 'faixa'[\s\S]*slot_position = 87[\s\S]*placement_type = 'video_highlight'[\s\S]*slot_position = 1/);
  assert.doesNotMatch(activationMigration, /slot_position\s*(?:>|>=)\s*10|faixa[^;]*limit\s+10/i);
});

test("UNIQUE transversal so nasce depois da verificacao e e deferred", () => {
  const checkIndex = activationMigration.indexOf("matchday-live-layout-cutover-unexpected-transversal-duplicate");
  const uniqueIndex = activationMigration.indexOf("matchday_live_layout_placements_matchday_bank_key");
  assert.ok(checkIndex >= 0 && uniqueIndex > checkIndex);
  assert.match(
    activationMigration,
    /unique \(matchday_id, bank_item_id\)\s*\n\s*deferrable initially deferred/,
  );
});

test("movement fino valida Jornada viva concorrencia e delega no core", () => {
  assert.match(movement, /from public\.matchdays[\s\S]*for update/);
  assert.match(movement, /desk_row\.is_managed = true/);
  assert.match(movement, /p_expect_target_empty and found/);
  assert.match(movement, /p_expected_target_bank_item_id[\s\S]*is distinct from/);
  assert.match(movement, /apply_matchday_live_layout_placement_plan\([\s\S]*true/);
  assert.doesNotMatch(movement, /swap|shift|compact|autofill|reorder/i);
});

test("adaptador legacy calcula estado final sem winner e chama o core uma vez", () => {
  assert.match(adapter, /derive_matchday_live_layout_placement_shadow/);
  assert.match(adapter, /bank_candidate_count <> 1/);
  assert.match(adapter, /slot_source_count <> 1/);
  assert.match(adapter, /having pg_catalog\.count\(\*\) > 1/);
  assert.match(adapter, /jsonb_agg\([\s\S]*order by/);
  assert.equal(
    (adapter.match(/apply_matchday_live_layout_placement_plan\s*\(/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(adapter, /\blimit\s+1\b|distinct on|row_number\s*\(/i);
});

test("v9 e Desk mantem envelopes mas entregam ocupacao ao core", () => {
  assert.match(activationMigration, /apply_matchday_editorial_profile_workspace_v9_pre_cutover/);
  assert.match(activationMigration, /create function public\.apply_matchday_editorial_profile_workspace_v9\(/);
  assert.match(activationMigration, /apply_matchday_editorial_desk_state_v2_pre_cutover/);
  assert.match(activationMigration, /create function public\.apply_matchday_editorial_desk_state_v2\(/);
  assert.ok(
    (activationMigration.match(/reconcile_matchday_live_layout_from_legacy_adapter\s*\(/g) ?? []).length >= 3,
  );
});

test("v10 e token cache nao sao redefinidos", () => {
  assert.doesNotMatch(
    `${bridgeMigration}\n${activationMigration}`,
    /create (?:or replace )?function\s+public\.apply_matchday_editorial_profile_workspace_v10/i,
  );
  assert.doesNotMatch(`${bridgeMigration}\n${activationMigration}`, /create[^;]*(?:workspace_token_cache|reconcile_token_cache)/i);
  assert.match(activationMigration, /revoke execute on function public\.apply_matchday_editorial_profile_workspace_v[2-8]/);
});

test("publicacao materializa antes da troca atomica da Jornada viva", () => {
  const publish = publisher.indexOf("activate_matchday_reference_composition");
  const materialize = publisher.indexOf("materialize_matchday_live_layout_continuity");
  const sourceOff = publisher.indexOf("set is_managed = false");
  const targetOn = publisher.indexOf("set is_managed = true");
  assert.ok(publish >= 0 && materialize > publish && sourceOff > materialize && targetOn > sourceOff);
  assert.match(publisher, /target_row\.number = v_source_number \+ 1/);
  assert.match(publisher, /order by lock_row\.id[\s\S]*for update/);
  assert.doesNotMatch(publisher, /initialize_matchday_editorial_thematic_continuity_v3/);
});

test("recovery explicito materializa carryover existente sem usar J03", () => {
  const recovery = section(
    activationMigration,
    "create function public.recover_matchday_live_layout_continuity(",
    "revoke all on function public.recover_matchday_live_layout_continuity(",
  );
  assert.match(recovery, /carryover_source_composition_id[\s\S]*p_source_composition_id/);
  assert.match(recovery, /materialize_matchday_live_layout_continuity/);
  assert.match(recovery, /set carryover_source_composition_id = null/);
  assert.doesNotMatch(recovery, /6f826bbe-88ef-42e2-8e4d-350e97752ade/);
});

test("composicao publicada e filhos ficam imutaveis", () => {
  assert.match(activationMigration, /guard_published_reference_composition\(\)/);
  assert.match(activationMigration, /old\.status = 'published'/);
  for (const table of [
    "matchday_reference_composition_items",
    "matchday_hierarchical_composition_slots",
    "matchday_historical_composition_zones",
    "matchday_historical_composition_zone_items",
  ]) {
    assert.match(activationMigration, new RegExp(`on public\\.${table}`));
  }
});

test("RPCs publicas de cutover sao exclusivas do service_role", () => {
  for (const functionName of [
    "apply_matchday_live_layout_movement",
    "apply_matchday_live_layout_legacy_slot",
    "refresh_matchday_live_layout_legacy",
    "recover_matchday_live_layout_continuity",
  ]) {
    assert.match(
      `${bridgeMigration}\n${activationMigration}`,
      new RegExp(`grant execute on function public\\.${functionName}`),
    );
  }
  assert.doesNotMatch(
    `${bridgeMigration}\n${activationMigration}`,
    /grant execute[^;]*to\s+(?:anon|authenticated|public)/i,
  );
});

test("transferencia de artigo chega ao movement RPC uma unica vez", () => {
  const flow = source("lib/editorial-matchday-news-flow.ts");
  const transfer = flow.slice(flow.indexOf("export async function transferPublishedArticleBetweenMatchdayZones"));
  assert.match(transfer, /applyAuthoritativePlacementMovement\(/);
  assert.doesNotMatch(transfer, /normalizeHorizontalNewsOrder|movePublishedArticleToFaixa/);
  assert.match(flow, /!input\.targetId \|\| explicitSlotTargetId\(input\.targetId\) !== null/);
});

test("Desk resolve placement pelo adapter atomico e nao compacta Faixa", () => {
  const resolution = source("lib/editorial-matchday-desk-resolution.ts");
  assert.match(resolution, /rpc\/apply_matchday_live_layout_legacy_slot/);
  assert.match(resolution, /live_four_news[\s\S]*placementType: "selection"/);
  assert.doesNotMatch(resolution, /normalizeHorizontalNewsOrder/);
});

test("Gestor delega slots unitarios e recusa bulk/reorder legacy", () => {
  const gestor = source("app/api/admin/gestor/route.ts");
  const page = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
  assert.match(gestor, /rpc\/apply_matchday_live_layout_legacy_slot/);
  assert.match(gestor, /authoritative-placements-do-not-reorder/);
  assert.match(gestor, /authoritative-placements-use-(?:slot-writers|individual-slots)/);
  assert.doesNotMatch(page, /value="move_matchday_horizontal_news_item"/);
  assert.doesNotMatch(page, /entra automaticamente em primeiro na Faixa/);
  assert.match(page, /fica Desalojada quando perder o seu último placement/);
});

test("landing usa is_managed sem depender de carryover", () => {
  const landing = source("app/competicoes/[competitionSlug]/[seasonLabel]/page.tsx");
  assert.match(landing, /is_managed=is\.true/);
  assert.doesNotMatch(landing, /carryover_source_composition_id=not\.is\.null/);
});

test("reopen foi retirado e Latest four so faz forward refresh", () => {
  const route = source("app/api/admin/editorial/composicao/route.ts");
  const page = source("app/admin/editorial/composicao/[matchdayId]/page.tsx");
  const projection = source("lib/editorial-matchday-latest-four-projection.ts");
  assert.doesNotMatch(route, /reopenReferenceComposition|reopen_reference_composition/);
  assert.doesNotMatch(page, /Reabrir composicao|reopen_reference_composition/);
  assert.match(projection, /rpc\/refresh_matchday_live_layout_legacy/);
});

test("working tree fica limitado ao cutover e artefactos protegidos", () => {
  const allowed = new Set([
    "baseline-testes-20260829.txt",
    "jornada-codex-parcial.zip",
    "supabase/.temp/",
    bridgeMigrationPath,
    activationMigrationPath,
    "lib/matchday-live-layout-authoritative-cutover.test.ts",
    "app/admin/editorial/artigos/_articleForm.tsx",
    "app/admin/editorial/composicao/[matchdayId]/page.tsx",
    "app/admin/editorial/jornada/[matchdayId]/page.tsx",
    "app/api/admin/editorial/composicao/route.ts",
    "app/api/admin/gestor/route.ts",
    "app/competicoes/[competitionSlug]/[seasonLabel]/page.tsx",
    "lib/editorial-matchday-desk-resolution.ts",
    "lib/editorial-matchday-desk-resolution.test.ts",
    "lib/editorial-matchday-latest-four-projection.ts",
    "lib/editorial-matchday-latest-four-projection.test.ts",
    "lib/editorial-matchday-news-flow.ts",
    "lib/editorial-matchday-news-flow.test.ts",
    "lib/editorial-matchday-news-flow-ui.test.ts",
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
