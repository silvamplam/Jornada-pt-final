import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const flowSource = source("lib/editorial-matchday-news-flow.ts");
const articleRouteSource = source("app/api/admin/editorial/artigos/route.ts");
const articleServiceSource = source("lib/editorial-article-service.ts");
const gestorRouteSource = source("app/api/admin/gestor/route.ts");
const editorialPageSource = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
const compositionSyncSource = source("lib/editorial-current-reference-composition-sync.ts");


test("publicar deixou de significar entrada automática em Últimas", () => {
  assert.ok(articleServiceSource.includes("placePublishedArticleInitially"));
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

test("os quatro lugares junto de Últimas são origem manual, mas nunca destino independente", () => {
  assert.ok(flowSource.includes("syncLatestFourNewsProjection(matchdayId)"));
  assert.ok(flowSource.includes("news-flow-automatic-latest-projection"));
  assert.ok(flowSource.includes("!isLatestFourNewsSlotType(slotType)"));
  assert.doesNotMatch(
    flowSource,
    /isLatestFourNewsSlotType\(input\.sourceSlotType\)[\s\S]{0,200}news-flow-automatic-latest-projection/,
  );
  assert.match(
    flowSource,
    /isLatestFourNewsSlotType\(input\.targetSlotType\)[\s\S]{0,200}news-flow-automatic-latest-projection/,
  );
  assert.ok(editorialPageSource.includes("Projeção automática das quatro primeiras notícias publicadas de Últimas."));
  assert.match(
    editorialPageSource,
    /Projeção automática das quatro primeiras notícias publicadas de Últimas\.<\/small>[\s\S]{0,500}<NewsTransferControl/,
  );
});

test("Últimas não grava o UUID canónico na FK legada de articles", () => {
  assert.ok(flowSource.includes("article_id: null"));
  const canonicalLegacyGuard = 'const articleId = linkUrl?.startsWith("/noticias/") ? null : rawArticleId;';
  assert.equal(gestorRouteSource.split(canonicalLegacyGuard).length - 1, 2);
});

test("as seis zonas base mantêm o mesmo circuito e aceitam os lugares hierárquicos vivos", () => {
  assert.ok(flowSource.includes('| "side_block"'));
  assert.ok(flowSource.includes('| LiveMatchdayHierarchicalTransferSlotType'));
  assert.ok(flowSource.includes('isEditorialNewsFlowSlotType(value)'));
  assert.ok(flowSource.includes('isLiveMatchdayHierarchicalTransferSlotType(value)'));
  assert.ok(flowSource.includes('"side_block",'));
  assert.ok(flowSource.includes('...LIVE_MATCHDAY_HIERARCHICAL_TRANSFER_SLOT_TYPES'));
  assert.equal(flowSource.includes("Últimas só recebe novidades escolhidas no momento da publicação."), false);
  assert.equal(flowSource.includes('slotType !== "editorial_line_item"'), false);
  assert.ok(editorialPageSource.includes('targetSlotType: "editorial_line_item"'));
  assert.ok(editorialPageSource.includes('targetSlotType: "side_block"'));
  assert.ok(editorialPageSource.includes('sourceSlotType="side_block"'));
});

test("os três layouts vivos usam armazenamento próprio e não leem nem escrevem a Composição", () => {
  assert.ok(flowSource.includes("matchday_live_layout_items"));
  assert.equal(flowSource.includes("matchday_hierarchical_composition_slots"), false);
  assert.equal(flowSource.includes("matchday_reference_composition_items"), false);
  assert.equal(flowSource.includes("readCurrentStandardCompositionId"), false);
  assert.equal(flowSource.includes("readCurrentLiveCompositionId"), false);
  assert.ok(editorialPageSource.includes("matchday_live_layout_items"));
  assert.equal(editorialPageSource.includes("liveHierarchicalLayoutState.compositionId"), false);
});

test("qualquer destino ocupado exige escolher explicitamente o destino da notícia desalojada", () => {
  assert.ok(flowSource.includes("displacedTargetSlotType?: EditorialDisplacedTargetSlotType | null"));
  assert.ok(flowSource.includes("news-flow-displaced-target-required"));
  assert.ok(flowSource.includes("Escolhe para onde deve ir a notícia que será substituída."));
  assert.ok(gestorRouteSource.includes('formData.get("displaced_target_choice")'));
  assert.ok(gestorRouteSource.includes("isEditorialMatchdayTransferSlotType"));
  assert.ok(editorialPageSource.includes("Se o destino estiver ocupado, escolhe para onde vai a notícia que sai."));
  assert.equal(editorialPageSource.includes("As duas mudam de zona"), false);
});

test("a troca automática desaparece e a posição de origem só é usada por escolha explícita", () => {
  assert.equal(flowSource.includes("Entre zonas hierárquicas mantém-se a troca bidirecional já validada."), false);
  assert.ok(flowSource.includes("Nunca existe troca automática."));
  assert.ok(flowSource.includes("if (displacedTargetSlotType === input.sourceSlotType)"));
  assert.ok(flowSource.includes("await writeProjectionToExistingSourceZone("));
  assert.ok(editorialPageSource.includes("posição de origem"));
});

test("a notícia desalojada pode ficar sem colocação, entrar em Últimas, Contexto, Faixa ou posição livre", () => {
  assert.ok(flowSource.includes('if (slotType === "unplaced") return null;'));
  assert.ok(flowSource.includes('if (slotType === "editorial_line_item")'));
  assert.ok(flowSource.includes('if (slotType === "side_block")'));
  assert.ok(flowSource.includes("matchday_horizontal_news"));
  assert.ok(flowSource.includes("news-flow-displaced-target-full"));
  assert.ok(editorialPageSource.includes('{ value: "unplaced::", label: "Sem colocação editorial" }'));
  assert.ok(editorialPageSource.includes('value: "editorial_line_item::"'));
  assert.ok(editorialPageSource.includes('value: "side_block::"'));
  assert.ok(editorialPageSource.includes('value: "important_item::"'));
});

test("Últimas recebe transferências como lista cronológica e nunca como posição única ocupada", () => {
  assert.ok(editorialPageSource.includes('label: "Últimas — acrescentar por cronologia"'));
  assert.ok(flowSource.includes("await ensurePublishedArticleInLatest(matchdayId, articleId);"));
  assert.ok(flowSource.includes("await normalizeLatestNewsOrder(matchdayId);"));
  assert.ok(flowSource.includes("order=published_at.desc.nullslast,created_at.desc.nullslast"));
});

test("Contexto transfere artigo canónico preservando autor e o perfil próprio do pós-título", () => {
  assert.ok(flowSource.includes('if (slotType === "side_block")'));
  assert.ok(flowSource.includes("EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS"));
  assert.ok(flowSource.includes("side_block_author: projection.author"));
  assert.ok(flowSource.includes("side_block_text: projection.subtitle"));
  assert.ok(flowSource.includes("side_block_link_url: projection.linkUrl"));
  assert.ok(flowSource.includes("missingEditorialArticleCanonicalFields(article)"));
});

test("todos os controlos de transferência usam a mesma escolha de destino para a notícia desalojada", () => {
  assert.ok(editorialPageSource.includes("newsDisplacedTargetOptionsForSource"));
  for (const slotType of ["headline", "editorial_line_item", "side_block", "highlight", "complement", "important_item"]) {
    assert.ok(editorialPageSource.includes(`newsDisplacedTargetOptionsForSource("${slotType}"`), slotType);
  }
  assert.ok(editorialPageSource.includes("data-displaced-target-field"));
  assert.ok(editorialPageSource.includes("data-target-occupied"));
});

test("a composição publicada atual passa a sincronizar também Contexto", () => {
  assert.ok(compositionSyncSource.includes('"side_block",'));
  assert.ok(compositionSyncSource.includes('slot_type: "side_block"'));
  assert.ok(compositionSyncSource.includes('source_type: "matchday_editorial_side_block"'));
  assert.ok(compositionSyncSource.includes("side_block_text"));
  assert.ok(compositionSyncSource.includes("side_block_link_url"));
});

test("a transferência continua a preservar o artigo canónico e a projetar o perfil da zona", () => {
  assert.ok(flowSource.includes("const article = await readPublishedCompleteArticle(input.articleId, input.matchdayId);"));
  assert.ok(flowSource.includes("projectEditorialArticleToZone"));
  assert.ok(flowSource.includes("projectArticleToTransferZone"));
  assert.ok(flowSource.includes("missingEditorialArticleCanonicalFields(article)"));
  assert.ok(flowSource.includes("syncCurrentPublishedReferenceCompositionNewsFlow"));
});

test("uma nova chegada à Faixa sobe para primeiro e a ordem manual fica disponível no backoffice", () => {
  const horizontalEditorSource = source("components/admin/EditorialHorizontalNewsEditor.tsx");

  assert.ok(flowSource.includes("prioritizeMatchdayHorizontalNewsItem"));
  assert.ok(flowSource.includes("persistHorizontalNewsOrder"));
  assert.ok(flowSource.includes("temporaryStart"));
  assert.ok(flowSource.includes("await prioritizeMatchdayHorizontalNewsItem(matchdayId, incomingId);"));
  assert.ok(flowSource.includes("export async function moveMatchdayHorizontalNewsItem"));
  assert.ok(flowSource.includes("export async function normalizeMatchdayHorizontalNewsOrder"));
  assert.ok(gestorRouteSource.includes('actionType === "move_matchday_horizontal_news_item"'));
  assert.ok(gestorRouteSource.includes("await normalizeMatchdayHorizontalNewsOrder(matchdayId);"));
  assert.ok(editorialPageSource.includes('value="move_matchday_horizontal_news_item"'));
  assert.ok(editorialPageSource.includes("Subir / esquerda"));
  assert.ok(editorialPageSource.includes("Descer / direita"));
  assert.ok(horizontalEditorSource.includes("Uma transferência nova entra em primeiro."));
});

test("a composição publicada atual continua sincronizada depois das mudanças de posição", () => {
  assert.ok(flowSource.includes("syncCurrentPublishedReferenceCompositionNewsFlow"));
  assert.ok(flowSource.includes("await syncCurrentPublishedReferenceCompositionNewsFlow(input.matchdayId);"));
  assert.ok(gestorRouteSource.includes("NEWS_FLOW_REFERENCE_SYNC_ACTIONS"));
});

test("Últimas deixa de ter um teto editorial fixo de 20 notícias", () => {
  const publicMatchdaySource = source("lib/public-matchday.ts");
  const gestorSource = source("app/api/admin/gestor/route.ts");
  const compositionPageSource = source("app/admin/editorial/composicao/[matchdayId]/page.tsx");
  const compositionRouteSource = source("app/api/admin/editorial/composicao/route.ts");

  assert.equal(flowSource.includes("LATEST_NEWS_MAX_ITEMS"), false);
  assert.equal(flowSource.includes("news-flow-latest-full"), false);
  assert.doesNotMatch(flowSource, /matchday_latest_news[^`]*limit=20/);
  assert.doesNotMatch(publicMatchdaySource, /matchday_latest_news[^`]*limit=20/);
  assert.doesNotMatch(editorialPageSource, /matchday_latest_news[^`]*limit=20/);
  assert.match(editorialPageSource, /buildLatestNewsEditorSortOrders/);
  assert.match(gestorSource, /latestNewsSortOrdersFromFormData/);
  assert.doesNotMatch(gestorSource, /LATEST_NEWS_EDITOR_SORT_ORDERS/);
  assert.doesNotMatch(compositionPageSource, /matchday_latest_news[^`]*limit=50/);
  assert.doesNotMatch(compositionRouteSource, /matchday_latest_news[^`]*limit=50/);
});
