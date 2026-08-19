import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const hierarchyModel = source("lib/editorial-hierarchical-composition.ts");
const transferFlow = source("lib/editorial-matchday-news-flow.ts");
const liveLayoutModel = source("lib/editorial-matchday-live-layout.ts");
const liveLayoutMigration = source("supabase/steps/118-jornada-layouts-vivos-independentes-apply.sql");
const liveLayoutDeltaMigration = source("supabase/steps/119-jornada-zona-4-noticias-ultimas-apply.sql");
const publicLoader = source("lib/public-matchday.ts");
const publicPage = source("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx");
const publicRenderer = source("components/public/PublicHierarchicalComposition.tsx");
const fourNewsRenderer = source("components/public/PublicFourNewsLatestLayout.tsx");
const latestNewsRenderer = source("components/public/PublicLatestNewsBlock.tsx");
const publicEditorial = source("components/public/PublicEditorialLayout.tsx");
const editorialAdmin = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");

const reusedHierarchicalSlots = [
  "secondary_strong_1",
  "secondary_strong_2",
  "secondary_1",
  "secondary_2",
  "dominant_side_top",
  "dominant_side_bottom",
  "secondary_3",
  "secondary_4",
  "closing_1",
  "closing_2",
  "closing_3",
] as const;

test("a Jornada viva mantém três layouts reutilizados e acrescenta a zona 4 notícias + Últimas", () => {
  for (const slotKey of reusedHierarchicalSlots) {
    assert.match(hierarchyModel, new RegExp(`transferSlotType: "live_hierarchical:${slotKey}"`));
    assert.match(hierarchyModel, new RegExp(`slotKey: "${slotKey}"`));
  }

  assert.equal((hierarchyModel.match(/transferSlotType: "live_hierarchical:/g) ?? []).length, 11);
  assert.equal((hierarchyModel.match(/transferSlotType: "live_four_news:/g) ?? []).length, 4);
  assert.match(hierarchyModel, /\.\.\.HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS\.map/);
  assert.match(hierarchyModel, /transferSlotType: `live_beyond_matchday:\$\{position\.sortOrder\}`/);
  assert.match(hierarchyModel, /group: "four_news"/);
  assert.doesNotMatch(hierarchyModel, /live_hierarchical:dominant_main|live_hierarchical:other_chronicle_/);
});

test("o estado vivo é próprio da Jornada e não depende da Composição", () => {
  assert.match(liveLayoutMigration, /create table if not exists public\.matchday_live_layout_items/);
  assert.match(liveLayoutMigration, /matchday_id uuid not null references public\.matchdays/);
  assert.match(liveLayoutMigration, /article_id uuid references public\.editorial_articles/);
  assert.doesNotMatch(liveLayoutMigration, /matchday_reference_compositions|matchday_hierarchical_composition_slots/);
  assert.match(liveLayoutDeltaMigration, /live_four_news:1[\s\S]*live_four_news:4/);
  assert.match(liveLayoutDeltaMigration, /latest_zone_placement in \('top', 'hidden', 'four_news'\)/);
  assert.doesNotMatch(liveLayoutDeltaMigration, /matchday_reference_compositions|matchday_hierarchical_composition_slots/);
  assert.match(liveLayoutModel, /export type MatchdayLiveLayoutItem/);
  assert.match(transferFlow, /matchday_live_layout_items/);
  assert.doesNotMatch(transferFlow, /presentation_mode=eq\.standard/);
  assert.doesNotMatch(transferFlow, /matchday_hierarchical_composition_slots/);
  assert.doesNotMatch(transferFlow, /matchday_reference_composition_items/);
  assert.match(publicLoader, /readMatchdayLiveLayoutItems/);
  assert.match(publicLoader, /liveLayoutItems/);
  assert.doesNotMatch(editorialAdmin, /composição standard publicada desta Jornada|composição publicada e atual para esta Jornada/);
});

test("os layouts públicos são flexíveis, a zona 4+Últimas é condicional e a Faixa fica no fim", () => {
  assert.match(publicRenderer, /export function PublicHierarchicalLiveLayouts/);
  assert.match(publicRenderer, /<InterpretiveAnalysisSection heading=\{null\}/);
  assert.match(publicRenderer, /<InterpretiveOtherGamesSection heading=\{null\}/);
  assert.match(publicRenderer, /heading=\{null\}[\s\S]*<PublicBeyondMatchdayNews|<PublicBeyondMatchdayNews[\s\S]*heading=\{null\}/);
  assert.match(publicPage, /<PublicHierarchicalLiveLayouts/);
  assert.match(publicPage, /context\.liveLayoutItems/);
  assert.match(publicPage, /storage !== "four_news"/);
  assert.match(publicPage, /latestZonePlacement === "four_news"/);
  assert.match(publicPage, /<PublicFourNewsLatestLayout/);
  assert.match(fourNewsRenderer, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(fourNewsRenderer, /grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(fourNewsRenderer, /\.public-four-news-card \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(fourNewsRenderer, /<PublicLatestNewsBlock/);
  assert.match(
    fourNewsRenderer,
    /grid-template-columns:[\s\S]*?1\.22fr[\s\S]*?1\.22fr[\s\S]*?250px[\s\S]*?220px/,
  );
  assert.match(fourNewsRenderer, /grid-column: span 2/);
  assert.match(fourNewsRenderer, /aspect-ratio: 16 \/ 9/);
  assert.match(fourNewsRenderer, /public-four-news-ad-column/);
  assert.match(fourNewsRenderer, /data-public-ad-slot="four-news-latest"/);
  assert.match(fourNewsRenderer, /constrainToFourNewsGrid/);
  assert.match(latestNewsRenderer, /constrainToFourNewsGrid/);
  assert.match(latestNewsRenderer, /\.public-four-news-grid/);
  assert.match(publicEditorial, /!hasRoundupSummary \? midContent : null/);
  assert.match(publicEditorial, /hasRoundupSummary \? midContent : null/);

  const liveLayoutsIndex = publicPage.indexOf("<PublicHierarchicalLiveLayouts");
  const horizontalIndex = publicPage.indexOf("<PublicHorizontalNewsStrip");
  const standingsIndex = publicPage.indexOf('id="classificacao"');
  assert.ok(liveLayoutsIndex >= 0 && horizontalIndex > liveLayoutsIndex && standingsIndex > horizontalIndex);
});

test("as posições reutilizadas entram no mesmo motor de transferências já usado pelas zonas atuais", () => {
  assert.match(transferFlow, /isLiveMatchdayHierarchicalTransferSlotType/);
  assert.match(transferFlow, /writeProjectionToLiveLayoutSlot/);
  assert.match(transferFlow, /sourceContainsArticle[\s\S]*readLiveLayoutRow/);
  assert.match(transferFlow, /readOccupiedTargetZone[\s\S]*readLiveLayoutRow/);
  assert.match(transferFlow, /clearArticleFromSourceZone[\s\S]*readLiveLayoutRow/);
  assert.match(transferFlow, /LIVE_MATCHDAY_HIERARCHICAL_TRANSFER_SLOT_TYPES/);
  assert.match(editorialAdmin, /LIVE_MATCHDAY_HIERARCHICAL_LAYOUT_POSITIONS/);
  assert.match(editorialAdmin, /sourceSlotType=\{position\.transferSlotType\}/);
  assert.match(editorialAdmin, /newsDisplacedTargetOptionsForSource\(position\.transferSlotType, occupant\.id\)/);
});

test("o backoffice respeita a ordem hierárquica das zonas vivas e deixa a Faixa por último", () => {
  assert.match(editorialAdmin, />07 4 notícias \+ Últimas<\/a>/);
  assert.match(editorialAdmin, />08 6 notícias<\/a>/);
  assert.match(editorialAdmin, />09 5 notícias 1D\+1S\+3C<\/a>/);
  assert.match(editorialAdmin, />10 5 notícias 1D\+4S<\/a>/);
  assert.match(editorialAdmin, />11 Faixa de notícias<\/a>/);
  assert.match(hierarchyModel, /4 notícias \+ Últimas — notícia 1/);
  assert.match(hierarchyModel, /6 notícias \(1 dominante · 3 secundárias · 2 complementares\)/);
  assert.match(hierarchyModel, /5 notícias \(1 dominante · 1 secundária · 3 complementares\)/);
  assert.match(hierarchyModel, /5 notícias \(1 dominante · 4 secundárias\)/);

  const transferStart = editorialAdmin.indexOf("const newsTransferTargetOptions");
  const displacedStart = editorialAdmin.indexOf("function newsDisplacedTargetOptionsForSource", transferStart);
  const transferBlock = editorialAdmin.slice(transferStart, displacedStart);
  assert.ok(transferBlock.indexOf("LIVE_MATCHDAY_HIERARCHICAL_LAYOUT_POSITIONS.forEach") < transferBlock.indexOf('targetSlotType: "important_item"'));

  const displacedEnd = editorialAdmin.indexOf("const highlightsEditor", displacedStart);
  const displacedBlock = editorialAdmin.slice(displacedStart, displacedEnd);
  assert.ok(displacedBlock.indexOf("LIVE_MATCHDAY_HIERARCHICAL_LAYOUT_POSITIONS.forEach") < displacedBlock.indexOf('sourceSlotType === "important_item"'));
});

test("a página viva e a composição hierárquica anulam sombras nas zonas de conteúdo", () => {
  assert.match(
    publicEditorial,
    /\.public-editorial-layout-panel,\s*\.public-editorial-layout-panel \* \{\s*box-shadow: none !important;/,
  );
  assert.match(
    publicPage,
    /\.public-matchday-panel,[\s\S]*?\.public-matchday-news \{\s*box-shadow: none !important;/,
  );
  assert.match(
    publicRenderer,
    /\.public-hierarchical-composition,\s*\.public-hierarchical-composition \* \{\s*box-shadow: none !important;/,
  );
});

test("a manchete da Jornada viva não corta o título com line-clamp", () => {
  assert.match(
    publicEditorial,
    /data-editorial-scope="matchday"[^}]*?\.public-matchday-editorial h1,[\s\S]*?\.public-matchday-editorial h2 \{\s*display: block;\s*-webkit-line-clamp: unset;\s*overflow: visible;\s*text-overflow: clip;/,
  );
});

test("as zonas vivas usam divisores com blur alinhado globalmente à esquerda", () => {
  assert.match(
    publicRenderer,
    /\.composition-interpretive-preview \{[\s\S]*?gap: 64px;/,
  );

  assert.match(
    publicRenderer,
    /\.composition-interpretive-section \{[\s\S]*?padding-top: 32px;[\s\S]*?border-top: 0;/,
  );

  assert.match(
    publicRenderer,
    /\.public-hierarchical-live-layouts::before \{[\s\S]*?top: 5px;[\s\S]*?right: 0;[\s\S]*?left: 0;[\s\S]*?height: 1px;[\s\S]*?rgba\(108, 130, 154, 0\.22\) 0%/,
  );

  assert.match(
    publicRenderer,
    /\.public-hierarchical-live-layouts::after \{[\s\S]*?top: 4px;[\s\S]*?right: 32%;[\s\S]*?left: 0;[\s\S]*?height: 10px;[\s\S]*?rgba\(178, 191, 205, 0\.05\) 0%/,
  );

  assert.match(
    publicRenderer,
    /\.composition-interpretive-preview > \.composition-interpretive-section::before,[\s\S]*?top: 5px;[\s\S]*?right: 0;[\s\S]*?left: 0;[\s\S]*?height: 1px;[\s\S]*?rgba\(108, 130, 154, 0\.20\) 0%/,
  );

  assert.match(
    publicRenderer,
    /\.composition-interpretive-preview > \.composition-interpretive-section::after,[\s\S]*?top: 4px;[\s\S]*?right: 32%;[\s\S]*?left: 0;[\s\S]*?height: 10px;[\s\S]*?rgba\(178, 191, 205, 0\.045\) 0%/,
  );

  assert.doesNotMatch(
    publicRenderer,
    /composition-interpretive-section:nth-child\(even\)::before/,
  );

  assert.doesNotMatch(
    publicRenderer,
    /composition-interpretive-section:nth-child\(even\)::after/,
  );

  assert.match(
    fourNewsRenderer,
    /\.public-four-news-latest-layout::before \{[\s\S]*?top: 5px;[\s\S]*?right: 0;[\s\S]*?left: 0;[\s\S]*?height: 1px;[\s\S]*?rgba\(108, 130, 154, 0\.22\) 0%/,
  );

  assert.match(
    fourNewsRenderer,
    /\.public-four-news-latest-layout::after \{[\s\S]*?top: 4px;[\s\S]*?right: 32%;[\s\S]*?left: 0;[\s\S]*?height: 10px;[\s\S]*?rgba\(178, 191, 205, 0\.05\) 0%/,
  );

  assert.match(
    publicRenderer,
    /\.composition-interpretive-preview > :first-child \{[\s\S]*?padding-top: 0;/,
  );

  assert.match(
    publicRenderer,
    /@media \(max-width: 980px\) \{[\s\S]*?gap: 50px;/,
  );

  assert.match(
    publicRenderer,
    /@media \(max-width: 720px\) \{[\s\S]*?gap: 38px;/,
  );

  assert.match(
    publicRenderer,
    /<InterpretiveAnalysisSection heading=\{null\}/,
  );

  assert.match(
    publicRenderer,
    /<InterpretiveOtherGamesSection heading=\{null\}/,
  );
});
