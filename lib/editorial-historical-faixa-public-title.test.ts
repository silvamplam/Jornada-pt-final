import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260924190000_historical_composition_faixa_public_title.sql";
const migration = readFileSync(migrationPath, "utf8");
const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);
const adminPage = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);
const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);
const publicLoader = readFileSync("lib/public-matchday.ts", "utf8");
const publicPage = readFileSync(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  "utf8",
);
const horizontalStrip = readFileSync(
  "components/public/PublicHorizontalNewsStrip.tsx",
  "utf8",
);
const smoke = readFileSync(
  "supabase/steps/124-composicao-historica-workspace-atomico-smoke-rollback.sql",
  "utf8",
);

function sourceBetween(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0, `início em falta: ${startNeedle}`);
  assert.ok(end > start, `fim em falta depois de ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

test("a migration cria uma autoridade histórica opcional, aditiva e sem backfill", () => {
  const schema = sourceBetween(
    migration,
    "alter table public.matchday_reference_compositions",
    "create or replace function public.apply_historical_composition_workspace_plan_v3(",
  );

  assert.match(schema, /add column if not exists hierarchical_faixa_title text/);
  assert.match(schema, /hierarchical_faixa_title is null/);
  assert.match(schema, /hierarchical_faixa_title = pg_catalog\.btrim\(hierarchical_faixa_title\)/);
  assert.match(schema, /char_length\(hierarchical_faixa_title\) between 1 and 120/);
  assert.doesNotMatch(schema, /\bupdate\s+public\.matchday_reference_compositions\b/i);
  assert.doesNotMatch(schema, /\binsert\s+into\b/i);
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
});

test("route e RPC aceitam vazio, trimam e limitam faixaTitle a 120 caracteres", () => {
  const parser = sourceBetween(
    route,
    "function parseHierarchicalDeskSettings(",
    "\nasync function applyHierarchicalDeskPlan",
  );
  const applyV3 = sourceBetween(
    migration,
    "create or replace function public.apply_historical_composition_workspace_plan_v3(",
    "\nrevoke all",
  );

  assert.match(parser, /hasOwnProperty\.call\(value, "faixaTitle"\)/);
  assert.match(parser, /typeof value\.faixaTitle === "string" \? value\.faixaTitle\.trim\(\) : ""/);
  assert.match(parser, /faixaTitle\.length > 120/);
  assert.doesNotMatch(parser, /faixaTitle\.length === 0/);
  assert.match(applyV3, /jsonb_typeof\(p_settings -> 'faixaTitle'\) <> 'string'/);
  assert.match(applyV3, /v_faixa_title := pg_catalog\.btrim\(p_settings ->> 'faixaTitle'\)/);
  assert.match(applyV3, /char_length\(v_faixa_title\) > 120/);
  assert.match(applyV3, /nullif\(v_faixa_title, ''\)/);
});

test("Faixa ativa edita o título no mesmo draft com undo e reset", () => {
  const faixa = sourceBetween(
    client,
    '          {activeWorkspaceKey === "faixa" ? (',
    "\n          ) : null}",
  );
  const samePlan = sourceBetween(client, "function samePlan(", "\n\nfunction DynamicZoneTitleInput");
  const applyChanges = sourceBetween(client, "  async function applyChanges() {", "\n\n  function renderCard");

  assert.match(faixa, /<span>Título público<\/span>/);
  assert.match(faixa, /aria-label="Título público da Faixa histórica"/);
  assert.match(faixa, /defaultValue=\{plan\.settings\.faixaTitle\}/);
  assert.match(faixa, /const faixaTitle = event\.currentTarget\.value\.trim\(\)/);
  assert.match(faixa, /updateSettings\([\s\S]*\{ \.\.\.plan\.settings, faixaTitle \}/);
  assert.match(samePlan, /left\.settings\.faixaTitle === right\.settings\.faixaTitle/);
  assert.match(client, /basePlan\.settings\.faixaTitle !== plan\.settings\.faixaTitle/);
  assert.match(client, /function undo\([\s\S]*setPlan\(previous\)/);
  assert.match(client, /function reset\([\s\S]*setPlan\(basePlan\)/);
  assert.match(applyChanges, /body\.set\("settings_json", JSON\.stringify\(plan\.settings\)\)/);
  assert.doesNotMatch(client, /useState\([^\n]*faixaTitle/i);
});

test("draft e preview administrativos leem exclusivamente o título histórico", () => {
  assert.match(adminPage, /hierarchical_faixa_title: string \| null/);
  assert.match(adminPage, /draftComposition\?\.hierarchical_faixa_title\?\.trim\(\) \?\? ""/);
  assert.match(adminPage, /initialFaixaTitle=\{hierarchicalFaixaTitle\}/);
  assert.match(
    adminPage,
    /<PublicHorizontalNewsStrip[\s\S]*?items=\{hierarchicalPreviewFaixaItems\}[\s\S]*?title=\{hierarchicalFaixaTitle\}/,
  );
  assert.doesNotMatch(adminPage, /physicalSnapshot\.faixa\.publicTitle/);
});

test("página pública separa autoridade histórica e Mesa Viva sem fallback", () => {
  const authority = sourceBetween(
    publicPage,
    "  const faixaPublicTitle =",
    "\n\n  const editorialVisibility",
  );

  assert.match(publicLoader, /hierarchical_faixa_title: string \| null/);
  assert.match(publicLoader, /select=[^`]*hierarchical_faixa_title/);
  assert.match(authority, /useHierarchicalReferenceComposition/);
  assert.match(authority, /referenceComposition\?\.hierarchical_faixa_title\?\.trim\(\) \?\? ""/);
  assert.match(authority, /: physicalSnapshot\?\.faixa\.publicTitle \?\? ""/);
  assert.doesNotMatch(authority, /"Faixa(?: de notícias)?"/);
  assert.match(publicPage, /title=\{faixaPublicTitle\}/);
  assert.match(horizontalStrip, /\{title \? <h2 className="public-horizontal-news-heading">\{title\}<\/h2> : null\}/);
});

