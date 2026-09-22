import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

const page = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);

const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);

const migration = readFileSync(
  "supabase/migrations/20260826103000_historical_composition_body_order.sql",
  "utf8",
);

test("Abertura e Editorial ficam fixos antes do corpo editorial", () => {
  const opening = client.indexOf("01 · Abertura");
  const editorial = client.indexOf("02 · Editorial da Jornada");
  const body = client.indexOf("bodyBlockKeys(");

  assert.ok(opening >= 0);
  assert.ok(editorial > opening);
  assert.ok(body >= 0);
});

test("o modo normal organiza filtros, pesquisa e ordenação numa única linha", () => {
  assert.match(client, /\.hc-desk-classification,[\s\S]*?order:\s*1;/);
  assert.match(client, /\.hc-desk-historical\s*\{[\s\S]*?order:\s*2;/);
  assert.match(client, /\.hc-desk-search\s*\{[\s\S]*?order:\s*3;/);
  assert.match(client, /\.hc-desk-order\s*\{[\s\S]*?order:\s*4;/);
  assert.match(client, /\.hc-desk-result-count\s*\{[\s\S]*?order:\s*5;/);
  assert.match(client, /\.hc-desk-toolbar\s*\{[\s\S]*?flex-wrap:\s*nowrap;/);
  assert.match(client, /selectedBankItemIds\.length === 0 \? \([\s\S]*aria-label="Bank"[\s\S]*aria-label="Classificação"[\s\S]*aria-label="Histórica"[\s\S]*aria-label="Pesquisar artigos"[\s\S]*aria-label="Ordenação"[\s\S]*visibleArticles\.length/);
});

test("o modo seleção substitui os filtros por ações contextuais sem scroll horizontal", () => {
  const toolbarStart = client.indexOf("  const articleToolbar = (");
  const toolbarEnd = client.indexOf("\n\n  return (", toolbarStart);
  assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart);
  const toolbar = client.slice(toolbarStart, toolbarEnd);
  const selectionStart = toolbar.indexOf('<div className="hc-desk-selection-actions"');
  assert.ok(selectionStart >= 0);
  const selectionToolbar = toolbar.slice(selectionStart);

  assert.match(selectionToolbar, /1 selecionado/);
  assert.match(selectionToolbar, /selecionados/);
  assert.match(selectionToolbar, /Enviar p\/ Bank/);
  assert.match(selectionToolbar, /Retirar do Bank/);
  assert.match(selectionToolbar, /Selecionar p\/ Histórica/);
  assert.match(selectionToolbar, /Retirar da Histórica/);
  assert.match(selectionToolbar, />Limpar</);
  assert.doesNotMatch(selectionToolbar, /aria-label="Bank"|aria-label="Classificação"|aria-label="Pesquisar artigos"|aria-label="Ordenação"/);
  assert.doesNotMatch(selectionToolbar, /Colocar \{selectedBankItemIds\.length\} aqui/);
  assert.match(client, /\.hc-desk-toolbar\.selection-mode \{[\s\S]*?overflow-x:\s*visible;/);
  assert.match(client, /\.hc-desk-selection-actions \{[\s\S]*?flex-wrap:\s*nowrap;/);
});

test("limpar seleção não altera nenhum estado de filtro", () => {
  assert.match(client, /onClick=\{\(\) => setSelectedBankItemIds\(\[\]\)\}>Limpar<\/button>/);
  const clearStart = client.indexOf('onClick={() => setSelectedBankItemIds([])}>Limpar</button>');
  assert.ok(clearStart >= 0);
  const clearAction = client.slice(clearStart, clearStart + 90);
  assert.doesNotMatch(clearAction, /setBankFilter|setSelectedGroupKey|setHistoricalSelectionFilter|setSearch|setArticleOrder/);
});

test("Colocar N aqui partilha a linha título/layout e deixa de ter header dedicado", () => {
  const zoneStart = client.indexOf("          {activeDynamicZone ? (");
  const zoneEnd = client.indexOf('          {activeWorkspaceKey === "editorial"', zoneStart);
  assert.ok(zoneStart >= 0 && zoneEnd > zoneStart);
  const dynamicZone = client.slice(zoneStart, zoneEnd);

  assert.match(dynamicZone, /hc-dynamic-zone-editor has-selection/);
  assert.match(dynamicZone, /aria-label="Layout da zona editorial"/);
  assert.match(dynamicZone, /selectedBankItemIds\.length > 0 \? <button className="hc-dynamic-zone-place"[\s\S]*?Colocar \{selectedBankItemIds\.length\} aqui/);
  assert.ok(dynamicZone.indexOf("hc-dynamic-zone-place") < dynamicZone.indexOf('<section className="hc-desk-zone">'));
  assert.doesNotMatch(dynamicZone, /<header>/);
});

test("Vídeo + Destaque partilha a ordem do corpo com as zonas dinâmicas", () => {
  assert.match(client, /videoPosition/);
  assert.match(client, /moveBodyBlock\("video", "up"\)/);
  assert.match(client, /moveBodyBlock\("video", "down"\)/);
  assert.match(client, /móvel no corpo editorial/);
});

test("a posição do vídeo é carregada e persistida", () => {
  assert.match(page, /hierarchical_video_position/);
  assert.match(page, /initialVideoPosition=/);
  assert.match(route, /videoPosition/);
  assert.match(
    route,
    /rpc\/apply_historical_composition_workspace_plan_v3/,
  );
});

test("a RPC v3 preserva atomicidade e permissões", () => {
  assert.match(
    migration,
    /apply_historical_composition_workspace_plan_v2\(/,
  );
  assert.match(
    migration,
    /hierarchical_video_position/,
  );
  assert.match(migration, /security invoker/i);
  assert.match(migration, /from public,\s*anon,\s*authenticated/i);
  assert.match(migration, /to service_role/i);
});
