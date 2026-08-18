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
const publicationRouteSource = source("app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts");

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

test("a Publicação em lote recebe diretamente o texto colado no pacote editorial", () => {
  assert.match(clientSource, /EDITORIAL_BATCH_TRANSFER_STORAGE_KEY/);
  assert.match(clientSource, /EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY/);
  assert.match(clientSource, /parseEditorialBatchTransferSourcePackage/);
  assert.match(clientSource, /window\.sessionStorage\.getItem/);
  assert.match(clientSource, /window\.sessionStorage\.removeItem/);
  assert.match(clientSource, /setArticleText\(transferredText\)/);
  assert.match(clientSource, /setPreflight\(preflightEditorialArticleBatch\(transferredText\)\)/);
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
  assert.match(clientSource, /<button type="button"[^>]*onClick=\{analyseBatch\}>Analisar lote<\/button>/);
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
  assert.doesNotMatch(clientSource, /row\.index.*padStart/);
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

test("a publicação só aparece depois do pré-flight global e suporta retoma", () => {
  assert.match(clientSource, /"PUBLICAR LOTE"/);
  assert.match(clientSource, /"RETOMAR PUBLICAÇÃO"/);
  assert.match(clientSource, /preflight && imagePreflight && \(canPublish \|\| Object\.keys\(publicationStates\)\.length > 0\)/);
  assert.match(clientSource, /disabled=\{!canPublish \|\| isPublishing \|\| allPublished\}/);
  assert.match(clientSource, /publishingRef\.current/);
});

test("o upload do lote reutiliza exatamente a rota assinada existente e mantém o helper puro", () => {
  assert.match(clientSource, /\/api\/admin\/editorial\/artigos\/upload-image\/sign/);
  assert.match(clientSource, /method: "PUT"/);
  assert.match(clientSource, /"x-upsert": "false"/);
  assert.match(clientSource, /imageContentType\(file\)/);
  assert.doesNotMatch(imagePreflightSource, /supabase|fetch\(|openai|createEditorialArticle|write|upload|signedUrl/i);
  assert.doesNotMatch(routeSource, /writeSupabaseAdmin|createEditorialArticle|placePublishedArticleInitially/);
  assert.match(routeSource, /fetchSupabaseAdminTable/);
});

test("a API de lote é apenas orquestração sobre artigo canónico e Últimas", () => {
  assert.match(publicationRouteSource, /createEditorialArticle/);
  assert.match(publicationRouteSource, /resolveCanonicalArticleContext/);
  assert.match(publicationRouteSource, /normalizeEditorialArticleSlug/);
  assert.match(publicationRouteSource, /ensurePublishedArticleInLatest/);
  assert.match(publicationRouteSource, /markEditorialSourcePackageArticleUsed/);
  assert.match(publicationRouteSource, /source-usage-mark-failed/);
  assert.match(publicationRouteSource, /initialPlacement: "editorial_line_item"/);
  assert.doesNotMatch(publicationRouteSource, /writeSupabaseAdmin|writeSupabaseAdminReturning/);
  assert.doesNotMatch(publicationRouteSource, /matchday_latest_news/);
});

test("o pre-flight servidor é read-only e bloqueia colisões antes do upload", () => {
  const start = publicationRouteSource.indexOf("async function preflightPublication");
  const end = publicationRouteSource.indexOf("async function publishItem", start);
  const preflightSource = publicationRouteSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(preflightSource, /prepareBatch/);
  assert.doesNotMatch(preflightSource, /createEditorialArticle|ensurePublishedArticleInLatest/);
  assert.match(publicationRouteSource, /duplicate-slug-in-batch/);
  assert.match(publicationRouteSource, /slug-collision/);
});

test("o servidor deriva o contexto só a partir da Jornada", () => {
  assert.match(publicationRouteSource, /resolveCanonicalArticleContext\(\{ competition_id: null, season_id: null, matchday_id: matchdayId \}\)/);
  assert.match(publicationRouteSource, /matchday_id: matchdayId/);
  assert.match(publicationRouteSource, /competition_id: null/);
  assert.match(publicationRouteSource, /season_id: null/);
});

test("a publicação vinda de pacote usa a hora da fonte mais recente por artigo", () => {
  assert.match(clientSource, /action: "preflight"[\s\S]*?\.\.\.\(sourcePackage \? \{ sourcePackage \} : \{\}\)/);
  assert.match(publicationRouteSource, /entry\.publishedAtPrecision === "instant"/);
  assert.match(publicationRouteSource, /parsePublishedAt\(\s*entry\.publishedAt,?\s*\)/);
  assert.doesNotMatch(publicationRouteSource, /type SourcePublicationRow/);
  assert.doesNotMatch(publicationRouteSource, /publishedAtBySourceId/);
  assert.match(publicationRouteSource, /sourcePublishedAt\.get\(\s*item\.article\.index,?\s*\)/);
  assert.match(publicationRouteSource, /missing-source-published-at/);
  assert.match(publicationRouteSource, /resume-source-time-mismatch/);
});

test("o lote manual sem pacote mantém uma ordem determinística independente do upload", () => {
  assert.match(publicationRouteSource, /baseTimeMs\s*-\s*\(item\.article\.index\s*-\s*1\)/);
  assert.match(publicationRouteSource, /resume-order-mismatch/);
});

test("existe reconciliação controlada para corrigir lotes já publicados com a hora das fontes", () => {
  assert.match(publicationRouteSource, /action === "reconcile_source_times"/);
  assert.match(publicationRouteSource, /updateEditorialArticle\(article\.id/);
  assert.match(publicationRouteSource, /await ensurePublishedArticleInLatest\(article\.matchday_id, article\.id\)/);
});

test("uma falha pára o lote e deixa os artigos seguintes como não tentados", () => {
  assert.match(clientSource, /for \(const pendingItem of plan\.slice\(index \+ 1\)\)/);
  assert.match(clientSource, /status: "not_attempted"/);
  assert.match(clientSource, /setPublicationError\(`Publicação interrompida no artigo/);
  assert.match(clientSource, /return;/);
});

test("o retry reutiliza imagem já carregada e reconcilia artigo publicado em Últimas", () => {
  assert.match(clientSource, /uploadedImageUrlsRef\.current\[planItem\.key\]/);
  assert.match(clientSource, /publicationPlanRef\.current\s*\?\?\s*await requestPublicationPreflight\(\)/);
  assert.match(publicationRouteSource, /if \(existing\)/);
  assert.match(publicationRouteSource, /await ensurePublishedArticleInLatest\(matchdayId, existing\.id\)/);
  assert.match(clientSource, /published_missing_usage/);
  assert.match(clientSource, /FALTA MARCAR FONTES/);
});

test("o autor do lote mantém o valor editorial atual por defeito e é editável", () => {
  assert.match(clientSource, /const DEFAULT_BATCH_AUTHOR = "Silvestre Chícharo"/);
  assert.match(clientSource, /htmlFor="batch-author"/);
  assert.match(clientSource, /value=\{author\}/);
  assert.match(clientSource, /onChange=\{\(event\) => handleAuthorChange\(event\.target\.value\)\}/);
});

test("o estado global do lote inclui artigos, contexto, imagens e autor", () => {
  assert.match(
    clientSource,
    /const globallyPrepared = preflight\.ready && contextComplete && imagePreflight\.ready && authorReady;/,
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

test("uma colisão de Dossiê exige confirmação explícita antes de atualizar o artigo canónico", () => {
  assert.match(
    clientSource,
    /CONFIRMAR ATUALIZAÇÃO/,
  );

  assert.match(
    clientSource,
    /confirmedUpdates/,
  );

  assert.match(
    clientSource,
    /planItem\.mode === "update"/,
  );

  assert.match(
    publicationRouteSource,
    /"update_required"/,
  );

  assert.match(
    publicationRouteSource,
    /publicationMode === "update"/,
  );

  assert.match(
    publicationRouteSource,
    /updateEditorialArticle\(\s*existing\.id/,
  );

  assert.match(
    publicationRouteSource,
    /published_at:\s*existing\.published_at/,
  );

  assert.match(
    publicationRouteSource,
    /update-target-mismatch/,
  );
});


test("saídas do mesmo Dossiê preservam a hora real da fonte sem offsets artificiais", () => {
  assert.doesNotMatch(
    publicationRouteSource,
    /duplicateOffsetBySourceGroup/,
  );

  assert.match(
    publicationRouteSource,
    /publishedAtByArticle\.set\(\s*output\.position,\s*sourcePublishedAt,\s*\)/,
  );
});
