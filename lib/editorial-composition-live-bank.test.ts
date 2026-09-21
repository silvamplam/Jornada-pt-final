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

test("a projeção identifica o Banco da Viva exclusivamente pelo bankItemId físico", () => {
  assert.match(
    page,
    /new Set\([\s\S]*hierarchicalProfileSnapshot\.physicalWorkspace\.explicitBankItemIds[\s\S]*\)/,
  );
  assert.match(
    page,
    /fromLiveBank:\s*hierarchicalExplicitLiveBankItemIds\.has\(bankItem\.id\)/,
  );
  assert.doesNotMatch(page, /fromLiveBank:[^\n]*(title|slug|url|sort|position)/i);
});

test("a ausência de snapshot temático projeta um conjunto vazio sem bloquear jornadas antigas", () => {
  const start = page.indexOf("  const hierarchicalExplicitLiveBankItemIds =");
  const end = page.indexOf("\n\n  const hierarchicalDeskArticleById", start);
  assert.ok(start >= 0 && end > start);

  const projection = page.slice(start, end);
  assert.match(projection, /hierarchicalProfileSnapshot\?\.kind === "thematic"/);
  assert.match(projection, /:\s*\[\],/);
});

test("o cliente real apresenta âmbitos, contadores e marca editorial discreta", () => {
  assert.match(client, /aria-label="Âmbito do Banco da Mesa"/);
  assert.match(client, /Banco da Viva \(\{reservoirCounts\.liveBank\}\)/);
  assert.match(client, /Todos \(\{reservoirCounts\.all\}\)/);
  assert.match(client, /reservoirCounts\.liveBank > 0/);
  assert.match(client, /initialHistoricalCompositionReservoirScope/);
  assert.match(client, /reservoirScope === "all" && article\.fromLiveBank/);
  assert.match(client, />\s*BANCO DA VIVA\s*</);
});

test("pesquisa e grupos são aplicados depois do âmbito sem limpar a seleção", () => {
  assert.match(
    client,
    /filterHistoricalCompositionReservoir\([\s\S]*new Set\(selectedGroupKeys\),[\s\S]*search,[\s\S]*reservoirScope,/,
  );

  const start = client.indexOf('aria-label="Âmbito do Banco da Mesa"');
  const end = client.indexOf('<div className="hc-desk-search">', start);
  assert.ok(start >= 0 && end > start);
  const scopeControls = client.slice(start, end);
  assert.match(scopeControls, /setReservoirScope\("live-bank"\)/);
  assert.match(scopeControls, /setReservoirScope\("all"\)/);
  assert.doesNotMatch(scopeControls, /setSelectedBankItemIds/);
});

test("seleção múltipla e colocação continuam a usar apenas bankItemId", () => {
  assert.match(client, /selectedBankItemIds\s*\.map\(\(bankItemId\) =>/);
  assert.match(client, /Colocar \{selectedBankItemIds\.length\} aqui/);
  assert.match(client, /bankItemId:\s*article\.bankItemId/);
  assert.match(client, /setSelectedBankItemIds\(\[\]\)/);
});

test("o âmbito visual não entra no payload final da composição", () => {
  const start = client.indexOf("  async function applyChanges()");
  const end = client.indexOf("\n  function renderCard", start);
  assert.ok(start >= 0 && end > start);
  const applyChanges = client.slice(start, end);

  assert.match(applyChanges, /operations_json/);
  assert.match(applyChanges, /settings_json/);
  assert.match(applyChanges, /dynamic_zones_json/);
  assert.doesNotMatch(applyChanges, /reservoirScope|fromLiveBank|live-bank/);
});
