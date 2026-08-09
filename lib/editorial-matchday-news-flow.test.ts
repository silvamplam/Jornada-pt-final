import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const flowSource = source("lib/editorial-matchday-news-flow.ts");
const articleRouteSource = source("app/api/admin/editorial/artigos/route.ts");
const gestorRouteSource = source("app/api/admin/gestor/route.ts");


test("publicar deixou de significar entrada automática em Últimas", () => {
  assert.ok(articleRouteSource.includes("placePublishedArticleInitially"));
  assert.ok(articleRouteSource.includes('formData.get("initial_placement")'));
  assert.equal(articleRouteSource.includes("await ensurePublishedArticleInLatest(payload.matchday_id"), false);
  assert.equal(articleRouteSource.includes('error: "latest-placement-failed"'), false);
  assert.ok(articleRouteSource.includes('placement_error: "1"'));
});

test("a primeira publicação pode ficar sem colocação ou escolher uma das cinco zonas", () => {
  for (const value of ["none", "editorial_line_item", "headline", "highlight", "complement", "important_item"]) {
    assert.ok(articleRouteSource.includes(`case "${value}"`) || value === "none", value);
  }
  assert.ok(flowSource.includes("export async function placePublishedArticleInitially"));
  assert.ok(flowSource.includes('if (targetSlotType === "none") return;'));
  assert.ok(flowSource.includes('if (targetSlotType === "editorial_line_item")'));
  assert.ok(flowSource.includes("await ensurePublishedArticleInLatest(matchdayId, articleId);"));
});

test("Últimas continua a ordenar sempre pela data/hora canónica mais recente", () => {
  assert.ok(flowSource.includes("export async function normalizeLatestNewsOrder(matchdayId: string)"));
  assert.ok(flowSource.includes("order=published_at.desc.nullslast,created_at.desc.nullslast"));
  assert.ok(flowSource.includes("if (leftTime !== rightTime) return rightTime - leftTime;"));
  assert.ok(flowSource.includes("await normalizeLatestNewsOrder(matchdayId);"));
  assert.ok(gestorRouteSource.includes("await normalizeLatestNewsOrder(matchdayId);"));
});

test("Últimas não grava o UUID canónico na FK legada de articles", () => {
  assert.ok(flowSource.includes("article_id: null"));
  const canonicalLegacyGuard = 'const articleId = linkUrl?.startsWith("/noticias/") ? null : rawArticleId;';
  assert.equal(gestorRouteSource.split(canonicalLegacyGuard).length - 1, 2);
});

test("notícias de outras zonas não podem ser transferidas para Últimas", () => {
  assert.ok(flowSource.includes('if (input.targetSlotType === "editorial_line_item")'));
  assert.ok(flowSource.includes("Últimas só recebe novidades escolhidas no momento da publicação."));
  assert.ok(flowSource.includes('slotType !== "editorial_line_item"'));
});

test("ao sair de Últimas para destino livre, a notícia é promovida e Últimas recompõe-se", () => {
  assert.ok(flowSource.includes('if (input.sourceSlotType === "editorial_line_item")'));
  assert.ok(flowSource.includes("await clearArticleFromSourceZone(input.matchdayId, input.sourceSlotType, input.sourceId);"));
  assert.ok(flowSource.includes("await normalizeLatestNewsOrder(input.matchdayId);"));
});

test("ao sair de Últimas para destino ocupado, é obrigatório decidir o destino da notícia substituída", () => {
  assert.ok(flowSource.includes("displacedTargetSlotType?: EditorialDisplacedTargetSlotType | null"));
  assert.ok(flowSource.includes("news-flow-displaced-target-required"));
  assert.ok(flowSource.includes("Escolhe para onde deve ir a notícia que será substituída."));
  assert.ok(gestorRouteSource.includes('formData.get("displaced_target_choice")'));
  assert.ok(gestorRouteSource.includes("displacedTargetSlotType,"));
});

test("a notícia substituída nunca é enviada automaticamente para Últimas", () => {
  assert.ok(flowSource.includes("placeProjectionInAvailableZone"));
  assert.ok(flowSource.includes('slotType === "editorial_line_item"'));
  assert.ok(flowSource.includes("news-flow-latest-new-only"));
  assert.ok(flowSource.includes('displacedTargetSlotType !== "unplaced"'));
});

test("a notícia substituída pode ficar sem colocação ou ir para uma zona hierárquica livre", () => {
  assert.ok(flowSource.includes('if (slotType === "unplaced") return null;'));
  for (const slotType of ["headline", "highlight", "complement"]) {
    assert.ok(flowSource.includes(`slotType === "${slotType}"`), slotType);
  }
  assert.ok(flowSource.includes("matchday_horizontal_news"));
  assert.ok(flowSource.includes("news-flow-displaced-target-full"));
});

test("entre as quatro zonas hierárquicas mantém-se a troca bidirecional validada", () => {
  assert.ok(flowSource.includes("Entre zonas hierárquicas mantém-se a troca bidirecional já validada."));
  assert.ok(flowSource.includes("const displacedProjection = await projectionForDisplacedOccupant"));
  assert.ok(flowSource.includes("await writeProjectionToExistingSourceZone("));
  assert.ok(flowSource.includes("await restoreSourceArticleAfterFailedSwap"));
});

test("a transferência continua a preservar o artigo canónico e a projetar o perfil da zona", () => {
  assert.ok(flowSource.includes("const article = await readPublishedCompleteArticle(input.articleId, input.matchdayId);"));
  assert.ok(flowSource.includes("projectEditorialArticleToZone"));
  assert.ok(flowSource.includes("missingEditorialArticleCanonicalFields(article)"));
  assert.ok(flowSource.includes("Contexto e Vídeo não pertencem ao circuito normal de transferência de notícias."));
});

test("a composição publicada atual continua sincronizada depois das mudanças de posição", () => {
  assert.ok(flowSource.includes("syncCurrentPublishedReferenceCompositionNewsFlow"));
  assert.ok(flowSource.includes("await syncCurrentPublishedReferenceCompositionNewsFlow(input.matchdayId);"));
  assert.ok(gestorRouteSource.includes("NEWS_FLOW_REFERENCE_SYNC_ACTIONS"));
});
