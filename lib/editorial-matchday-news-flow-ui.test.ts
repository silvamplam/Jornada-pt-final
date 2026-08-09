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

test("Últimas deixa de aparecer como destino de transferência", () => {
  const targetOptionsStart = editorialPageSource.indexOf("const newsTransferTargetOptions");
  const targetOptionsEnd = editorialPageSource.indexOf("const latestDisplacedTargetOptions", targetOptionsStart);
  assert.ok(targetOptionsStart >= 0 && targetOptionsEnd > targetOptionsStart);
  const targetOptionsBlock = editorialPageSource.slice(targetOptionsStart, targetOptionsEnd);
  assert.equal(targetOptionsBlock.includes('targetSlotType: "editorial_line_item"'), false);
});

test("Últimas continua a poder iniciar promoções para as quatro zonas hierárquicas", () => {
  assert.ok(editorialPageSource.includes('sourceSlotType="editorial_line_item"'));
  assert.ok(editorialPageSource.includes("Últimas mantém-se cronológica"));
  assert.ok(editorialPageSource.includes("ela nunca regressa automaticamente a Últimas"));
});

test("uma promoção de Últimas para zona ocupada exige escolher o destino da notícia substituída", () => {
  assert.ok(editorialPageSource.includes('name="displaced_target_choice"'));
  assert.ok(editorialPageSource.includes("Enviar a notícia substituída para"));
  assert.ok(editorialPageSource.includes("data-displaced-target-field"));
  assert.ok(editorialPageSource.includes("needsDisplacedDestination"));
  assert.ok(editorialPageSource.includes("displacedSelect.required = needsDisplacedDestination"));
});

test("o destino da notícia substituída inclui sem colocação, posições livres e Faixa, mas não Últimas", () => {
  assert.ok(editorialPageSource.includes('{ value: "unplaced::", label: "Sem colocação editorial" }'));
  assert.ok(editorialPageSource.includes('value: "headline::"'));
  assert.ok(editorialPageSource.includes('value: `highlight::${order}`'));
  assert.ok(editorialPageSource.includes('value: "complement::"'));
  assert.ok(editorialPageSource.includes('value: "important_item::"'));
  const displacedStart = editorialPageSource.indexOf("const latestDisplacedTargetOptions");
  const displacedEnd = editorialPageSource.indexOf("const highlightsEditor", displacedStart);
  const displacedBlock = editorialPageSource.slice(displacedStart, displacedEnd);
  assert.equal(displacedBlock.includes('editorial_line_item'), false);
});

test("as quatro zonas hierárquicas mantêm o controlo de transferência já validado", () => {
  for (const slotType of ["headline", "highlight", "complement", "important_item"]) {
    assert.ok(editorialPageSource.includes(`sourceSlotType="${slotType}"`), slotType);
  }
  assert.ok(editorialPageSource.includes("As duas mudam de zona; nenhum artigo original é reescrito."));
});


test("Últimas mantém o antetítulo com hora numa única linha", () => {
  assert.match(
    publicMatchdayPageSource,
    /\.public-news-list time \{[\s\S]*?max-width:\s*100%;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
  );
});
