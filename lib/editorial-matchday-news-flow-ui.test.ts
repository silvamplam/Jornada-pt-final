import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const editorialPageSource = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
const articleFormSource = source("app/admin/editorial/artigos/_articleForm.tsx");
const articlePageSource = source("app/admin/editorial/artigos/page.tsx");
const newsroomPageSource = source("app/admin/editorial/redacao-automatica/page.tsx");
const publicMatchdayPageSource = source("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx");


test("o pacote para o ChatGPT continua a chamar Assunto principal ao foco", () => {
  assert.ok(newsroomPageSource.includes("Assunto principal"));
  assert.ok(newsroomPageSource.includes('name="suggested_title"'));
});

test("na primeira publicação escolhe-se a colocação inicial em vez de entrar automaticamente em Últimas", () => {
  assert.ok(articleFormSource.includes("Colocação inicial"));
  assert.ok(articleFormSource.includes('name="initial_placement"'));
  assert.ok(articleFormSource.includes('value="none"'));
  assert.ok(articleFormSource.includes('value="editorial_line_item"'));
  assert.ok(articleFormSource.includes('value="headline"'));
  assert.ok(articleFormSource.includes('value="highlight"'));
  assert.ok(articleFormSource.includes('value="complement"'));
  assert.ok(articleFormSource.includes('value="important_item"'));
  assert.equal(articleFormSource.includes("entra automaticamente em Últimas"), false);
});

test("publicar sem colocação editorial é uma opção explícita e não transforma uma falha de colocação em rascunho", () => {
  assert.ok(articleFormSource.includes("Publicar sem colocação editorial"));
  assert.ok(articlePageSource.includes("Artigo publicado sem colocação editorial"));
  assert.ok(articlePageSource.includes("O artigo continua disponível para colocação manual"));
});

test("Últimas integra os destinos de transferência e continua a receber por cronologia", () => {
  const targetOptionsStart = editorialPageSource.indexOf("const newsTransferTargetOptions");
  const targetOptionsEnd = editorialPageSource.indexOf("const highlightsEditor", targetOptionsStart);
  assert.ok(targetOptionsStart >= 0 && targetOptionsEnd > targetOptionsStart);
  const targetOptionsBlock = editorialPageSource.slice(targetOptionsStart, targetOptionsEnd);
  assert.ok(targetOptionsBlock.includes('targetSlotType: "editorial_line_item"'));
  assert.ok(targetOptionsBlock.includes('label: "Últimas — acrescentar por cronologia"'));
});

test("Últimas e Contexto podem iniciar transferências pelo mesmo controlo", () => {
  assert.ok(editorialPageSource.includes('sourceSlotType="editorial_line_item"'));
  assert.ok(editorialPageSource.includes('sourceSlotType="side_block"'));
  assert.ok(editorialPageSource.includes("Se o destino estiver ocupado, a notícia substituída entra automaticamente em primeiro na Faixa."));
});

test("o segundo seletor da notícia substituída deixa de existir", () => {
  assert.equal(editorialPageSource.includes('name="displaced_target_choice"'), false);
  assert.equal(editorialPageSource.includes("Enviar a notícia substituída para"), false);
  assert.equal(editorialPageSource.includes("data-displaced-target-field"), false);
  assert.equal(editorialPageSource.includes("data-target-occupied"), false);
  assert.equal(editorialPageSource.includes("needsDisplacedDestination"), false);
  assert.equal(editorialPageSource.includes("newsDisplacedTargetOptionsForSource"), false);
});

test("todas as seis zonas usam o mesmo controlo e informam o destino automático da desalojada", () => {
  for (const slotType of ["headline", "editorial_line_item", "side_block", "highlight", "complement", "important_item"]) {
    assert.ok(editorialPageSource.includes(`sourceSlotType="${slotType}"`), slotType);
  }
  assert.ok(editorialPageSource.includes("A notícia atual entra automaticamente em primeiro na Faixa."));
  assert.equal(editorialPageSource.includes("Escolhe para onde vai a notícia atual"), false);
});


test("Últimas mantém o antetítulo com hora numa única linha", () => {
  assert.match(
    publicMatchdayPageSource,
    /\.public-news-list time \{[\s\S]*?max-width:\s*100%;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
  );
});

test("a confirmação de substituição mantém apenas o seletor do destino", () => {
  assert.ok(editorialPageSource.includes('select name="target_choice"'));
  assert.ok(editorialPageSource.includes("option.getAttribute('data-confirm-message')"));
  assert.ok(editorialPageSource.includes("window.confirm(message)"));
  assert.equal(editorialPageSource.includes("editorial-admin-displaced-target"), false);
  assert.equal(editorialPageSource.includes("updateDisplacedDestination"), false);
  assert.equal(editorialPageSource.includes("displacedSelect"), false);
});
