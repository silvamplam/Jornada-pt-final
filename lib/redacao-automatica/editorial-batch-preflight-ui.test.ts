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
const publicationClientSource = source("lib/redacao-automatica/editorial-batch-publication-client.ts");
const imagePreflightSource = source("lib/redacao-automatica/editorial-batch-image-preflight.ts");
const newsroomSource = source("app/admin/editorial/redacao-automatica/page.tsx");
const publicationRouteSource = source("app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts");
const sourcePackagePageSource = source("app/admin/editorial/redacao-automatica/pacotes/[year]/[month]/[id]/page.tsx");

function clientFunction(functionName: string) {
  const syncStart = clientSource.indexOf(`  function ${functionName}`);
  const asyncStart = clientSource.indexOf(`  async function ${functionName}`);
  const start = syncStart >= 0 ? syncStart : asyncStart;
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
  assert.match(clientSource, /analyseEditorialBatchForPublication/);
  assert.match(publicationClientSource, /preflightEditorialArticleBatch\(articleText\)/);
});

test("a Publicação em lote preserva o Dossiê até ao sucesso integral", () => {
  assert.match(clientSource, /EDITORIAL_BATCH_TRANSFER_STORAGE_KEY/);
  assert.match(clientSource, /EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY/);
  assert.match(clientSource, /parseEditorialBatchTransferSourcePackage/);
  assert.match(clientSource, /window\.sessionStorage\.getItem/);
  assert.match(clientSource, /setArticleText\(transferredText\)/);
  assert.match(clientSource, /setSourcePackage\(transferredSourcePackage\)/);

  const loadedIndex =
    clientSource.indexOf(
      "setSourcePackage(transferredSourcePackage);",
    );
  const firstRemovalIndex =
    clientSource.indexOf(
      "window.sessionStorage.removeItem",
    );

  assert.ok(
    loadedIndex >= 0
    && firstRemovalIndex > loadedIndex,
  );

  assert.match(
    clientSource,
    /function clearTransferredBatch[\s\S]*?sessionStorage\.removeItem/,
  );
  assert.match(
    clientSource,
    /await finalizeBatchEditorialFlow\(\);[\s\S]*?clearTransferredBatch\(\);/,
  );
  assert.match(
    clientSource,
    /function handleTextChange[\s\S]*?sessionStorage\.setItem/,
  );
});

test("uma atualização preserva obrigatoriamente a imagem publicada", () => {
  assert.match(
    publicationRouteSource,
    /image_url:\s*existing\.image_url/,
  );

  assert.match(
    publicationRouteSource,
    /image_caption:\s*existing\.image_caption/,
  );

  const updateStart =
    publicationRouteSource.indexOf(
      'if (publicationMode === "update")',
    );

  const updateEnd =
    publicationRouteSource.indexOf(
      "\n    if (existing)",
      updateStart,
    );

  assert.ok(
    updateStart >= 0
    && updateEnd > updateStart,
  );

  const updateSource =
    publicationRouteSource.slice(
      updateStart,
      updateEnd,
    );

  assert.doesNotMatch(
    updateSource,
    /missing-image-url/,
  );

  assert.doesNotMatch(
    updateSource,
    /image_url:\s*imageUrl/,
  );

  assert.match(
    clientSource,
    /const requiresImage =\s*planItem\.mode === "create";/,
  );

  assert.match(
    clientSource,
    /planItem\.mode === "update"\s*\?\s*null/,
  );

  assert.match(
    clientSource,
    /planItem\.mode === "create"\s*&& !imageUrl/,
  );

  assert.match(
    clientSource,
    /IMAGENS PUBLICADAS PRESERVADAS/,
  );

  assert.match(
    clientSource,
    /IMAGEM PUBLICADA PRESERVADA/,
  );

  assert.match(
    clientSource,
    /A imagem atualmente publicada também será preservada/,
  );
});

