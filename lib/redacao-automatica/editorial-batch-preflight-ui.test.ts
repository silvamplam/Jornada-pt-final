import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { preflightEditorialArticleBatch } from "./editorial-batch-parser";
import {
  EDITORIAL_BATCH_IMAGE_ACCEPT,
  preflightEditorialBatchImages,
} from "./editorial-batch-image-preflight";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const routeSource = source("app/admin/editorial/redacao-automatica/publicacao-lote/page.tsx");
const clientSource = source("app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx");
const imagePreflightSource = source("lib/redacao-automatica/editorial-batch-image-preflight.ts");
const newsroomSource = source("app/admin/editorial/redacao-automatica/page.tsx");

function clientFunction(functionName: string) {
  const start = clientSource.indexOf(`  function ${functionName}`);
  assert.notEqual(start, -1, `Função ${functionName} não encontrada`);
  const end = clientSource.indexOf("\n  }", start) + "\n  }".length;
  assert.ok(end >= start, `Fim da função ${functionName} não encontrado`);
  return clientSource.slice(start, end);
}

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

test("a página usa diretamente a função pura de pré-flight de imagens", () => {
  assert.match(clientSource, /from "@\/lib\/redacao-automatica\/editorial-batch-image-preflight"/);
  assert.match(
    clientSource,
    /preflightEditorialBatchImages\(analysedArticleKeys, selectedImages\)/,
  );
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
  assert.doesNotMatch(clientFunction("handleTextChange"), /setSelectedImages/);
  assert.match(clientSource, /imagePreflight={imagePreflight}/);
});

test("estados individuais usam texto VÁLIDO e INVÁLIDO além da cor", () => {
  assert.match(clientSource, /isValid \? "VÁLIDO" : "INVÁLIDO"/);
  assert.match(clientSource, /isValid \? styles\.validArticle : styles\.invalidArticle/);
});

test("existe uma única seleção multiple com accept limitado aos formatos esperados", () => {
  assert.match(clientSource, /type="file"\s+multiple\s+accept={EDITORIAL_BATCH_IMAGE_ACCEPT}/);
  assert.ok(clientSource.includes("SELECIONAR IMAGENS"));
  assert.deepEqual(EDITORIAL_BATCH_IMAGE_ACCEPT.split(","), [
    "image/jpeg",
    "image/png",
    "image/webp",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
  ]);
  assert.equal((clientSource.match(/type="file"/g) ?? []).length, 1);
});

test("a associação não usa a posição do FileList nem a ordem do Windows", () => {
  assert.match(clientFunction("handleImagesSelected"), /Array\.from\(files\)/);
  assert.doesNotMatch(clientFunction("handleImagesSelected"), /article|key|index|padStart/i);
  assert.match(imagePreflightSource, /const FILE_PREFIX = \/\^\(\\d\{2\}\)-\//);
  assert.match(imagePreflightSource, /\[\.\.\.inputFiles\]\.sort\(compareFiles\)/);

  const result = preflightEditorialBatchImages(["01", "02", "03"], [
    { name: "03-benfica.webp", type: "image/webp", size: 3 },
    { name: "01-porto.jpg", type: "image/jpeg", size: 1 },
    { name: "02-sporting.png", type: "image/png", size: 2 },
  ]);
  assert.deepEqual(result.articles.map((item) => item.file?.name), [
    "01-porto.jpg",
    "02-sporting.png",
    "03-benfica.webp",
  ]);
});

test("a UI mostra associação, falta e duplicados por artigo", () => {
  assert.match(clientSource, /imageResult\.file\?\.name/);
  assert.match(clientSource, /<strong>{imageResult\.message}<\/strong>/);
  assert.match(clientSource, /imageResult\?\.candidates[\s\S]*?\.map\(\(file\) => file\.name\)/);
  assert.ok(imagePreflightSource.includes('message: "IMAGEM ASSOCIADA"'));
  assert.ok(imagePreflightSource.includes('message: "IMAGEM EM FALTA"'));
  assert.ok(imagePreflightSource.includes("DUAS IMAGENS COM O PREFIXO"));
});

test("a UI mostra ficheiros órfãos e inválidos sem os ignorar", () => {
  assert.match(clientSource, /imagePreflight\.fileProblems\.map/);
  assert.match(clientSource, /<strong>{problem\.file\.name}<\/strong>/);
  assert.match(clientSource, /<span>{problem\.message}<\/span>/);
  assert.ok(imagePreflightSource.includes("PREFIXO EM FALTA OU INVÁLIDO"));
  assert.ok(imagePreflightSource.includes("NÃO EXISTE ARTIGO"));
  assert.ok(imagePreflightSource.includes("FORMATO NÃO SUPORTADO"));
});

test("uma nova análise reaproveita os ficheiros já selecionados", () => {
  assert.doesNotMatch(clientFunction("analyseBatch"), /setSelectedImages/);
  assert.match(
    clientSource,
    /const imagePreflight = useMemo\([\s\S]*?preflightEditorialBatchImages\(analysedArticleKeys, selectedImages\)/,
  );
});

test("mudar Competição, Época ou Jornada não apaga a seleção de imagens", () => {
  assert.doesNotMatch(clientFunction("handleCompetitionChange"), /setSelectedImages/);
  assert.doesNotMatch(clientFunction("handleSeasonChange"), /setSelectedImages/);
  assert.doesNotMatch(clientSource, /onChange={\(event\) => setMatchdayId\(event\.target\.value\)}[\s\S]{0,80}setSelectedImages/);
});

test("uma nova escolha substitui integralmente a seleção anterior", () => {
  assert.match(
    clientFunction("handleImagesSelected"),
    /setSelectedImages\(files \? Array\.from\(files\) : \[\]\)/,
  );
  assert.doesNotMatch(clientFunction("handleImagesSelected"), /\.concat|\.push|\.add|\.set\(/);
});

test("as previews são locais e os object URLs são sempre libertados", () => {
  assert.match(clientSource, /URL\.createObjectURL\(file\)/);
  assert.match(clientSource, /URL\.revokeObjectURL\(previewUrl\)/);
  assert.match(clientSource, /return \(\) =>/);
  assert.match(clientSource, /src={previewUrl}/);
});

test("não existem controlos de publicação", () => {
  assert.doesNotMatch(clientSource, /<button[^>]*>Publicar lote<\/button>/i);
});

test("o cliente e o helper não fazem upload, rede, IA nem writes", () => {
  assert.doesNotMatch(clientSource, /editorial-article-service|server-only|supabase/i);
  assert.doesNotMatch(clientSource, /createEditorialArticle|placePublishedArticleInitially|fetch\(|writeSupabaseAdmin|signedUrl|upload\(/i);
  assert.doesNotMatch(imagePreflightSource, /supabase|fetch\(|openai|createEditorialArticle|write|upload|signedUrl/i);
  assert.doesNotMatch(routeSource, /writeSupabaseAdmin|createEditorialArticle|placePublishedArticleInitially/);
  assert.match(routeSource, /fetchSupabaseAdminTable/);
});
test("o estado global do lote inclui artigos, contexto e imagens", () => {
  assert.match(
    clientSource,
    /const globallyPrepared = preflight\.ready && contextComplete && imagePreflight\.ready;/,
  );
  assert.match(
    clientSource,
    /className=\{globallyPrepared \? styles\.readyBadge : styles\.invalidBadge\}/,
  );
  assert.match(
    clientSource,
    /\{globallyPrepared \? "PRÉ-FLIGHT VÁLIDO" : "PRÉ-FLIGHT COM PROBLEMAS"\}/,
  );
});
