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

test("o painel direito usa apenas duas linhas compactas como a Mesa Editorial", () => {
  const modernStyles = client.slice(client.indexOf("/* Mesa histórica modernizada"));
  const toolbarStart = client.indexOf("  const articleToolbar = (");
  const toolbarEnd = client.indexOf("\n\n  const selectionContext", toolbarStart);
  assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart);
  const toolbar = client.slice(toolbarStart, toolbarEnd);

  assert.match(modernStyles, /\.hc-desk-toolbar \{[\s\S]*?display: grid;/);
  assert.match(modernStyles, /\.hc-desk-scope \{[\s\S]*?grid-template-columns: repeat\(4,/);
  assert.match(modernStyles, /\.hc-desk-groups \{[\s\S]*?overflow-x: auto;/);
  assert.match(modernStyles, /\.hc-desk-filter-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(toolbar, /aria-label="Decisão histórica"[\s\S]*Todos \([\s\S]*Sem decisão \([\s\S]*Bank \([\s\S]*Histórica \(/);
  assert.match(toolbar, /aria-label="Classificação"[\s\S]*setSelectedGroupKey\(group\.key\)/);
  assert.match(toolbar, /candidateSearchOpen \? \([\s\S]*aria-label="Pesquisar artigos"[\s\S]*aria-label="Classificação"/);
  assert.match(toolbar, /className="hc-desk-search-toggle"[\s\S]*Selecionar visíveis/);
  assert.doesNotMatch(toolbar, /hc-desk-toolbar-status|hc-desk-selection-actions|Mais recentes|aria-label="Ordenação"/);
  assert.doesNotMatch(client, /articleOrder|setArticleOrder|Mais antigos|Mais recentes/);
  assert.doesNotMatch(client, /No Bank|Não selecionados/);
});

test("o modo seleção mantém lupa e Limpar na segunda linha e move operações para o contexto global", () => {
  const toolbarStart = client.indexOf("  const articleToolbar = (");
  const toolbarEnd = client.indexOf("\n\n  const selectionContext", toolbarStart);
  assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart);
  const toolbar = client.slice(toolbarStart, toolbarEnd);
  const selectionStart = client.indexOf("  const selectionContext");
  const selectionEnd = client.indexOf("\n\n  return (", selectionStart);
  assert.ok(selectionStart >= 0 && selectionEnd > selectionStart);
  const selectionContext = client.slice(selectionStart, selectionEnd);

  assert.match(selectionContext, /1 artigo selecionado/);
  assert.match(selectionContext, /artigos selecionados/);
  assert.match(selectionContext, /Enviar p\/ Bank/);
  assert.match(selectionContext, /Retirar do Bank/);
  assert.match(selectionContext, /Selecionar p\/ Histórica/);
  assert.match(selectionContext, /Retirar da Histórica/);
  assert.match(toolbar, /aria-label="Decisão histórica"/);
  assert.match(toolbar, /aria-label="Classificação"/);
  assert.match(toolbar, /aria-label="Pesquisar artigos"/);
  assert.match(toolbar, /selectedBankItemIds\.length > 0 \? "Limpar" : "Selecionar visíveis"/);
  assert.doesNotMatch(toolbar, /hc-desk-selection-actions/);
  assert.doesNotMatch(selectionContext, /Colocar \{selectedBankItemIds\.length\} aqui/);
  const modernStyles = client.slice(client.indexOf("/* Mesa histórica modernizada"));
  assert.match(modernStyles, /\.hc-desk-selection-actions \{[\s\S]*?flex-wrap: wrap;/);
});

test("limpar seleção não altera nenhum estado de filtro", () => {
  const clearStart = client.indexOf("  function toggleVisibleSelection() {");
  const clearEnd = client.indexOf("\n\n  const openingSection", clearStart);
  assert.ok(clearStart >= 0 && clearEnd > clearStart);
  const clearAction = client.slice(clearStart, clearEnd);
  assert.match(clearAction, /selectedBankItemIds\.length > 0[\s\S]*setSelectedBankItemIds\(\[\]\)/);
  assert.match(clearAction, /visibleArticles\.map\(\(article\) => article\.bankItemId\)/);
  assert.doesNotMatch(clearAction, /setHistoricalDecisionFilter|setSelectedGroupKey|setSearch/);
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

test("a rail seleciona um único bloco e move apenas para o vizinho", () => {
  const railStart = client.indexOf('<aside className="hc-zone-rail"');
  const railEnd = client.indexOf("\n\n        <section", railStart);
  assert.ok(railStart >= 0 && railEnd > railStart);
  const rail = client.slice(railStart, railEnd);
  const reorderStart = client.indexOf("  function moveBodyBlock(");
  const reorderEnd = client.indexOf("\n\n  function addDynamicZone", reorderStart);
  assert.ok(reorderStart >= 0 && reorderEnd > reorderStart);
  const reorder = client.slice(reorderStart, reorderEnd);

  assert.match(client, /const \[selectedReorderBlockKey, setSelectedReorderBlockKey\]/);
  assert.match(rail, /checked=\{selectedReorderBlockKey === blockKey\}/);
  assert.match(rail, /setSelectedReorderBlockKey\(event\.target\.checked \? blockKey : null\)/);
  assert.match(rail, /aria-label="Subir zona selecionada"/);
  assert.match(rail, /aria-label="Descer zona selecionada"/);
  assert.match(rail, /moveBodyBlock\(selectedReorderBlockKey, "up"\)/);
  assert.match(rail, /moveBodyBlock\(selectedReorderBlockKey, "down"\)/);
  assert.match(reorder, /const targetIndex = direction === "up" \? index - 1 : index \+ 1;/);
  assert.match(reorder, /\[keys\[index\], keys\[targetIndex\]\] =/);
  assert.match(client, /videoPosition/);
  assert.match(client, /móvel no corpo editorial/);
});

test("Página e blocos cria e apaga zonas, mas não contém reorder", () => {
  const panelStart = client.indexOf("<summary>Página e blocos</summary>");
  const panelEnd = client.indexOf("\n\n        {children}", panelStart);
  assert.ok(panelStart >= 0 && panelEnd > panelStart);
  const panel = client.slice(panelStart, panelEnd);

  assert.match(panel, /onClick=\{addDynamicZone\}/);
  assert.match(panel, /onClick=\{\(\) => removeDynamicZone\(zone\.clientId\)\}/);
  assert.doesNotMatch(panel, /moveBodyBlock|aria-label="Subir|aria-label="Descer|>\s*[↑↓]\s*</);
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
