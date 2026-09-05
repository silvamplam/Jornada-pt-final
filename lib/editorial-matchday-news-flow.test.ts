import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const flowSource = source("lib/editorial-matchday-news-flow.ts");
const physicalPlacementSource = source("lib/editorial-matchday-physical-placement.ts");
const articleRouteSource = source("app/api/admin/editorial/artigos/route.ts");
const articleServiceSource = source("lib/editorial-article-service.ts");
const gestorRouteSource = source("app/api/admin/gestor/route.ts");
const editorialPageSource = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
const compositionSyncSource = source("lib/editorial-current-reference-composition-sync.ts");
const latestOrderMigrationSource = source(
  "supabase/migrations/20260823215153_batch_publication_latest_order_set_based.sql",
);


test("publicar deixou de significar entrada automática em Últimas", () => {
  assert.ok(articleServiceSource.includes("placePublishedArticleInitially"));
  assert.ok(articleRouteSource.includes('formData.get("initial_placement")'));
  assert.equal(articleRouteSource.includes("await ensurePublishedArticleInLatest(payload.matchday_id"), false);
  assert.equal(articleRouteSource.includes('error: "latest-placement-failed"'), false);
  assert.ok(articleRouteSource.includes('placement_error: "1"'));
});

test("a primeira publicação separa Últimas funcional de placements com slot inequívoco", () => {
  assert.ok(flowSource.includes("export async function placePublishedArticleInitially"));
  assert.ok(flowSource.includes('if (targetSlotType === "none") return;'));
  assert.ok(flowSource.includes('if (targetSlotType === "editorial_line_item")'));
  assert.ok(flowSource.includes("await ensurePublishedArticleInLatest(matchdayId, articleId);"));
  assert.ok(flowSource.includes('targetSlotType === "highlight" || targetSlotType === "important_item"'));
  assert.ok(flowSource.includes('"news-flow-explicit-slot-required"'));
  assert.ok(flowSource.includes("await applyMatchdaySinglePlacement({"));
});

