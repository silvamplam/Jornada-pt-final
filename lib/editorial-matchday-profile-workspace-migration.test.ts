import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/20260823080936_matchday_editorial_profile_workspace_opening.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const normalized = migration.toLowerCase();

function source(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("workspace token abrange reconcile e Abertura sem depender da ordem Legacy", () => {
  assert.match(normalized, /create function public\.matchday_editorial_profile_workspace_token/);
  assert.match(normalized, /matchday_editorial_profile_reconcile_token/);
  assert.match(normalized, /from public\.matchday_editorials/);
  assert.match(normalized, /from public\.matchday_highlights/);
  assert.doesNotMatch(normalized, /'shared_page_control'/);
});

test("ordem das cinco zonas é estado temático próprio no reconcile control", () => {
  assert.match(normalized, /add column thematic_zone_order text\[\]/);
  assert.match(normalized, /'benfica'[\s\S]*'sporting'[\s\S]*'fc_porto'[\s\S]*'other_liga_clubs'[\s\S]*'outside_liga_other'/);
  assert.match(normalized, /thematic_zone_order/);
  assert.doesNotMatch(normalized, /insert into public\.matchday_editorial_desk_control[\s\S]*live_public_zone_order/);
});

test("Apply workspace é transacional, server-authoritative e valida exclusividade antes do primeiro write", () => {
  const functionStart = normalized.indexOf("create function public.apply_matchday_editorial_profile_workspace");
  const functionEnd = normalized.indexOf("\n$$;", functionStart);
  const body = normalized.slice(functionStart, functionEnd);
  const finalValidation = body.indexOf("exclusive-placement-incomplete");
  const tokenConflict = body.indexOf("state-token-conflict");
  const nestedApply = body.indexOf("apply_matchday_editorial_profile_reconcile_v2");
  const openingWrite = body.indexOf("insert into public.matchday_editorials");

  assert.match(normalized, /^begin;[\s\S]*commit;\s*$/);
  assert.ok(tokenConflict >= 0 && finalValidation > tokenConflict);
  assert.ok(nestedApply > finalValidation && openingWrite > nestedApply);
  assert.match(body, /for update of matchday_row/);
  assert.match(body, /lock table public\.matchday_editorials in share row exclusive mode/);
  assert.match(body, /lock table public\.matchday_highlights in share row exclusive mode/);
  assert.match(body, /lock table public\.matchday_horizontal_news in share row exclusive mode/);
  assert.match(body, /p_expected_revision/);
  assert.doesNotMatch(body, /apply_matchday_editorial_desk_state/);
});

test("Abertura usa writes seletivos e protege drafts por dimensão", () => {
  assert.match(normalized, /v_headline_changed boolean/);
  assert.match(normalized, /v_context_changed boolean/);
  assert.match(normalized, /v_headline_color_changed boolean/);
  assert.match(normalized, /v_latest_placement_changed boolean/);
  assert.match(normalized, /workspace-headline-draft-content/);
  assert.match(normalized, /workspace-context-draft-content/);
  assert.match(normalized, /workspace-highlight-draft-content/);
  assert.doesNotMatch(normalized, /delete from public\.matchday_highlights\s+where matchday_id = p_matchday_id;\s+\n\s*insert into public\.matchday_highlights/);
  assert.match(normalized, /where highlight_row\.matchday_id = p_matchday_id\s+and highlight_row\.sort_order = v_highlight_slot/);
  assert.match(normalized, /title = case when v_headline_changed/);
  assert.match(normalized, /title_color = case when v_headline_color_changed/);
});

test("resync de Bank é suprimido apenas dentro do Apply temático", () => {
  assert.match(normalized, /drop trigger if exists sync_matchday_editorials_to_bank/);
  assert.match(normalized, /drop trigger if exists sync_matchday_highlights_to_bank/);
  assert.match(normalized, /current_setting\('jornada\.thematic_workspace_apply', true\)/);
  assert.match(normalized, /set_config\(\s*'jornada\.thematic_workspace_apply',\s*'on',\s*true/);
});

test("RPC preserva contratos públicos da Faixa e não altera storage Legacy da ordem", () => {
  assert.match(normalized, /latest_zone_placement/);
  assert.match(normalized, /title_color/);
  assert.match(normalized, /thematic_zone_order/);
  assert.doesNotMatch(normalized, /public_matchday_horizontal_news_max_items/);
  assert.doesNotMatch(normalized, /alter table public\.matchday_horizontal_news/);
  assert.doesNotMatch(normalized, /set\s+live_public_zone_order\s*=/);
});

test("funções privilegiadas têm search_path fechado e execução service_role only", () => {
  assert.equal((normalized.match(/security definer/g) ?? []).length, 2);
  assert.equal((normalized.match(/set search_path = ''/g) ?? []).length, 2);
  assert.match(normalized, /revoke all on function public\.matchday_editorial_profile_workspace_token[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(normalized, /grant execute on function public\.matchday_editorial_profile_workspace_token[\s\S]*to service_role/);
  assert.match(normalized, /revoke all on function public\.apply_matchday_editorial_profile_workspace[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(normalized, /grant execute on function public\.apply_matchday_editorial_profile_workspace[\s\S]*to service_role/);
});

test("UI monta só a janela visível da Faixa e mantém pesquisa/expansão sobre a fila completa", () => {
  const client = source("app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx");
  assert.match(client, /const FAIXA_INITIAL_VISIBLE = 10/);
  assert.match(client, /const visibleFaixa =[\s\S]*deskView === "focus"[\s\S]*filteredFaixa\.slice\(0, faixaVisibleCount\)/);
  assert.match(client, /visibleFaixa\.map/);
  assert.match(client, /Mostrar mais 10/);
  assert.match(client, /Pesquisar em toda a Faixa/);
  assert.match(client, /loading="lazy"/);
  assert.doesNotMatch(client, /reconcile\.faixaAfter\.map\(\(item\) => \(/);
});

test("preview local só lê a Seleção e Apply faz uma única escrita temática", () => {
  const client = source("app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx");
  const route = source("app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts");
  assert.match(client, /function commitDraft/);
  assert.match(client, /async function applyChanges\(\)/);
  assert.equal((client.match(/method: "POST"/g) ?? []).length, 1);
  assert.match(client, /method: "GET"/);
  assert.equal((route.match(/writeSupabaseAdminReturning/g) ?? []).length, 2);
  assert.match(route, /rpc\/apply_matchday_editorial_profile_workspace_v6/);
  assert.match(route, /expectedStateToken|p_expected_state_token/);
  assert.match(route, /thematic_zone_order: pageControls\.thematicZoneOrder/);
});
