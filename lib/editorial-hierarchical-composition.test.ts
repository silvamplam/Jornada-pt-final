import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS,
  HIERARCHICAL_COMPOSITION_MOMENTS,
  HIERARCHICAL_COMPOSITION_SLOT_KEYS,
  incompleteHierarchicalBeyondMatchdayPositions,
  hierarchicalCompositionEditorialParagraphs,
  incompleteHierarchicalCompositionSlots,
  isPublishableHierarchicalBeyondMatchday,
  isPublishableHierarchicalComposition,
  isPublishableHierarchicalCompositionEditorial,
  missingHierarchicalCompositionEditorialFields,
  missingHierarchicalCompositionSlots,
  type HierarchicalCompositionSlot,
} from "./editorial-hierarchical-composition";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const applySql = source("supabase/steps/105-composicao-hierarquica-opcional-apply.sql");
const preflightSql = source("supabase/steps/104-composicao-hierarquica-opcional-preflight.sql");
const postflightSql = source("supabase/steps/106-composicao-hierarquica-opcional-postflight.sql");
const smokeSql = source("supabase/steps/107-composicao-hierarquica-opcional-smoke-rollback.sql");
const posteriorPreflightSql = source("supabase/steps/108-composicao-hierarquica-momentos-posteriores-preflight.sql");
const posteriorApplySql = source("supabase/steps/109-composicao-hierarquica-momentos-posteriores-apply.sql");
const posteriorPostflightSql = source("supabase/steps/110-composicao-hierarquica-momentos-posteriores-postflight.sql");
const posteriorSmokeSql = source("supabase/steps/111-composicao-hierarquica-momentos-posteriores-smoke-rollback.sql");
const editorialPreflightSql = source("supabase/steps/120-composicao-hierarquica-editorial-autonomo-preflight.sql");
const editorialApplySql = source("supabase/steps/121-composicao-hierarquica-editorial-autonomo-apply.sql");
const editorialPostflightSql = source("supabase/steps/122-composicao-hierarquica-editorial-autonomo-postflight.sql");
const editorialSmokeSql = source("supabase/steps/123-composicao-hierarquica-editorial-autonomo-smoke-rollback.sql");
const compositionRoute = source("app/api/admin/editorial/composicao/route.ts");
const compositionPage = source("app/admin/editorial/composicao/[matchdayId]/page.tsx");
const publicPage = source("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx");
const publicLoader = source("lib/public-matchday.ts");
const currentSync = source("lib/editorial-current-reference-composition-sync.ts");
const renderer = source("components/public/PublicHierarchicalComposition.tsx");
const beyondRenderer = source("components/public/PublicBeyondMatchdayNews.tsx");
const roundupSwitcher = source("components/public/RoundupVideoSwitcher.tsx");
const interpretivePreview = source("components/admin/HierarchicalCompositionInterpretivePreview.tsx");

function slot(slotKey: HierarchicalCompositionSlot["slot_key"], overrides: Partial<HierarchicalCompositionSlot> = {}): HierarchicalCompositionSlot {
  return {
    id: `id-${slotKey}`,
    composition_id: "composition",
    slot_key: slotKey,
    bank_item_id: `bank-${slotKey}`,
    source_identity: `source:${slotKey}`,
    label_snapshot: "Antetítulo",
    title_snapshot: "Título",
    subtitle_snapshot: "Pós-título",
    image_url_snapshot: "https://example.test/image.jpg",
    link_url_snapshot: "https://example.test/noticia",
    ...overrides,
  };
}