test("Últimas continua a ordenar sempre pela data/hora canónica mais recente", () => {
  assert.match(
    flowSource,
    /export async function normalizeLatestNewsOrder\(\s*matchdayId: string,?\s*\)/,
  );
  assert.match(flowSource, /rpc\/normalize_matchday_latest_news_order/);
  assert.match(latestOrderMigrationSource, /row_number\(\) over \(\s*order by\s*resolved\.order_time desc/);
  assert.match(latestOrderMigrationSource, /update public\.matchday_latest_news as latest_row\s*set sort_order = ranked\.next_sort_order/);
  assert.doesNotMatch(flowSource, /Promise\.all\([\s\S]{0,300}sort_order/);
  assert.ok(flowSource.includes("await normalizeLatestNewsOrder(matchdayId);"));
  assert.ok(gestorRouteSource.includes("await normalizeLatestNewsOrder(matchdayId);"));
});

test("os quatro lugares junto de Últimas são origem manual, mas nunca destino independente", () => {
  assert.match(
    flowSource,
    /isLatestFourNewsSlotType\(input\.targetSlotType\)[\s\S]{0,320}news-flow-placement-target-invalid/,
  );
  assert.ok(editorialPageSource.includes('sourceSlotType={position.transferSlotType}'));
  const targetOptions = editorialPageSource.slice(
    editorialPageSource.indexOf("const newsTransferTargetOptions"),
    editorialPageSource.indexOf("const highlightsEditor"),
  );
  assert.equal(targetOptions.includes('targetSlotType: "live_four_news'), false);
});

test("Últimas não grava o UUID canónico na FK legada de articles", () => {
  assert.ok(flowSource.includes("article_id: null"));
  const canonicalLegacyGuard = 'const articleId = linkUrl?.startsWith("/noticias/") ? null : rawArticleId;';
  assert.equal(gestorRouteSource.split(canonicalLegacyGuard).length - 1, 2);
});

test("as superfícies legacy continuam origem mas apenas targets placement entram no core", () => {
  assert.ok(flowSource.includes('| "side_block"'));
  assert.ok(flowSource.includes('| LiveMatchdayHierarchicalTransferSlotType'));
  assert.ok(flowSource.includes('isEditorialNewsFlowSlotType(value)'));
  assert.ok(flowSource.includes('isLiveMatchdayHierarchicalTransferSlotType(value)'));
  assert.ok(flowSource.includes('"side_block",'));
  assert.ok(flowSource.includes('isLatestFourNewsSlotType(input.targetSlotType)'));
  assert.match(
    flowSource,
    /input\.targetSlotType === "editorial_line_item"[\s\S]{0,360}news-flow-placement-target-invalid/,
  );
  assert.equal(editorialPageSource.includes('targetSlotType: "editorial_line_item"'), false);
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

test("destino ocupado desalojará apenas o ocupante substituído sem auto-Faixa", () => {
  assert.equal(flowSource.includes("displacedTargetSlotType"), false);
  assert.equal(flowSource.includes("displacedTargetOrder"), false);
  assert.equal(flowSource.includes("news-flow-displaced-target-required"), false);
  assert.equal(gestorRouteSource.includes('formData.get("displaced_target_choice")'), false);
  const transfer = flowSource.slice(
    flowSource.indexOf("export async function transferPublishedArticleBetweenMatchdayZones"),
  );
  assert.match(transfer, /applyMatchdaySinglePlacement\(\{/);
  assert.doesNotMatch(transfer, /projectionForDisplacedOccupant|placeProjectionInAvailableZone|prioritizeMatchdayHorizontalNewsItem/);
  assert.ok(editorialPageSource.includes("fica Desalojada quando perder o seu último placement"));
  assert.equal(editorialPageSource.includes("entra automaticamente em primeiro na Faixa"), false);
});

test("movement chega ao core numa única request transacional", () => {
  const transfer = flowSource.slice(
    flowSource.indexOf("export async function transferPublishedArticleBetweenMatchdayZones"),
  );
  assert.equal((transfer.match(/applyMatchdaySinglePlacement\(\{/g) ?? []).length, 1);
  assert.doesNotMatch(transfer, /writeArticleToTargetZone|clearArticleFromSourceZone/);
  assert.match(physicalPlacementSource, /rpc\/apply_matchday_live_layout_single_placement_v15/);
  assert.match(physicalPlacementSource, /p_expected_physical_state_token/);
  assert.match(physicalPlacementSource, /p_expected_target_bank_item_id/);
  assert.match(physicalPlacementSource, /p_expect_target_empty/);
});

test("Últimas continua funcional e cronológica mas não recebe movement", () => {
  assert.equal(editorialPageSource.includes('label: "Últimas — acrescentar por cronologia"'), false);
  assert.match(flowSource, /targetSlotType === "editorial_line_item"[\s\S]{0,360}news-flow-placement-target-invalid/);
  assert.ok(flowSource.includes("await normalizeLatestNewsOrder("));
  assert.match(flowSource, /rpc\/normalize_matchday_latest_news_order/);
  assert.match(latestOrderMigrationSource, /resolved\.order_time desc/);
});

test("Contexto transfere artigo canónico preservando autor e o perfil próprio do pós-título", () => {
  assert.ok(flowSource.includes('if (slotType === "side_block")'));
  assert.ok(flowSource.includes("EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS"));
  assert.ok(flowSource.includes("side_block_author: projection.author"));
  assert.ok(flowSource.includes("side_block_text: projection.subtitle"));
  assert.ok(flowSource.includes("side_block_link_url: projection.linkUrl"));
  assert.ok(flowSource.includes("missingEditorialArticleCanonicalFields(article)"));
});

test("todos os controlos de transferência deixam de apresentar o segundo seletor", () => {
  for (const slotType of ["headline", "editorial_line_item", "side_block", "highlight", "complement", "important_item"]) {
    assert.ok(editorialPageSource.includes(`sourceSlotType="${slotType}"`), slotType);
  }
  assert.equal(editorialPageSource.includes("NewsDisplacedTargetOption"), false);
  assert.equal(editorialPageSource.includes("newsDisplacedTargetOptionsForSource"), false);
  assert.equal(editorialPageSource.includes("displaced_target_choice"), false);
  assert.equal(editorialPageSource.includes("data-displaced-target-field"), false);
  assert.equal(editorialPageSource.includes("data-target-occupied"), false);
});

test("a composição publicada atual passa a sincronizar também Contexto", () => {
  assert.ok(compositionSyncSource.includes('"side_block",'));
  assert.ok(compositionSyncSource.includes('slot_type: "side_block"'));
  assert.ok(compositionSyncSource.includes('source_type: "matchday_editorial_side_block"'));
  assert.ok(compositionSyncSource.includes("side_block_text"));
  assert.ok(compositionSyncSource.includes("side_block_link_url"));
});

test("a transferência resolve a participação contextual e não reescreve histórico", () => {
  assert.ok(flowSource.includes("const article = await readPublishedCompleteArticle(input.articleId, input.matchdayId);"));
  assert.match(flowSource, /readContextualArticleBankItemId\(\s*input\.matchdayId,\s*input\.articleId/);
  assert.ok(flowSource.includes("missingEditorialArticleCanonicalFields(article)"));
  const transfer = flowSource.slice(
    flowSource.indexOf("export async function transferPublishedArticleBetweenMatchdayZones"),
  );
  assert.doesNotMatch(transfer, /syncCurrentPublishedReferenceCompositionNewsFlow/);
});

test("Faixa usa slots sparse e o reorder legacy fica recusado", () => {
  assert.ok(editorialPageSource.includes("nova posição #"));
  assert.ok(editorialPageSource.includes("Math.max(0, ...horizontalNews.map"));
  assert.ok(gestorRouteSource.includes('actionType === "move_matchday_horizontal_news_item"'));
  assert.ok(gestorRouteSource.includes('"authoritative-placements-do-not-reorder"'));
  assert.equal(editorialPageSource.includes('value="move_matchday_horizontal_news_item"'), false);
  assert.equal(editorialPageSource.includes("Subir / esquerda"), false);
  assert.equal(editorialPageSource.includes("Descer / direita"), false);
});

test("movement não altera a composição histórica publicada", () => {
  const transfer = flowSource.slice(
    flowSource.indexOf("export async function transferPublishedArticleBetweenMatchdayZones"),
  );
  assert.doesNotMatch(transfer, /syncCurrentPublishedReferenceCompositionNewsFlow/);
  assert.doesNotMatch(gestorRouteSource, /NEWS_FLOW_REFERENCE_SYNC_ACTIONS/);
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
