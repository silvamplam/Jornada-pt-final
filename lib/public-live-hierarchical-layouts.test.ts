import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const hierarchyModel = source("lib/editorial-hierarchical-composition.ts");
const transferFlow = source("lib/editorial-matchday-news-flow.ts");
const compositionSync = source("lib/editorial-current-reference-composition-sync.ts");
const publicLoader = source("lib/public-matchday.ts");
const publicPage = source("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx");
const publicRenderer = source("components/public/PublicHierarchicalComposition.tsx");
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

test("a Jornada viva reutiliza apenas os três layouts hierárquicos pedidos", () => {
  for (const slotKey of reusedHierarchicalSlots) {
    assert.match(hierarchyModel, new RegExp(`transferSlotType: "live_hierarchical:${slotKey}"`));
    assert.match(hierarchyModel, new RegExp(`slotKey: "${slotKey}"`));
  }

  assert.equal((hierarchyModel.match(/transferSlotType: "live_hierarchical:/g) ?? []).length, 11);
  assert.match(hierarchyModel, /\.\.\.HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS\.map/);
  assert.match(hierarchyModel, /transferSlotType: `live_beyond_matchday:\$\{position\.sortOrder\}`/);
  assert.doesNotMatch(hierarchyModel, /live_hierarchical:dominant_main|live_hierarchical:other_chronicle_/);
});

test("o estado vivo usa a composição publicada current sem exigir o modo standard", () => {
  assert.match(transferFlow, /status=eq\.published&is_current=is\.true&order=published_at\.desc\.nullslast&limit=1/);
  assert.doesNotMatch(transferFlow, /presentation_mode=eq\.standard/);
  assert.doesNotMatch(editorialAdmin, /presentation_mode=eq\.standard/);
  assert.match(transferFlow, /matchday_hierarchical_composition_slots/);
  assert.match(transferFlow, /matchday_reference_composition_items/);
  assert.match(transferFlow, /slot_type=eq\.beyond_matchday/);
  assert.match(transferFlow, /live:\$\{position\?\.transferSlotType \?\? slotType\}:/);
  assert.match(publicLoader, /hierarchicalCompositionSlots = await fetchSupabaseAdminTable<HierarchicalCompositionSlot>/);
  assert.match(editorialAdmin, /Estes lugares ficam disponíveis quando existir uma composição publicada e atual para esta Jornada\./);
  assert.doesNotMatch(editorialAdmin, /composição standard publicada desta Jornada/);
  assert.match(compositionSync, /presentation_mode=eq\.standard/);
  assert.doesNotMatch(transferFlow, /create table|alter table/i);
});

test("os três layouts públicos usam os renderers hierárquicos já existentes e não deslocam a Faixa", () => {
  assert.match(publicRenderer, /export function PublicHierarchicalLiveLayouts/);
  assert.match(publicRenderer, /<InterpretiveAnalysisSection showEmptySlots=\{false\}/);
  assert.match(publicRenderer, /<InterpretiveOtherGamesSection showEmptySlots=\{false\}/);
  assert.match(publicRenderer, /<PublicBeyondMatchdayNews/);
  assert.match(publicPage, /<PublicHierarchicalLiveLayouts/);

  const horizontalIndex = publicPage.indexOf("<PublicHorizontalNewsStrip");
  const liveLayoutsIndex = publicPage.indexOf("<PublicHierarchicalLiveLayouts");
  const standingsIndex = publicPage.indexOf('id="classificacao"');
  assert.ok(horizontalIndex >= 0 && liveLayoutsIndex > horizontalIndex && standingsIndex > liveLayoutsIndex);
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