test("os modos são aditivos e os registos existentes ficam standard por default", () => {
  assert.match(applySql, /add column if not exists presentation_mode text not null default 'standard'/i);
  assert.match(applySql, /presentation_mode in \('standard', 'hierarchical'\)/i);
  assert.match(publicLoader, /presentation_mode: ReferenceCompositionPresentationMode/);
  assert.match(publicPage, /presentation_mode === "hierarchical"/);
  assert.match(publicPage, /: editorialVisibility\.showCoverPanel \? \(/);
});

test("um draft standard e um hierarchical coexistem, mas o mesmo modo não duplica", () => {
  assert.match(
    applySql,
    /unique index if not exists matchday_reference_compositions_draft_mode_unique_idx[\s\S]*\(matchday_id, presentation_mode\)[\s\S]*where status = 'draft'/i,
  );
  assert.match(smokeSql, /'smoke-standard', 'standard'[\s\S]*'smoke-hierarchical', 'hierarchical'/i);
  assert.match(smokeSql, /second draft standard|segundo draft standard/i);
  assert.match(preflightSql, /group by matchday_id, presentation_mode[\s\S]*having count\(\*\) > 1/i);
  assert.match(compositionPage, /readDraftReferenceComposition[\s\S]*readPublishedReferenceComposition/);
  assert.match(compositionPage, /Usar apresentação Atual publicada/);
});

test("a taxonomia hierárquica contém exclusivamente os 15 lugares aprovados", () => {
  assert.equal(HIERARCHICAL_COMPOSITION_SLOT_KEYS.length, 15);
  assert.deepEqual(HIERARCHICAL_COMPOSITION_SLOT_KEYS, [
    "dominant_main",
    "dominant_side_top",
    "dominant_side_bottom",
    "other_chronicle_1",
    "other_chronicle_2",
    "other_chronicle_3",
    "secondary_strong_1",
    "secondary_strong_2",
    "secondary_1",
    "secondary_2",
    "secondary_3",
    "secondary_4",
    "closing_1",
    "closing_2",
    "closing_3",
  ]);
  assert.equal(HIERARCHICAL_COMPOSITION_MOMENTS.length, 5);
  for (const slotKey of HIERARCHICAL_COMPOSITION_SLOT_KEYS) {
    assert.match(applySql, new RegExp(`'${slotKey}'`));
  }
});

test("slots e origens não duplicam e apagar o banco não destrói snapshots", () => {
  assert.match(applySql, /unique \(composition_id, slot_key\)/i);
  assert.match(applySql, /unique \(composition_id, source_identity\)/i);
  assert.match(applySql, /\(composition_id, bank_item_id\)[\s\S]*where bank_item_id is not null/i);
  assert.match(applySql, /bank_item_id uuid references public\.matchday_editorial_bank_items\(id\) on delete set null/i);
  assert.match(compositionRoute, /hierarchicalBankSourceIdentity/);
  assert.match(compositionRoute, /Esta notícia já ocupa outro lugar da composição hierárquica/);
});

test("os 15 lugares usam persistência própria e snapshots do banco", () => {
  const hierarchicalTableStart = applySql.indexOf("create table if not exists public.matchday_hierarchical_composition_slots");
  const hierarchicalTableEnd = applySql.indexOf("create unique index if not exists matchday_hierarchical_composition_slots_bank_unique_idx");
  const hierarchicalTableDefinition = applySql.slice(hierarchicalTableStart, hierarchicalTableEnd);

  assert.match(applySql, /create table if not exists public\.matchday_hierarchical_composition_slots/i);
  assert.match(applySql, /bank_item_id uuid references public\.matchday_editorial_bank_items\(id\) on delete set null/i);
  assert.match(applySql, /label_snapshot text[\s\S]*title_snapshot text[\s\S]*subtitle_snapshot text[\s\S]*image_url_snapshot text[\s\S]*link_url_snapshot text/i);
  assert.doesNotMatch(hierarchicalTableDefinition, /related_article|custom_card|article_id/i);
  assert.doesNotMatch(compositionRoute, /writeSupabaseAdmin\("editorial_articles"/);
});

test("Para Lá da Jornada tem exatamente uma dominante e quatro secundárias completas", () => {
  const complete = HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.map((position) => ({
    slot_type: "beyond_matchday",
    sort_order: position.sortOrder,
    label_snapshot: "ATUALIDADE",
    title_snapshot: `Notícia ${position.sortOrder}`,
    subtitle_snapshot: "Contexto",
    image_url_snapshot: "https://example.test/image.jpg",
    link_url_snapshot: `/noticias/${position.sortOrder}`,
  }));

  assert.deepEqual(HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.map((position) => position.key), [
    "dominant",
    "secondary_1",
    "secondary_2",
    "secondary_3",
    "secondary_4",
  ]);
  assert.equal(incompleteHierarchicalBeyondMatchdayPositions(complete).length, 0);
  assert.equal(isPublishableHierarchicalBeyondMatchday(complete), true);
  assert.equal(isPublishableHierarchicalBeyondMatchday(complete.slice(0, 4)), false);
  assert.match(posteriorApplySql, /slot_type = 'beyond_matchday'/);
  assert.match(posteriorApplySql, /hierarchical_beyond_matchday_incomplete/);
  assert.match(posteriorSmokeSql, /sem as cinco posições tornou-se current/);
});

test("108–111 são um delta posterior e não repetem a fundação 104–107", () => {
  assert.doesNotMatch(applySql, /beyond_matchday|editorial_article/);
  assert.doesNotMatch(preflightSql, /beyond_matchday|editorial_articles|matchday_roundup_items/);
  assert.doesNotMatch(postflightSql, /beyond_matchday|editorial_article/);
  assert.doesNotMatch(smokeSql, /beyond_matchday|editorial_article/);

  assert.doesNotMatch(posteriorPreflightSql, /^\s*(alter|create|drop|insert|update|delete|commit)\b/im);
  assert.doesNotMatch(posteriorPostflightSql, /^\s*(alter|create|drop|insert|update|delete|commit)\b/im);
  assert.match(posteriorApplySql, /^begin;/i);
  assert.match(posteriorApplySql, /commit;\s*$/i);
  assert.doesNotMatch(posteriorApplySql, /create table|add column if not exists presentation_mode/i);
  assert.match(posteriorApplySql, /matchday_reference_composition_items_beyond_position_check/i);
  assert.match(posteriorApplySql, /sort_order between 1 and 5/i);
  assert.match(
    posteriorApplySql,
    /unique index if not exists matchday_reference_composition_beyond_position_unique_idx[\s\S]*\(composition_id, sort_order\)[\s\S]*slot_type = 'beyond_matchday'/i,
  );
  assert.match(posteriorApplySql, /'matchday_roundup_item'[\s\S]*'matchday_editorial_bank_item'[\s\S]*'editorial_article'/i);
  assert.match(posteriorSmokeSql, /^begin;/i);
  assert.match(posteriorSmokeSql, /rollback;\s*$/i);
  assert.doesNotMatch(posteriorSmokeSql, /commit/i);
});

test("a RPC delta bloqueia hierarchical incompleta ao publicar e ao reativar", () => {
  assert.match(
    posteriorApplySql,
    /if v_target.status = 'draft'[\s\S]*elsif v_target.status <> 'published'[\s\S]*end if;\s*if v_target.presentation_mode = 'hierarchical'/i,
  );
  assert.match(posteriorApplySql, /v_slot_count <> 15 or v_complete_slot_count <> 15/i);
  assert.match(posteriorApplySql, /v_beyond_count <> 5[\s\S]*v_complete_beyond_count <> 5[\s\S]*v_beyond_position_count <> 5/i);
  assert.match(posteriorSmokeSql, /v_incomplete_draft_blocked/i);
  assert.match(posteriorSmokeSql, /v_missing_beyond_blocked/i);
  assert.match(posteriorSmokeSql, /v_published_beyond_reactivation_blocked/i);
  assert.match(posteriorSmokeSql, /v_published_core_reactivation_blocked/i);
  assert.match(
    posteriorSmokeSql,
    /activate_matchday_reference_composition\(v_matchday_id, v_hierarchical_id, false\)/i,
  );
  assert.match(posteriorSmokeSql, /tentativa inválida alterou a composição current/i);
  assert.match(posteriorPostflightSql, /RPC não protege publicação e reativação hierarchical/i);
});

test("os momentos posteriores usam snapshots normais e seleção editorial manual", () => {
  assert.match(compositionRoute, /assignRoundupItemToHierarchicalComposition/);
  assert.match(compositionRoute, /assignBankItemToHierarchicalAuxiliary/);
  assert.match(compositionRoute, /assignPublishedArticleToHierarchicalAuxiliary/);
  assert.match(
    compositionRoute,
    /const sourceType = input\.bankItemId[\s\S]*\? "matchday_editorial_bank_item"[\s\S]*: input\.articleId[\s\S]*\? "editorial_article"[\s\S]*: "editorial_content"/,
  );
  assert.match(compositionRoute, /source_type: sourceType/);
  assert.match(compositionPage, /editorial manual da atualidade viva naquele momento/i);
  assert.match(compositionPage, /preenchida automaticamente por data/i);
  assert.doesNotMatch(publicPage, /BeyondMatchdayArticleRow|published_at\.desc[\s\S]*beyondMatchday/);
});

test("arquivar e reativar uma notícia livre repõe 15 lugares e momentos posteriores", () => {
  const assignFormStart = compositionPage.indexOf("function AssignBankItemForm(");
  const assignFormEnd = compositionPage.indexOf("function BankNewsListItem(", assignFormStart);
  const assignForm = compositionPage.slice(assignFormStart, assignFormEnd);
  const bankCardStart = compositionPage.indexOf("function BankNewsListItem(");
  const bankCardEnd = compositionPage.indexOf("function LatestArticlePresentationForm(", bankCardStart);
  const bankCard = compositionPage.slice(bankCardStart, bankCardEnd);

  assert.match(assignForm, /composition\.status !== "draft" \|\| item\.status !== "active"/);
  assert.match(assignForm, /Usar num dos 15 lugares…/);
  assert.match(assignForm, /Usar num momento posterior…/);
  assert.match(
    assignForm,
    /Atribuir ao lugar<\/button>\s*<\/form>\s*<form[\s\S]*assign_bank_item_to_hierarchical_auxiliary/,
  );
  assert.doesNotMatch(
    assignForm,
    /\{isArticle \? \([\s\S]*assign_bank_item_to_hierarchical_auxiliary/,
  );

  assert.match(bankCard, /!isArchived && !placementLabel \? \(\s*<AssignBankItemForm/);
  assert.match(bankCard, /isArchived \? \([\s\S]*actionType="reactivate_bank_item"/);
  assert.match(compositionRoute, /reactivate_bank_item[\s\S]*updateBankItemStatus\(formData, "active"\)/);
  assert.match(compositionRoute, /body: JSON\.stringify\(\{ status: nextStatus \}\)/);
  assert.match(compositionRoute, /function projectHierarchicalAuxiliaryBankItem/);
  assert.match(
    compositionRoute,
    /const projection = articleId[\s\S]*projectHierarchicalAuxiliaryArticle[\s\S]*: projectHierarchicalAuxiliaryBankItem\(bankItem\)/,
  );
  assert.ok((compositionRoute.match(/hierarchicalCompositionUsesBankItem\(/g) ?? []).length >= 3);
});

test("draft incompleto é representável, mas só 15 slots completos são publicáveis", () => {
  const incomplete = HIERARCHICAL_COMPOSITION_SLOT_KEYS.slice(0, 3).map((key) => slot(key));
  assert.equal(missingHierarchicalCompositionSlots(incomplete).length, 12);
  assert.equal(isPublishableHierarchicalComposition(incomplete), false);

  const complete = HIERARCHICAL_COMPOSITION_SLOT_KEYS.map((key) => slot(key));
  assert.equal(missingHierarchicalCompositionSlots(complete).length, 0);
  assert.equal(incompleteHierarchicalCompositionSlots(complete).length, 0);
  assert.equal(isPublishableHierarchicalComposition(complete), true);

  complete[0] = slot("dominant_main", { image_url_snapshot: null });
  assert.deepEqual(incompleteHierarchicalCompositionSlots(complete), ["dominant_main"]);
  assert.equal(isPublishableHierarchicalComposition(complete), false);
  assert.match(compositionRoute, /Completa os 15 lugares antes de publicar/);
  assert.match(applySql, /v_slot_count <> 15 or v_complete_slot_count <> 15/i);
  assert.match(smokeSql, /draft hierárquico incompleto foi publicado/i);
});

test("publicação e alternância usam uma única RPC transacional e preservam a outra versão", () => {
  assert.match(applySql, /function public\.activate_matchday_reference_composition/);
  assert.match(applySql, /where matchday_id = p_matchday_id[\s\S]*for update/i);
  assert.match(applySql, /set is_current = false[\s\S]*where matchday_id = p_matchday_id/i);
  assert.match(applySql, /set status = case when status = 'draft' then 'published'/i);
  assert.match(applySql, /is_current = true/i);
  assert.doesNotMatch(applySql, /delete from public\.matchday_reference_compositions/i);
  assert.match(compositionRoute, /rpc\/activate_matchday_reference_composition/);
  assert.doesNotMatch(compositionRoute, /body: JSON\.stringify\(\{ is_current: false \}\)[\s\S]*status: "published"/);
  assert.match(smokeSql, /reversão atómica para standard incoerente/i);
  assert.match(postflightSql, /RPC atómica incompleta/i);
});

test("o editor seleciona o modo, usa o banco, permite preview e não ativa o draft", () => {
  assert.match(compositionPage, />\s*Atual\s*</);
  assert.match(compositionPage, />\s*Hierárquica\s*</);
  assert.match(compositionPage, /assign_bank_item_to_hierarchical_slot/);
  assert.match(compositionPage, /HIERARCHICAL_COMPOSITION_MOMENTS\.map/);
  assert.match(compositionPage, /<HierarchicalCompositionInterpretivePreview/);
  assert.match(compositionPage, /slots={hierarchicalSlots}/);
  assert.match(interpretivePreview, /composition-interpretive-slot-empty/);
  assert.match(compositionPage, /O preview usa o draft e não altera publicação nem apresentação current/);
  assert.match(compositionPage, /Publicar e usar esta apresentação/);
  assert.match(compositionPage, /Usar apresentação Atual/);
  assert.match(
    compositionPage,
    /<\/section>\s*<\/div>\s*\{presentationMode === "hierarchical"[\s\S]*className="composition-admin-panel composition-admin-preview-section"/,
  );
  assert.match(
    compositionPage,
    /\.composition-admin-preview \{[\s\S]*width: 100%;[\s\S]*max-width: 1200px;[\s\S]*margin-inline: auto;/,
  );
});

test("o sincronizador vivo só encontra composição current standard", () => {
  assert.match(currentSync, /select=id,presentation_mode/);
  assert.match(currentSync, /presentation_mode=eq\.standard/);
  assert.doesNotMatch(currentSync, /matchday_hierarchical_composition_slots/);
});

test("o renderer público usa a arquitetura interpretativa validada e mantém os quatro snapshots", () => {
  const slotMapSource = renderer.match(
    /HIERARCHICAL_PUBLIC_INTERPRETIVE_SLOT_MAP = \{([\s\S]*?)\n\} as const;/,
  )?.[1] ?? "";
  const mappedSlotKeys = HIERARCHICAL_COMPOSITION_SLOT_KEYS.filter((slotKey) => {
    const occurrences = slotMapSource.match(new RegExp(`"${slotKey}"`, "g")) ?? [];
    assert.equal(occurrences.length, 1, `${slotKey} deve ocorrer uma única vez no mapa público`);
    return occurrences.length === 1;
  });

  assert.match(publicPage, /<PublicHierarchicalComposition/);
  assert.match(publicPage, /className="public-matchday-hierarchical-region"/);
  assert.match(
    publicPage,
    /\.public-matchday-hierarchical-region \{[\s\S]*width: 100%;[\s\S]*max-width: 1200px;[\s\S]*box-sizing: border-box;[\s\S]*margin-inline: auto;/,
  );
  assert.equal(mappedSlotKeys.length, HIERARCHICAL_COMPOSITION_SLOT_KEYS.length);
  assert.match(renderer, /data-public-hierarchical-layout="interpretive"/);
  assert.match(renderer, /composition-interpretive-opening/);
  assert.match(renderer, /composition-interpretive-analysis-grid/);
  assert.match(renderer, /composition-interpretive-other-games-layout/);
  assert.match(renderer, /slot\.image_url_snapshot/);
  assert.match(renderer, /slot\.label_snapshot/);
  assert.match(renderer, /slot\.title_snapshot/);
  assert.match(renderer, /slot\.subtitle_snapshot/);
  assert.doesNotMatch(renderer, /HIERARCHICAL_EDITORIAL_PREVIEW_MOCK|mock-preview-not-persisted|Mock de preview · não publicado/);
});

test("o renderer público conserva a hierarquia visual do preview e usa Editorial autónomo quando completo", () => {
  assert.match(renderer, /composition-interpretive-dominant[\s\S]*grid-template-columns: minmax\(0, 5fr\) minmax\(0, 4fr\)/);
  assert.match(renderer, /composition-interpretive-chronicles[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(renderer, /composition-interpretive-analysis-main[\s\S]*grid-column: span 4/);
  assert.match(renderer, /composition-interpretive-analysis-center[\s\S]*grid-column: span 5/);
  assert.match(renderer, /composition-interpretive-analysis-side[\s\S]*grid-column: span 3/);
  assert.match(renderer, /composition-interpretive-other-left[\s\S]*grid-column: span 7/);
  assert.match(renderer, /composition-interpretive-other-compact-column[\s\S]*grid-column: span 5/);
  assert.match(renderer, /composition-interpretive-news-full \{\s*grid-column: 1 \/ -1;/);
  assert.match(renderer, /data-editorial-source="hierarchical-composition"/);
  assert.match(renderer, /hasEditorial \? \(/);
  assert.match(renderer, /@media \(max-width: 980px\)/);
  assert.match(renderer, /@media \(max-width: 720px\)/);
  assert.doesNotMatch(renderer, /visibleMoments\.map|public-hierarchical-card/);
});

test("a abertura interpretativa V4 existe apenas no preview e distribui os 15 slots sem repetições", () => {
  const slotMapSource = interpretivePreview.match(
    /HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP = \{([\s\S]*?)\n\} as const;/,
  )?.[1] ?? "";
  const mappedSlotKeys = HIERARCHICAL_COMPOSITION_SLOT_KEYS.filter((slotKey) => {
    const occurrences = slotMapSource.match(new RegExp(`"${slotKey}"`, "g")) ?? [];
    assert.equal(occurrences.length, 1, `${slotKey} deve ocorrer uma única vez no mapa do preview`);
    return occurrences.length === 1;
  });

  assert.match(compositionPage, /HierarchicalCompositionInterpretivePreview/);
  assert.doesNotMatch(publicPage, /HierarchicalCompositionInterpretivePreview|backofficePreviewMomentKeys/);
  assert.doesNotMatch(interpretivePreview, /<PublicHierarchicalComposition[\s/>]|backofficePreviewMomentKeys/);
  assert.equal(mappedSlotKeys.length, HIERARCHICAL_COMPOSITION_SLOT_KEYS.length);

  assert.match(interpretivePreview, /data-preview-only="hierarchical-interpretive-opening"/);
  assert.match(interpretivePreview, /max-width: 1200px/);
  assert.match(interpretivePreview, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(interpretivePreview, /composition-interpretive-news[\s\S]*grid-column: span 9/);
  assert.match(interpretivePreview, /composition-interpretive-editorial[\s\S]*grid-column: span 3/);
  assert.doesNotMatch(interpretivePreview, /fetchSupabase|writeSupabase|editorial_articles|matchday_reference_compositions/);
});

test("a abertura V3 permanece 9+3 com dominante 5+4, três crónicas e Editorial", () => {
  const upperBlockStart = interpretivePreview.indexOf('<section className="composition-interpretive-opening"');
  const upperBlockEnd = interpretivePreview.indexOf("</section>", upperBlockStart);
  const editorialIndex = interpretivePreview.indexOf('className="composition-interpretive-editorial"', upperBlockStart);

  assert.ok(upperBlockStart >= 0 && upperBlockEnd > upperBlockStart);
  assert.ok(editorialIndex > upperBlockStart && editorialIndex < upperBlockEnd);
  assert.match(interpretivePreview, /composition-interpretive-dominant[\s\S]*grid-template-columns: minmax\(0, 5fr\) minmax\(0, 4fr\)/);
  assert.match(
    interpretivePreview,
    /composition-interpretive-dominant \.composition-interpretive-title[\s\S]*font-family: Georgia, "Times New Roman", serif;[\s\S]*font-size: clamp\(25px, 2\.37vw, 34px\);[\s\S]*font-weight: 700;[\s\S]*line-height: 1\.06;[\s\S]*letter-spacing: 0/,
  );
  assert.match(interpretivePreview, /composition-interpretive-chronicles[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(interpretivePreview, /composition-interpretive-chronicle \.composition-interpretive-title[\s\S]*font-size: 19px;[\s\S]*font-weight: 800/);
  assert.match(interpretivePreview, /composition-interpretive-chronicle \.composition-interpretive-subtitle[\s\S]*color: #6d7989;[\s\S]*font-size: 12\.5px;[\s\S]*line-height: 1\.52/);
  assert.match(interpretivePreview, /composition-interpretive-editorial[\s\S]*align-self: start/);
  assert.match(interpretivePreview, /slot\.image_url_snapshot/);
  assert.match(interpretivePreview, /slot\.label_snapshot/);
  assert.match(interpretivePreview, /slot\.title_snapshot/);
  assert.match(interpretivePreview, /slot\.subtitle_snapshot/);
  assert.match(interpretivePreview, /object-fit: cover/);
});



test("Arbitragem e reações mantém 4+5+3 com distribuição vertical matemática e pós-títulos binários", () => {
  const openingIndex = interpretivePreview.indexOf('className="composition-interpretive-opening"');
  const analysisIndex = interpretivePreview.indexOf('className="composition-interpretive-section composition-interpretive-analysis"');
  const otherGamesIndex = interpretivePreview.indexOf('className="composition-interpretive-section composition-interpretive-other-games"');

  assert.ok(openingIndex >= 0 && analysisIndex > openingIndex && otherGamesIndex > analysisIndex);
  assert.doesNotMatch(interpretivePreview, /composition-interpretive-statements|data-grid-span="(12|6)"/);
  assert.match(interpretivePreview, />Arbitragem e reações<\/h2>/);
  assert.match(interpretivePreview, /composition-interpretive-analysis-grid[\s\S]*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);[\s\S]*align-items: stretch;[\s\S]*gap: 28px/);
  assert.match(interpretivePreview, /composition-interpretive-analysis-main \{[\s\S]*grid-column: span 4/);
  assert.match(interpretivePreview, /composition-interpretive-analysis-center \{[\s\S]*grid-column: span 5;[\s\S]*grid-template-rows: repeat\(3, auto\);[\s\S]*align-content: space-between;[\s\S]*height: 100%/);
  assert.match(interpretivePreview, /composition-interpretive-analysis-side \{[\s\S]*grid-column: span 3;[\s\S]*grid-template-rows: repeat\(2, auto\);[\s\S]*align-content: space-between;[\s\S]*height: 100%/);
  assert.match(interpretivePreview, /dominant: "secondary_strong_1"/);
  assert.match(interpretivePreview, /center: \["secondary_strong_2", "secondary_1", "secondary_2"\]/);
  assert.match(interpretivePreview, /side: \["dominant_side_top", "dominant_side_bottom"\]/);
  assert.match(interpretivePreview, /data-editorial-weight="main"/);
  assert.match(interpretivePreview, /data-editorial-weight="development"/);
  assert.match(interpretivePreview, /data-editorial-weight="complement"/);
  assert.match(interpretivePreview, /composition-interpretive-analysis-main \.composition-interpretive-media \{[\s\S]*aspect-ratio: 2 \/ 1/);
  assert.match(interpretivePreview, /composition-interpretive-analysis-main \.composition-interpretive-title \{[\s\S]*font-size: 24px;[\s\S]*line-height: 1\.12/);
  assert.match(interpretivePreview, /composition-interpretive-analysis-medium \{[\s\S]*grid-template-columns: minmax\(156px, 1\.08fr\) minmax\(0, 1\.72fr\)[\s\S]*gap: 14px;[\s\S]*align-items: stretch;[\s\S]*padding-bottom: 12px/);
  assert.match(interpretivePreview, /composition-interpretive-analysis-medium \.composition-interpretive-media \{[\s\S]*aspect-ratio: 16 \/ 9;[\s\S]*height: auto;[\s\S]*min-height: 0/);
  assert.match(interpretivePreview, /composition-interpretive-analysis-medium \.composition-interpretive-title \{[\s\S]*font-size: 16px;[\s\S]*font-weight: 800;[\s\S]*line-height: 1\.12/);
  assert.match(
    interpretivePreview,
    /HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP\.analysis\.center\.map\(\(slotKey\) => \{[\s\S]*<PreviewNewsCopy[\s\S]*showSubtitle=\{false\}[\s\S]*slot=\{slot\}[\s\S]*slotKey=\{slotKey\}/,
  );
  assert.match(interpretivePreview, /composition-interpretive-analysis-side-item \.composition-interpretive-media \{[\s\S]*aspect-ratio: 2\.45 \/ 1/);
  assert.match(interpretivePreview, /composition-interpretive-analysis-side-item \.composition-interpretive-title \{[\s\S]*font-size: 15px;[\s\S]*font-weight: 800;[\s\S]*line-height: 1\.15/);
  assert.match(
    interpretivePreview,
    /HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP\.analysis\.side\.map\(\(slotKey\) => \{[\s\S]*<PreviewNewsCopy[\s\S]*showSubtitle=\{false\}[\s\S]*slot=\{slot\}[\s\S]*slotKey=\{slotKey\}/,
  );
  assert.match(interpretivePreview, /composition-interpretive-analysis-main \.composition-interpretive-title \{[\s\S]*-webkit-line-clamp: 3/);
  assert.doesNotMatch(interpretivePreview, /composition-interpretive-reactions|composition-interpretive-reaction|repeat\(6, minmax/);
});

test("Outros jogos mantém 7+5 com duas peças à esquerda, três à direita e compactos com altura alinhada ao título", () => {
  assert.match(interpretivePreview, />Outros jogos da jornada<\/h2>/);
  assert.match(interpretivePreview, /primary: "secondary_3"/);
  assert.match(interpretivePreview, /second: "secondary_4"/);
  assert.match(interpretivePreview, /compact: \["closing_1", "closing_2", "closing_3"\]/);
  assert.match(interpretivePreview, /composition-interpretive-other-games-layout[\s\S]*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);[\s\S]*align-items: stretch;[\s\S]*gap: 28px/);
  assert.match(interpretivePreview, /composition-interpretive-other-left \{[\s\S]*grid-column: span 7;[\s\S]*grid-template-rows: repeat\(2, auto\);[\s\S]*align-content: space-between;[\s\S]*gap: 24px;[\s\S]*height: 100%/);
  assert.match(interpretivePreview, /composition-interpretive-other-compact-column \{[\s\S]*grid-column: span 5;[\s\S]*grid-template-rows: repeat\(3, minmax\(0, 1fr\)\);[\s\S]*align-content: stretch;[\s\S]*height: 100%/);
  assert.match(interpretivePreview, /composition-interpretive-other-featured \.composition-interpretive-media \{[\s\S]*aspect-ratio: 3 \/ 1/);
  assert.match(interpretivePreview, /composition-interpretive-other-featured \.composition-interpretive-title \{[\s\S]*font-size: 22px/);
  assert.match(interpretivePreview, /composition-interpretive-other-second-featured \{[\s\S]*grid-template-columns: minmax\(0, 0\.82fr\) minmax\(0, 1\.58fr\)/);
  assert.match(interpretivePreview, /composition-interpretive-other-second-featured \.composition-interpretive-media \{[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.match(interpretivePreview, /data-editorial-weight="featured-primary"[\s\S]*<PreviewNewsCopy slot=\{otherFeaturedSlot\} slotKey=\{otherFeaturedKey\} \/>/);
  assert.match(interpretivePreview, /data-editorial-weight="featured-secondary"[\s\S]*<PreviewNewsCopy slot=\{otherSecondSlot\} slotKey=\{otherSecondKey\} \/>/);
  assert.match(interpretivePreview, /composition-interpretive-other-second-featured \.composition-interpretive-subtitle \{[\s\S]*font-size: 12\.5px;[\s\S]*-webkit-line-clamp: 3/);
  assert.match(interpretivePreview, /HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP\.otherGames\.compact\.map/);
  assert.match(interpretivePreview, /composition-interpretive-other-compact \{[\s\S]*grid-template-columns: minmax\(128px, 0\.94fr\) minmax\(0, 1\.46fr\)[\s\S]*column-gap: 14px;[\s\S]*row-gap: 6px;[\s\S]*align-items: stretch;[\s\S]*padding-block: 14px/);
  assert.match(interpretivePreview, /composition-interpretive-other-compact \.composition-interpretive-media-link \{[\s\S]*display: block;[\s\S]*height: auto[\s\S]*\}[\s\S]*composition-interpretive-other-compact \.composition-interpretive-media \{[\s\S]*aspect-ratio: 16 \/ 9;[\s\S]*height: auto;[\s\S]*min-height: 0/);
  assert.match(
    interpretivePreview,
    /HIERARCHICAL_INTERPRETIVE_PREVIEW_SLOT_MAP\.otherGames\.compact\.map[\s\S]*<PreviewNewsCopy showSubtitle=\{false\} slot=\{slot\} slotKey=\{slotKey\} \/>[\s\S]*slot\?\.subtitle_snapshot[\s\S]*\{slot\.subtitle_snapshot\}/,
  );
  assert.match(interpretivePreview, /composition-interpretive-other-compact \.composition-interpretive-title \{[\s\S]*min-height: calc\(3 \* 15px \* 1\.17\);[\s\S]*-webkit-line-clamp: 3/);
  assert.doesNotMatch(interpretivePreview, /composition-interpretive-other-secondary-grid|repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(interpretivePreview, /composition-interpretive-other-games-grid|composition-interpretive-other-game(?:\s|\.)/);
  assert.doesNotMatch(interpretivePreview, /Empate deixa primeiro aviso|André Silva revive|article_id|source_identity\s*===/);
});

test("o Editorial da Jornada é autónomo, persistido na composição e obrigatório nas novas publicações hierarchical", () => {
  const editorialMarkup = interpretivePreview.match(/<aside[\s\S]*?composition-interpretive-editorial[\s\S]*?>([\s\S]*?)<\/aside>/)?.[1] ?? "";

  assert.deepEqual(missingHierarchicalCompositionEditorialFields(null), ["title", "text", "author"]);
  assert.equal(isPublishableHierarchicalCompositionEditorial({ title: "Título", text: "Texto", author: "Autor" }), true);
  assert.equal(isPublishableHierarchicalCompositionEditorial({ title: "Título", text: " ", author: "Autor" }), false);
  assert.deepEqual(hierarchicalCompositionEditorialParagraphs("Primeiro.\n\nSegundo."), ["Primeiro.", "Segundo."]);

  assert.match(editorialPreflightSql, /matchday_reference_compositions/);
  assert.match(editorialApplySql, /add column if not exists hierarchical_editorial_title text/i);
  assert.match(editorialApplySql, /add column if not exists hierarchical_editorial_text text/i);
  assert.match(editorialApplySql, /add column if not exists hierarchical_editorial_author text/i);
  assert.match(editorialApplySql, /matchday_reference_compositions_hierarchical_editorial_complete_check[\s\S]*not valid/i);
  assert.match(editorialPostflightSql, /constraint deveria permanecer NOT VALID/i);
  assert.match(editorialSmokeSql, /hierarchical publicada sem Editorial completo foi aceite/i);

  assert.match(compositionPage, /action_type" value="update_hierarchical_editorial"/);
  assert.match(compositionPage, /feedbackAnchor === "hierarchical-editorial"/);
  assert.match(compositionPage, /Este texto pertence apenas a esta composição hierárquica/);
  assert.match(compositionRoute, /updateHierarchicalEditorial/);
  assert.match(compositionRoute, /Completa o Editorial da Jornada antes de publicar/);
  assert.match(publicLoader, /hierarchical_editorial_title/);
  assert.match(publicLoader, /hierarchical_editorial_text/);
  assert.match(publicLoader, /hierarchical_editorial_author/);
  assert.match(publicPage, /editorial=\{hierarchicalEditorial\}/);
  assert.match(interpretivePreview, /data-editorial-source="hierarchical-composition-draft"/);
  assert.match(renderer, /data-editorial-source="hierarchical-composition"/);
  assert.doesNotMatch(interpretivePreview, /HIERARCHICAL_EDITORIAL_PREVIEW_MOCK|mock-preview-not-persisted|Mock de preview · não publicado/);
  assert.doesNotMatch(renderer, /editorialSideBlock|published-context/);
  assert.doesNotMatch(editorialMarkup, /<img/);
});

test("a página pública preserva a composição 4+5+3 de Arbitragem e reações", () => {
  assert.match(renderer, />Arbitragem e reações<\/h2>/);
  assert.match(renderer, /dominant: "secondary_strong_1"/);
  assert.match(renderer, /center: \["secondary_strong_2", "secondary_1", "secondary_2"\]/);
  assert.match(renderer, /side: \["dominant_side_top", "dominant_side_bottom"\]/);
  assert.match(renderer, /composition-interpretive-analysis-grid[\s\S]*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(renderer, /composition-interpretive-analysis-main[\s\S]*grid-column: span 4/);
  assert.match(renderer, /composition-interpretive-analysis-center[\s\S]*grid-column: span 5/);
  assert.match(renderer, /composition-interpretive-analysis-side[\s\S]*grid-column: span 3/);
});

test("a página pública preserva Outros jogos em 7+5 com duas peças e três compactas", () => {
  assert.match(renderer, />Outros jogos da jornada<\/h2>/);
  assert.match(renderer, /primary: "secondary_3"/);
  assert.match(renderer, /second: "secondary_4"/);
  assert.match(renderer, /compact: \["closing_1", "closing_2", "closing_3"\]/);
  assert.match(renderer, /composition-interpretive-other-left[\s\S]*grid-column: span 7/);
  assert.match(renderer, /composition-interpretive-other-compact-column[\s\S]*grid-column: span 5/);
});

test("hierarchical inválida falha controladamente e os vídeos permanecem depois dos 15", () => {
  assert.match(publicPage, /hasValidHierarchicalReferenceComposition/);
  assert.match(publicPage, /temporariamente indisponível/);
  assert.match(publicPage, /!useHierarchicalReferenceComposition/);
  assert.match(renderer, /public-hierarchical-videos/);
  assert.match(renderer, /<PublicEditorialLayout/);
  assert.doesNotMatch(renderer, /<RoundupVideoSwitcher/);
  assert.ok(renderer.indexOf('className="composition-interpretive-other-games-layout"') < renderer.lastIndexOf("<PublicHierarchicalPosteriorMoments"));
});

test("o renderer posterior existe apenas na composição hierárquica e conserva a ordem editorial 1+4", () => {
  assert.match(renderer, /<PublicBeyondMatchdayNews/);
  assert.match(renderer, /ATUALIDADE NO MOMENTO DA JORNADA/);
  assert.match(publicPage, /beyondMatchdayItems=\{hierarchicalBeyondMatchdayNews\}/);
  assert.match(publicPage, /useHierarchicalReferenceComposition\s*\? context\.referenceRoundupItems/);
  assert.doesNotMatch(publicPage, /<PublicBeyondMatchdayNews[\s/>]/);
});

test("Para Lá mantém duas secundárias superiores com imagem e duas inferiores textuais", () => {
  assert.match(beyondRenderer, /secondary\.map\(\(item, index\) =>/);
  assert.match(beyondRenderer, /const isTextOnly = index >= 2/);
  assert.match(beyondRenderer, /data-secondary-presentation={isTextOnly \? "text" : "image"}/);
  assert.match(beyondRenderer, /{isTextOnly \? null : <StoryMedia item={item} \/>}/);
  assert.match(beyondRenderer, /<StoryCopy item={item} showSubtitle \/>/);
  assert.match(beyondRenderer, /\(lead \|\| showSubtitle\) && item\.subtitle/);
  assert.match(beyondRenderer, /public-beyond-matchday-secondary-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(beyondRenderer, /public-beyond-matchday-text-only[\s\S]*border-top: 1px solid #dbe4ee/);
  assert.match(beyondRenderer, /public-beyond-matchday-text-only \.public-beyond-matchday-subtitle[\s\S]*-webkit-line-clamp: 2/);
});

test("o preview do draft inclui Vídeo, Destaque e Para Lá sem alterar current", () => {
  assert.match(compositionPage, /hierarchicalPreviewRoundupItems/);
  assert.match(compositionPage, /hierarchicalPreviewVideoHighlight/);
  assert.match(compositionPage, /hierarchicalPreviewBeyondMatchdayItems/);
  assert.match(compositionPage, /roundupHeading="A JORNADA EM VÍDEO"/);
  assert.match(compositionPage, /videoHighlight={hierarchicalPreviewVideoHighlight}/);
  assert.match(compositionPage, /beyondMatchdayItems={hierarchicalPreviewBeyondMatchdayItems}/);
  assert.match(interpretivePreview, /<PublicHierarchicalPosteriorMoments/);
  assert.match(renderer, /data-hierarchical-posterior-moments="true"/);
  assert.match(renderer, /<PublicEditorialLayout/);
  assert.match(renderer, /<PublicBeyondMatchdayNews/);
  assert.doesNotMatch(interpretivePreview, /activate_matchday_reference_composition|is_current|writeSupabase/);
});

test("o preview de vídeo reutiliza o renderer V13 e não mantém markup visual paralelo", () => {
  assert.match(interpretivePreview, /<PublicHierarchicalPosteriorMoments/);
  assert.match(interpretivePreview, /includeV13PreviewStructure/);
  assert.doesNotMatch(interpretivePreview, /<PublicEditorialLayout|<RoundupVideoSwitcher/);
  assert.doesNotMatch(
    interpretivePreview,
    /public-roundup-switch-item|public-roundup-video-content|public-roundup-video-panel|public-roundup-switch-thumb/,
  );

  assert.equal(renderer.match(/<PublicEditorialLayout/g)?.length, 1);
  assert.doesNotMatch(renderer, /<RoundupVideoSwitcher/);
  assert.match(renderer, /includeV13PreviewStructure = false/);
  assert.match(renderer, /includeV13PreviewStructure \? <style>{hierarchicalV13PreviewStructureStyles}<\/style> : null/);
  assert.match(
    renderer,
    /public-hierarchical-v13-preview \.public-roundup-switch-item \{[\s\S]*display: grid;[\s\S]*align-items: center;/,
  );
  assert.match(
    renderer,
    /public-hierarchical-v13-preview \.public-roundup-meta,[\s\S]*public-roundup-active-meta \{[\s\S]*display: flex;/,
  );
  assert.match(
    renderer,
    /public-hierarchical-v13-preview \.public-roundup-video-block,[\s\S]*public-complement-body \{[\s\S]*display: grid;/,
  );
});

test("o preview preserva cinco vídeos visíveis e scroll vertical para os restantes", () => {
  const previewStructureStyles = renderer.match(
    /const hierarchicalV13PreviewStructureStyles = `([\s\S]*?)`;/,
  )?.[1] ?? "";

  assert.match(
    previewStructureStyles,
    /public-hierarchical-v13-preview \.public-roundup-scroll-window \{\s*overflow-y: auto;/,
  );
  assert.doesNotMatch(
    previewStructureStyles,
    /public-hierarchical-v13-preview \.public-roundup-scroll-window \{[^}]*\b(?:height|max-height):/,
  );
  assert.match(
    roundupSwitcher,
    /public-roundup-scroll-window \{[\s\S]*height: var\(--public-roundup-list-height\);[\s\S]*max-height: var\(--public-roundup-list-height\);/,
  );
  assert.match(roundupSwitcher, /public-roundup-switch-item \{[\s\S]*flex: 0 0 20%;/);
});



test("cabecalhos de secao usam escala editorial de 18px, preto e caixa alta", () => {
  assert.match(
    interpretivePreview,
    /\.composition-admin-panel h2\.composition-interpretive-section-heading \{[\s\S]*margin: 0 0 16px;[\s\S]*color: #526173;[\s\S]*font-family: "Segoe UI", Arial, Helvetica, sans-serif;[\s\S]*font-size: 18px;[\s\S]*font-weight: 800;[\s\S]*line-height: 1\.15;[\s\S]*text-transform: uppercase;/,
  );
  assert.match(
    interpretivePreview,
    /\.composition-interpretive-section \{[\s\S]*padding-top: 18px;[\s\S]*border-top: 1px solid #dfe5eb;/,
  );
  assert.doesNotMatch(
    interpretivePreview,
    /\.composition-interpretive-section::before/,
  );
});