test("Guardar montagem mantém uma única RPC transacional e rollback inclui a Faixa", () => {
  const applyV3 = sourceBetween(
    migration,
    "create or replace function public.apply_historical_composition_workspace_plan_v3(",
    "\nrevoke all",
  );

  assert.match(applyV3, /apply_historical_composition_workspace_plan_v2\(/);
  assert.match(applyV3, /p_settings - 'videoPosition' - 'faixaTitle'/);
  assert.match(applyV3, /update public\.matchday_reference_compositions as composition[\s\S]*hierarchical_faixa_title = case/);
  assert.match(route, /rpc\/apply_historical_composition_workspace_plan_v3/);
  assert.doesNotMatch(route, /rpc\/[^"']*faixa/i);
  assert.match(smoke, /apply_historical_composition_workspace_plan_v3/);
  assert.match(smoke, /'faixaTitle', 'Título transitório da Faixa'/);
  assert.match(smoke, /hierarchical_faixa_title is distinct from 'Título original da Faixa'/);
  assert.match(smoke, /rollback;\s*$/);
});

test("reopen preserva o título e não existe RPC paralela da Faixa", () => {
  const reopen = sourceBetween(
    migration,
    "create or replace function public.reopen_matchday_reference_composition(",
    "\nrevoke all on function",
  );

  assert.match(reopen, /hierarchical_faixa_title/);
  assert.match(reopen, /v_source\.hierarchical_faixa_title/);
  assert.equal((reopen.match(/hierarchical_faixa_title/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /create(?: or replace)? function public\.[^(]*faixa/i);
});

test("important_item e restantes decisões históricas permanecem inalterados", () => {
  assert.match(route, /slotType: "important_item"/);
  assert.match(client, /`faixa_\$\{position\}`/);
  assert.doesNotMatch(migration, /alter table public\.matchday_reference_composition_items/i);
  assert.doesNotMatch(migration, /alter table public\.matchday_historical_composition_zones/i);
  assert.doesNotMatch(migration, /historicalDecision|Sem decisão|classification|historical_article_decisions/i);
});
