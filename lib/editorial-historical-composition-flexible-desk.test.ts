import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);
const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
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
const renderer = readFileSync(
  "components/public/PublicHierarchicalComposition.tsx",
  "utf8",
);
const profiles = readFileSync("lib/editorial-profiles.ts", "utf8");
const migrationPath =
  "supabase/migrations/20260825145814_historical_composition_workspace.sql";
const migration = readFileSync(migrationPath, "utf8");

test("a rota abre diretamente uma única Mesa hierárquica e conserva o legacy apenas internamente", () => {
  assert.match(page, /historicalCompositionDeskPresentationMode\(\)/);
  assert.match(page, /return "hierarchical"/);
  assert.doesNotMatch(page, /Atual\s*\|\s*Hierárquica/);
  assert.doesNotMatch(page, /composition-admin-mode-selector-link/);
  assert.match(page, /readDraftReferenceComposition/);
  assert.match(page, /presentation_mode/);
  assert.match(page, /groupCompositionItemsBySection/);
  assert.doesNotMatch(client, /Últimas/);
});

test("o reservatório é o catálogo visual único e usa a classificação temática natural", () => {
  for (const label of [
    "Benfica",
    "Sporting",
    "FC Porto",
    "Outros clubes",
    "Fora da Liga / outros",
  ]) {
    assert.ok(profiles.includes(label), `falta o grupo ${label}`);
  }
  assert.match(page, /readMatchdayEditorialProfileDesk/);
  assert.match(page, /naturalGroupKey/);
  assert.match(client, /filterHistoricalCompositionReservoir/);
  assert.match(client, /placedBankItemIds/);
  assert.doesNotMatch(client, /Colocar em\.\.\.|Adicionar à zona…/);
});

test("todos os destinos visíveis recebem drag e o plano continua local até Guardar montagem", () => {
  assert.match(client, /dropOnLocation/);
  assert.match(client, /moveHistoricalCompositionPiece/);
  assert.match(client, /target === "editorial"/);
  assert.match(client, /plan\.auxiliary\.video_highlight/);
  assert.match(client, /beyond_matchday_/);
  assert.match(client, /faixa_/);
  assert.match(client, /beforeunload/);
  assert.match(client, /function undo\(/);
  assert.match(client, /function reset\(/);
  assert.match(client, /GUARDAR MONTAGEM/);
  assert.match(client, /apply_hierarchical_desk_plan/);
  assert.doesNotMatch(client, /PUBLICAR[\s\S]*apply_hierarchical_desk_plan/);
});

test("Editorial é uma peça canónica e os snapshots históricos continuam a alimentar o renderer legacy", () => {
  assert.match(client, /kind: "assign_editorial"/);
  assert.match(client, /kind: "remove_editorial"/);
  assert.match(route, /readPublishedEditorialArticleForHierarchicalAuxiliary/);
  assert.match(migration, /hierarchical_editorial_source_type = 'editorial_article'/);
  assert.match(migration, /hierarchical_editorial_source_id = v_editorial_source_id/);
  assert.match(migration, /hierarchical_editorial_text = v_editorial_text/);
  assert.match(publicPage, /hierarchical_editorial_title/);
  assert.match(publicPage, /hierarchicalEditorialHref/);
});

test("Inserir todos os vídeos é uma operação batch, determinística, idempotente e não confirma candidatos", () => {
  assert.match(page, /INSERIR TODOS OS VÍDEOS DISPONÍVEIS/);
  assert.match(page, /assign_all_roundup_items_to_hierarchical_composition/);
  assert.match(route, /async function assignAllRoundupItemsToHierarchicalComposition/);
  assert.match(route, /status=eq\.published&video_url=not\.is\.null&order=sort_order\.asc,id\.asc/);
  assert.match(route, /existingSourceIds/);
  assert.match(route, /missingItems\.length === 0/);
  assert.match(route, /missingItems\.map/);
  assert.doesNotMatch(
    route.slice(
      route.indexOf("async function assignAllRoundupItemsToHierarchicalComposition"),
      route.indexOf("async function activateReferenceComposition"),
    ),
    /match_video_summary_candidates|confirmed|candidate/,
  );
});

test("os quatro menus operacionais são recolhidos e guardar continua separado de publicar", () => {
  for (const summary of [
    "Página e blocos",
    "Vídeo + Destaque",
    "Publicar composição",
    "Pré-visualização",
  ]) {
    assert.ok(`${page}\n${client}`.includes(`<summary>${summary}</summary>`), `falta o menu ${summary}`);
  }
  assert.doesNotMatch(`${page}\n${client}`, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(client, /GUARDAR MONTAGEM/);
  assert.match(page, /publish_reference_composition/);
});

test("metadados novos são opcionais, pertencem à composição histórica e não migram dados antigos", () => {
  assert.equal(existsSync(migrationPath), true);
  const schemaMigration = migration.slice(
    0,
    migration.indexOf(
      "create or replace function public.apply_historical_composition_workspace_plan",
    ),
  );
  for (const column of [
    "hierarchical_headline_title_color",
    "hierarchical_zone_1_title",
    "hierarchical_zone_2_title",
    "hierarchical_block_order",
    "hierarchical_editorial_source_type",
    "hierarchical_editorial_source_id",
  ]) {
    assert.ok(migration.includes(column), `falta ${column}`);
    assert.ok(publicLoader.includes(column), `loader não lê ${column}`);
  }
  assert.doesNotMatch(schemaMigration, /\bupdate\s+public\.matchday_reference_compositions\b/i);
  assert.doesNotMatch(schemaMigration, /\binsert\s+into\b/i);
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
});

test("o renderer mantém o percurso histórico sem ordem e usa títulos e ordem apenas quando configurados", () => {
  assert.match(renderer, /configuredBlocks \?\?/);
  assert.match(renderer, /blockOrder\?\.map/);
  assert.match(renderer, /Arbitragem e Reações/);
  assert.match(renderer, /Outros jogos da jornada/);
  assert.match(renderer, /titleColor=\{headlineTitleColor\}/);
  assert.match(publicPage, /hierarchical_block_order == null\s*\? null/);
  assert.match(publicPage, /normalizeHistoricalCompositionBlockOrder/);
});
