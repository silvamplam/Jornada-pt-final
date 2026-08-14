import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { preflightEditorialArticleBatch } from "./editorial-batch-parser";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const routeSource = source("app/admin/editorial/redacao-automatica/publicacao-lote/page.tsx");
const clientSource = source("app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx");
const newsroomSource = source("app/admin/editorial/redacao-automatica/page.tsx");

function article(title: string, subtitle = `Pós-título ${title}`) {
  return `[JORNADA_ARTIGO_V1]
ANTETÍTULO
Liga Portugal

TÍTULO
${title}

PÓS-TÍTULO
${subtitle}

CORPO
Corpo de ${title}.
[/JORNADA_ARTIGO_V1]`;
}

test("existe a rota de Publicação em lote no App Router", () => {
  assert.match(routeSource, /export default async function EditorialBatchPreflightPage/);
  assert.match(routeSource, /<h1>Publicação em lote<\/h1>/);
});

test("a Redação Automática oferece acesso lateral à Publicação em lote", () => {
  assert.ok(newsroomSource.includes('/admin/editorial/redacao-automatica/publicacao-lote'));
  assert.ok(newsroomSource.includes('>Publicação em lote</a>'));
});

test("a página usa diretamente o pré-flight batch existente", () => {
  assert.match(clientSource, /from "@\/lib\/redacao-automatica\/editorial-batch-parser"/);
  assert.match(clientSource, /preflightEditorialArticleBatch\(articleText\)/);
});

test("a UI não duplica a interpretação de JORNADA_ARTIGO_V1", () => {
  assert.match(clientSource, /EDITORIAL_BATCH_ARTICLE_START_MARKER/);
  assert.doesNotMatch(clientSource, /\[JORNADA_ARTIGO_V1\]/);
  assert.doesNotMatch(clientSource, /split\(.*JORNADA_ARTIGO_V1/);
  assert.doesNotMatch(clientSource, /matchAll\(.*JORNADA_ARTIGO_V1/);
});

test("os três seletores de contexto têm labels reais", () => {
  assert.match(clientSource, /htmlFor="batch-competition"[\s\S]*?<span>Competição<\/span>/);
  assert.match(clientSource, /htmlFor="batch-season"[\s\S]*?<span>Época<\/span>/);
  assert.match(clientSource, /htmlFor="batch-matchday"[\s\S]*?<span>Jornada<\/span>/);
});

test("Competição filtra épocas e limpa Época e Jornada", () => {
  assert.match(clientSource, /seasons\.filter\(\(season\) => season\.competition_id === competitionId\)/);
  assert.match(
    clientSource,
    /function handleCompetitionChange[\s\S]*?setCompetitionId\(nextCompetitionId\);[\s\S]*?setSeasonId\(""\);[\s\S]*?setMatchdayId\(""\);/,
  );
});

test("Época filtra e limpa a Jornada incompatível", () => {
  assert.match(clientSource, /matchdays\.filter\(\(matchday\) => matchday\.season_id === seasonId\)/);
  assert.match(
    clientSource,
    /function handleSeasonChange[\s\S]*?setSeasonId\(nextSeasonId\);[\s\S]*?setMatchdayId\(""\);/,
  );
});

test("a prontidão do contexto confirma as relações entre os três IDs", () => {
  assert.match(clientSource, /selectedSeason\.competition_id === selectedCompetition\.id/);
  assert.match(clientSource, /selectedMatchday\.season_id === selectedSeason\.id/);
  assert.match(clientSource, /preflight\.ready && contextComplete/);
});

test("existe textarea editorial acessível", () => {
  assert.match(clientSource, /htmlFor="batch-article-text"/);
  assert.match(clientSource, /<textarea[\s\S]*?id="batch-article-text"/);
});

test("existe botão semântico Analisar lote", () => {
  assert.match(clientSource, /<button type="button" onClick=\{analyseBatch\}>Analisar lote<\/button>/);
});

test("o contrato real fornece total, válidos, inválidos e chaves 01 02 03", () => {
  const result = preflightEditorialArticleBatch([
    article("Título A"),
    article("Título B"),
    article("Título C"),
  ].join("\n\n"));

  assert.deepEqual(
    {
      total: result.total,
      valid: result.valid,
      invalid: result.invalid,
      ready: result.ready,
      keys: result.articles.map((item) => item.key),
    },
    { total: 3, valid: 3, invalid: 0, ready: true, keys: ["01", "02", "03"] },
  );
  assert.match(clientSource, /<dt>Artigos encontrados<\/dt>/);
  assert.match(clientSource, /<dt>Válidos<\/dt>/);
  assert.match(clientSource, /<dt>Inválidos<\/dt>/);
});

test("a UI apresenta a key fornecida pelo parser sem segunda numeração", () => {
  assert.match(clientSource, /<li key=\{row\.key\}/);
  assert.match(clientSource, /aria-label=\{`Artigo \$\{row\.key\}`\}>\{row\.key\}/);
  assert.doesNotMatch(clientSource, /row\.index.*padStart|index \+ 1/);
});

test("problemas globais e por artigo são separados", () => {
  const result = preflightEditorialArticleBatch(`${article("Título A")}\n\ntexto exterior`);
  assert.ok(result.issues.some((issue) => issue.code === "text_outside_blocks" && issue.index === undefined));
  assert.match(clientSource, /const globalIssues = preflight\.issues\.filter\(\(issue\) => issue\.index === undefined\)/);
  assert.match(clientSource, />Problemas do lote<\/h3>/);
  assert.match(clientSource, />Problemas:<\/p>/);
});

test("artigo sem título utilizável recebe fallback neutro", () => {
  const result = preflightEditorialArticleBatch(article(""));
  assert.equal(result.issues.some((issue) => issue.code === "empty_title" && issue.key === "01"), true);
  assert.match(clientSource, /\|\| "Sem título"/);
});

test("alterar o texto invalida a análise anterior e pede nova análise", () => {
  assert.match(
    clientSource,
    /function handleTextChange[\s\S]*?if \(preflight\)[\s\S]*?setPreflight\(null\);[\s\S]*?setTextChangedAfterAnalysis\(true\);/,
  );
  assert.ok(clientSource.includes("Texto alterado — analisar novamente."));
});

test("estados individuais usam texto VÁLIDO e INVÁLIDO além da cor", () => {
  assert.match(clientSource, /isValid \? "VÁLIDO" : "INVÁLIDO"/);
  assert.match(clientSource, /isValid \? styles\.validArticle : styles\.invalidArticle/);
});

test("não existem controlos de publicação nem de imagens", () => {
  assert.doesNotMatch(clientSource, /<button[^>]*>Publicar lote<\/button>/i);
  assert.doesNotMatch(clientSource, /type="file"|accept="image|Selecionar imagens/i);
});

test("o cliente não importa serviços server-only nem executa writes", () => {
  assert.doesNotMatch(clientSource, /editorial-article-service|server-only|supabase/i);
  assert.doesNotMatch(clientSource, /createEditorialArticle|placePublishedArticleInitially|fetch\(|writeSupabaseAdmin/);
  assert.doesNotMatch(routeSource, /writeSupabaseAdmin|createEditorialArticle|placePublishedArticleInitially/);
  assert.match(routeSource, /fetchSupabaseAdminTable/);
});
