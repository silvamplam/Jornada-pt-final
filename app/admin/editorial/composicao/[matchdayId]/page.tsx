import type { ReactNode } from "react";
import {
  fetchSupabaseAdminTable,
  type SupabaseCompetition,
  type SupabaseCountry,
  type SupabaseMatchday,
  type SupabaseMatchdayEditorial,
  type SupabaseMatchdayHighlight,
  type SupabaseMatchdayHorizontalNews,
  type SupabaseMatchdayLatestNews,
  type SupabaseMatchdayRoundupItem,
  type SupabaseSeason
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CompositionPageProps = {
  params: Promise<{
    matchdayId: string;
  }>;
  searchParams?: Promise<{
    bank_archived?: string;
    bank_assigned?: string;
    bank_assignment_error?: string;
    bank_error?: string;
    bank_existing?: string;
    bank_filter?: string;
    bank_repeated?: string;
    bank_reactivated?: string;
    bank_saved?: string;
    bank_skipped?: string;
    bank_updated?: string;
    bank_status_error?: string;
    bank_unassigned?: string;
    composition_error?: string;
    composition_saved?: string;
  }>;
};

type MatchdayContext = {
  matchday: SupabaseMatchday;
  season: SupabaseSeason;
  competition: SupabaseCompetition;
  country: SupabaseCountry | null;
};

type ContextSelectorData = {
  countries: SupabaseCountry[];
  competitions: SupabaseCompetition[];
  seasons: SupabaseSeason[];
  matchdays: SupabaseMatchday[];
  error: string;
};

type SupabaseArticle = {
  id: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  source_url: string | null;
  status: string;
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
  match_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReferenceComposition = {
  id: string;
  matchday_id: string;
  status: string;
  is_current: boolean;
  internal_name: string | null;
  use_roundup_items: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

type ReferenceCompositionItem = {
  id: string;
  composition_id: string;
  slot_type: string;
  source_type: string;
  source_id: string | null;
  article_id: string | null;
  sort_order: number;
  title_snapshot: string | null;
  subtitle_snapshot: string | null;
  image_url_snapshot: string | null;
  link_url_snapshot: string | null;
  label_snapshot: string | null;
  label_color_snapshot: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type MatchdayEditorialBankItem = {
  id: string;
  matchday_id: string;
  label: string | null;
  label_color: string | null;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  source_type: string | null;
  source_id: string | null;
  source_slug: string | null;
  origin_slot_type: string | null;
  sort_order: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type MatchdayEditorialWithHeadlineLink = SupabaseMatchdayEditorial & {
  headline_link_url?: string | null;
};

type MatchdayHighlightWithLink = SupabaseMatchdayHighlight & {
  link_url?: string | null;
};

const referenceCompositionSections = [
  { slotType: "headline", title: "Manchete" },
  { slotType: "complement", title: "Complemento da manchete" },
  { slotType: "side_block", title: "Bloco lateral" },
  { slotType: "highlight", title: "Destaques abaixo da manchete" },
  { slotType: "important_item", title: "Faixa horizontal de notícias" },
  { slotType: "editorial_line_item", title: "Zona editorial final" },
  { slotType: "related_article", title: "Artigos relacionados" },
  { slotType: "roundup", title: "Resumo / Vídeos" },
  { slotType: "custom_card", title: "Cartão personalizado" }
];

const bankAssignableSlotTypes = new Set(["headline", "complement", "side_block", "highlight", "important_item", "editorial_line_item"]);
const bankAssignableSlotOptions = referenceCompositionSections.filter((section) => bankAssignableSlotTypes.has(section.slotType));

function groupCompositionItemsBySection(items: ReferenceCompositionItem[]) {
  const orderedItems = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const knownSlotTypes = new Set(referenceCompositionSections.map((section) => section.slotType));
  const sections = referenceCompositionSections
    .map((section) => ({
      ...section,
      items: orderedItems.filter((item) => item.slot_type === section.slotType)
    }))
    .filter(
      (section) =>
        section.items.length > 0 ||
        bankAssignableSlotTypes.has(section.slotType) ||
        section.slotType === "roundup"
    );
  const otherItems = orderedItems.filter((item) => !knownSlotTypes.has(item.slot_type));

  if (otherItems.length > 0) {
    sections.push({
      slotType: "other",
      title: "Outros itens",
      items: otherItems
    });
  }

  return sections;
}

function compositionSectionTitle(slotType?: string | null) {
  return referenceCompositionSections.find((section) => section.slotType === slotType)?.title ?? "Outros itens";
}

function normalizeCandidateLink(value?: string | null) {
  return textOrEmpty(value).toLowerCase();
}

function normalizeCandidateValue(value?: string | null) {
  return textOrEmpty(value).toLowerCase();
}

function normalizeSourceType(sourceType?: string | null) {
  const normalized = normalizeCandidateValue(sourceType);

  if (normalized === "matchday_editorials") return "matchday_editorial";
  if (normalized === "matchday_highlights") return "matchday_highlight";
  if (normalized === "matchday_roundup_items") return "matchday_roundup_item";
  if (normalized === "articles") return "article";

  return normalized;
}

function isMatchdayEditorialSource(sourceType?: string | null) {
  return normalizeSourceType(sourceType) === "matchday_editorial";
}

function isFreeNewsSlot(slotType?: string | null) {
  return slotType === "important_item" || slotType === "editorial_line_item";
}

function isBankCompositionSource(sourceType?: string | null, sourceId?: string | null) {
  const normalizedSourceType = normalizeSourceType(sourceType);
  return Boolean(sourceId) && (normalizedSourceType === "manual_link" || normalizedSourceType === "matchday_editorial_bank_item");
}

function bankItemPlacementLabel(items: ReferenceCompositionItem[], bankItem: MatchdayEditorialBankItem) {
  const directSlotTitles = items
    .filter((item) => isBankCompositionSource(item.source_type, item.source_id) && item.source_id === bankItem.id)
    .map((item) => compositionSectionTitle(item.slot_type));
  const directUniqueSlotTitles = Array.from(new Set(directSlotTitles));

  if (directUniqueSlotTitles.length > 0) {
    return directUniqueSlotTitles.join(", ");
  }

  return candidatePlacementLabel(items, {
    sourceType: bankItem.source_type ?? "matchday_editorial_bank_item",
    sourceId: bankItem.source_id,
    linkUrl: bankItem.link_url,
    title: bankItem.title,
    subtitle: bankItem.subtitle,
    imageUrl: bankItem.image_url
  });
}

function isArtificialFreeZoneLabel(label?: string | null, sourceType?: string | null) {
  const normalizedLabel = normalizeCandidateValue(label);
  const normalizedSourceType = normalizeSourceType(sourceType);

  if (!normalizedLabel) return false;
  if (
    normalizedLabel === "zona editorial final" ||
    normalizedLabel === "mais noticias da jornada" ||
    normalizedLabel === "mais notícias da jornada" ||
    normalizedLabel === "faixa horizontal de noticias" ||
    normalizedLabel === "faixa horizontal de notícias"
  ) return true;
  if (normalizedSourceType === "matchday_editorial") {
    return normalizedLabel === "manchete" || normalizedLabel === "complemento" || normalizedLabel === "complemento da manchete" || normalizedLabel === "bloco lateral";
  }
  if (normalizedSourceType === "article") {
    return normalizedLabel === "artigo / noticia" || normalizedLabel === "artigo / notícia";
  }

  return false;
}

function compositionItemDisplayLabel(item: ReferenceCompositionItem) {
  if (isFreeNewsSlot(item.slot_type) && isArtificialFreeZoneLabel(item.label_snapshot, item.source_type)) {
    return null;
  }

  return item.label_snapshot || item.slot_type;
}

function matchdayEditorialOriginSlot(item: ReferenceCompositionItem) {
  if (!isMatchdayEditorialSource(item.source_type)) {
    return null;
  }

  if (item.slot_type === "headline" || item.slot_type === "complement" || item.slot_type === "side_block") {
    return item.slot_type;
  }

  const label = normalizeCandidateValue(item.label_snapshot);

  if (label === "manchete") {
    return "headline";
  }

  if (label === "complemento da manchete" || label === "complemento") {
    return "complement";
  }

  if (label === "bloco lateral") {
    return "side_block";
  }

  return null;
}

function concreteContentMatches(
  item: ReferenceCompositionItem,
  {
    articleId,
    linkUrl,
    title,
    subtitle,
    imageUrl
  }: {
    articleId?: string | null;
    linkUrl?: string | null;
    title?: string | null;
    subtitle?: string | null;
    imageUrl?: string | null;
  }
) {
  const itemTitle = normalizeCandidateValue(item.title_snapshot);
  const candidateTitle = normalizeCandidateValue(title);

  if (!itemTitle || !candidateTitle || itemTitle !== candidateTitle) {
    return false;
  }

  if (articleId && item.article_id && item.article_id === articleId) {
    return true;
  }

  const itemLinkUrl = normalizeCandidateLink(item.link_url_snapshot);
  const candidateLinkUrl = normalizeCandidateLink(linkUrl);

  if (itemLinkUrl && candidateLinkUrl && itemLinkUrl === candidateLinkUrl) {
    return true;
  }

  const itemImageUrl = normalizeCandidateLink(item.image_url_snapshot);
  const candidateImageUrl = normalizeCandidateLink(imageUrl);
  const itemSubtitle = normalizeCandidateValue(item.subtitle_snapshot);
  const candidateSubtitle = normalizeCandidateValue(subtitle);
  const canCompareImage = Boolean(itemImageUrl && candidateImageUrl);
  const canCompareSubtitle = Boolean(itemSubtitle && candidateSubtitle);

  return (canCompareImage && itemImageUrl === candidateImageUrl) || (canCompareSubtitle && itemSubtitle === candidateSubtitle);
}

function compositionItemMatchesCandidate(
  item: ReferenceCompositionItem,
  {
    sourceType,
    sourceId,
    articleId,
    linkUrl,
    originSlotType,
    title,
    subtitle,
    imageUrl
  }: {
    sourceType: string;
    sourceId?: string | null;
    articleId?: string | null;
    linkUrl?: string | null;
    originSlotType?: string | null;
    title?: string | null;
    subtitle?: string | null;
    imageUrl?: string | null;
  }
) {
  if (isMatchdayEditorialSource(sourceType)) {
    if (!sourceId || !isMatchdayEditorialSource(item.source_type) || !item.source_id || item.source_id !== sourceId) {
      return false;
    }

    const originMatches = Boolean(originSlotType && matchdayEditorialOriginSlot(item) === originSlotType);

    if (!originMatches && isFreeNewsSlot(item.slot_type)) {
      return concreteContentMatches(item, { articleId, linkUrl, title, subtitle, imageUrl });
    }

    if (!originMatches) {
      return false;
    }

    const itemTitle = normalizeCandidateValue(item.title_snapshot);
    const candidateTitle = normalizeCandidateValue(title);

    if (itemTitle && candidateTitle && itemTitle !== candidateTitle) {
      return false;
    }

    if (articleId && item.article_id && item.article_id === articleId) {
      return true;
    }

    const itemLinkUrl = normalizeCandidateLink(item.link_url_snapshot);
    const candidateLinkUrl = normalizeCandidateLink(linkUrl);

    if (itemLinkUrl && candidateLinkUrl && itemLinkUrl === candidateLinkUrl) {
      return true;
    }

    if (!itemTitle || !candidateTitle || itemTitle !== candidateTitle) {
      return false;
    }

    const itemImageUrl = normalizeCandidateLink(item.image_url_snapshot);
    const candidateImageUrl = normalizeCandidateLink(imageUrl);
    const itemSubtitle = normalizeCandidateValue(item.subtitle_snapshot);
    const candidateSubtitle = normalizeCandidateValue(subtitle);
    const canCompareImage = Boolean(itemImageUrl && candidateImageUrl);
    const canCompareSubtitle = Boolean(itemSubtitle && candidateSubtitle);

    if (canCompareImage || canCompareSubtitle) {
      return (canCompareImage && itemImageUrl === candidateImageUrl) || (canCompareSubtitle && itemSubtitle === candidateSubtitle);
    }

    return true;
  }

  const itemTitle = normalizeCandidateValue(item.title_snapshot);
  const candidateTitle = normalizeCandidateValue(title);

  if (itemTitle && candidateTitle && itemTitle !== candidateTitle) {
    return false;
  }

  if (articleId && item.article_id && item.article_id === articleId) {
    return true;
  }

  const itemLinkUrl = normalizeCandidateLink(item.link_url_snapshot);
  const candidateLinkUrl = normalizeCandidateLink(linkUrl);

  if (itemLinkUrl && candidateLinkUrl && itemLinkUrl === candidateLinkUrl) {
    return true;
  }

  if (sourceType && sourceId && item.source_type && item.source_id) {
    if (isMatchdayEditorialSource(item.source_type)) {
      return false;
    }

    if (normalizeSourceType(item.source_type) === normalizeSourceType(sourceType) && item.source_id === sourceId) {
      return true;
    }
  }

  if (itemTitle && candidateTitle && itemTitle === candidateTitle) {
    const itemImageUrl = normalizeCandidateLink(item.image_url_snapshot);
    const candidateImageUrl = normalizeCandidateLink(imageUrl);
    const itemSubtitle = normalizeCandidateValue(item.subtitle_snapshot);
    const candidateSubtitle = normalizeCandidateValue(subtitle);
    const canCompareImage = Boolean(itemImageUrl && candidateImageUrl);
    const canCompareSubtitle = Boolean(itemSubtitle && candidateSubtitle);

    return (canCompareImage && itemImageUrl === candidateImageUrl) || (canCompareSubtitle && itemSubtitle === candidateSubtitle);
  }

  return false;
}

function candidatePlacementLabel(
  items: ReferenceCompositionItem[],
  candidate: {
    sourceType: string;
    sourceId?: string | null;
    articleId?: string | null;
    linkUrl?: string | null;
    originSlotType?: string | null;
    title?: string | null;
    subtitle?: string | null;
    imageUrl?: string | null;
  }
) {
  const slotTitles = items
    .filter((item) => compositionItemMatchesCandidate(item, candidate))
    .map((item) => compositionSectionTitle(item.slot_type));
  const uniqueSlotTitles = Array.from(new Set(slotTitles));

  return uniqueSlotTitles.length > 0 ? uniqueSlotTitles.join(", ") : null;
}

function countCompositionSlots(items: ReferenceCompositionItem[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const slotType = item.slot_type ?? "";
    counts[slotType] = (counts[slotType] ?? 0) + 1;
    return counts;
  }, {});
}

function getCompositionPublicationValidation(items: ReferenceCompositionItem[]) {
  const counts = countCompositionSlots(items);
  const headlineCount = counts.headline ?? 0;
  const complementCount = counts.complement ?? 0;
  const sideBlockCount = counts.side_block ?? 0;
  const warnings: string[] = [];

  if (headlineCount === 0) {
    warnings.push("A composição ainda não tem manchete.");
  } else if (headlineCount > 1) {
    warnings.push(`A composição tem ${headlineCount} manchetes. Remove ${headlineCount === 2 ? "uma" : "as manchetes extra"} antes de publicar.`);
  }

  if (complementCount > 1) {
    warnings.push("A composição só pode ter um complemento da manchete.");
  }

  if (sideBlockCount > 1) {
    warnings.push("A composição só pode ter um bloco lateral.");
  }

  return {
    canPublish: items.length > 0 && warnings.length === 0,
    warnings,
  };
}

function getPublishedCompositionProblemMessage(items: ReferenceCompositionItem[]) {
  const counts = countCompositionSlots(items);
  const headlineCount = counts.headline ?? 0;
  const complementCount = counts.complement ?? 0;
  const sideBlockCount = counts.side_block ?? 0;

  if (headlineCount === 0) {
    return "Esta composição publicada tem um problema estrutural: a zona Manchete não tem itens. Reabre como rascunho, adiciona uma manchete e publica novamente.";
  }

  if (headlineCount > 1) {
    return `Esta composição publicada tem um problema estrutural: a zona Manchete tem ${headlineCount} itens. Reabre como rascunho, remove uma manchete e publica novamente.`;
  }

  if (complementCount > 1) {
    return "Esta composição publicada tem um problema estrutural: a zona Complemento da manchete tem mais de um item. Reabre como rascunho, remove o complemento extra e publica novamente.";
  }

  if (sideBlockCount > 1) {
    return "Esta composição publicada tem um problema estrutural: a zona Bloco lateral tem mais de um item. Reabre como rascunho, remove o bloco lateral extra e publica novamente.";
  }

  return null;
}

const compositionPageStyles = `
  body {
    margin: 0;
    background: #eef2f6;
  }

  .composition-admin-shell {
    min-height: 100vh;
    padding: 28px;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .composition-admin-hero,
  .composition-admin-panel,
  .composition-admin-card {
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .composition-admin-hero {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: flex-end;
    padding: 24px;
    background: #10151b;
    color: #ffffff;
  }

  .composition-admin-hero p,
  .composition-admin-hero h1,
  .composition-admin-hero span {
    margin: 0;
  }

  .composition-admin-hero p {
    color: #e5252a;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .composition-admin-hero h1 {
    margin-top: 8px;
    font-size: 38px;
    line-height: 1;
  }

  .composition-admin-hero span {
    display: block;
    margin-top: 10px;
    color: #cdd5df;
    font-size: 15px;
  }

  .composition-admin-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-end;
  }

  .composition-admin-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 14px;
    border: 1px solid rgba(255, 255, 255, 0.26);
    border-radius: 6px;
    color: inherit;
    font-size: 12px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .composition-context-selector {
    display: grid;
    grid-template-columns: minmax(220px, 0.8fr) minmax(0, 2.2fr);
    gap: 14px;
    align-items: end;
    margin-top: 12px;
    padding: 14px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .composition-context-selector p,
  .composition-context-selector strong,
  .composition-context-selector label {
    margin: 0;
  }

  .composition-context-selector p {
    color: #e5252a;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .composition-context-selector strong {
    display: block;
    margin-top: 4px;
    color: #10151b;
    font-size: 13px;
    line-height: 1.35;
  }

  .composition-context-selector-form {
    display: grid;
    grid-template-columns: repeat(3, minmax(120px, 1fr)) auto;
    gap: 10px;
    align-items: end;
  }

  .composition-context-selector-field {
    display: grid;
    gap: 5px;
  }

  .composition-context-selector-field label {
    color: #607086;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .composition-context-selector-field select {
    min-height: 38px;
    width: 100%;
    border: 1px solid #cdd6e1;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 13px;
  }

  .composition-context-selector-empty {
    color: #607086;
    font-size: 13px;
    line-height: 1.35;
  }

  .composition-admin-layout {
    display: grid;
    grid-template-columns: minmax(360px, 1.05fr) minmax(420px, 0.95fr);
    gap: 14px;
    margin-top: 14px;
    align-items: start;
  }

  .composition-admin-panel {
    overflow: hidden;
  }

  .composition-admin-panel > header {
    padding: 14px 16px;
    border-bottom: 1px solid #e6ebf1;
    background: #f8fafc;
  }

  .composition-admin-panel h2,
  .composition-admin-panel h3,
  .composition-admin-panel p,
  .composition-admin-card p {
    margin: 0;
  }

  .composition-admin-panel h2 {
    font-size: 22px;
    text-transform: uppercase;
  }

  .composition-admin-panel header p {
    margin-top: 6px;
    color: #607086;
    font-size: 13px;
    line-height: 1.45;
  }

  .composition-admin-stack {
    display: grid;
    gap: 10px;
    padding: 12px;
  }

  #matchday-editorial-bank {
    order: -1;
  }

  .composition-admin-card {
    overflow: hidden;
    box-shadow: none;
  }

  .composition-admin-card header {
    padding: 10px 12px;
    border-bottom: 1px solid #edf1f5;
    background: #ffffff;
  }

  .composition-admin-card h3 {
    font-size: 13px;
    text-transform: uppercase;
  }

  .composition-admin-card-body {
    display: grid;
    gap: 8px;
    padding: 10px;
  }

  .composition-admin-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 8px;
  }

  .composition-admin-bank-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: space-between;
  }

  .composition-admin-bank-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .composition-admin-filter-link {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 9px;
    border: 1px solid #d4dde7;
    border-radius: 999px;
    background: #ffffff;
    color: #526174;
    font-size: 10px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .composition-admin-filter-link.active {
    border-color: #10151b;
    background: #10151b;
    color: #ffffff;
  }

  .composition-admin-bank-list {
    display: grid;
    gap: 7px;
  }

  .composition-admin-bank-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(170px, 0.48fr);
    gap: 10px;
    align-items: start;
    padding: 10px;
    border: 1px solid #e3e9f0;
    border-radius: 6px;
    background: #ffffff;
  }

  .composition-admin-bank-item.has-image {
    grid-template-columns: 88px minmax(0, 1fr) minmax(170px, 0.48fr);
  }

  .composition-admin-bank-item .composition-admin-image {
    aspect-ratio: 4 / 3;
  }

  .composition-admin-bank-copy,
  .composition-admin-bank-actions,
  .composition-admin-publish-summary {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .composition-admin-state {
    width: fit-content;
    padding: 4px 7px;
    border-radius: 999px;
    background: #edf2f7;
    color: #526174;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .composition-admin-state.in-use {
    background: #e8f1ec;
    color: #1f6d43;
  }

  .composition-admin-state.archived {
    background: #f5ecec;
    color: #8a2d35;
  }

  .composition-admin-publish-summary {
    padding: 10px;
    border: 1px solid #dce3eb;
    border-radius: 6px;
    background: #f8fafc;
  }

  .composition-admin-publish-summary strong {
    font-size: 11px;
    text-transform: uppercase;
  }

  .composition-admin-inline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: end;
  }

  .composition-admin-section-list {
    display: grid;
    gap: 10px;
  }

  .composition-admin-section {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid #e3e9f0;
    border-radius: 6px;
    background: #f8fafc;
  }

  .composition-admin-section-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .composition-admin-section-heading h4 {
    margin: 0;
    color: #10151b;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .composition-admin-section-heading span {
    color: #607086;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .composition-admin-candidates {
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
  }

  .composition-admin-candidates summary {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid #edf1f5;
    cursor: pointer;
    color: #10151b;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .composition-admin-candidates summary::-webkit-details-marker {
    display: none;
  }

  .composition-admin-candidates summary::after {
    content: "Abrir";
    color: #607086;
    font-size: 11px;
    font-weight: 900;
  }

  .composition-admin-candidates[open] summary::after {
    content: "Fechar";
  }

  .composition-admin-candidates-body {
    display: grid;
    gap: 10px;
    padding: 10px;
  }

  .composition-admin-item {
    display: grid;
    gap: 6px;
    min-width: 0;
    padding: 10px;
    border: 1px solid #e3e9f0;
    border-radius: 6px;
    background: #ffffff;
  }

  .composition-admin-item:has(.composition-admin-image) {
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: start;
    column-gap: 10px;
  }

  .composition-admin-item:has(.composition-admin-image) > :not(.composition-admin-image) {
    grid-column: 2;
  }

  .composition-admin-video-item {
    display: grid;
    gap: 6px;
    min-width: 0;
    padding: 10px;
    border: 1px solid #d9e1ea;
    border-radius: 6px;
    background: #fbfcfe;
  }

  .composition-admin-image {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 6px;
    background: #eef2f6;
  }

  .composition-admin-image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .composition-admin-label {
    color: #c40012;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .composition-admin-added-badge {
    width: fit-content;
    border-radius: 999px;
    background: #e8f1ec;
    color: #1f6d43;
    padding: 4px 7px;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .composition-admin-title {
    color: #10151b;
    font-size: 14px;
    font-weight: 900;
    line-height: 1.18;
  }

  .composition-admin-copy {
    color: #526174;
    font-size: 12px;
    line-height: 1.35;
  }

  .composition-admin-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    color: #607086;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .composition-admin-link {
    color: #10151b;
    overflow: hidden;
    font-size: 11px;
    font-weight: 900;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composition-admin-form {
    display: grid;
    gap: 7px;
  }

  .composition-admin-form-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .composition-admin-field {
    display: grid;
    gap: 4px;
  }

  .composition-admin-field label,
  .composition-admin-check {
    color: #526174;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .composition-admin-input {
    width: 100%;
    min-height: 34px;
    box-sizing: border-box;
    border: 1px solid #cdd6e0;
    border-radius: 6px;
    padding: 7px 9px;
    color: #10151b;
    font: inherit;
    font-size: 12px;
  }

  .composition-admin-small-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    width: fit-content;
    border: 0;
    border-radius: 6px;
    padding: 0 10px;
    background: #10151b;
    color: #ffffff;
    cursor: pointer;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .composition-admin-small-button.secondary {
    background: #e6ebf1;
    color: #10151b;
  }

  .composition-admin-note {
    color: #6d7b8c;
    font-size: 11px;
    line-height: 1.35;
  }

  .composition-admin-empty {
    padding: 12px;
    border: 1px dashed #cdd6e0;
    border-radius: 6px;
    color: #6d7b8c;
    font-size: 13px;
    line-height: 1.45;
  }

  @media (max-width: 980px) {
    .composition-admin-layout,
    .composition-admin-grid,
    .composition-admin-bank-item {
      grid-template-columns: 1fr;
    }

    .composition-admin-bank-item .composition-admin-image {
      max-width: 180px;
    }

    .composition-admin-hero {
      align-items: flex-start;
      flex-direction: column;
    }

    .composition-admin-actions {
      justify-content: flex-start;
    }

    .composition-context-selector,
    .composition-context-selector-form {
      grid-template-columns: 1fr;
    }
  }
`;

async function readFirst<T>(path: string): Promise<T | null> {
  const rows = await fetchSupabaseAdminTable<T>(`${path}&limit=1`);
  return rows[0] ?? null;
}

async function readMatchdayContext(matchdayId: string): Promise<MatchdayContext | null> {
  const matchday = await readFirst<SupabaseMatchday>(
    `matchdays?select=id,season_id,number,label,starts_on,ends_on,status,context_summary&id=eq.${encodeURIComponent(matchdayId)}`
  ).catch(() => null);

  if (!matchday) {
    return null;
  }

  const season = await readFirst<SupabaseSeason>(
    `seasons?select=id,competition_id,label,starts_on,ends_on,is_current&id=eq.${encodeURIComponent(matchday.season_id)}`
  ).catch(() => null);

  if (!season) {
    return null;
  }

  const competition = await readFirst<SupabaseCompetition>(
    `competitions?select=id,name,slug,country_id,country,logo_url,accent_color,is_active&id=eq.${encodeURIComponent(
      season.competition_id
    )}`
  ).catch(() => null);

  if (!competition) {
    return null;
  }

  const country = competition.country_id
    ? await readFirst<SupabaseCountry>(
        `countries?select=id,name,slug,iso2,flag_emoji,is_active&id=eq.${encodeURIComponent(competition.country_id)}`
      ).catch(() => null)
    : null;

  return { matchday, season, competition, country };
}

async function readContextSelectorData(): Promise<ContextSelectorData> {
  try {
    const [countries, competitions, seasons, matchdays] = await Promise.all([
      fetchSupabaseAdminTable<SupabaseCountry>("countries?select=id,name,slug,iso2,flag_emoji,is_active&order=name.asc"),
      fetchSupabaseAdminTable<SupabaseCompetition>(
        "competitions?select=id,country_id,name,slug,is_active&order=name.asc"
      ),
      fetchSupabaseAdminTable<SupabaseSeason>(
        "seasons?select=id,competition_id,label,is_current,starts_on,ends_on&order=label.desc"
      ),
      fetchSupabaseAdminTable<SupabaseMatchday>(
        "matchdays?select=id,season_id,number,label,starts_on,ends_on,status&order=number.asc"
      )
    ]);

    return { countries, competitions, seasons, matchdays, error: "" };
  } catch (error) {
    return {
      countries: [],
      competitions: [],
      seasons: [],
      matchdays: [],
      error: error instanceof Error ? error.message : "Nao foi possivel carregar o seletor de jornadas."
    };
  }
}

function formatContextSelectorMatchdayLabel(
  item: SupabaseMatchday,
  seasonById: Map<string, SupabaseSeason>,
  competitionById: Map<string, SupabaseCompetition>,
  countryById: Map<string, SupabaseCountry>
) {
  const itemSeason = seasonById.get(item.season_id);
  const itemCompetition = itemSeason ? competitionById.get(itemSeason.competition_id) : null;
  const itemCountry = itemCompetition?.country_id ? countryById.get(itemCompetition.country_id) : null;
  return `${itemCountry?.name ?? "Pais"} / ${itemCompetition?.name ?? "Competicao"} / ${
    itemSeason?.label ?? "Epoca"
  } / ${item.label}`;
}

async function readMatchdayEditorial(matchdayId: string): Promise<MatchdayEditorialWithHeadlineLink | null> {
  try {
    return await readFirst<MatchdayEditorialWithHeadlineLink>(
      `matchday_editorials?select=id,matchday_id,title,summary,title_color,image_url,headline_link_url,below_headline_mode,below_headline_heading,below_headline_heading_color,complementary_mode,complementary_roundup_item_id,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status,roundup_video_heading,roundup_video_heading_color,side_block_status,side_block_type,side_block_label,side_block_label_color,side_block_title,side_block_title_color,side_block_author,side_block_text,side_block_image_url,side_block_link_url,latest_zone_mode,latest_zone_title,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}`
    );
  } catch {
    return readFirst<MatchdayEditorialWithHeadlineLink>(
      `matchday_editorials?select=id,matchday_id,title,summary,title_color,image_url,headline_link_url,below_headline_mode,below_headline_heading,below_headline_heading_color,complementary_mode,complementary_roundup_item_id,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status,roundup_video_heading,roundup_video_heading_color,side_block_status,side_block_type,side_block_label,side_block_label_color,side_block_title,side_block_title_color,side_block_author,side_block_text,side_block_image_url,side_block_link_url,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}`
    ).catch(() => null);
  }
}

function readMatchdayHighlights(matchdayId: string): Promise<MatchdayHighlightWithLink[]> {
  return fetchSupabaseAdminTable<MatchdayHighlightWithLink>(
    `matchday_highlights?select=id,matchday_id,label,label_color,title,image_url,link_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&order=sort_order.asc&limit=20`
  ).catch(() => []);
}

function readMatchdayHorizontalNews(matchdayId: string): Promise<SupabaseMatchdayHorizontalNews[]> {
  return fetchSupabaseAdminTable<SupabaseMatchdayHorizontalNews>(
    `matchday_horizontal_news?select=id,matchday_id,label,label_color,title,subtitle,image_url,link_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&order=sort_order.asc`
  ).catch(() => []);
}

function readMatchdayRoundupItems(matchdayId: string): Promise<SupabaseMatchdayRoundupItem[]> {
  return fetchSupabaseAdminTable<SupabaseMatchdayRoundupItem>(
    `matchday_roundup_items?select=id,matchday_id,label,title,subtitle,image_url,video_url,duration,type,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&order=sort_order.asc&limit=50`
  ).catch(() => []);
}

async function readMatchdayLatestNews(matchdayId: string): Promise<SupabaseMatchdayLatestNews[]> {
  try {
    return await fetchSupabaseAdminTable<SupabaseMatchdayLatestNews>(
      `matchday_latest_news?select=id,matchday_id,time_label,time_label_color,title,subtitle,image_url,link_url,article_id,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&order=sort_order.asc&limit=50`
    );
  } catch {
    return fetchSupabaseAdminTable<SupabaseMatchdayLatestNews>(
      `matchday_latest_news?select=id,matchday_id,time_label,title,image_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&order=sort_order.asc&limit=50`
    ).catch(() => []);
  }
}

function readMatchdayArticles(matchdayId: string): Promise<SupabaseArticle[]> {
  return fetchSupabaseAdminTable<SupabaseArticle>(
    `articles?select=id,title,summary,image_url,source_url,status,competition_id,season_id,matchday_id,match_id,published_at,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&order=published_at.desc.nullslast&limit=50`
  ).catch(() => []);
}

function readDraftReferenceComposition(matchdayId: string): Promise<ReferenceComposition | null> {
  return readFirst<ReferenceComposition>(
    `matchday_reference_compositions?select=id,matchday_id,status,is_current,internal_name,use_roundup_items,created_at,updated_at,published_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&status=eq.draft&order=created_at.desc`
  ).catch(() => null);
}

async function readReferenceCompositionForBackoffice(matchdayId: string): Promise<ReferenceComposition | null> {
  const draftComposition = await readDraftReferenceComposition(matchdayId);

  if (draftComposition) {
    return draftComposition;
  }

  return readFirst<ReferenceComposition>(
    `matchday_reference_compositions?select=id,matchday_id,status,is_current,internal_name,use_roundup_items,created_at,updated_at,published_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&status=eq.published&is_current=is.true&order=published_at.desc.nullslast`
  ).catch(() => null);
}

function readReferenceCompositionItems(compositionId?: string | null): Promise<ReferenceCompositionItem[]> {
  if (!compositionId) {
    return Promise.resolve([]);
  }

  return fetchSupabaseAdminTable<ReferenceCompositionItem>(
    `matchday_reference_composition_items?select=id,composition_id,slot_type,source_type,source_id,article_id,sort_order,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot,label_snapshot,label_color_snapshot,status,created_at,updated_at&composition_id=eq.${encodeURIComponent(
      compositionId
    )}&order=sort_order.asc`
  ).catch(() => []);
}

function readMatchdayEditorialBankItems(matchdayId: string): Promise<MatchdayEditorialBankItem[]> {
  return fetchSupabaseAdminTable<MatchdayEditorialBankItem>(
    `matchday_editorial_bank_items?select=id,matchday_id,label,label_color,title,subtitle,image_url,link_url,source_type,source_id,source_slug,origin_slot_type,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&order=sort_order.asc.nullslast,created_at.desc`
  ).catch(() => []);
}

function statusLabel(status?: string | null) {
  if (status === "published") return "Publicado";
  if (status === "draft") return "Rascunho";
  if (status === "active") return "Ativo";
  if (status === "archived") return "Arquivado";
  return status || "Sem estado";
}

function compositionStatusLabel(status?: string | null) {
  if (status === "published") return "publicada";
  if (status === "draft") return "rascunho";
  return status || "sem estado";
}

function formatPublishedAt(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon"
  });
}

function textOrEmpty(value?: string | null) {
  return value?.trim() || "";
}

function FieldLink({ href }: { href?: string | null }) {
  const url = textOrEmpty(href);

  if (!url) {
    return null;
  }

  return (
    <a className="composition-admin-link" href={url}>
      Abrir link
    </a>
  );
}

function ImagePreview({ src }: { src?: string | null }) {
  const imageUrl = textOrEmpty(src);

  if (!imageUrl) {
    return null;
  }

  return (
    <div className="composition-admin-image">
      <img alt="" src={imageUrl} />
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="composition-admin-empty">{children}</div>;
}

function ItemCard({
  label,
  labelColor,
  title,
  subtitle,
  imageUrl,
  linkUrl,
  addedInLabel,
  meta,
  children
}: {
  label?: string | null;
  labelColor?: string | null;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  addedInLabel?: string | null;
  meta?: Array<string | null | undefined>;
  children?: ReactNode;
}) {
  const visibleMeta = meta?.filter((item): item is string => Boolean(item)) ?? [];

  return (
    <article className="composition-admin-item">
      <ImagePreview src={imageUrl} />
      {textOrEmpty(label) ? (
        <span className="composition-admin-label" style={textOrEmpty(labelColor) ? { color: labelColor ?? undefined } : undefined}>
          {label}
        </span>
      ) : null}
      {addedInLabel ? (
        <span className="composition-admin-added-badge">Já adicionada em: {addedInLabel}</span>
      ) : null}
      {textOrEmpty(title) ? <strong className="composition-admin-title">{title}</strong> : null}
      {textOrEmpty(subtitle) ? <p className="composition-admin-copy">{subtitle}</p> : null}
      {visibleMeta.length > 0 ? (
        <div className="composition-admin-meta">
          {visibleMeta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
      <FieldLink href={linkUrl} />
      {children}
    </article>
  );
}

function RoundupItemCard({
  label,
  title,
  subtitle,
  linkUrl,
  addedInLabel,
  meta,
  children
}: {
  label?: string | null;
  title?: string | null;
  subtitle?: string | null;
  linkUrl?: string | null;
  addedInLabel?: string | null;
  meta?: Array<string | null | undefined>;
  children?: ReactNode;
}) {
  const visibleMeta = meta?.filter((item): item is string => Boolean(item)) ?? [];

  return (
    <article className="composition-admin-video-item">
      {textOrEmpty(label) ? <span className="composition-admin-label">{label}</span> : null}
      {addedInLabel ? (
        <span className="composition-admin-added-badge">Já adicionada em: {addedInLabel}</span>
      ) : null}
      {textOrEmpty(title) ? <strong className="composition-admin-title">{title}</strong> : null}
      {textOrEmpty(subtitle) ? <p className="composition-admin-copy">{subtitle}</p> : null}
      {visibleMeta.length > 0 ? (
        <div className="composition-admin-meta">
          {visibleMeta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
      <FieldLink href={linkUrl} />
      {children}
    </article>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="composition-admin-card">
      <header>
        <h3>{title}</h3>
      </header>
      <div className="composition-admin-card-body">{children}</div>
    </section>
  );
}

function CollapsibleCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="composition-admin-candidates">
      <summary>{title}</summary>
      <div className="composition-admin-candidates-body">{children}</div>
    </details>
  );
}

function ItemsGrid<T>({
  items,
  empty,
  render
}: {
  items: T[];
  empty: string;
  render: (item: T) => ReactNode;
}) {
  if (items.length === 0) {
    return <EmptyState>{empty}</EmptyState>;
  }

  return <div className="composition-admin-grid">{items.map(render)}</div>;
}

function HiddenField({ name, value }: { name: string; value?: string | number | null }) {
  return <input type="hidden" name={name} value={value == null ? "" : String(value)} />;
}

function BankItemStatusForm({
  actionType,
  item,
  label,
  matchdayId,
  returnTo
}: {
  actionType: "archive_bank_item" | "reactivate_bank_item";
  item: MatchdayEditorialBankItem;
  label: string;
  matchdayId: string;
  returnTo: string;
}) {
  return (
    <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value={actionType} />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="bank_item_id" value={item.id} />
      <HiddenField name="return_to" value={returnTo} />
      <button className="composition-admin-small-button secondary" type="submit">
        {label}
      </button>
    </form>
  );
}

function AssignBankItemForm({
  composition,
  item,
  matchdayId,
  returnTo
}: {
  composition: ReferenceComposition | null;
  item: MatchdayEditorialBankItem;
  matchdayId: string;
  returnTo: string;
}) {
  if (!composition || composition.status !== "draft" || item.status !== "active") {
    return null;
  }

  return (
    <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="assign_bank_item_to_composition_slot" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="bank_item_id" value={item.id} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value="matchday-editorial-bank" />
      <div className="composition-admin-field">
        <label htmlFor={`bank-zone-${item.id}`}>Adicionar à zona…</label>
        <select className="composition-admin-input" id={`bank-zone-${item.id}`} name="slot_type" defaultValue="" required>
          <option value="" disabled>Escolher zona</option>
          {bankAssignableSlotOptions.map((option) => (
            <option key={option.slotType} value={option.slotType}>
              {option.title}
            </option>
          ))}
        </select>
      </div>
      <button className="composition-admin-small-button" type="submit">
        Adicionar à zona
      </button>
      <p className="composition-admin-note">
        Manchete, complemento e bloco lateral são zonas únicas. Uma nova escolha substitui a anterior sem apagar a notícia do banco.
      </p>
    </form>
  );
}

function BankNewsListItem({
  composition,
  item,
  matchdayId,
  placementLabel,
  returnTo
}: {
  composition: ReferenceComposition | null;
  item: MatchdayEditorialBankItem;
  matchdayId: string;
  placementLabel: string | null;
  returnTo: string;
}) {
  const isArchived = item.status === "archived";
  const hasImage = Boolean(textOrEmpty(item.image_url));
  const stateLabel = isArchived ? "Arquivada" : placementLabel ? `Em uso: ${placementLabel}` : "Disponível";
  const stateClass = isArchived ? " archived" : placementLabel ? " in-use" : "";

  return (
    <article className={`composition-admin-bank-item ${hasImage ? "has-image" : "no-image"}`}>
      <ImagePreview src={item.image_url} />
      <div className="composition-admin-bank-copy">
        {textOrEmpty(item.label) ? (
          <span className="composition-admin-label" style={textOrEmpty(item.label_color) ? { color: item.label_color ?? undefined } : undefined}>
            {item.label}
          </span>
        ) : null}
        <strong className="composition-admin-title">{item.title}</strong>
        {textOrEmpty(item.subtitle) ? <p className="composition-admin-copy">{item.subtitle}</p> : null}
        <span className={`composition-admin-state${stateClass}`}>{stateLabel}</span>
        <FieldLink href={item.link_url} />
      </div>
      <div className="composition-admin-bank-actions">
        {!isArchived && !placementLabel ? (
          <AssignBankItemForm composition={composition} item={item} matchdayId={matchdayId} returnTo={returnTo} />
        ) : null}
        {!isArchived && placementLabel ? (
          <p className="composition-admin-note">Retira a notícia da composição para a voltar a disponibilizar ou arquivar.</p>
        ) : null}
        {!isArchived && !placementLabel ? (
          <BankItemStatusForm actionType="archive_bank_item" item={item} label="Arquivar" matchdayId={matchdayId} returnTo={returnTo} />
        ) : null}
        {isArchived ? (
          <BankItemStatusForm actionType="reactivate_bank_item" item={item} label="Reativar" matchdayId={matchdayId} returnTo={returnTo} />
        ) : null}
      </div>
    </article>
  );
}

function MoveCompositionItemForm({
  composition,
  item,
  matchdayId,
  returnTo
}: {
  composition: ReferenceComposition;
  item: ReferenceCompositionItem;
  matchdayId: string;
  returnTo: string;
}) {
  if (item.slot_type === "roundup") return null;

  return (
    <form className="composition-admin-form-row" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="move_composition_item" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="item_id" value={item.id} />
      <HiddenField name="return_to" value={returnTo} />
      <select className="composition-admin-input" name="target_slot_type" defaultValue={item.slot_type} aria-label="Mover para outra zona">
        {bankAssignableSlotOptions.map((option) => (
          <option key={option.slotType} value={option.slotType}>
            {option.title}
          </option>
        ))}
      </select>
      <button className="composition-admin-small-button" type="submit">Mover</button>
    </form>
  );
}

function ReorderCompositionItemForm({
  composition,
  direction,
  item,
  label,
  matchdayId,
  returnTo
}: {
  composition: ReferenceComposition;
  direction: "up" | "down";
  item: ReferenceCompositionItem;
  label: string;
  matchdayId: string;
  returnTo: string;
}) {
  return (
    <form action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="reorder_composition_item" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="item_id" value={item.id} />
      <HiddenField name="direction" value={direction} />
      <HiddenField name="return_to" value={returnTo} />
      <button className="composition-admin-small-button secondary" type="submit">{label}</button>
    </form>
  );
}

function CreateDraftForm({ matchdayId, returnTo }: { matchdayId: string; returnTo: string }) {
  return (
    <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="create_draft" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="return_to" value={returnTo} />
      <div className="composition-admin-field">
        <label htmlFor="reference-composition-internal-name">Nome interno</label>
        <input
          className="composition-admin-input"
          id="reference-composition-internal-name"
          name="internal_name"
          placeholder="Rascunho de composição histórica"
        />
      </div>
      <button className="composition-admin-small-button" type="submit">
        Criar rascunho
      </button>
      <p className="composition-admin-note">
        O rascunho é criado apenas na nova estrutura de composição histórica. A página pública continua sem alterações.
      </p>
    </form>
  );
}

function UpdateDraftForm({
  composition,
  matchdayId,
  returnTo
}: {
  composition: ReferenceComposition;
  matchdayId: string;
  returnTo: string;
}) {
  return (
    <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="update_draft" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="return_to" value={returnTo} />
      <div className="composition-admin-field">
        <label htmlFor="reference-composition-current-name">Nome interno</label>
        <input
          className="composition-admin-input"
          id="reference-composition-current-name"
          name="internal_name"
          defaultValue={composition.internal_name ?? ""}
        />
      </div>
      <label className="composition-admin-check">
        <input type="checkbox" name="use_roundup_items" value="1" defaultChecked={composition.use_roundup_items} /> Usar
        resumo/vídeos
      </label>
      <button className="composition-admin-small-button" type="submit">
        Guardar definições do rascunho
      </button>
      <p className="composition-admin-note">Guarda apenas o nome interno e a opção de resumo/vídeos. Não altera as notícias nem publica a composição.</p>
    </form>
  );
}

function PublishCompositionForm({
  composition,
  matchdayId,
  returnTo,
  summary,
  unusedCount
}: {
  composition: ReferenceComposition;
  matchdayId: string;
  returnTo: string;
  summary: Array<{ label: string; count: number }>;
  unusedCount: number;
}) {
  return (
    <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="publish_reference_composition" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="return_to" value={returnTo} />
      <div className="composition-admin-publish-summary">
        <strong>Revisão antes de publicar</strong>
        <div className="composition-admin-meta">
          {summary.map((item) => (
            <span key={item.label}>{item.label}: {item.count}</span>
          ))}
          <span>Disponíveis não utilizadas: {unusedCount}</span>
        </div>
      </div>
      <p className="composition-admin-note">
        Torna esta seleção, hierarquia e ordem na versão pública e histórica da jornada. Os artigos e conteúdos de origem não são alterados.
      </p>
      <label className="composition-admin-check">
        <input type="checkbox" name="confirm_publish" value="yes" required /> Confirmo que revi a manchete, as zonas, a ordem e as notícias ainda disponíveis no banco.
      </label>
      <button className="composition-admin-small-button" type="submit">
        Publicar composição histórica
      </button>
    </form>
  );
}

function ReopenCompositionForm({
  composition,
  matchdayId,
  returnTo
}: {
  composition: ReferenceComposition;
  matchdayId: string;
  returnTo: string;
}) {
  return (
    <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="reopen_reference_composition" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="return_to" value={returnTo} />
      <p className="composition-admin-note">
        Esta composição está publicada. Para alterar itens, reabre como rascunho, corrige e publica novamente.
      </p>
      <button className="composition-admin-small-button secondary" type="submit">
        Reabrir para edição
      </button>
    </form>
  );
}

function AddCandidateForm({
  composition,
  matchdayId,
  returnTo,
  sortOrder,
  slotType,
  sourceType,
  sourceId,
  articleId,
  title,
  subtitle,
  imageUrl,
  linkUrl,
  label,
  labelColor,
  alreadyAdded,
  buttonLabel = "Adicionar à composição"
}: {
  composition: ReferenceComposition | null;
  matchdayId: string;
  returnTo: string;
  sortOrder: number;
  slotType: string;
  sourceType: string;
  sourceId?: string | null;
  articleId?: string | null;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  label?: string | null;
  labelColor?: string | null;
  alreadyAdded?: boolean;
  buttonLabel?: string;
}) {
  if (!composition || composition.status !== "draft" || alreadyAdded) {
    return null;
  }

  return (
    <form action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="add_item" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="slot_type" value={slotType} />
      <HiddenField name="source_type" value={sourceType} />
      <HiddenField name="source_id" value={sourceId} />
      <HiddenField name="article_id" value={articleId} />
      <HiddenField name="sort_order" value={sortOrder} />
      <HiddenField name="title_snapshot" value={title} />
      <HiddenField name="subtitle_snapshot" value={subtitle} />
      <HiddenField name="image_url_snapshot" value={imageUrl} />
      <HiddenField name="link_url_snapshot" value={linkUrl} />
      <HiddenField name="label_snapshot" value={label} />
      <HiddenField name="label_color_snapshot" value={labelColor} />
      <button className="composition-admin-small-button" type="submit">
        {buttonLabel}
      </button>
    </form>
  );
}

function AddImportantItemForm({
  composition,
  matchdayId,
  returnTo,
  sortOrder,
  sourceType,
  sourceId,
  articleId,
  title,
  subtitle,
  imageUrl,
  linkUrl,
  label,
  labelColor,
  alreadyAdded
}: {
  composition: ReferenceComposition | null;
  matchdayId: string;
  returnTo: string;
  sortOrder: number;
  sourceType: string;
  sourceId?: string | null;
  articleId?: string | null;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  label?: string | null;
  labelColor?: string | null;
  alreadyAdded?: boolean;
}) {
  if (!composition || composition.status !== "draft" || alreadyAdded) {
    return null;
  }

  return (
    <form action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="add_item" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="slot_type" value="important_item" />
      <HiddenField name="source_type" value={sourceType} />
      <HiddenField name="source_id" value={sourceId} />
      <HiddenField name="article_id" value={articleId} />
      <HiddenField name="sort_order" value={sortOrder} />
      <HiddenField name="title_snapshot" value={title} />
      <HiddenField name="subtitle_snapshot" value={subtitle} />
      <HiddenField name="image_url_snapshot" value={imageUrl} />
      <HiddenField name="link_url_snapshot" value={linkUrl} />
      <HiddenField name="label_snapshot" value={label} />
      <HiddenField name="label_color_snapshot" value={labelColor} />
      <button className="composition-admin-small-button secondary" type="submit">
        Adicionar à Faixa horizontal de notícias
      </button>
    </form>
  );
}

function RemoveItemForm({
  composition,
  item,
  matchdayId,
  returnTo
}: {
  composition: ReferenceComposition;
  item: ReferenceCompositionItem;
  matchdayId: string;
  returnTo: string;
}) {
  return (
    <form action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="remove_item" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="item_id" value={item.id} />
      <HiddenField name="return_to" value={returnTo} />
      <button className="composition-admin-small-button secondary" type="submit">
        Retirar da zona
      </button>
    </form>
  );
}

function UnassignBankItemForm({
  composition,
  item,
  matchdayId,
  returnTo
}: {
  composition: ReferenceComposition;
  item: ReferenceCompositionItem;
  matchdayId: string;
  returnTo: string;
}) {
  return (
    <form action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="unassign_bank_item_from_composition_slot" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="composition_item_id" value={item.id} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value="matchday-editorial-bank" />
      <button className="composition-admin-small-button secondary" type="submit">
        Retirar da zona
      </button>
    </form>
  );
}

function CompositionItemActions({
  canMoveDown,
  canMoveUp,
  composition,
  item,
  matchdayId,
  returnTo
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  composition: ReferenceComposition;
  item: ReferenceCompositionItem;
  matchdayId: string;
  returnTo: string;
}) {
  const isBankItem = isBankCompositionSource(item.source_type, item.source_id);

  return (
    <div className="composition-admin-form">
      <MoveCompositionItemForm composition={composition} item={item} matchdayId={matchdayId} returnTo={returnTo} />
      <div className="composition-admin-inline-actions">
        {canMoveUp ? (
          <ReorderCompositionItemForm composition={composition} direction="up" item={item} label="Subir" matchdayId={matchdayId} returnTo={returnTo} />
        ) : null}
        {canMoveDown ? (
          <ReorderCompositionItemForm composition={composition} direction="down" item={item} label="Descer" matchdayId={matchdayId} returnTo={returnTo} />
        ) : null}
        {isBankItem ? (
          <UnassignBankItemForm composition={composition} item={item} matchdayId={matchdayId} returnTo={returnTo} />
        ) : (
          <RemoveItemForm composition={composition} item={item} matchdayId={matchdayId} returnTo={returnTo} />
        )}
      </div>
      <p className="composition-admin-note">
        {isBankItem
          ? "Retirar devolve a notícia ao estado Disponível no banco."
          : "Retirar remove apenas este item da composição histórica."}
      </p>
    </div>
  );
}

export default async function AdminEditorialCompositionPage({ params, searchParams }: CompositionPageProps) {
  const { matchdayId } = await params;
  const query = searchParams ? await searchParams : {};
  const context = await readMatchdayContext(matchdayId);

  if (!context) {
    return (
      <main className="composition-admin-shell">
        <style>{compositionPageStyles}</style>
        <section className="composition-admin-panel">
          <header>
            <h2>Jornada não encontrada</h2>
            <p>A composição editorial só pode ser visualizada a partir de uma jornada existente.</p>
          </header>
        </section>
      </main>
    );
  }

  const { matchday, season, competition, country } = context;
  const [draftComposition, bankItems, contextSelector] = await Promise.all([
    readReferenceCompositionForBackoffice(matchday.id),
    readMatchdayEditorialBankItems(matchday.id),
    readContextSelectorData()
  ]);
  const compositionItems = await readReferenceCompositionItems(draftComposition?.id);
  const groupedCompositionItems = groupCompositionItemsBySection(compositionItems);
  const publicationValidation = getCompositionPublicationValidation(compositionItems);
  const isDraftComposition = draftComposition?.status === "draft";
  const isPublishedComposition = draftComposition?.status === "published";
  const publishedCompositionProblemMessage = isPublishedComposition ? getPublishedCompositionProblemMessage(compositionItems) : null;
  const publishedAtLabel = formatPublishedAt(draftComposition?.published_at);
  const contextLabel = `${country?.name ?? "Pais"} / ${competition.name} / ${season.label} / ${matchday.label}`;
  const selectorCountryById = new Map(contextSelector.countries.map((item) => [item.id, item]));
  const selectorCompetitionById = new Map(contextSelector.competitions.map((item) => [item.id, item]));
  const selectorSeasonById = new Map(contextSelector.seasons.map((item) => [item.id, item]));
  const bankFilter = ["all", "available", "in_use", "archived"].includes(query.bank_filter ?? "")
    ? (query.bank_filter as "all" | "available" | "in_use" | "archived")
    : "all";
  const baseReturnTo = `/admin/editorial/composicao/${matchday.id}`;
  const returnTo = bankFilter === "all" ? baseReturnTo : `${baseReturnTo}?bank_filter=${encodeURIComponent(bankFilter)}`;
  const bankPlacementById = new Map(bankItems.map((item) => [item.id, bankItemPlacementLabel(compositionItems, item)]));
  const availableBankItems = bankItems.filter((item) => item.status !== "archived" && !bankPlacementById.get(item.id));
  const filteredBankItems = bankItems.filter((item) => {
    const placement = bankPlacementById.get(item.id);
    if (bankFilter === "available") return item.status !== "archived" && !placement;
    if (bankFilter === "in_use") return item.status !== "archived" && Boolean(placement);
    if (bankFilter === "archived") return item.status === "archived";
    return true;
  });
  const bankFilterCounts = {
    all: bankItems.length,
    available: availableBankItems.length,
    in_use: bankItems.filter((item) => item.status !== "archived" && Boolean(bankPlacementById.get(item.id))).length,
    archived: bankItems.filter((item) => item.status === "archived").length
  };
  const compositionSummary = [
    { slotType: "headline", label: "Manchete" },
    { slotType: "complement", label: "Complemento" },
    { slotType: "side_block", label: "Bloco lateral" },
    { slotType: "highlight", label: "Destaques" },
    { slotType: "important_item", label: "Faixa horizontal" },
    { slotType: "editorial_line_item", label: "Zona final" },
    { slotType: "roundup", label: "Resumo/Vídeos" }
  ].map((section) => ({
    label: section.label,
    count: compositionItems.filter((item) => item.slot_type === section.slotType).length
  }));
  const bankSavedCount = Math.max(0, Number.parseInt(query.bank_saved ?? "0", 10) || 0);
  const bankUpdatedCount = Math.max(0, Number.parseInt(query.bank_updated ?? "0", 10) || 0);
  const bankSkippedCount = Math.max(0, Number.parseInt(query.bank_skipped ?? "0", 10) || 0);
  const bankExistingCount = Math.max(0, Number.parseInt(query.bank_existing ?? String(bankSkippedCount), 10) || 0);
  const bankRepeatedCount = Math.max(0, Number.parseInt(query.bank_repeated ?? "0", 10) || 0);
  const bankFeedback = (() => {
    if (query.bank_status_error) {
      return query.bank_status_error === "1" ? "Não foi possível atualizar o estado da notícia no banco." : query.bank_status_error;
    }
    if (query.bank_assignment_error) {
      return query.bank_assignment_error === "1" ? "Não foi possível adicionar ou retirar a notícia da composição." : query.bank_assignment_error;
    }
    if (query.bank_assigned) return "Notícia adicionada à composição histórica.";
    if (query.bank_unassigned) return "Notícia retirada da composição e novamente disponível no banco.";
    if (query.bank_archived) return "Notícia arquivada. Continua preservada no banco histórico.";
    if (query.bank_reactivated) return "Notícia reativada e devolvida à lista disponível.";
    if (query.bank_error) return "Não foi possível sincronizar as publicações desta jornada.";
    if (query.bank_saved || query.bank_updated || query.bank_skipped || query.bank_existing || query.bank_repeated) {
      return `Sincronização concluída: ${bankSavedCount} novas, ${bankUpdatedCount} atualizadas, ${bankExistingCount} já estavam corretas e ${bankRepeatedCount} repetições foram ignoradas.`;
    }
    return null;
  })();
  const compositionFeedback = query.composition_error
    ? query.composition_error === "1"
      ? "Não foi possível guardar a alteração na composição histórica."
      : query.composition_error
    : query.composition_saved
      ? "Alteração guardada na composição histórica."
      : null;

  return (
    <main className="composition-admin-shell">
      <style>{compositionPageStyles}</style>

      <section className="composition-admin-hero">
        <div>
          <p>Composição histórica da jornada</p>
          <h1>Jornada {String(matchday.number).padStart(2, "0")}</h1>
          <span>{contextLabel}</span>
        </div>
        <nav className="composition-admin-actions" aria-label="Acoes de navegacao">
          <a className="composition-admin-button" href="/admin/editorial/home">
            Home editorial
          </a>
          <a className="composition-admin-button" href="/admin/editorial/artigos">
            Artigos / Notícias
          </a>
          <a className="composition-admin-button" href="/admin/editorial/conteudos">
            VÍDEO
          </a>
          <a className="composition-admin-button" href={`/admin/editorial/jornada/${encodeURIComponent(matchday.id)}`}>
            Editorial da Jornada
          </a>
          <a className="composition-admin-button" href="/admin/gestor">
            Centro de Gestão
          </a>
          <a className="composition-admin-button" href="/admin">
            Backoffice
          </a>
        </nav>
      </section>

      <section className="composition-context-selector" aria-label="Alterar jornada da composicao">
        <div>
          <p>Alterar jornada</p>
          <strong>{contextLabel}</strong>
        </div>
        {contextSelector.error ? (
          <span className="composition-context-selector-empty">Nao foi possivel carregar o seletor: {contextSelector.error}</span>
        ) : (
          <form className="composition-context-selector-form" data-context-switcher data-target-base="/admin/editorial/composicao">
            <div className="composition-context-selector-field">
              <label htmlFor="composition-context-competition">Competição</label>
              <select id="composition-context-competition" name="competition_id" defaultValue={competition.id}>
                {contextSelector.competitions.map((item) => (
                  <option key={item.id} value={item.id} data-country={item.country_id ?? ""}>
                    {selectorCountryById.get(item.country_id ?? "")?.name
                      ? `${selectorCountryById.get(item.country_id ?? "")?.name} / ${item.name}`
                      : item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="composition-context-selector-field">
              <label htmlFor="composition-context-season">Época</label>
              <select id="composition-context-season" name="season_id" defaultValue={season.id}>
                {contextSelector.seasons.map((item) => (
                  <option key={item.id} value={item.id} data-competition={item.competition_id ?? ""}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="composition-context-selector-field">
              <label htmlFor="composition-context-matchday">Jornada</label>
              <select id="composition-context-matchday" name="matchday_id" defaultValue={matchday.id}>
                {contextSelector.matchdays.map((item) => (
                  <option key={item.id} value={item.id} data-season={item.season_id ?? ""}>
                    {formatContextSelectorMatchdayLabel(item, selectorSeasonById, selectorCompetitionById, selectorCountryById)}
                  </option>
                ))}
              </select>
            </div>
            <button className="composition-admin-button" type="submit">
              Abrir Composição Editorial
            </button>
          </form>
        )}
      </section>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              Array.prototype.forEach.call(document.querySelectorAll("[data-context-switcher]"), function (form) {
                var competition = form.querySelector("select[name='competition_id']");
                var season = form.querySelector("select[name='season_id']");
                var matchday = form.querySelector("select[name='matchday_id']");
                if (!competition || !season || !matchday) return;

                function syncOptions() {
                  Array.prototype.forEach.call(season.options, function (option) {
                    option.hidden = option.getAttribute("data-competition") !== competition.value;
                  });
                  if (season.selectedOptions[0] && season.selectedOptions[0].hidden) {
                    var firstSeason = Array.prototype.find.call(season.options, function (option) { return !option.hidden; });
                    if (firstSeason) season.value = firstSeason.value;
                  }

                  Array.prototype.forEach.call(matchday.options, function (option) {
                    option.hidden = option.getAttribute("data-season") !== season.value;
                  });
                  if (matchday.selectedOptions[0] && matchday.selectedOptions[0].hidden) {
                    var firstMatchday = Array.prototype.find.call(matchday.options, function (option) { return !option.hidden; });
                    if (firstMatchday) matchday.value = firstMatchday.value;
                  }
                }

                competition.addEventListener("change", syncOptions);
                season.addEventListener("change", syncOptions);
                form.addEventListener("submit", function (event) {
                  event.preventDefault();
                  if (!matchday.value) return;
                  window.location.href = form.getAttribute("data-target-base") + "/" + encodeURIComponent(matchday.value);
                });
                syncOptions();
              });
            })();
          `
        }}
      />

      <div className="composition-admin-layout">
        <section className="composition-admin-panel">
          <header>
            <h2>1. Banco histórico da jornada</h2>
            <p>
              Todas as notícias e conteúdos publicados desta jornada ficam disponíveis aqui, independentemente da zona onde apareceram.
            </p>
          </header>
          <div className="composition-admin-stack">
            <div id="matchday-editorial-bank">
              <Card title="Publicações da jornada">
                <div className="composition-admin-meta">
                  <span>{competition.name}</span>
                  <span>{season.label}</span>
                  <span>{matchday.label ?? `Jornada ${String(matchday.number).padStart(2, "0")}`}</span>
                  <span>Atualização automática ativa</span>
                </div>

                {bankFeedback ? <p className="composition-admin-note">{bankFeedback}</p> : null}

                <div className="composition-admin-bank-toolbar">
                  <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
                    <HiddenField name="action_type" value="save_matchday_editorial_bank_current" />
                    <HiddenField name="matchday_id" value={matchday.id} />
                    <HiddenField name="return_to" value={returnTo} />
                    <button className="composition-admin-small-button secondary" type="submit">
                      Sincronizar notícias em falta
                    </button>
                  </form>

                  <nav className="composition-admin-bank-filters" aria-label="Filtrar banco histórico">
                    {[
                      { key: "all", label: "Todas", count: bankFilterCounts.all },
                      { key: "available", label: "Disponíveis", count: bankFilterCounts.available },
                      { key: "in_use", label: "Em uso", count: bankFilterCounts.in_use },
                      { key: "archived", label: "Arquivadas", count: bankFilterCounts.archived }
                    ].map((filter) => (
                      <a
                        className={`composition-admin-filter-link${bankFilter === filter.key ? " active" : ""}`}
                        href={
                          filter.key === "all"
                            ? `${baseReturnTo}#matchday-editorial-bank`
                            : `${baseReturnTo}?bank_filter=${encodeURIComponent(filter.key)}#matchday-editorial-bank`
                        }
                        key={filter.key}
                      >
                        {filter.label} ({filter.count})
                      </a>
                    ))}
                  </nav>
                </div>

                <p className="composition-admin-note">
                  O banco é atualizado automaticamente quando um artigo ou conteúdo publicado é associado a esta jornada. A sincronização manual apenas recupera eventuais publicações em falta, sem apagar nem duplicar notícias.
                </p>

                {filteredBankItems.length > 0 ? (
                  <div className="composition-admin-bank-list">
                    {filteredBankItems.map((item) => (
                      <BankNewsListItem
                        composition={draftComposition}
                        item={item}
                        key={item.id}
                        matchdayId={matchday.id}
                        placementLabel={bankPlacementById.get(item.id) ?? null}
                        returnTo={returnTo}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState>
                    {bankFilter === "available"
                      ? "Não existem notícias disponíveis por associar."
                      : bankFilter === "in_use"
                        ? "Ainda não existem notícias em uso nesta composição."
                        : bankFilter === "archived"
                          ? "Não existem notícias arquivadas."
                          : "Ainda não existem publicações guardadas no banco desta jornada."}
                  </EmptyState>
                )}
              </Card>
            </div>
          </div>
        </section>

        <section className="composition-admin-panel">
          <header>
            <h2>2. Composição histórica da jornada</h2>
            <p>
              Escolhe no banco as notícias que ficam no arquivo e define aqui a sua hierarquia, zona e ordem definitivas.
            </p>
          </header>
          <div className="composition-admin-stack">
            <Card title={isPublishedComposition ? "Composição histórica publicada" : "Composição histórica em rascunho"}>
              {draftComposition ? (
                <>
                  {compositionFeedback ? <p className="composition-admin-note">{compositionFeedback}</p> : null}
                  <div className="composition-admin-meta">
                    <span>Estado: {compositionStatusLabel(draftComposition.status)}</span>
                    {isPublishedComposition ? (
                      <span>Versão ativa: {draftComposition.is_current ? "sim" : "não"}</span>
                    ) : (
                      <span>Ainda não publicada</span>
                    )}
                    <span>{draftComposition.use_roundup_items ? "Inclui resumo/vídeos" : "Não inclui resumo/vídeos"}</span>
                    {publishedAtLabel ? <span>Publicado em: {publishedAtLabel}</span> : null}
                  </div>

                  {isDraftComposition ? (
                    <>
                      <UpdateDraftForm composition={draftComposition} matchdayId={matchday.id} returnTo={returnTo} />
                      {publicationValidation.warnings.length > 0 ? (
                        <div className="composition-admin-note">
                          {publicationValidation.warnings.map((warning) => (
                            <p key={warning}>{warning}</p>
                          ))}
                        </div>
                      ) : null}
                      {publicationValidation.canPublish ? (
                        <PublishCompositionForm
                          composition={draftComposition}
                          matchdayId={matchday.id}
                          returnTo={returnTo}
                          summary={compositionSummary}
                          unusedCount={availableBankItems.length}
                        />
                      ) : null}
                    </>
                  ) : null}

                  {isPublishedComposition && draftComposition.is_current ? (
                    <>
                      {publishedCompositionProblemMessage ? (
                        <p className="composition-admin-note">{publishedCompositionProblemMessage}</p>
                      ) : null}
                      <p className="composition-admin-note">
                        Esta é a versão pública e histórica ativa desta jornada.
                      </p>
                      <ReopenCompositionForm composition={draftComposition} matchdayId={matchday.id} returnTo={returnTo} />
                    </>
                  ) : null}
                </>
              ) : (
                <CreateDraftForm matchdayId={matchday.id} returnTo={returnTo} />
              )}
            </Card>

            <Card title="Zonas da composição histórica">
              {draftComposition ? (
                <div className="composition-admin-section-list">
                  {groupedCompositionItems.map((section) => (
                    <section className="composition-admin-section" key={section.slotType}>
                      <div className="composition-admin-section-heading">
                        <h4>{section.title}</h4>
                        <span>
                          {section.items.length} {section.items.length === 1 ? "item" : "itens"}
                        </span>
                      </div>
                      {section.items.length > 0 ? (
                        <div className="composition-admin-grid">
                          {section.items.map((item, index) => {
                            const itemMeta = [`Ordem ${item.sort_order}`, statusLabel(item.status)];
                            const actions = isDraftComposition ? (
                              <CompositionItemActions
                                canMoveDown={index < section.items.length - 1}
                                canMoveUp={index > 0}
                                composition={draftComposition}
                                item={item}
                                matchdayId={matchday.id}
                                returnTo={returnTo}
                              />
                            ) : null;

                            if (item.slot_type === "roundup") {
                              return (
                                <RoundupItemCard
                                  key={item.id}
                                  label={compositionItemDisplayLabel(item)}
                                  title={item.title_snapshot}
                                  subtitle={item.subtitle_snapshot}
                                  linkUrl={item.link_url_snapshot}
                                  meta={itemMeta}
                                >
                                  {actions}
                                </RoundupItemCard>
                              );
                            }

                            return (
                              <ItemCard
                                key={item.id}
                                imageUrl={item.image_url_snapshot}
                                label={compositionItemDisplayLabel(item)}
                                labelColor={item.label_color_snapshot}
                                title={item.title_snapshot}
                                subtitle={item.subtitle_snapshot}
                                linkUrl={item.link_url_snapshot}
                                meta={itemMeta}
                              >
                                {actions}
                              </ItemCard>
                            );
                          })}
                        </div>
                      ) : (
                        <EmptyState>Nenhuma notícia associada a esta zona.</EmptyState>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <EmptyState>Cria primeiro um rascunho para começar a composição histórica.</EmptyState>
              )}
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
