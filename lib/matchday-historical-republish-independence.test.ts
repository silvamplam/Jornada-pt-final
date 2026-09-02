import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260902053337_matchday_historical_republish_independence.sql";
const bridgePath =
  "supabase/migrations/20260901201453_matchday_live_layout_cutover_bridge.sql";
const activationPath =
  "supabase/migrations/20260901201455_matchday_live_layout_authoritative_activation.sql";
const retirementPath =
  "supabase/migrations/20260901211957_matchday_live_layout_source_retirement.sql";
const migration = readFileSync(migrationPath, "utf8");
const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);
const page = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);

function section(startNeedle: string, endNeedle: string) {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `inicio ausente: ${startNeedle}`);
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `fim ausente: ${endNeedle}`);
  return migration.slice(start, end);
}

const reopen = section(
  "create function public.reopen_matchday_reference_composition(",
  "revoke all on function\n  public.reopen_matchday_reference_composition",
);
const publish = section(
  "create function public.publish_matchday_reference_composition(",
  "revoke all on function\n  public.publish_matchday_reference_composition",
);
const historicalBranch = section(
  "  if v_has_transition then",
  "  if not v_source_is_managed then",
);

test("migration corretiva e forward-only, transacional e posterior", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
  assert.equal((migration.match(/^begin;/gm) ?? []).length, 1);
  assert.equal((migration.match(/^commit;/gm) ?? []).length, 1);
  assert.ok(migrationPath > retirementPath);
  const protectedChanges = execFileSync(
    "git",
    ["diff", "--name-only", "--", bridgePath, activationPath, retirementPath],
    { encoding: "utf8" },
  ).trim();
  assert.equal(protectedChanges, "");
});

test("remove exatamente os guards editoriais permanentes da Activation", () => {
  for (const trigger of [
    "matchday_reference_compositions_published_immutable",
    "matchday_reference_composition_items_published_immutable",
    "matchday_hierarchical_composition_slots_published_immutable",
    "matchday_historical_composition_zones_published_immutable",
    "matchday_historical_composition_zone_items_published_immutable",
  ]) {
    assert.match(migration, new RegExp(`drop trigger if exists\\s+${trigger}`));
  }
  assert.match(migration, /drop function if exists\s+jornada_private\.guard_published_reference_composition\(\)/);
  assert.match(migration, /drop function if exists\s+jornada_private\.guard_published_reference_composition_child\(\)/);
});

test("reopen exige certificado v6 e source historica retirada", () => {
  assert.match(reopen, /continuity_version = 6/);
  assert.match(reopen, /target_matchday\.number = source_matchday\.number \+ 1/);
  assert.match(reopen, /source_desk\.is_managed = false/);
  assert.match(reopen, /matchday_live_layout_placements/);
  assert.match(reopen, /matchday_live_layout_bank_item_state_memory/);
  assert.match(reopen, /composition_historical_source_not_retired/);
});

test("reopen clona o current para draft e preserva pai e quatro familias de filhos", () => {
  assert.match(reopen, /status = 'published'[\s\S]*is_current = true/);
  assert.match(reopen, /'draft',[\s\S]*false,[\s\S]*v_source\.internal_name/);
  assert.match(reopen, /from public\.matchday_reference_composition_items/);
  assert.match(reopen, /from public\.matchday_hierarchical_composition_slots/);
  assert.match(reopen, /from public\.matchday_historical_composition_zones/);
  assert.match(reopen, /from public\.matchday_historical_composition_zone_items/);
  assert.doesNotMatch(reopen, /update public\.matchday_reference_compositions/);
  assert.doesNotMatch(reopen, /matchday_latest_news|matchday_roundup_items/);
});

test("publicacao distingue first publication de historical republish pela transition", () => {
  assert.match(publish, /if v_has_transition then/);
  assert.match(historicalBranch, /continuity_version <> 6/);
  assert.match(historicalBranch, /activate_matchday_reference_composition\([\s\S]*true/);
  assert.match(historicalBranch, /'publicationKind', 'historical_republish'/);
  assert.match(publish, /if not v_source_is_managed then[\s\S]*publish_matchday_reference_composition_with_continuity/);
  assert.match(publish, /'publicationKind', 'first_publication'/);
});

test("republicacao nao chama materializer nem retirement e preserva transition original", () => {
  assert.doesNotMatch(historicalBranch, /materialize_matchday_live_layout_continuity/);
  assert.doesNotMatch(historicalBranch, /retire_matchday_live_layout_source/);
  assert.match(historicalBranch, /v_transition_before := pg_catalog\.to_jsonb\(v_transition\)/);
  assert.match(historicalBranch, /v_transition_after is distinct from v_transition_before/);
  assert.doesNotMatch(historicalBranch, /(?:insert into|update|delete from)\s+public\.matchday_editorial_continuity_transitions/i);
});

test("republicacao nao escreve em superfícies live nem no target", () => {
  assert.doesNotMatch(
    historicalBranch,
    /(?:insert into|update|delete from)\s+public\.(?:matchday_editorial_desk_control|matchday_live_layout_placements|matchday_editorial_bank_items|matchday_live_layout_zones|matchday_live_layout_blocks|matchday_latest_news|matchday_roundup_items|matchday_live_layout_bank_item_state_memory)/i,
  );
  assert.match(historicalBranch, /composition_historical_republish_postcondition_failed/);
});

test("UI reabre sem despublicar e route usa apenas o dispatcher correto", () => {
  assert.match(page, /reopen_reference_composition/);
  assert.match(page, /continua pública enquanto trabalhas num rascunho histórico independente/);
  assert.match(route, /rpc\/reopen_matchday_reference_composition/);
  assert.match(route, /rpc\/publish_matchday_reference_composition"/);
  assert.doesNotMatch(route, /rpc\/publish_matchday_reference_composition_with_continuity/);
  assert.doesNotMatch(route, /status:\s*"draft"[\s\S]{0,100}published_at:\s*null/);
});

test("novas RPCs ficam exclusivas do service_role com search_path seguro", () => {
  for (const functionName of [
    "reopen_matchday_reference_composition",
    "publish_matchday_reference_composition",
  ]) {
    assert.match(
      migration,
      new RegExp(`security definer[\\s\\S]*set search_path = ''[\\s\\S]*revoke all on function[\\s\\S]*public\\.${functionName}`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function[\\s\\S]*public\\.${functionName}\\(uuid, uuid\\)[\\s\\S]*to service_role`),
    );
  }
  assert.doesNotMatch(migration, /grant execute[^;]*to\s+(?:anon|authenticated|public)/i);
});