test("um Dossiê de atualização recupera e bloqueia a Jornada canónica", () => {
  assert.match(sourcePackagePageSource, /resolveUpdateMatchdayId/);
  assert.match(sourcePackagePageSource, /updateArticleCount/);
  assert.match(sourcePackagePageSource, /matchdayId: updateMatchdayId/);
  assert.match(clientSource, /transferredSourcePackage\?\.matchdayId/);
  assert.match(clientSource, /setCompetitionId\(transferredCompetition\.id\)/);
  assert.match(clientSource, /setSeasonId\(transferredSeason\.id\)/);
  assert.match(clientSource, /setMatchdayId\(transferredMatchday\.id\)/);
  assert.match(clientSource, /sourcePackageContextLocked/);
  assert.match(
    clientSource,
    /ATUALIZAÇÃO DE \$\{sourcePackageUpdateCount\} ARTIGOS PUBLICADOS/,
  );
});

test("a página usa diretamente a função pura de pré-flight de imagens", () => {
  assert.match(clientSource, /from "@\/lib\/redacao-automatica\/editorial-batch-image-preflight"/);
  assert.match(
    clientSource,
    /preflightEditorialBatchImages\(\s*analysedArticleKeys,\s*selectedImages,/,
  );
  assert.match(clientSource, /sourcePackage\?\.outputImages/);
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

test("a análise deixou de exigir o botão intermédio Analisar lote", () => {
  assert.doesNotMatch(clientSource, /ANALISAR LOTE|analyseBatch/);
  assert.ok(clientSource.includes("A análise é automática quando o lote"));
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

test("alterar o texto invalida imediatamente o plano anterior", () => {
  assert.match(
    clientSource,
    /function handleTextChange[\s\S]*?resetPublicationRun\(\);[\s\S]*?setArticleText\(nextText\);/,
  );
  assert.match(
    clientSource,
    /function resetPublicationRun[\s\S]*?setPublicationPlan\(null\);/,
  );
  assert.match(clientSource, /publicationPreflightAbortRef\.current\?\.abort\(\)/);
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

test("a análise automática reaproveita os ficheiros já selecionados", () => {
  assert.doesNotMatch(clientFunction("resetPublicationRun"), /setSelectedImages/);
  assert.match(
    clientSource,
    /const imagePreflight = useMemo\([\s\S]*?preflightEditorialBatchImages\(\s*analysedArticleKeys,\s*selectedImages,/,
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

test("o painel final mostra checking, erro/retry e publicação sem CTA técnico", () => {
  assert.match(publicationClientSource, /"PUBLICAR EM ÚLTIMAS"/);
  assert.match(publicationClientSource, /"RETOMAR PUBLICAÇÃO"/);
  assert.match(clientSource, /const publicationPanelVisible = Boolean\(/);
  assert.match(clientSource, /canPublish[\s\S]*?\|\| isCheckingPublication[\s\S]*?\|\| publicationPlan[\s\S]*?\|\| publicationError/);
  assert.match(clientSource, /\{publicationPanelVisible \? \(/);
  assert.ok(clientSource.includes("A verificar destino editorial…"));
  assert.ok(clientSource.includes("Tentar novamente"));
  assert.match(clientSource, /disabled=\{!canPublish \|\| isPublishing \|\| isChecking \|\| allPublished\}/);
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
  assert.match(publicationRouteSource, /initialPlacement: "none"/);
  assert.match(
    publicationRouteSource,
    /ensurePublishedArticleInLatest\([\s\S]{0,160}deferGlobalSync: true/,
  );
  assert.match(publicationRouteSource, /finalizePublishedArticlesInLatestBatch/);
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
  assert.match(clientSource, /requestEditorialBatchPublicationPreflight[\s\S]*?\.\.\.\(sourcePackage \? \{ sourcePackage \} : \{\}\)/);
  assert.match(publicationClientSource, /action: "preflight"[\s\S]*?\.\.\.\(sourcePackage \? \{ sourcePackage \} : \{\}\)/);
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
  assert.match(
    publicationRouteSource,
    /await ensurePublishedArticleInLatest\(\s*article\.matchday_id,\s*article\.id,\s*\{ deferGlobalSync: true \},?\s*\)/,
  );
  assert.match(publicationRouteSource, /for \([\s\S]{0,120}of affectedMatchdayIds[\s\S]{0,160}finalizePublishedArticlesInLatestBatch/);
});

test("uma falha pára o lote e deixa os artigos seguintes como não tentados", () => {
  assert.match(clientSource, /for \(const pendingItem of plan\.slice\(index \+ 1\)\)/);
  assert.match(clientSource, /status: "not_attempted"/);
  assert.match(
    clientSource,
    /await finalizeBatchEditorialFlow\(\)[\s\S]{0,700}setPublicationError\(\s*`Publicação interrompida no artigo/,
  );
  assert.match(clientSource, /return;/);
});

test("o retry reutiliza imagem já carregada e reconcilia artigo publicado em Últimas", () => {
  assert.match(clientSource, /uploadedImageUrlsRef\.current\[planItem\.key\]/);
  assert.match(clientSource, /publicationPlanRef\.current\s*\?\?\s*await requestPublicationPreflight\(\)/);
  assert.match(publicationRouteSource, /if \(existing\)/);
  assert.match(
    publicationRouteSource,
    /await ensurePublishedArticleInLatest\(\s*matchdayId,\s*existing\.id,\s*\{ deferGlobalSync: true \},?\s*\)/,
  );
  assert.match(clientSource, /published_missing_usage/);
  assert.match(clientSource, /FALTA MARCAR FONTES/);
});

test("o autor do lote mantém o valor editorial atual por defeito e é editável", () => {
  assert.match(clientSource, /const DEFAULT_BATCH_AUTHOR = "Silvestre Chícharo"/);
  assert.match(clientSource, /htmlFor="batch-author"/);
  assert.match(clientSource, /value=\{author\}/);
  assert.match(clientSource, /onChange=\{\(event\) => handleAuthorChange\(event\.target\.value\)\}/);
});

test("o estado global aceita imagem nova ou preservação da imagem publicada", () => {
  assert.match(
    clientSource,
    /const globallyPrepared =[\s\S]*?preflight\.ready[\s\S]*?contextComplete[\s\S]*?preservesPublishedImages[\s\S]*?\|\| imagePreflight\.ready[\s\S]*?authorReady/,
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

test("um Dossiê reutilizado resolve o artigo original por ID apesar de um título novo", () => {
  assert.match(
    publicationRouteSource,
    /updateTarget\s*\?\s*await readExistingArticleById\(updateTarget\.publishedArticleId\)/,
  );
  assert.match(
    publicationRouteSource,
    /const slug = updateTarget\?\.publishedSlug\s*\?\?\s*normalizeEditorialArticleSlug\(article\.title\)/,
  );
  assert.match(
    publicationRouteSource,
    /updateTargetFromDossier: Boolean\(item\.updateTarget\)/,
  );
  assert.match(clientSource, /Este Dossiê corresponde a um artigo já publicado/);
});

test("o alvo herdado é revalidado e não admite confirmação ou criação arbitrária", () => {
  assert.match(publicationRouteSource, /editorialBatchUpdateTargetIssue/);
  assert.match(publicationRouteSource, /confirmed-update-target-mismatch/);
  assert.match(publicationRouteSource, /invalid-dossier-update-target/);
  assert.match(
    publicationRouteSource,
    /updateArticleId !== updateTarget\.publishedArticleId/,
  );
  assert.match(
    publicationRouteSource,
    /publicationMode !== "update" && publicationMode !== "resume"/,
  );
  assert.match(
    publicationRouteSource,
    /não pode criar automaticamente um segundo artigo/,
  );
});

test("a atualização por alvo mantém identidade, URL, data e histórico de utilização", () => {
  assert.match(
    publicationRouteSource,
    /updateEditorialArticle\(\s*existing\.id/,
  );
  assert.match(publicationRouteSource, /slug:\s*existing\.slug\s*\?\?\s*slug/);
  assert.match(publicationRouteSource, /published_at:\s*existing\.published_at/);
  assert.match(
    publicationRouteSource,
    /ensurePublishedArticleInLatest\(\s*matchdayId,\s*existing\.id/,
  );
  assert.match(
    publicationRouteSource,
    /markSourcePackageUsed\(\s*sourcePackage,\s*article\.index,\s*existing\.id/,
  );
});

test("pacotes normais mantêm os caminhos create, resume e salvaguarda por slug", () => {
  assert.match(publicationRouteSource, /readExistingArticleBySlug\(slug\)/);
  assert.match(publicationRouteSource, /\? "resume" as const\s*: "create" as const/);
  assert.match(publicationRouteSource, /createEditorialArticle/);
  assert.match(publicationRouteSource, /slug-collision/);
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
test("o lote válido dispara automaticamente um único preflight server-side", () => {
  assert.match(
    clientSource,
    /useEffect\(\(\) => \{[\s\S]*?shouldRequestAutomaticEditorialBatchPreflight\([\s\S]*?ready: canPublish[\s\S]*?analyseEditorialBatchForPublication\([\s\S]*?requestServerPreflight:[\s\S]*?requestEditorialBatchPublicationPreflight/,
  );
  assert.match(
    clientSource,
    /const publicationCanPublish =[\s\S]*?canPublish[\s\S]*?Boolean\(publicationPlan\)[\s\S]*?updatesConfirmed/,
  );
  assert.match(
    clientSource,
    /const canPublish = Boolean\([\s\S]*?preflight\.ready[\s\S]*?contextComplete[\s\S]*?imagePreflight\.ready[\s\S]*?author\.trim\(\)/,
  );
  assert.match(clientSource, /lastRequestedPublicationFingerprintRef/);
  assert.match(clientSource, /activePublicationFingerprintRef/);
  assert.match(clientSource, /publicationRequestSequenceRef/);
  assert.match(clientSource, /isEditorialBatchPreflightResponseCurrent/);
  assert.doesNotMatch(clientSource, /ANALISAR LOTE|analyseBatch/);
});

test("uma atualização fica explícita com um único CTA antes de publicar", () => {
  assert.ok(publicationClientSource.includes("ATUALIZAÇÃO DETETADA"));
  assert.ok(publicationClientSource.includes("ATUALIZAÇÃO CONFIRMADA"));
  assert.ok(publicationClientSource.includes("ATUALIZAR ARTIGO"));
  assert.ok(clientSource.includes("CONFIRMAR ATUALIZAÇÃO"));
  assert.ok(
    clientSource.includes(
      "Este Dossiê corresponde a um artigo já publicado. A atualização manterá o mesmo artigo e o mesmo URL.",
    ),
  );
  assert.ok(clientSource.includes("URL existente:"));
  assert.doesNotMatch(publicationClientSource, /AGUARDA VERIFICAÇÃO|AGUARDA CONFIRMAÇÃO|CONFIRMAR ATUALIZAÇÃO ACIMA|PRONTO PARA ATUALIZAR/);
});

test("estados editoriais são texto ou badge e nunca botões falsos", () => {
  const buttonBlocks = clientSource.match(/<button[\s\S]*?<\/button>/g) ?? [];

  for (const label of [
    "AGUARDA VERIFICAÇÃO",
    "ATUALIZAÇÃO CONFIRMADA",
    "LOTE PUBLICADO",
  ]) {
    assert.equal(
      buttonBlocks.some((button) => button.includes(label)),
      false,
      `${label} não pode ser um botão`,
    );
  }

  assert.match(clientSource, /<strong className=\{`\$\{styles\.publicationStatus\}/);
  assert.match(clientSource, /<span className=\{styles\.confirmedState\}>Atualização confirmada<\/span>/);
});

test("todos os artigos do lote apresentam o destino determinado", () => {
  assert.match(clientSource, /<h3 id="batch-publication-destinations-title">Destino por artigo<\/h3>/);
  assert.match(clientSource, /\{plan\.map\(\(item\) => \{/);
  assert.ok(clientSource.includes("NOVO ARTIGO"));
  assert.ok(clientSource.includes("PUBLICAÇÃO JÁ PREPARADA"));
  assert.ok(clientSource.includes("ATUALIZAÇÃO BLOQUEADA"));
  assert.match(clientSource, /updateCandidates\.length > 0/);
});
test("imagens sem prefixo podem ser associadas explicitamente aos artigos", () => {
  const first = {
    name: "Alverca-Santa clara.webp",
    type: "image/webp",
    size: 101,
  };

  const second = {
    name: "Arouca-Mar.webp",
    type: "image/webp",
    size: 202,
  };

  const result = preflightEditorialBatchImages(
    ["01", "02"],
    [second, first],
    [],
    [
      { key: "01", file: first },
      { key: "02", file: second },
    ],
  );

  assert.equal(result.ready, true);
  assert.equal(result.associated, 2);
  assert.equal(result.missing, 0);
  assert.equal(result.problems, 0);

  assert.deepEqual(
    result.articles.map((item) => item.file?.name),
    [
      "Alverca-Santa clara.webp",
      "Arouca-Mar.webp",
    ],
  );

  assert.deepEqual(result.fileProblems, []);
});