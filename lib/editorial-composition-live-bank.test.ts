import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);
const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

test("o Bank da Viva é apenas o fallback inicial identificado pelo bankItemId físico", () => {
  assert.match(
    page,
    /new Set\([\s\S]*hierarchicalProfileSnapshot\.physicalWorkspace\.explicitBankItemIds[\s\S]*\)/,
  );
  assert.match(
    page,
    /historicalCompositionEffectiveDecision\([\s\S]*hierarchicalExplicitLiveBankItemIds\.has\(bankItem\.id\)/,
  );
  assert.doesNotMatch(page, /historicalCompositionEffectiveDecision\([^)]*(title|slug|url|sort|position)/i);
});

test("a ausência de snapshot temático projeta fallback vazio sem bloquear jornadas antigas", () => {
  const start = page.indexOf("  const hierarchicalExplicitLiveBankItemIds =");
  const end = page.indexOf("\n\n  const historicalDecisionByArticleId", start);
  assert.ok(start >= 0 && end > start);

  const projection = page.slice(start, end);
  assert.match(projection, /hierarchicalProfileSnapshot\?\.kind === "thematic"/);
  assert.match(projection, /:\s*\[\],/);
});

test("o cliente apresenta Todos, Bank, No Bank, contadores e marca pelo estado efetivo", () => {
  assert.match(client, /aria-label="Bank"/);
  assert.match(client, /Bank \(\{reservoirCounts\.inBank\}\)/);
  assert.match(client, /No Bank \(\{reservoirCounts\.outsideBank\}\)/);
  assert.match(client, /Todos \(\{reservoirCounts\.all\}\)/);
  assert.match(client, /initialHistoricalCompositionReservoirScope/);
  assert.match(client, /article\.historicalDecision === "bank"/);
  assert.match(client, />\s*BANK\s*</);
});

test("pesquisa, classificação e Bank combinam sem limpar a seleção", () => {
  assert.match(
    client,
    /filterHistoricalCompositionReservoir\([\s\S]*selectedGroupKeys,[\s\S]*search,[\s\S]*bankFilter,/,
  );

  const start = client.indexOf('aria-label="Bank"');
  const end = client.indexOf('<div className="hc-desk-search">', start);
  assert.ok(start >= 0 && end > start);
  const scopeControls = client.slice(start, end);
  assert.match(scopeControls, /setBankFilter\("in-bank"\)/);
  assert.match(scopeControls, /setBankFilter\("outside-bank"\)/);
  assert.match(scopeControls, /setBankFilter\("all"\)/);
  assert.match(scopeControls, /Sem classificação/);
  assert.doesNotMatch(scopeControls, /setSelectedBankItemIds/);
});

test("seleção múltipla e colocação continuam a usar apenas bankItemId", () => {
  assert.match(client, /selectedBankItemIds\s*\.map\(\(bankItemId\) =>/);
  assert.match(client, /Colocar \{selectedBankItemIds\.length\} aqui/);
  assert.match(client, /bankItemId:\s*article\.bankItemId/);
  assert.match(client, /setSelectedBankItemIds\(\[\]\)/);
});

test("os filtros e decisões editoriais não entram no payload final da composição", () => {
  const start = client.indexOf("  async function applyChanges()");
  const end = client.indexOf("\n  function renderCard", start);
  assert.ok(start >= 0 && end > start);
  const applyChanges = client.slice(start, end);

  assert.match(applyChanges, /operations_json/);
  assert.match(applyChanges, /settings_json/);
  assert.match(applyChanges, /dynamic_zones_json/);
  assert.doesNotMatch(applyChanges, /bankFilter|selectedGroupKey|historicalDecision|in-bank|outside-bank/);
});
