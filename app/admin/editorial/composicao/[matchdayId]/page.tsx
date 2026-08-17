import type { ReactNode } from "react";
import { readMatchdayEditorialDesk } from "@/lib/editorial-matchday-desk";
import {
  placementGroupForKey,
  placementLabelForKey,
  type MatchdayDeskSnapshot,
} from "@/lib/editorial-matchday-desk-model";
import { EDITORIAL_NEWS_FLOW_SLOT_TYPES } from "@/lib/editorial-zone-presentation";
import {
  HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS,
  HIERARCHICAL_COMPOSITION_DESK_SECTIONS,
  HIERARCHICAL_COMPOSITION_MOMENTS,
  HIERARCHICAL_COMPOSITION_EDITORIAL_FIELD_LABELS,
  hierarchicalBeyondMatchdayPositionLabel,
  hierarchicalCompositionEditorialParagraphs,
  hierarchicalCompositionMediaSnapshot,
  hierarchicalSlotLabel,
  incompleteHierarchicalBeyondMatchdayPositions,
  incompleteHierarchicalCompositionSlots,
  isPublishableHierarchicalBeyondMatchday,
  isPublishableHierarchicalComposition,
  isPublishableHierarchicalCompositionEditorial,
  missingHierarchicalCompositionEditorialFields,
  missingHierarchicalCompositionSlots,
  type HierarchicalCompositionEditorial,
  type HierarchicalCompositionSlot,
  type ReferenceCompositionPresentationMode,
} from "@/lib/editorial-hierarchical-composition";
import HierarchicalCompositionInterpretivePreview from "@/components/admin/HierarchicalCompositionInterpretivePreview";
import HierarchicalCompositionDeskClient from "./HierarchicalCompositionDeskClient";
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
    feedback_anchor?: string;
    presentation_mode?: string;
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

type PublishedEditorialArticle = {
  id: string;
  slug: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  status: string | null;
  published_at: string | null;
  matchday_id: string | null;
};

type PublishedEditorialContent = {
  id: string;
  slug: string | null;
  content_type: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  embed_url: string | null;
  is_embeddable: boolean | null;
  status: string | null;
  published_at: string | null;
  matchday_id: string | null;
};

type ReferenceComposition = {
  id: string;
  matchday_id: string;
  status: string;
  is_current: boolean;
  internal_name: string | null;
  use_roundup_items: boolean;
  presentation_mode: ReferenceCompositionPresentationMode;
  hierarchical_editorial_title: string | null;
  hierarchical_editorial_text: string | null;
  hierarchical_editorial_author: string | null;
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
  media_kind_snapshot?: string | null;
  media_embed_url_snapshot?: string | null;
  media_video_url_snapshot?: string | null;
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
  { slotType: "editorial_line_item", title: "Últimas" },
  { slotType: "side_block", title: "Contexto" },
  { slotType: "highlight", title: "3 notícias abaixo da manchete" },
  { slotType: "roundup", title: "Vídeo" },
  { slotType: "complement", title: "Notícia ao lado do vídeo" },
  { slotType: "important_item", title: "Faixa de notícias" },
  { slotType: "related_article", title: "Artigos relacionados" },
  { slotType: "custom_card", title: "Outros conteúdos" }
];

const compositionZoneMeta: Record<string, { anchor: string; number: string }> = {
  headline: { anchor: "manchete", number: "01" },
  editorial_line_item: { anchor: "ultimas-noticias", number: "02" },
  side_block: { anchor: "contexto", number: "03" },
  highlight: { anchor: "tres-noticias", number: "04" },
  roundup: { anchor: "video", number: "05" },
  complement: { anchor: "noticia-ao-lado-video", number: "06" },
  important_item: { anchor: "faixa-noticias", number: "07" }
};

function compositionZoneAnchor(slotType?: string | null) {
  return compositionZoneMeta[slotType ?? ""]?.anchor ?? `composition-zone-${slotType || "outros"}`;
}

function compositionZoneHeading(slotType: string, title: string) {
  const number = compositionZoneMeta[slotType]?.number;
  return number ? `${number} · ${title}` : title;
}

const bankAssignableSlotTypes = new Set(["headline", "complement", "side_block", "highlight", "important_item", "editorial_line_item"]);
const bankAssignableSlotOptions = referenceCompositionSections.filter((section) => bankAssignableSlotTypes.has(section.slotType));
const editorialArticleFlowSlotTypes = new Set<string>(EDITORIAL_NEWS_FLOW_SLOT_TYPES);
const editorialArticleFlowSlotOptions = referenceCompositionSections.filter((section) => editorialArticleFlowSlotTypes.has(section.slotType));

function isEditorialArticleBankItem(item: MatchdayEditorialBankItem) {
  const sourceType = item.source_type?.trim().toLowerCase() ?? "";
  return sourceType === "editorial_article" && Boolean(item.source_id);
}

function isEditorialContentBankItem(item: MatchdayEditorialBankItem) {
  return item.source_type?.trim().toLowerCase() === "editorial_content" && Boolean(item.source_id);
}

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

function hierarchicalAuxiliaryBankItemPlacementLabel(
  items: ReferenceCompositionItem[],
  bankItem: MatchdayEditorialBankItem,
) {
  const placementLabels = items
    .filter((item) =>
      compositionItemMatchesCandidate(item, {
        sourceType: bankItem.source_type ?? "matchday_editorial_bank_item",
        sourceId: bankItem.source_id,
        linkUrl: bankItem.link_url,
        title: bankItem.title,
        subtitle: bankItem.subtitle,
        imageUrl: bankItem.image_url,
      }),
    )
    .map((item) =>
      item.slot_type === "complement"
        ? "Destaque da Jornada"
        : item.slot_type === "beyond_matchday"
          ? `Para Lá da Jornada — ${hierarchicalBeyondMatchdayPositionLabel(item.sort_order)}`
          : null,
    )
    .filter((label): label is string => Boolean(label));

  const uniquePlacementLabels = Array.from(new Set(placementLabels));
  return uniquePlacementLabels.length > 0 ? uniquePlacementLabels.join(", ") : null;
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
  const highlightCount = counts.highlight ?? 0;
  const warnings: string[] = [];

  if (headlineCount === 0) {
    warnings.push("A composição ainda não tem manchete.");
  } else if (headlineCount > 1) {
    warnings.push(`A composição tem ${headlineCount} manchetes. Remove ${headlineCount === 2 ? "uma" : "as manchetes extra"} antes de publicar.`);
  }

  if (complementCount > 1) {
    warnings.push("A composição só pode ter uma notícia ao lado do vídeo.");
  }

  if (sideBlockCount > 1) {
    warnings.push("A composição só pode ter um Contexto.");
  }

  if (highlightCount > 3) {
    warnings.push("A zona 3 notícias abaixo da manchete só pode ter três notícias.");
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
  const highlightCount = counts.highlight ?? 0;

  if (headlineCount === 0) {
    return "Esta composição publicada tem um problema estrutural: a zona Manchete não tem itens. Reabre como rascunho, adiciona uma manchete e publica novamente.";
  }

  if (headlineCount > 1) {
    return `Esta composição publicada tem um problema estrutural: a zona Manchete tem ${headlineCount} itens. Reabre como rascunho, remove uma manchete e publica novamente.`;
  }

  if (complementCount > 1) {
    return "Esta composição publicada tem um problema estrutural: a zona Notícia ao lado do vídeo tem mais de um item. Reabre como rascunho, remove o item extra e publica novamente.";
  }

  if (sideBlockCount > 1) {
    return "Esta composição publicada tem um problema estrutural: a zona Contexto tem mais de um item. Reabre como rascunho, remove o item extra e publica novamente.";
  }

  if (highlightCount > 3) {
    return "Esta composição publicada tem um problema estrutural: a zona 3 notícias abaixo da manchete tem mais de três itens. Reabre como rascunho e remove os itens extra antes de publicar novamente.";
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

  .composition-admin-zone-nav {
    position: sticky;
    top: 8px;
    z-index: 30;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
    border: 1px solid #f2c7ca;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.98);
    padding: 10px;
    box-shadow: 0 10px 24px rgba(8, 15, 24, 0.12);
    backdrop-filter: blur(8px);
  }

  .composition-admin-zone-nav a {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: #e5252a;
    color: #ffffff;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.03em;
    padding: 0 10px;
    text-decoration: none;
    text-transform: uppercase;
  }

  .composition-admin-zone-nav a:hover {
    background: #b91c1c;
  }

  #composition-status,
  #manchete,
  #ultimas-noticias,
  #contexto,
  #tres-noticias,
  #video,
  #noticia-ao-lado-video,
  #faixa-noticias {
    scroll-margin-top: 84px;
  }

  .composition-admin-feedback {
    margin: 0;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 900;
    line-height: 1.35;
  }

  .composition-admin-feedback.success {
    background: #e8f1ec;
    color: #1f6d43;
  }

  .composition-admin-feedback.error {
    background: #f8e8ea;
    color: #8a2d35;
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

  .composition-admin-desk-search-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }

  .composition-admin-desk-search-row strong {
    min-width: 64px;
    color: #526174;
    font-size: 11px;
    text-align: right;
  }

  .composition-admin-bank-filters button.composition-admin-filter-link {
    cursor: pointer;
    font-family: inherit;
  }

  .composition-admin-desk-selection-summary {
    min-height: 30px;
    display: flex;
    align-items: center;
    padding: 7px 9px;
    border: 1px solid #dce3eb;
    border-radius: 6px;
    background: #f8fafc;
    color: #526174;
    font-size: 11px;
    font-weight: 900;
  }

  .composition-admin-desk-choice {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 6px;
    align-items: start;
    cursor: pointer;
  }

  .composition-admin-desk-choice input {
    margin: 4px 0 0;
  }

  .composition-admin-desk-choice .composition-admin-image {
    aspect-ratio: 4 / 3;
  }

  .composition-admin-bank-item.selected {
    border-color: #10151b;
    box-shadow: inset 0 0 0 1px #10151b;
  }

  .composition-admin-desk-bank {
    display: grid;
    gap: 7px;
  }

  .composition-admin-desk-toolbar {
    position: sticky;
    top: 0;
    z-index: 8;
    display: grid;
    gap: 7px;
    padding: 0 0 8px;
    border-bottom: 1px solid #edf1f5;
    background: rgba(255, 255, 255, .98);
    backdrop-filter: blur(8px);
  }

  .composition-admin-desk-bank .composition-admin-filter-link.active {
    border-color: #1d4ed8;
    background: #1d4ed8;
    color: #ffffff;
  }

  .composition-admin-desk-bulk-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    padding-top: 7px;
    border-top: 1px solid #edf1f5;
  }

  .composition-admin-desk-bulk-bar strong {
    margin-right: 2px;
    font-size: 11px;
  }

  .composition-admin-desk-bulk-bar select {
    min-width: 220px;
    min-height: 32px;
    padding: 0 8px;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 12px;
  }

  .composition-admin-desk-place-button {
    background: #1d4ed8;
  }

  .composition-admin-desk-place-button:disabled {
    cursor: default;
    opacity: .45;
  }

  .composition-admin-bank-item.composition-admin-desk-row,
  .composition-admin-bank-item.composition-admin-desk-row.has-image {
    position: relative;
    display: grid;
    grid-template-columns: 18px 22px 56px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    min-height: 64px;
    padding: 6px;
    border: 1px solid #e0e6ed;
    border-radius: 6px;
    background: #ffffff;
  }

  .composition-admin-bank-item.composition-admin-desk-row.selected {
    border-color: #2563eb;
    box-shadow: inset 3px 0 0 #2563eb;
  }

  .composition-admin-desk-row input[type="checkbox"] {
    width: 15px;
    height: 15px;
    margin: 0;
  }

  .composition-admin-desk-rank {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: #eef2f6;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 800;
  }

  .composition-admin-desk-row.selected .composition-admin-desk-rank {
    background: #1d4ed8;
    color: #ffffff;
  }

  .composition-admin-desk-thumbnail,
  .composition-admin-desk-thumbnail-placeholder {
    display: block;
    width: 56px;
    height: 42px;
    border-radius: 4px;
    background: #e9eef4;
    object-fit: cover;
  }

  .composition-admin-desk-row .composition-admin-bank-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .composition-admin-desk-row .composition-admin-title {
    overflow: hidden;
    font-size: 13px;
    line-height: 1.14;
    text-overflow: ellipsis;
  }

  .composition-admin-desk-row .composition-admin-meta {
    gap: 7px;
    align-items: center;
    font-size: 9px;
  }

  .composition-admin-desk-row .composition-admin-state {
    padding: 0;
    border-radius: 0;
    background: transparent;
    color: #526174;
    font-size: 9px;
    letter-spacing: .02em;
  }

  .composition-admin-desk-row.disabled {
    opacity: .72;
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
    border-left: 4px solid #e5252a;
    border-radius: 6px;
    background: #ffffff;
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

  textarea.composition-admin-input {
    resize: vertical;
    line-height: 1.5;
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

  .composition-admin-mode-selector {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding: 10px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
  }

  .composition-admin-mode-selector a {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    border: 1px solid #cdd6e1;
    border-radius: 6px;
    padding: 0 14px;
    color: #526174;
    font-size: 12px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .composition-admin-mode-selector a.active {
    border-color: #10151b;
    background: #10151b;
    color: #ffffff;
  }

  .composition-admin-hierarchical-empty {
    display: grid;
    gap: 5px;
    min-height: 110px;
    align-content: center;
    justify-items: center;
    border: 1px dashed #b7c2ce;
    border-radius: 6px;
    background: #f7f9fb;
    color: #607086;
    font-size: 11px;
    text-align: center;
    text-transform: uppercase;
  }

  .composition-admin-hierarchical-empty .composition-admin-form {
    width: min(100%, 320px);
    margin-top: 7px;
    text-align: left;
    text-transform: none;
  }

  .composition-admin-hierarchical-empty .composition-admin-small-button {
    justify-self: center;
  }

  .composition-admin-preview {
    width: 100%;
    max-width: 1200px;
    box-sizing: border-box;
    margin-inline: auto;
    overflow-x: auto;
    background: #ffffff;
  }

  .composition-admin-preview-section {
    width: 100%;
    max-width: 1200px;
    box-sizing: border-box;
    margin: 14px auto 0;
  }

  .composition-admin-preview-section > .composition-admin-note {
    padding: 12px 16px;
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
      )}&order=sort_order.asc`
    );
  } catch {
    return fetchSupabaseAdminTable<SupabaseMatchdayLatestNews>(
      `matchday_latest_news?select=id,matchday_id,time_label,title,image_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&order=sort_order.asc`
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

function readPublishedEditorialArticles(matchdayId: string): Promise<PublishedEditorialArticle[]> {
  return fetchSupabaseAdminTable<PublishedEditorialArticle>(
    `editorial_articles?select=id,slug,label,title,subtitle,image_url,status,published_at,matchday_id&status=eq.published&or=(matchday_id.eq.${encodeURIComponent(
      matchdayId
    )},matchday_id.is.null)&order=published_at.desc.nullslast,created_at.desc&limit=200`
  ).catch(() => []);
}

function readPublishedEditorialContents(matchdayId: string): Promise<PublishedEditorialContent[]> {
  return fetchSupabaseAdminTable<PublishedEditorialContent>(
    `editorial_contents?select=id,slug,content_type,label,title,subtitle,summary,image_url,thumbnail_url,video_url,embed_url,is_embeddable,status,published_at,matchday_id&status=eq.published&or=(matchday_id.eq.${encodeURIComponent(
      matchdayId
    )},matchday_id.is.null)&order=published_at.desc.nullslast,created_at.desc&limit=200`
  ).catch(() => []);
}

function readDraftReferenceComposition(
  matchdayId: string,
  presentationMode: ReferenceCompositionPresentationMode,
): Promise<ReferenceComposition | null> {
  return readFirst<ReferenceComposition>(
    `matchday_reference_compositions?select=id,matchday_id,status,is_current,internal_name,use_roundup_items,presentation_mode,hierarchical_editorial_title,hierarchical_editorial_text,hierarchical_editorial_author,created_at,updated_at,published_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&status=eq.draft&presentation_mode=eq.${encodeURIComponent(presentationMode)}&order=created_at.desc`
  ).catch(() => null);
}

function readPublishedReferenceComposition(
  matchdayId: string,
  presentationMode: ReferenceCompositionPresentationMode,
): Promise<ReferenceComposition | null> {
  return readFirst<ReferenceComposition>(
    `matchday_reference_compositions?select=id,matchday_id,status,is_current,internal_name,use_roundup_items,presentation_mode,hierarchical_editorial_title,hierarchical_editorial_text,hierarchical_editorial_author,created_at,updated_at,published_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&status=eq.published&presentation_mode=eq.${encodeURIComponent(presentationMode)}&order=is_current.desc,published_at.desc.nullslast`
  ).catch(() => null);
}

function readReferenceCompositionItems(compositionId?: string | null): Promise<ReferenceCompositionItem[]> {
  if (!compositionId) {
    return Promise.resolve([]);
  }

  return fetchSupabaseAdminTable<ReferenceCompositionItem>(
    `matchday_reference_composition_items?select=id,composition_id,slot_type,source_type,source_id,article_id,sort_order,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot,label_snapshot,label_color_snapshot,media_kind_snapshot,media_embed_url_snapshot,media_video_url_snapshot,status,created_at,updated_at&composition_id=eq.${encodeURIComponent(
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

function readHierarchicalCompositionSlots(compositionId?: string | null): Promise<HierarchicalCompositionSlot[]> {
  if (!compositionId) return Promise.resolve([]);

  return fetchSupabaseAdminTable<HierarchicalCompositionSlot>(
    `matchday_hierarchical_composition_slots?select=id,composition_id,slot_key,bank_item_id,source_identity,label_snapshot,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot,media_kind_snapshot,media_embed_url_snapshot,media_video_url_snapshot,created_at,updated_at&composition_id=eq.${encodeURIComponent(
      compositionId
    )}`
  ).catch(() => []);
}

function hierarchicalEditorialFromComposition(
  composition?: ReferenceComposition | null,
): HierarchicalCompositionEditorial | null {
  if (!composition) return null;
  return {
    title: composition.hierarchical_editorial_title,
    text: composition.hierarchical_editorial_text,
    author: composition.hierarchical_editorial_author,
  };
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
  hierarchicalAuxiliaryItems,
  hierarchicalSlots,
  item,
  matchdayId,
  presentationMode,
  returnTo
}: {
  composition: ReferenceComposition | null;
  hierarchicalAuxiliaryItems: ReferenceCompositionItem[];
  hierarchicalSlots: HierarchicalCompositionSlot[];
  item: MatchdayEditorialBankItem;
  matchdayId: string;
  presentationMode: ReferenceCompositionPresentationMode;
  returnTo: string;
}) {
  if (!composition || composition.status !== "draft" || item.status !== "active") {
    return null;
  }

  const isArticle = isEditorialArticleBankItem(item);
  const isEditorialContent = isEditorialContentBankItem(item);
  const slotOptions = isArticle ? editorialArticleFlowSlotOptions : bankAssignableSlotOptions;
  const hierarchicalDeskSections = isEditorialContent
    ? HIERARCHICAL_COMPOSITION_DESK_SECTIONS.map((section) => ({
        ...section,
        slots: section.slots.filter((slot) => slot.key === "dominant_main"),
      })).filter((section) => section.slots.length > 0)
    : HIERARCHICAL_COMPOSITION_DESK_SECTIONS;
  const occupiedHierarchicalSlots = new Set(hierarchicalSlots.map((slot) => slot.slot_key));
  const occupiedBeyondOrders = new Set(
    hierarchicalAuxiliaryItems
      .filter((candidate) => candidate.slot_type === "beyond_matchday")
      .map((candidate) => candidate.sort_order),
  );
  const hasVideoHighlight = hierarchicalAuxiliaryItems.some((candidate) => candidate.slot_type === "complement");

  if (presentationMode === "hierarchical") {
    return (
      <div className="composition-admin-stack">
        <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
          <HiddenField name="action_type" value="assign_bank_item_to_hierarchical_slot" />
          <HiddenField name="matchday_id" value={matchdayId} />
          <HiddenField name="composition_id" value={composition.id} />
          <HiddenField name="bank_item_id" value={item.id} />
          <HiddenField name="return_to" value={returnTo} />
          <HiddenField name="return_anchor" value="matchday-editorial-bank" />
          <div className="composition-admin-field">
            <label htmlFor={`bank-hierarchical-slot-${item.id}`}>Colocar na Mesa da Composição…</label>
            <select className="composition-admin-input" id={`bank-hierarchical-slot-${item.id}`} name="slot_key" defaultValue="" required>
              <option value="" disabled>Escolher lugar</option>
              {hierarchicalDeskSections.map((section) => (
                <optgroup key={section.key} label={section.title}>
                  {section.slots.map((slot) => (
                    <option disabled={occupiedHierarchicalSlots.has(slot.key)} key={slot.key} value={slot.key}>
                      {slot.label}{occupiedHierarchicalSlots.has(slot.key) ? " — ocupado" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button className="composition-admin-small-button" type="submit">Atribuir ao lugar</button>
        </form>

        <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
          <HiddenField name="action_type" value="assign_bank_item_to_hierarchical_auxiliary" />
          <HiddenField name="matchday_id" value={matchdayId} />
          <HiddenField name="composition_id" value={composition.id} />
          <HiddenField name="bank_item_id" value={item.id} />
          <HiddenField name="return_to" value={returnTo} />
          <HiddenField name="return_anchor" value="matchday-editorial-bank" />
          <div className="composition-admin-field">
            <label htmlFor={`bank-hierarchical-auxiliary-${item.id}`}>Usar num momento posterior…</label>
            <select className="composition-admin-input" id={`bank-hierarchical-auxiliary-${item.id}`} name="auxiliary_target" defaultValue="" required>
              <option value="" disabled>Escolher posição</option>
              <option disabled={hasVideoHighlight} value="video_highlight">
                Destaque da Jornada{hasVideoHighlight ? " — ocupado" : ""}
              </option>
              {!isEditorialContent ? HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.map((position) => (
                <option
                  disabled={occupiedBeyondOrders.has(position.sortOrder)}
                  key={position.key}
                  value={`beyond_matchday_${position.sortOrder}`}
                >
                  Para Lá da Jornada — {position.label}{occupiedBeyondOrders.has(position.sortOrder) ? " — ocupado" : ""}
                </option>
              )) : null}
            </select>
          </div>
          <button className="composition-admin-small-button" type="submit">Atribuir ao momento</button>
        </form>
      </div>
    );
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
        <label htmlFor={`bank-zone-${item.id}`}>{isArticle ? "Publicar nesta zona…" : "Adicionar à zona…"}</label>
        <select className="composition-admin-input" id={`bank-zone-${item.id}`} name="slot_type" defaultValue="" required>
          <option value="" disabled>Escolher zona</option>
          {slotOptions.map((option) => (
            <option key={option.slotType} value={option.slotType}>
              {option.title}
            </option>
          ))}
        </select>
      </div>
      <button className="composition-admin-small-button" type="submit">
        {isArticle ? "Publicar nesta zona" : "Adicionar à zona"}
      </button>
      <p className="composition-admin-note">
        {isArticle
          ? "O artigo mantém-se completo na origem; esta zona recebe apenas a apresentação definida para ela."
          : "Se a zona tiver limite de lugares, é necessário libertar primeiro um lugar ocupado."}
      </p>
    </form>
  );
}

function BankNewsListItem({
  composition,
  hierarchicalAuxiliaryItems,
  hierarchicalSlots,
  item,
  matchdayId,
  placementLabel,
  presentationMode,
  returnTo
}: {
  composition: ReferenceComposition | null;
  hierarchicalAuxiliaryItems: ReferenceCompositionItem[];
  hierarchicalSlots: HierarchicalCompositionSlot[];
  item: MatchdayEditorialBankItem;
  matchdayId: string;
  placementLabel: string | null;
  presentationMode: ReferenceCompositionPresentationMode;
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
          <AssignBankItemForm
            composition={composition}
            hierarchicalAuxiliaryItems={hierarchicalAuxiliaryItems}
            hierarchicalSlots={hierarchicalSlots}
            item={item}
            matchdayId={matchdayId}
            presentationMode={presentationMode}
            returnTo={returnTo}
          />
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

function liveDeskArticleStatus(inLatest: boolean, placementKey?: string | null) {
  if (!inLatest && !placementKey) return "SEM COLOCAÇÃO";
  if (inLatest && !placementKey) return "ÚLTIMAS · SEM ZONA";

  const placement = placementLabelForKey(placementKey).toUpperCase();
  return inLatest ? `ÚLTIMAS · ${placement}` : placement;
}

function AssignRoundupVideoFromDeskForm({
  alreadySelected,
  composition,
  matchdayId,
  returnTo,
  videoId,
}: {
  alreadySelected: boolean;
  composition: ReferenceComposition | null;
  matchdayId: string;
  returnTo: string;
  videoId: string;
}) {
  if (alreadySelected) {
    return <span className="composition-admin-state in-use">Na composição</span>;
  }

  if (!composition || composition.status !== "draft") {
    return <span className="composition-admin-state">Disponível</span>;
  }

  return (
    <form action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="assign_roundup_item_to_hierarchical_composition" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="roundup_item_id" value={videoId} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value="matchday-editorial-bank" />
      <button className="composition-admin-small-button" type="submit">
        Adicionar a A Jornada em Vídeo
      </button>
    </form>
  );
}

function HierarchicalCompositionDeskBank({
  bankItems,
  bankPlacementById,
  composition,
  deskSnapshot,
  hierarchicalAuxiliaryItems,
  hierarchicalSlots,
  matchdayId,
  returnTo,
  selectedRoundupSourceIds,
}: {
  bankItems: MatchdayEditorialBankItem[];
  bankPlacementById: Map<string, string | null>;
  composition: ReferenceComposition | null;
  deskSnapshot: MatchdayDeskSnapshot | null;
  hierarchicalAuxiliaryItems: ReferenceCompositionItem[];
  hierarchicalSlots: HierarchicalCompositionSlot[];
  matchdayId: string;
  returnTo: string;
  selectedRoundupSourceIds: Set<string>;
}) {
  const liveArticles = deskSnapshot?.articles ?? [];

  const liveArticleById = new Map(
    liveArticles.map((article) => [article.id, article] as const),
  );

  const articleOrder = new Map(
    liveArticles.map((article, index) => [article.id, index] as const),
  );

  const deskBankItems = bankItems
    .filter(
      (item) =>
        item.status !== "archived" &&
        isEditorialArticleBankItem(item) &&
        Boolean(item.source_id && liveArticleById.has(item.source_id)),
    )
    .sort(
      (left, right) =>
        (articleOrder.get(left.source_id ?? "") ?? Number.MAX_SAFE_INTEGER) -
        (articleOrder.get(right.source_id ?? "") ?? Number.MAX_SAFE_INTEGER),
    );

  const mappedArticleIds = new Set(
    deskBankItems
      .map((item) => item.source_id)
      .filter((sourceId): sourceId is string => Boolean(sourceId)),
  );

  const missingDeskArticleCount = liveArticles.filter(
    (article) => !mappedArticleIds.has(article.id),
  ).length;

  const videos = deskSnapshot?.videos ?? [];
  const totalItems = deskBankItems.length + videos.length;

  const occupiedHierarchicalSlots = new Set(
    hierarchicalSlots.map((slot) => slot.slot_key),
  );

  const videoHighlightOccupied = hierarchicalAuxiliaryItems.some(
    (item) => item.slot_type === "complement",
  );

  const occupiedBeyondOrders = new Set(
    hierarchicalAuxiliaryItems
      .filter((item) => item.slot_type === "beyond_matchday")
      .map((item) => item.sort_order),
  );

  const filters = [
    ["all", "Todas"],
    ["latest", "Últimas"],
    ["latest_without_zone", "Sem zona nas Últimas"],
    ["four_news", "4 notícias"],
    ["six_news", "6 notícias"],
    ["five_news_balanced", "5 notícias principais"],
    ["five_news_secondary", "5 notícias secundárias"],
    ["faixa", "Faixa"],
    ["videos", "Vídeos"],
    ["highlight", "Destaque da Jornada"],
    ["unplaced", "Sem colocação"],
  ] as const;

  return (
    <Card title="Banco da Mesa">
      <div className="composition-admin-desk-bank">
        <div className="composition-admin-desk-toolbar">
          <div className="composition-admin-desk-search-row">
          <input
            className="composition-admin-input"
            data-composition-desk-search="true"
            placeholder="Pesquisar por título ou antetítulo"
            type="search"
          />

          <strong data-composition-desk-count="true">
            {totalItems}/{totalItems}
          </strong>
        </div>

        <nav className="composition-admin-bank-filters" aria-label="Filtrar Banco da Mesa">
          {filters.map(([key, label], index) => (
            <button
              className={`composition-admin-filter-link${index === 0 ? " active" : ""}`}
              data-composition-desk-filter={key}
              key={key}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        {composition?.status === "draft" ? (
          <form
            action="/api/admin/editorial/composicao"
            className="composition-admin-desk-bulk-bar"
            data-composition-desk-place-form="true"
            method="post"
          >
            <HiddenField name="action_type" value="" />
            <HiddenField name="matchday_id" value={matchdayId} />
            <HiddenField name="composition_id" value={composition.id} />
            <HiddenField name="return_to" value={returnTo} />
            <HiddenField name="return_anchor" value="matchday-editorial-bank" />

            <input
              data-composition-selected-bank-input="true"
              name="bank_item_id"
              type="hidden"
              value=""
            />

            <input
              data-composition-target-slot="true"
              name="slot_key"
              type="hidden"
              value=""
            />

            <input
              data-composition-target-auxiliary="true"
              name="auxiliary_target"
              type="hidden"
              value=""
            />

            <strong data-composition-selected-count="true">
              0 selecionadas
            </strong>

            <select
              aria-label="Colocar em"
              data-composition-destination="true"
              defaultValue=""
            >
              <option value="">Colocar em…</option>

              {HIERARCHICAL_COMPOSITION_DESK_SECTIONS.map((section) => (
                <optgroup key={section.key} label={section.title}>
                  {section.slots.map((slot) => (
                    <option
                      disabled={occupiedHierarchicalSlots.has(slot.key)}
                      key={slot.key}
                      value={`slot::${slot.key}`}
                    >
                      {slot.label}
                      {occupiedHierarchicalSlots.has(slot.key) ? " — ocupado" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}

              <optgroup label="Momentos posteriores">
                <option
                  disabled={videoHighlightOccupied}
                  value="aux::video_highlight"
                >
                  Destaque da Jornada
                  {videoHighlightOccupied ? " — ocupado" : ""}
                </option>

                {HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.map((position) => (
                  <option
                    disabled={occupiedBeyondOrders.has(position.sortOrder)}
                    key={position.key}
                    value={`aux::beyond_matchday_${position.sortOrder}`}
                  >
                    Para Lá da Jornada — {position.label}
                    {occupiedBeyondOrders.has(position.sortOrder) ? " — ocupado" : ""}
                  </option>
                ))}
              </optgroup>
            </select>

            <button
              className="composition-admin-small-button composition-admin-desk-place-button"
              data-composition-place-button="true"
              disabled
              type="submit"
            >
              Colocar
            </button>

            <button
              className="composition-admin-small-button secondary"
              data-composition-clear-selection="true"
              type="button"
            >
              Limpar seleção
            </button>
          </form>
        ) : (
          <p className="composition-admin-note">
            Reabre a composição para poderes selecionar e colocar publicações.
          </p>
        )}
        </div>

        {!deskSnapshot ? (
          <p className="composition-admin-note">
            Não foi possível ler o estado atual da Mesa viva. Nenhuma colocação será presumida.
          </p>
        ) : null}

        {missingDeskArticleCount > 0 ? (
          <div className="composition-admin-bank-toolbar">
            <p className="composition-admin-note">
              {missingDeskArticleCount} publicações da página viva ainda não têm entrada correspondente no banco.
            </p>

            <form
              className="composition-admin-form"
              action="/api/admin/editorial/composicao"
              method="post"
            >
              <HiddenField
                name="action_type"
                value="save_matchday_editorial_bank_current"
              />
              <HiddenField name="matchday_id" value={matchdayId} />
              <HiddenField name="return_to" value={returnTo} />

              <button
                className="composition-admin-small-button secondary"
                type="submit"
              >
                Sincronizar notícias em falta
              </button>
            </form>
          </div>
        ) : null}

        {totalItems > 0 ? (
          <div className="composition-admin-bank-list">
            {deskBankItems.map((item) => {
              const article = item.source_id
                ? liveArticleById.get(item.source_id) ?? null
                : null;

              if (!article) return null;

              const group = placementGroupForKey(article.placementKey);
              const compositionPlacement = bankPlacementById.get(item.id) ?? null;

              const selectionDisabled =
                composition?.status !== "draft" || Boolean(compositionPlacement);

              const thumbnail = article.imageUrl || item.image_url;

              return (
                <label
                  className={`composition-admin-bank-item composition-admin-desk-row${selectionDisabled ? " disabled" : ""}`}
                  data-composition-desk-group={group ?? ""}
                  data-composition-desk-in-latest={article.inLatest ? "1" : "0"}
                  data-composition-desk-item="true"
                  data-composition-desk-kind="article"
                  data-composition-desk-search-text={normalizeCandidateValue(
                    `${item.label ?? ""} ${item.title}`,
                  )}
                  key={item.id}
                >
                  <input
                    aria-label={`Selecionar ${item.title}`}
                    data-composition-bank-choice="true"
                    data-composition-bank-title={item.title}
                    disabled={selectionDisabled}
                    type="checkbox"
                    value={item.id}
                  />

                  <span
                    className="composition-admin-desk-rank"
                    data-composition-selection-rank="true"
                  >
                    ·
                  </span>

                  {thumbnail ? (
                    <img
                      alt=""
                      className="composition-admin-desk-thumbnail"
                      src={thumbnail}
                    />
                  ) : (
                    <span className="composition-admin-desk-thumbnail-placeholder" />
                  )}

                  <span className="composition-admin-bank-copy">
                    <span className="composition-admin-meta">
                      {textOrEmpty(item.label) ? (
                        <span className="composition-admin-label">
                          {item.label}
                        </span>
                      ) : null}

                      {article.publishedAt ? (
                        <time>
                          {new Date(article.publishedAt).toLocaleString("pt-PT", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Europe/Lisbon",
                          })}
                        </time>
                      ) : null}
                    </span>

                    <strong className="composition-admin-title">
                      {item.title}
                    </strong>

                    <span className="composition-admin-state">
                      {compositionPlacement
                        ? `COMPOSIÇÃO · ${compositionPlacement}`
                        : liveDeskArticleStatus(
                            article.inLatest,
                            article.placementKey,
                          )}
                    </span>
                  </span>
                </label>
              );
            })}

            {videos.map((video) => {
              const thumbnail = video.imageUrl;

              return (
                <article
                  className="composition-admin-bank-item composition-admin-desk-row"
                  data-composition-desk-item="true"
                  data-composition-desk-kind="video"
                  data-composition-desk-search-text={normalizeCandidateValue(
                    `${video.label ?? ""} ${video.title}`,
                  )}
                  key={`video:${video.id}`}
                >
                  <span />

                  <span className="composition-admin-desk-rank">
                    ▶
                  </span>

                  {thumbnail ? (
                    <img
                      alt=""
                      className="composition-admin-desk-thumbnail"
                      src={thumbnail}
                    />
                  ) : (
                    <span className="composition-admin-desk-thumbnail-placeholder" />
                  )}

                  <span className="composition-admin-bank-copy">
                    <span className="composition-admin-meta">
                      <span className="composition-admin-label">
                        VÍDEO
                      </span>

                      {textOrEmpty(video.duration) ? (
                        <span>{video.duration}</span>
                      ) : null}
                    </span>

                    <strong className="composition-admin-title">
                      {video.title}
                    </strong>

                    <span className="composition-admin-state">
                      {selectedRoundupSourceIds.has(video.id)
                        ? "A JORNADA EM VÍDEO · NA COMPOSIÇÃO"
                        : "A JORNADA EM VÍDEO"}
                    </span>

                    {!selectedRoundupSourceIds.has(video.id) ? (
                      <AssignRoundupVideoFromDeskForm
                        alreadySelected={false}
                        composition={composition}
                        matchdayId={matchdayId}
                        returnTo={returnTo}
                        videoId={video.id}
                      />
                    ) : null}
                  </span>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState>
            Ainda não existem publicações disponíveis na Mesa desta jornada.
          </EmptyState>
        )}
      </div>
    </Card>
  );
}
function LatestArticlePresentationForm({
  composition,
  item,
  matchdayId,
  returnAnchor,
  returnTo
}: {
  composition: ReferenceComposition;
  item: ReferenceCompositionItem;
  matchdayId: string;
  returnAnchor: string;
  returnTo: string;
}) {
  if (item.slot_type !== "editorial_line_item") return null;

  return (
    <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="update_article_zone_presentation" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="item_id" value={item.id} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value={returnAnchor} />
      <div className="composition-admin-field">
        <label htmlFor={`latest-label-${item.id}`}>Antetítulo / hora</label>
        <input
          className="composition-admin-input"
          id={`latest-label-${item.id}`}
          name="label_snapshot"
          defaultValue={item.label_snapshot ?? ""}
        />
      </div>
      <div className="composition-admin-field">
        <label htmlFor={`latest-subtitle-${item.id}`}>Pós-título manual, opcional</label>
        <input
          className="composition-admin-input"
          id={`latest-subtitle-${item.id}`}
          name="subtitle_snapshot"
          defaultValue={item.subtitle_snapshot ?? ""}
        />
      </div>
      <button className="composition-admin-small-button secondary" type="submit">Guardar apresentação</button>
      <p className="composition-admin-note">A hora é preenchida automaticamente ao entrar em Últimas. Podes editá-la e acrescentar um pós-título sem alterar o artigo original.</p>
    </form>
  );
}

function MoveCompositionItemForm({
  articleSource,
  composition,
  item,
  matchdayId,
  returnAnchor,
  returnTo
}: {
  articleSource: boolean;
  composition: ReferenceComposition;
  item: ReferenceCompositionItem;
  matchdayId: string;
  returnAnchor: string;
  returnTo: string;
}) {
  if (item.slot_type === "roundup") return null;
  const slotOptions = articleSource ? editorialArticleFlowSlotOptions : bankAssignableSlotOptions;

  return (
    <form className="composition-admin-form-row" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="move_composition_item" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="item_id" value={item.id} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value={returnAnchor} />
      <select className="composition-admin-input" name="target_slot_type" defaultValue={item.slot_type} aria-label="Transferir para outra zona">
        {slotOptions.map((option) => (
          <option key={option.slotType} value={option.slotType}>
            {option.title}
          </option>
        ))}
      </select>
      <button className="composition-admin-small-button" type="submit">Transferir</button>
    </form>
  );
}

function ReorderCompositionItemForm({
  composition,
  direction,
  item,
  label,
  matchdayId,
  returnAnchor,
  returnTo
}: {
  composition: ReferenceComposition;
  direction: "up" | "down";
  item: ReferenceCompositionItem;
  label: string;
  matchdayId: string;
  returnAnchor: string;
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
      <HiddenField name="return_anchor" value={returnAnchor} />
      <button className="composition-admin-small-button secondary" type="submit">{label}</button>
    </form>
  );
}

function CreateDraftForm({
  matchdayId,
  presentationMode,
  returnTo,
}: {
  matchdayId: string;
  presentationMode: ReferenceCompositionPresentationMode;
  returnTo: string;
}) {
  return (
    <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="create_draft" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="presentation_mode" value={presentationMode} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value="composition-status" />
      <div className="composition-admin-field">
        <label htmlFor="reference-composition-internal-name">Nome interno</label>
        <input
          className="composition-admin-input"
          id="reference-composition-internal-name"
          name="internal_name"
          placeholder="Rascunho da composição"
        />
      </div>
      <button className="composition-admin-small-button" type="submit">
        Criar rascunho
      </button>
      <p className="composition-admin-note">
        O rascunho fica disponível para edição antes de publicar.
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
      <HiddenField name="presentation_mode" value={composition.presentation_mode} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value="composition-status" />
      <div className="composition-admin-field">
        <label htmlFor="reference-composition-current-name">Nome interno</label>
        <input
          className="composition-admin-input"
          id="reference-composition-current-name"
          name="internal_name"
          defaultValue={composition.internal_name ?? ""}
        />
      </div>
      {composition.presentation_mode === "standard" ? (
        <label className="composition-admin-check">
          <input type="checkbox" name="use_roundup_items" value="1" defaultChecked={composition.use_roundup_items} /> Usar
          resumo/vídeos
        </label>
      ) : (
        <HiddenField name="use_roundup_items" value="1" />
      )}
      <button className="composition-admin-small-button" type="submit">
        Guardar definições do rascunho
      </button>
      <p className="composition-admin-note">
        {composition.presentation_mode === "standard"
          ? "Guarda apenas o nome interno e a opção de resumo/vídeos. Não altera as notícias nem publica a composição."
          : "Guarda apenas o nome interno. Os vídeos desta versão são escolhidos e ordenados na própria Composição."}
      </p>
    </form>
  );
}

function HierarchicalEditorialEditor({
  composition,
  matchdayId,
  returnTo,
}: {
  composition: ReferenceComposition;
  matchdayId: string;
  returnTo: string;
}) {
  const editorial = hierarchicalEditorialFromComposition(composition);
  const paragraphs = hierarchicalCompositionEditorialParagraphs(editorial?.text);
  const isDraft = composition.status === "draft";

  if (!isDraft) {
    return (
      <section className="composition-admin-section" id="hierarchical-editorial">
        <div className="composition-admin-section-heading">
          <h4>Editorial da Jornada</h4>
          <span>Conteúdo próprio desta composição</span>
        </div>
        <div className="composition-admin-stack">
          <strong>{editorial?.title || "Sem título"}</strong>
          {paragraphs.map((paragraph) => <p className="composition-admin-note" key={paragraph}>{paragraph}</p>)}
          <span className="composition-admin-note">Autor: {editorial?.author || "por preencher"}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="composition-admin-section" id="hierarchical-editorial">
      <div className="composition-admin-section-heading">
        <h4>Editorial da Jornada</h4>
        <span>Exclusivo da apresentação hierárquica</span>
      </div>
      <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
        <HiddenField name="action_type" value="update_hierarchical_editorial" />
        <HiddenField name="matchday_id" value={matchdayId} />
        <HiddenField name="composition_id" value={composition.id} />
        <HiddenField name="return_to" value={returnTo} />
        <HiddenField name="return_anchor" value="hierarchical-editorial" />
        <div className="composition-admin-field">
          <label htmlFor="hierarchical-editorial-title">Título</label>
          <input
            className="composition-admin-input"
            id="hierarchical-editorial-title"
            name="hierarchical_editorial_title"
            defaultValue={composition.hierarchical_editorial_title ?? ""}
            required
          />
        </div>
        <div className="composition-admin-field">
          <label htmlFor="hierarchical-editorial-text">Texto</label>
          <textarea
            className="composition-admin-input"
            id="hierarchical-editorial-text"
            name="hierarchical_editorial_text"
            defaultValue={composition.hierarchical_editorial_text ?? ""}
            rows={10}
            required
          />
        </div>
        <div className="composition-admin-field">
          <label htmlFor="hierarchical-editorial-author">Autor</label>
          <input
            className="composition-admin-input"
            id="hierarchical-editorial-author"
            name="hierarchical_editorial_author"
            defaultValue={composition.hierarchical_editorial_author ?? ""}
            required
          />
        </div>
        <button className="composition-admin-small-button" type="submit">Guardar Editorial da Jornada</button>
        <p className="composition-admin-note">
          Este texto pertence apenas a esta composição hierárquica. Não altera Contexto, Editorial da Jornada standard ou qualquer notícia.
        </p>
      </form>
    </section>
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
      <HiddenField name="return_anchor" value="composition-status" />
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
        {composition.presentation_mode === "hierarchical" ? "Publicar e usar esta apresentação" : "Publicar composição"}
      </button>
    </form>
  );
}

function ActivateCompositionForm({
  composition,
  label,
  matchdayId,
  returnTo,
}: {
  composition: ReferenceComposition;
  label: string;
  matchdayId: string;
  returnTo: string;
}) {
  return (
    <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="activate_reference_composition" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value="composition-status" />
      <button className="composition-admin-small-button" type="submit">{label}</button>
      <p className="composition-admin-note">A outra apresentação permanece publicada e pode voltar a ser escolhida.</p>
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
      <HiddenField name="return_anchor" value="composition-status" />
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
        Adicionar à Faixa de notícias
      </button>
    </form>
  );
}

function RemoveItemForm({
  composition,
  item,
  matchdayId,
  returnAnchor,
  returnTo
}: {
  composition: ReferenceComposition;
  item: ReferenceCompositionItem;
  matchdayId: string;
  returnAnchor: string;
  returnTo: string;
}) {
  return (
    <form action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="remove_item" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="item_id" value={item.id} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value={returnAnchor} />
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
  articleSource,
  canMoveDown,
  canMoveUp,
  composition,
  item,
  matchdayId,
  returnAnchor,
  returnTo
}: {
  articleSource: boolean;
  canMoveDown: boolean;
  canMoveUp: boolean;
  composition: ReferenceComposition;
  item: ReferenceCompositionItem;
  matchdayId: string;
  returnAnchor: string;
  returnTo: string;
}) {
  const isBankItem = isBankCompositionSource(item.source_type, item.source_id);

  return (
    <div className="composition-admin-form">
      {articleSource ? (
        <LatestArticlePresentationForm composition={composition} item={item} matchdayId={matchdayId} returnAnchor={returnAnchor} returnTo={returnTo} />
      ) : null}
      <MoveCompositionItemForm articleSource={articleSource} composition={composition} item={item} matchdayId={matchdayId} returnAnchor={returnAnchor} returnTo={returnTo} />
      <div className="composition-admin-inline-actions">
        {canMoveUp ? (
          <ReorderCompositionItemForm composition={composition} direction="up" item={item} label="Subir" matchdayId={matchdayId} returnAnchor={returnAnchor} returnTo={returnTo} />
        ) : null}
        {canMoveDown ? (
          <ReorderCompositionItemForm composition={composition} direction="down" item={item} label="Descer" matchdayId={matchdayId} returnAnchor={returnAnchor} returnTo={returnTo} />
        ) : null}
        {isBankItem ? (
          <UnassignBankItemForm composition={composition} item={item} matchdayId={matchdayId} returnTo={returnTo} />
        ) : (
          <RemoveItemForm composition={composition} item={item} matchdayId={matchdayId} returnAnchor={returnAnchor} returnTo={returnTo} />
        )}
      </div>
      <p className="composition-admin-note">
        {isBankItem
          ? "Retirar devolve a notícia ao estado Disponível no banco."
          : "Retirar remove apenas este item da composição."}
      </p>
    </div>
  );
}

function UnassignHierarchicalSlotForm({
  composition,
  matchdayId,
  returnTo,
  slot,
}: {
  composition: ReferenceComposition;
  matchdayId: string;
  returnTo: string;
  slot: HierarchicalCompositionSlot;
}) {
  return (
    <form action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="unassign_hierarchical_slot" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="hierarchical_slot_id" value={slot.id} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value={`hierarchical-${slot.slot_key}`} />
      <button className="composition-admin-small-button secondary" type="submit">Retirar deste lugar</button>
    </form>
  );
}

function HierarchicalCompositionEditor({
  composition,
  matchdayId,
  returnTo,
  slots,
}: {
  composition: ReferenceComposition;
  matchdayId: string;
  returnTo: string;
  slots: HierarchicalCompositionSlot[];
}) {
  const slotsByKey = new Map(
    slots.map((slot) => [slot.slot_key, slot] as const),
  );

  return (
    <div className="composition-admin-section-list">
      {HIERARCHICAL_COMPOSITION_DESK_SECTIONS.map((section) => (
        <section className="composition-admin-section" key={section.key}>
          <div className="composition-admin-section-heading">
            <h4>{section.title}</h4>

            <span>
              {section.slots.filter((slot) => slotsByKey.has(slot.key)).length}
              /{section.slots.length}
            </span>
          </div>

          <p className="composition-admin-note">
            {section.summary}
          </p>

          <div className="composition-admin-grid">
            {section.slots.map((definition) => {
              const slot = slotsByKey.get(definition.key) ?? null;

              return (
                <div
                  id={`hierarchical-${definition.key}`}
                  key={definition.key}
                >
                  {slot ? (
                    <ItemCard
                      imageUrl={slot.image_url_snapshot}
                      label={slot.label_snapshot}
                      linkUrl={slot.link_url_snapshot}
                      meta={[definition.label]}
                      subtitle={slot.subtitle_snapshot}
                      title={slot.title_snapshot}
                    >
                      {composition.status === "draft" ? (
                        <UnassignHierarchicalSlotForm
                          composition={composition}
                          matchdayId={matchdayId}
                          returnTo={returnTo}
                          slot={slot}
                        />
                      ) : null}
                    </ItemCard>
                  ) : (
                    <div className="composition-admin-hierarchical-empty">
                      <strong>{definition.label}</strong>
                      <span>Livre</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
function RemoveHierarchicalReferenceItemForm({
  composition,
  item,
  label = "Retirar",
  matchdayId,
  returnAnchor,
  returnTo,
}: {
  composition: ReferenceComposition;
  item: ReferenceCompositionItem;
  label?: string;
  matchdayId: string;
  returnAnchor: string;
  returnTo: string;
}) {
  return (
    <form action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="remove_item" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="item_id" value={item.id} />
      <HiddenField name="presentation_mode" value="hierarchical" />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value={returnAnchor} />
      <button className="composition-admin-small-button secondary" type="submit">{label}</button>
    </form>
  );
}

function ReorderHierarchicalVideoForm({
  composition,
  direction,
  item,
  label,
  matchdayId,
  returnTo,
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
      <HiddenField name="presentation_mode" value="hierarchical" />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value="hierarchical-video" />
      <button className="composition-admin-small-button secondary" type="submit">{label}</button>
    </form>
  );
}

function HierarchicalVideoEditor({
  composition,
  matchdayId,
  referenceItems,
  returnTo,
  roundupItems,
}: {
  composition: ReferenceComposition;
  matchdayId: string;
  referenceItems: ReferenceCompositionItem[];
  returnTo: string;
  roundupItems: SupabaseMatchdayRoundupItem[];
}) {
  const selectedVideos = referenceItems
    .filter((item) => item.slot_type === "roundup")
    .sort((left, right) => left.sort_order - right.sort_order);
  const selectedSourceIds = new Set(selectedVideos.map((item) => item.source_id).filter(Boolean));
  const availableVideos = roundupItems.filter(
    (item) => item.status === "published" && textOrEmpty(item.video_url) && !selectedSourceIds.has(item.id),
  );

  return (
    <section className="composition-admin-section" id="hierarchical-video">
      <div className="composition-admin-section-heading">
        <h4>A Jornada em Vídeo</h4>
        <span>{selectedVideos.length} {selectedVideos.length === 1 ? "vídeo" : "vídeos"}</span>
      </div>
      <p className="composition-admin-note">Esta lista pertence apenas a esta versão da Composição. Podes escolher, ordenar e retirar vídeos sem alterar a página viva.</p>

      {composition.status === "draft" && availableVideos.length > 0 ? (
        <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
          <HiddenField name="action_type" value="assign_roundup_item_to_hierarchical_composition" />
          <HiddenField name="matchday_id" value={matchdayId} />
          <HiddenField name="composition_id" value={composition.id} />
          <HiddenField name="return_to" value={returnTo} />
          <HiddenField name="return_anchor" value="hierarchical-video" />
          <div className="composition-admin-field">
            <label htmlFor="hierarchical-roundup-item">Adicionar vídeo publicado</label>
            <select className="composition-admin-input" id="hierarchical-roundup-item" name="roundup_item_id" defaultValue="" required>
              <option value="" disabled>Escolher vídeo</option>
              {availableVideos.map((item) => (
                <option key={item.id} value={item.id}>{item.title || item.label || item.type}</option>
              ))}
            </select>
          </div>
          <button className="composition-admin-small-button" type="submit">Adicionar vídeo</button>
        </form>
      ) : null}

      {selectedVideos.length > 0 ? (
        <div className="composition-admin-grid">
          {selectedVideos.map((item, index) => (
            <RoundupItemCard
              key={item.id}
              label={item.label_snapshot}
              title={item.title_snapshot}
              subtitle={item.subtitle_snapshot}
              linkUrl={item.link_url_snapshot}
              meta={[`Ordem ${index + 1}`]}
            >
              {composition.status === "draft" ? (
                <div className="composition-admin-actions">
                  <ReorderHierarchicalVideoForm
                    composition={composition}
                    direction="up"
                    item={item}
                    label="Subir"
                    matchdayId={matchdayId}
                    returnTo={returnTo}
                  />
                  <ReorderHierarchicalVideoForm
                    composition={composition}
                    direction="down"
                    item={item}
                    label="Descer"
                    matchdayId={matchdayId}
                    returnTo={returnTo}
                  />
                  <RemoveHierarchicalReferenceItemForm
                    composition={composition}
                    item={item}
                    matchdayId={matchdayId}
                    returnAnchor="hierarchical-video"
                    returnTo={returnTo}
                  />
                </div>
              ) : null}
            </RoundupItemCard>
          ))}
        </div>
      ) : (
        <EmptyState>Ainda não foram escolhidos vídeos para esta Composição.</EmptyState>
      )}
    </section>
  );
}

function PublishedSourceAuxiliaryForm({
  articles,
  contents,
  composition,
  matchdayId,
  openTargets,
  returnTo,
}: {
  articles: PublishedEditorialArticle[];
  contents: PublishedEditorialContent[];
  composition: ReferenceComposition;
  matchdayId: string;
  openTargets: Array<{ value: string; label: string }>;
  returnTo: string;
}) {
  const selectableArticles = articles.filter((article) => textOrEmpty(article.title) && textOrEmpty(article.slug));
  const highlightAvailable = openTargets.some((target) => target.value === "video_highlight");
  const selectableVideos = highlightAvailable
    ? contents.filter(
        (content) =>
          textOrEmpty(content.title) &&
          textOrEmpty(content.slug) &&
          (textOrEmpty(content.embed_url) || textOrEmpty(content.video_url)),
      )
    : [];
  if (composition.status !== "draft" || openTargets.length === 0 || (selectableArticles.length === 0 && selectableVideos.length === 0)) return null;

  return (
    <form className="composition-admin-form" action="/api/admin/editorial/composicao" method="post">
      <HiddenField name="action_type" value="assign_published_source_to_hierarchical_auxiliary" />
      <HiddenField name="matchday_id" value={matchdayId} />
      <HiddenField name="composition_id" value={composition.id} />
      <HiddenField name="return_to" value={returnTo} />
      <HiddenField name="return_anchor" value="hierarchical-auxiliary" />
      <div className="composition-admin-field">
        <label htmlFor="hierarchical-published-source">Publicação publicada</label>
        <select className="composition-admin-input" id="hierarchical-published-source" name="published_source" defaultValue="" required>
          <option value="" disabled>Escolher publicação</option>
          {selectableArticles.length > 0 ? (
            <optgroup label="Notícias">
              {selectableArticles.map((article) => (
                <option key={`article:${article.id}`} value={`editorial_article:${article.id}`}>{article.title}</option>
              ))}
            </optgroup>
          ) : null}
          {selectableVideos.length > 0 ? (
            <optgroup label="Vídeos">
              {selectableVideos.map((content) => (
                <option key={`content:${content.id}`} value={`editorial_content:${content.id}`}>{content.title}</option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>
      <div className="composition-admin-field">
        <label htmlFor="hierarchical-auxiliary-target">Posição</label>
        <select className="composition-admin-input" id="hierarchical-auxiliary-target" name="auxiliary_target" defaultValue="" required>
          <option value="" disabled>Escolher posição</option>
          {openTargets.map((target) => (
            <option key={target.value} value={target.value}>{target.label}</option>
          ))}
        </select>
      </div>
      <button className="composition-admin-small-button" type="submit">Adicionar publicação</button>
      <p className="composition-admin-note">Notícias mantêm o comportamento atual. Vídeos podem ser escolhidos para o Destaque da Jornada sem duplicar a origem canónica.</p>
    </form>
  );
}

function HierarchicalAuxiliaryEditor({
  articles,
  contents,
  composition,
  items,
  matchdayId,
  returnTo,
}: {
  articles: PublishedEditorialArticle[];
  contents: PublishedEditorialContent[];
  composition: ReferenceComposition;
  items: ReferenceCompositionItem[];
  matchdayId: string;
  returnTo: string;
}) {
  const videoHighlight = items.find((item) => item.slot_type === "complement") ?? null;

  const beyondByOrder = new Map(
    items
      .filter((item) => item.slot_type === "beyond_matchday")
      .map((item) => [item.sort_order, item] as const),
  );

  const openTargets = [
    ...(videoHighlight ? [] : [{ value: "video_highlight", label: "Destaque da Jornada" }]),
    ...HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS
      .filter((position) => !beyondByOrder.has(position.sortOrder))
      .map((position) => ({
        value: `beyond_matchday_${position.sortOrder}`,
        label: `Para Lá da Jornada — ${position.label}`,
      })),
  ];

  return (
    <section className="composition-admin-section" id="hierarchical-auxiliary">
      <div className="composition-admin-section-heading">
        <h4>Momentos posteriores</h4>
        <span>Destaque opcional + atualidade 1+4</span>
      </div>

      {composition.status === "draft" && openTargets.length > 0 ? (
        <details className="composition-admin-candidates">
          <summary>Opções avançadas — outras publicações</summary>
          <div className="composition-admin-candidates-body">
            <PublishedSourceAuxiliaryForm
              articles={articles}
              contents={contents}
              composition={composition}
              matchdayId={matchdayId}
              openTargets={openTargets}
              returnTo={returnTo}
            />
          </div>
        </details>
      ) : null}

      <section className="composition-admin-section">
        <div className="composition-admin-section-heading">
          <h4>Destaque da Jornada</h4>
          <span>Opcional, ao lado do vídeo</span>
        </div>

        {videoHighlight ? (
          <ItemCard
            imageUrl={videoHighlight.image_url_snapshot}
            label={videoHighlight.label_snapshot}
            linkUrl={videoHighlight.link_url_snapshot}
            subtitle={videoHighlight.subtitle_snapshot}
            title={videoHighlight.title_snapshot}
          >
            {composition.status === "draft" ? (
              <RemoveHierarchicalReferenceItemForm
                composition={composition}
                item={videoHighlight}
                matchdayId={matchdayId}
                returnAnchor="hierarchical-auxiliary"
                returnTo={returnTo}
              />
            ) : null}
          </ItemCard>
        ) : (
          <div className="composition-admin-hierarchical-empty">
            <strong>Destaque da Jornada</strong>
            <span>Livre</span>
          </div>
        )}
      </section>

      <section className="composition-admin-section">
        <div className="composition-admin-section-heading">
          <h4>Para Lá da Jornada</h4>
          <span>{beyondByOrder.size}/5 posições</span>
        </div>

        <p className="composition-admin-note">
          Seleção editorial manual da atualidade viva naquele momento; nunca é preenchida automaticamente por data.
        </p>

        <div className="composition-admin-grid">
          {HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.map((position) => {
            const item = beyondByOrder.get(position.sortOrder) ?? null;

            return item ? (
              <ItemCard
                imageUrl={item.image_url_snapshot}
                key={position.key}
                label={item.label_snapshot}
                linkUrl={item.link_url_snapshot}
                meta={[hierarchicalBeyondMatchdayPositionLabel(position.sortOrder)]}
                subtitle={item.subtitle_snapshot}
                title={item.title_snapshot}
              >
                {composition.status === "draft" ? (
                  <RemoveHierarchicalReferenceItemForm
                    composition={composition}
                    item={item}
                    matchdayId={matchdayId}
                    returnAnchor="hierarchical-auxiliary"
                    returnTo={returnTo}
                  />
                ) : null}
              </ItemCard>
            ) : (
              <div className="composition-admin-hierarchical-empty" key={position.key}>
                <strong>{position.label}</strong>
                <span>Livre</span>
              </div>
            );
          })}
        </div>
      </section>
    </section>
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
  const presentationMode: ReferenceCompositionPresentationMode =
    query.presentation_mode === "hierarchical" ? "hierarchical" : "standard";
  const [
    modeDraftComposition,
    modePublishedComposition,
    bankItems,
    contextSelector,
    roundupItems,
    publishedArticles,
    publishedContents,
    hierarchicalDeskSnapshot,
  ] = await Promise.all([
    readDraftReferenceComposition(matchday.id, presentationMode),
    readPublishedReferenceComposition(matchday.id, presentationMode),
    readMatchdayEditorialBankItems(matchday.id),
    readContextSelectorData(),
    presentationMode === "hierarchical" ? readMatchdayRoundupItems(matchday.id) : Promise.resolve([]),
    presentationMode === "hierarchical" ? readPublishedEditorialArticles(matchday.id) : Promise.resolve([]),
    presentationMode === "hierarchical" ? readPublishedEditorialContents(matchday.id) : Promise.resolve([]),
    presentationMode === "hierarchical"
      ? readMatchdayEditorialDesk(matchday.id)
      : Promise.resolve(null),
  ]);
  const draftComposition = modeDraftComposition ?? modePublishedComposition;
  const [compositionItems, hierarchicalSlots] = await Promise.all([
    readReferenceCompositionItems(draftComposition?.id),
    presentationMode === "hierarchical" ? readHierarchicalCompositionSlots(draftComposition?.id) : Promise.resolve([]),
  ]);
  const hierarchicalAuxiliaryItems = compositionItems.filter(
    (item) => item.slot_type === "complement" || item.slot_type === "beyond_matchday",
  );
  const selectedRoundupSourceIds = new Set(
    compositionItems
      .filter((item) => item.slot_type === "roundup" && item.source_id)
      .map((item) => item.source_id as string),
  );
  const hierarchicalPreviewRoundupItems = compositionItems
    .filter((item) => item.slot_type === "roundup")
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item) => ({
      id: item.id,
      label: item.label_snapshot,
      title: item.title_snapshot,
      subtitle: item.subtitle_snapshot,
      image_url: item.image_url_snapshot,
      video_url: item.link_url_snapshot,
      sort_order: item.sort_order,
      status: item.status,
    }));
  const hierarchicalPreviewHighlightItem = hierarchicalAuxiliaryItems.find(
    (item) => item.slot_type === "complement",
  );
  const hierarchicalPreviewHighlightMedia = hierarchicalCompositionMediaSnapshot(hierarchicalPreviewHighlightItem);
  const hierarchicalPreviewVideoHighlight = hierarchicalPreviewHighlightItem
    ? {
        isPublished: true,
        label: hierarchicalPreviewHighlightItem.label_snapshot,
        labelColor: hierarchicalPreviewHighlightItem.label_color_snapshot,
        title: hierarchicalPreviewHighlightItem.title_snapshot,
        text: hierarchicalPreviewHighlightItem.subtitle_snapshot,
        imageUrl: hierarchicalPreviewHighlightItem.image_url_snapshot,
        linkUrl: hierarchicalPreviewHighlightItem.link_url_snapshot,
        inlineMedia: hierarchicalPreviewHighlightMedia,
      }
    : null;
  const hierarchicalPreviewBeyondMatchdayItems = hierarchicalAuxiliaryItems
    .filter((item) => item.slot_type === "beyond_matchday")
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item) => ({
      id: item.id,
      label: item.label_snapshot,
      title: item.title_snapshot ?? "",
      subtitle: item.subtitle_snapshot,
      imageUrl: item.image_url_snapshot,
      linkUrl: item.link_url_snapshot ?? "",
    }));
  const groupedCompositionItems = groupCompositionItemsBySection(compositionItems);
  const missingHierarchicalSlots = missingHierarchicalCompositionSlots(hierarchicalSlots);
  const incompleteHierarchicalSlots = incompleteHierarchicalCompositionSlots(hierarchicalSlots);
  const incompleteBeyondPositions = incompleteHierarchicalBeyondMatchdayPositions(compositionItems);
  const hierarchicalEditorial = presentationMode === "hierarchical"
    ? hierarchicalEditorialFromComposition(draftComposition)
    : null;
  const missingHierarchicalEditorialFields = missingHierarchicalCompositionEditorialFields(hierarchicalEditorial);
  const publicationValidation = presentationMode === "hierarchical"
    ? {
        canPublish:
          isPublishableHierarchicalComposition(hierarchicalSlots) &&
          isPublishableHierarchicalBeyondMatchday(compositionItems) &&
          isPublishableHierarchicalCompositionEditorial(hierarchicalEditorial),
        warnings: [
          ...(Array.from(new Set([...missingHierarchicalSlots, ...incompleteHierarchicalSlots])).length > 0
            ? [`15 lugares — em falta: ${Array.from(new Set([...missingHierarchicalSlots, ...incompleteHierarchicalSlots])).map(hierarchicalSlotLabel).join(", ")}.`]
            : []),
          ...(incompleteBeyondPositions.length > 0
            ? [`Para Lá da Jornada — em falta: ${incompleteBeyondPositions.map((position) => position.label).join(", ")}.`]
            : []),
          ...(missingHierarchicalEditorialFields.length > 0
            ? [`Editorial da Jornada — em falta: ${missingHierarchicalEditorialFields.map((field) => HIERARCHICAL_COMPOSITION_EDITORIAL_FIELD_LABELS[field]).join(", ")}.`]
            : []),
        ],
      }
    : getCompositionPublicationValidation(compositionItems);
  const isDraftComposition = draftComposition?.status === "draft";
  const isPublishedComposition = draftComposition?.status === "published";
  const publishedCompositionProblemMessage = isPublishedComposition && presentationMode === "standard"
    ? getPublishedCompositionProblemMessage(compositionItems)
    : null;
  const publishedAtLabel = formatPublishedAt(draftComposition?.published_at);
  const contextLabel = `${country?.name ?? "Pais"} / ${competition.name} / ${season.label} / ${matchday.label}`;
  const selectorCountryById = new Map(contextSelector.countries.map((item) => [item.id, item]));
  const selectorCompetitionById = new Map(contextSelector.competitions.map((item) => [item.id, item]));
  const selectorSeasonById = new Map(contextSelector.seasons.map((item) => [item.id, item]));
  const bankFilter = ["all", "available", "in_use", "archived"].includes(query.bank_filter ?? "")
    ? (query.bank_filter as "all" | "available" | "in_use" | "archived")
    : "all";
  const baseReturnTo = `/admin/editorial/composicao/${matchday.id}${presentationMode === "hierarchical" ? "?presentation_mode=hierarchical" : ""}`;
  const returnTo = bankFilter === "all"
    ? baseReturnTo
    : `${baseReturnTo}${baseReturnTo.includes("?") ? "&" : "?"}bank_filter=${encodeURIComponent(bankFilter)}`;
  const hierarchicalPlacementByBankId = new Map(
    hierarchicalSlots
      .filter((slot) => slot.bank_item_id)
      .map((slot) => [slot.bank_item_id as string, hierarchicalSlotLabel(slot.slot_key)] as const),
  );
  const hierarchicalAuxiliaryPlacementByBankId = new Map(
    hierarchicalAuxiliaryItems
      .filter((item) => item.source_type === "matchday_editorial_bank_item" && item.source_id)
      .map((item) => [
        item.source_id as string,
        item.slot_type === "complement"
          ? "Destaque da Jornada"
          : `Para Lá da Jornada — ${hierarchicalBeyondMatchdayPositionLabel(item.sort_order)}`,
      ] as const),
  );
  const hierarchicalAuxiliaryPlacementByArticleId = new Map(
    hierarchicalAuxiliaryItems
      .filter((item) => item.source_type === "editorial_article" && item.source_id)
      .map((item) => [
        item.source_id as string,
        item.slot_type === "complement"
          ? "Destaque da Jornada"
          : `Para Lá da Jornada — ${hierarchicalBeyondMatchdayPositionLabel(item.sort_order)}`,
      ] as const),
  );
  const bankPlacementById = new Map(
    bankItems.map((item) => [
      item.id,
      presentationMode === "hierarchical"
        ? hierarchicalPlacementByBankId.get(item.id) ??
          hierarchicalAuxiliaryPlacementByBankId.get(item.id) ??
          (isEditorialArticleBankItem(item) && item.source_id
            ? hierarchicalAuxiliaryPlacementByArticleId.get(item.source_id) ?? null
            : null) ??
          hierarchicalAuxiliaryBankItemPlacementLabel(hierarchicalAuxiliaryItems, item)
        : bankItemPlacementLabel(compositionItems, item),
    ]),
  );
  const editorialArticleBankItemIds = new Set(bankItems.filter(isEditorialArticleBankItem).map((item) => item.id));
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
  const standardCompositionSummary = [
    { slotType: "headline", label: "Manchete" },
    { slotType: "editorial_line_item", label: "Últimas" },
    { slotType: "side_block", label: "Contexto" },
    { slotType: "highlight", label: "3 notícias" },
    { slotType: "roundup", label: "Vídeo" },
    { slotType: "complement", label: "Ao lado do vídeo" },
    { slotType: "important_item", label: "Faixa de notícias" }
  ].map((section) => ({
    label: section.label,
    count: compositionItems.filter((item) => item.slot_type === section.slotType).length
  }));
  const compositionSummary = presentationMode === "hierarchical"
    ? [
        ...HIERARCHICAL_COMPOSITION_MOMENTS.map((moment) => ({
          label: moment.title,
          count: moment.slots.filter((slot) => hierarchicalSlots.some((item) => item.slot_key === slot.key)).length,
        })),
        { label: "A Jornada em Vídeo", count: compositionItems.filter((item) => item.slot_type === "roundup").length },
        { label: "Destaque da Jornada", count: compositionItems.filter((item) => item.slot_type === "complement").length },
        { label: "Para Lá da Jornada", count: compositionItems.filter((item) => item.slot_type === "beyond_matchday").length },
      ]
    : standardCompositionSummary;
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
    if (query.bank_assigned) return "Notícia adicionada à composição.";
    if (query.bank_unassigned) return "Notícia retirada da composição e novamente disponível no banco.";
    if (query.bank_archived) return "Notícia arquivada. Continua preservada no banco.";
    if (query.bank_reactivated) return "Notícia reativada e devolvida à lista disponível.";
    if (query.bank_error) return "Não foi possível sincronizar as publicações desta jornada.";
    if (query.bank_saved || query.bank_updated || query.bank_skipped || query.bank_existing || query.bank_repeated) {
      return `Sincronização concluída: ${bankSavedCount} novas, ${bankUpdatedCount} atualizadas, ${bankExistingCount} já estavam corretas e ${bankRepeatedCount} repetições foram ignoradas.`;
    }
    return null;
  })();
  const compositionFeedback = query.composition_error
    ? query.composition_error === "1"
      ? "Não foi possível guardar a alteração."
      : query.composition_error
    : query.composition_saved
      ? "Alteração guardada."
      : null;
  const compositionFeedbackKind = query.composition_error ? "error" : query.composition_saved ? "success" : "";
  const feedbackAnchor = query.feedback_anchor ?? "";

  const hierarchicalDeskBankItemByArticleId = new Map(
    bankItems
      .filter(isEditorialArticleBankItem)
      .filter((item) => item.source_id)
      .map((item) => [item.source_id as string, item] as const),
  );

  const hierarchicalDeskArticles = presentationMode === "hierarchical"
    ? (hierarchicalDeskSnapshot?.articles ?? []).flatMap((article) => {
        const bankItem = hierarchicalDeskBankItemByArticleId.get(article.id);
        if (!bankItem || bankItem.status === "archived") return [];

        return [{
          bankItemId: bankItem.id,
          articleId: article.id,
          label: article.label ?? bankItem.label,
          title: article.title,
          imageUrl: article.imageUrl ?? bankItem.image_url,
          publishedAt: article.publishedAt,
          inLatest: article.inLatest,
          placementKey: article.placementKey,
        }];
      })
    : [];

  const hierarchicalDeskVideos = presentationMode === "hierarchical"
    ? (hierarchicalDeskSnapshot?.videos ?? []).map((video) => ({
        id: video.id,
        label: video.label,
        title: video.title,
        imageUrl: video.imageUrl,
        duration: video.duration,
      }))
    : [];

  const hierarchicalDeskSlots = presentationMode === "hierarchical"
    ? hierarchicalSlots.map((slot) => ({
        id: slot.id,
        slotKey: slot.slot_key,
        bankItemId: slot.bank_item_id,
        title: slot.title_snapshot ?? "Sem título",
      }))
    : [];

  const hierarchicalDeskAuxiliary = presentationMode === "hierarchical"
    ? hierarchicalAuxiliaryItems.map((item) => {
        const bankItemId =
          item.source_type === "matchday_editorial_bank_item"
            ? item.source_id
            : item.source_type === "editorial_article" && item.source_id
              ? hierarchicalDeskBankItemByArticleId.get(item.source_id)?.id ?? null
              : null;

        return {
          id: item.id,
          target:
            item.slot_type === "complement"
              ? "video_highlight"
              : `beyond_matchday_${item.sort_order}`,
          bankItemId,
          title: item.title_snapshot ?? "Sem título",
        };
      })
    : [];

  return (
    <main className={`composition-admin-shell${presentationMode === "hierarchical" && isDraftComposition ? " composition-admin-shell-desk" : ""}`}>
      <style>{compositionPageStyles}</style>

      <section className="composition-admin-hero">
        <div>
          <p>Composição da Jornada</p>
          <h1>Jornada {String(matchday.number).padStart(2, "0")}</h1>
          <span>{contextLabel}</span>
        </div>
        <nav className="composition-admin-actions" aria-label="Acoes de navegacao">
          <a className="composition-admin-button" href="/admin/editorial/home">
            Home editorial
          </a>
          <a className="composition-admin-button" href="/admin/editorial/redacao-automatica">
            Redação automática
          </a>
          <a className="composition-admin-button" href="/admin/editorial/artigos">
            Artigos / Notícias
          </a>
          <a className="composition-admin-button" href="/admin/editorial/conteudos">
            VÍDEO
          </a>
          <a className="composition-admin-button" href={`/admin/editorial/jornada/${encodeURIComponent(matchday.id)}`}>
            Abrir editorial
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

      <nav className="composition-admin-mode-selector" aria-label="Apresentação da Composição da Jornada">
        <a className={presentationMode === "standard" ? "active" : undefined} href={`/admin/editorial/composicao/${matchday.id}`}>
          Atual
        </a>
        <a className={presentationMode === "hierarchical" ? "active" : undefined} href={`/admin/editorial/composicao/${matchday.id}?presentation_mode=hierarchical`}>
          Hierárquica
        </a>
      </nav>

      {presentationMode === "standard" ? (
        <nav className="composition-admin-zone-nav" aria-label="Zonas da Composição da Jornada">
          <a href="#manchete">01 Manchete</a>
          <a href="#ultimas-noticias">02 Últimas</a>
          <a href="#contexto">03 Contexto</a>
          <a href="#tres-noticias">04 3 notícias</a>
          <a href="#video">05 Vídeo</a>
          <a href="#noticia-ao-lado-video">06 Ao lado do vídeo</a>
          <a href="#faixa-noticias">07 Faixa de notícias</a>
        </nav>
      ) : null}

      {presentationMode === "hierarchical" && isDraftComposition && draftComposition ? (
        <HierarchicalCompositionDeskClient
          articles={hierarchicalDeskArticles}
          auxiliaryItems={hierarchicalDeskAuxiliary}
          compositionId={draftComposition.id}
          matchdayId={matchday.id}
          slots={hierarchicalDeskSlots}
          videos={hierarchicalDeskVideos}
        >
          <details className="hc-desk-tool">
            <summary>A Jornada em Vídeo</summary>
            <div className="hc-desk-tool-body">
              <HierarchicalVideoEditor
                composition={draftComposition}
                matchdayId={matchday.id}
                referenceItems={compositionItems}
                returnTo={returnTo}
                roundupItems={roundupItems}
              />
            </div>
          </details>

          <details className="hc-desk-tool">
            <summary>Editorial da Jornada</summary>
            <div className="hc-desk-tool-body">
              {compositionFeedback && feedbackAnchor === "hierarchical-editorial" ? (
                <p className={`composition-admin-feedback ${compositionFeedbackKind}`}>
                  {compositionFeedback}
                </p>
              ) : null}

              <HierarchicalEditorialEditor
                composition={draftComposition}
                matchdayId={matchday.id}
                returnTo={returnTo}
              />
            </div>
          </details>

          <details className="hc-desk-tool">
            <summary>Publicação e estado</summary>
            <div className="hc-desk-tool-body composition-admin-stack">
              <UpdateDraftForm
                composition={draftComposition}
                matchdayId={matchday.id}
                returnTo={returnTo}
              />

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
            </div>
          </details>

          <details className="hc-desk-tool">
            <summary>Pré-visualização</summary>
            <div className="hc-desk-tool-body composition-admin-preview">
              <HierarchicalCompositionInterpretivePreview
                beyondMatchdayItems={hierarchicalPreviewBeyondMatchdayItems}
                editorial={hierarchicalEditorial}
                matchdayNumber={matchday.number}
                roundupHeading="A JORNADA EM VÍDEO"
                roundupItems={hierarchicalPreviewRoundupItems}
                slots={hierarchicalSlots}
                videoHighlight={hierarchicalPreviewVideoHighlight}
              />
            </div>
          </details>
        </HierarchicalCompositionDeskClient>
      ) : null}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var searchInput = document.querySelector(
                "[data-composition-desk-search]"
              );

              var countNode = document.querySelector(
                "[data-composition-desk-count]"
              );

              var filterButtons = Array.prototype.slice.call(
                document.querySelectorAll("[data-composition-desk-filter]")
              );

              var items = Array.prototype.slice.call(
                document.querySelectorAll("[data-composition-desk-item]")
              );

              var choices = Array.prototype.slice.call(
                document.querySelectorAll("[data-composition-bank-choice]")
              );

              var selectedCountNode = document.querySelector(
                "[data-composition-selected-count]"
              );

              var bankInput = document.querySelector(
                "[data-composition-selected-bank-input]"
              );

              var destinationSelect = document.querySelector(
                "[data-composition-destination]"
              );

              var slotInput = document.querySelector(
                "[data-composition-target-slot]"
              );

              var auxiliaryInput = document.querySelector(
                "[data-composition-target-auxiliary]"
              );

              var placeButton = document.querySelector(
                "[data-composition-place-button]"
              );

              var placeForm = document.querySelector(
                "[data-composition-desk-place-form]"
              );

              var clearButton = document.querySelector(
                "[data-composition-clear-selection]"
              );

              if (!searchInput) return;

              var activeFilter = "all";

              function selectedChoice() {
                return choices.find(function (choice) {
                  return choice.checked;
                }) || null;
              }

              function matchesFilter(item) {
                var kind =
                  item.getAttribute("data-composition-desk-kind") || "";

                var group =
                  item.getAttribute("data-composition-desk-group") || "";

                var inLatest =
                  item.getAttribute("data-composition-desk-in-latest") === "1";

                if (activeFilter === "all") return true;
                if (activeFilter === "videos") return kind === "video";
                if (kind !== "article") return false;

                if (activeFilter === "latest") {
                  return inLatest;
                }

                if (activeFilter === "latest_without_zone") {
                  return inLatest && !group;
                }

                if (activeFilter === "four_news") {
                  return group === "four_news";
                }

                if (activeFilter === "six_news") {
                  return group === "six_news";
                }

                if (activeFilter === "five_news_balanced") {
                  return group === "five_news_balanced";
                }

                if (activeFilter === "five_news_secondary") {
                  return group === "five_news_secondary";
                }

                if (activeFilter === "faixa") {
                  return group === "faixa";
                }

                if (activeFilter === "highlight") {
                  return group === "complement";
                }

                if (activeFilter === "unplaced") {
                  return !inLatest && !group;
                }

                return true;
              }

              function refreshList() {
                var query = (searchInput.value || "")
                  .trim()
                  .toLocaleLowerCase("pt-PT");

                var visible = 0;

                items.forEach(function (item) {
                  var searchText =
                    item.getAttribute(
                      "data-composition-desk-search-text"
                    ) || "";

                  var show =
                    matchesFilter(item) &&
                    (!query || searchText.indexOf(query) >= 0);

                  item.hidden = !show;
                  item.style.display = show ? "" : "none";

                  if (show) {
                    visible += 1;
                  }
                });

                if (countNode) {
                  countNode.textContent =
                    visible + "/" + items.length;
                }
              }

              function syncPlacementForm() {
                var choice = selectedChoice();

                var selectedId =
                  choice ? choice.value || "" : "";

                var destination =
                  destinationSelect
                    ? destinationSelect.value || ""
                    : "";

                if (bankInput) {
                  bankInput.value = selectedId;
                }

                if (slotInput) {
                  slotInput.value = "";
                }

                if (auxiliaryInput) {
                  auxiliaryInput.value = "";
                }

                if (placeForm) {
                  var actionInput = placeForm.querySelector(
                    'input[name="action_type"]'
                  );

                  if (actionInput) {
                    actionInput.value = "";
                  }

                  if (destination.indexOf("slot::") === 0) {
                    if (slotInput) {
                      slotInput.value =
                        destination.slice("slot::".length);
                    }

                    if (actionInput) {
                      actionInput.value =
                        "assign_bank_item_to_hierarchical_slot";
                    }
                  }
                  else if (destination.indexOf("aux::") === 0) {
                    if (auxiliaryInput) {
                      auxiliaryInput.value =
                        destination.slice("aux::".length);
                    }

                    if (actionInput) {
                      actionInput.value =
                        "assign_bank_item_to_hierarchical_auxiliary";
                    }
                  }
                }

                if (selectedCountNode) {
                  selectedCountNode.textContent =
                    selectedId
                      ? "1 selecionada"
                      : "0 selecionadas";
                }

                if (placeButton) {
                  placeButton.disabled =
                    !selectedId || !destination;
                }
              }

              function refreshSelection() {
                var choice = selectedChoice();

                items.forEach(function (item) {
                  item.classList.remove("selected");

                  var rank = item.querySelector(
                    "[data-composition-selection-rank]"
                  );

                  if (rank) {
                    rank.textContent = "·";
                  }
                });

                if (choice) {
                  var selectedRow = choice.closest(
                    "[data-composition-desk-item]"
                  );

                  if (selectedRow) {
                    selectedRow.classList.add("selected");

                    var selectedRank = selectedRow.querySelector(
                      "[data-composition-selection-rank]"
                    );

                    if (selectedRank) {
                      selectedRank.textContent = "1";
                    }
                  }
                }

                syncPlacementForm();
              }

              filterButtons.forEach(function (button) {
                button.addEventListener("click", function () {
                  activeFilter =
                    button.getAttribute(
                      "data-composition-desk-filter"
                    ) || "all";

                  filterButtons.forEach(function (candidate) {
                    candidate.classList.toggle(
                      "active",
                      candidate === button
                    );
                  });

                  refreshList();
                });
              });

              choices.forEach(function (choice) {
                choice.addEventListener("change", function () {
                  if (choice.checked) {
                    choices.forEach(function (candidate) {
                      if (candidate !== choice) {
                        candidate.checked = false;
                      }
                    });
                  }

                  refreshSelection();
                });
              });

              if (destinationSelect) {
                destinationSelect.addEventListener(
                  "change",
                  syncPlacementForm
                );
              }

              if (clearButton) {
                clearButton.addEventListener("click", function () {
                  choices.forEach(function (choice) {
                    choice.checked = false;
                  });

                  if (destinationSelect) {
                    destinationSelect.value = "";
                  }

                  refreshSelection();
                });
              }

              if (placeForm) {
                placeForm.addEventListener("submit", function (event) {
                  syncPlacementForm();

                  var choice = selectedChoice();

                  var destination =
                    destinationSelect
                      ? destinationSelect.value || ""
                      : "";

                  if (!choice || !destination) {
                    event.preventDefault();
                  }
                });
              }

              searchInput.addEventListener(
                "input",
                refreshList
              );

              choices.forEach(function (choice) {
                choice.checked = false;
              });

              if (destinationSelect) {
                destinationSelect.value = "";
              }

              refreshSelection();
              refreshList();
            })();          `
        }}
      />

      {presentationMode !== "hierarchical" || !isDraftComposition ? (
      <div className="composition-admin-layout">
        <section className="composition-admin-panel">
          <header>
            <h2>1. Banco da Jornada</h2>
            <p>
              Todas as notícias e conteúdos publicados desta jornada ficam disponíveis aqui, independentemente da zona onde apareceram.
            </p>
          </header>
          <div className="composition-admin-stack">
            <div id="matchday-editorial-bank">
              {presentationMode === "hierarchical" ? (
                <HierarchicalCompositionDeskBank
                  bankItems={bankItems}
                  bankPlacementById={bankPlacementById}
                  composition={draftComposition}
                  deskSnapshot={hierarchicalDeskSnapshot}
                  hierarchicalAuxiliaryItems={hierarchicalAuxiliaryItems}
                  hierarchicalSlots={hierarchicalSlots}
                  matchdayId={matchday.id}
                  returnTo={returnTo}
                  selectedRoundupSourceIds={selectedRoundupSourceIds}
                />
              ) : (
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

                  <nav className="composition-admin-bank-filters" aria-label="Filtrar banco da jornada">
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
                            : `${baseReturnTo}${baseReturnTo.includes("?") ? "&" : "?"}bank_filter=${encodeURIComponent(filter.key)}#matchday-editorial-bank`
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
                        hierarchicalAuxiliaryItems={hierarchicalAuxiliaryItems}
                        hierarchicalSlots={hierarchicalSlots}
                        item={item}
                        key={item.id}
                        matchdayId={matchday.id}
                        placementLabel={bankPlacementById.get(item.id) ?? null}
                        presentationMode={presentationMode}
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
              )}
            </div>
          </div>
        </section>

        <section className="composition-admin-panel">
          <header>
            <h2>2. Composição da Jornada</h2>
            <p>
              Escolhe no banco as notícias que ficam no arquivo e define aqui a sua hierarquia, zona e ordem definitivas.
            </p>
          </header>
          <div className="composition-admin-stack">
            <Card title={presentationMode === "hierarchical" ? "Mesa da Composição" : "Zonas da composição"}>
              {draftComposition ? (
                presentationMode === "hierarchical" ? (
                  <HierarchicalCompositionEditor
                    composition={draftComposition}
                    matchdayId={matchday.id}
                    returnTo={returnTo}
                    slots={hierarchicalSlots}
                  />
                ) : (
                  <div className="composition-admin-section-list">
                  {groupedCompositionItems.map((section) => {
                    const sectionAnchor = compositionZoneAnchor(section.slotType);

                    return (
                    <section className="composition-admin-section" id={sectionAnchor} key={section.slotType}>
                      <div className="composition-admin-section-heading">
                        <h4>{compositionZoneHeading(section.slotType, section.title)}</h4>
                        <span>
                          {section.items.length} {section.items.length === 1 ? "item" : "itens"}
                        </span>
                      </div>
                      {compositionFeedback && feedbackAnchor === sectionAnchor ? (
                        <p className={`composition-admin-feedback ${compositionFeedbackKind}`}>{compositionFeedback}</p>
                      ) : null}
                      {section.items.length > 0 ? (
                        <div className="composition-admin-grid">
                          {section.items.map((item, index) => {
                            const itemMeta = [`Ordem ${item.sort_order}`, statusLabel(item.status)];
                            const actions = isDraftComposition ? (
                              <CompositionItemActions
                                articleSource={item.source_type === "matchday_editorial_bank_item" && Boolean(item.source_id && editorialArticleBankItemIds.has(item.source_id))}
                                canMoveDown={index < section.items.length - 1}
                                canMoveUp={index > 0}
                                composition={draftComposition}
                                item={item}
                                matchdayId={matchday.id}
                                returnAnchor={sectionAnchor}
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
                    );
                  })}
                  </div>
                )
              ) : (
                <EmptyState>Cria primeiro um rascunho para começar a composição.</EmptyState>
              )}
            </Card>

            <div id="composition-status">
              <Card title={isPublishedComposition ? "Composição publicada" : "Composição em rascunho"}>
              {draftComposition ? (
                <>
                  {compositionFeedback && (!feedbackAnchor || feedbackAnchor === "composition-status") ? (
                    <p className={`composition-admin-feedback ${compositionFeedbackKind}`}>{compositionFeedback}</p>
                  ) : null}
                  <div className="composition-admin-meta">
                    <span>Estado: {compositionStatusLabel(draftComposition.status)}</span>
                    <span>Apresentação: {presentationMode === "hierarchical" ? "Hierárquica" : "Atual"}</span>
                    {isPublishedComposition ? (
                      <span>Versão ativa: {draftComposition.is_current ? "sim" : "não"}</span>
                    ) : (
                      <span>Ainda não publicada</span>
                    )}
                    {presentationMode === "standard" ? (
                      <span>{draftComposition.use_roundup_items ? "Inclui resumo/vídeos" : "Não inclui resumo/vídeos"}</span>
                    ) : (
                      <span>{compositionItems.filter((item) => item.slot_type === "roundup").length} vídeos escolhidos nesta versão</span>
                    )}
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
                      {modePublishedComposition && !modePublishedComposition.is_current ? (
                        <ActivateCompositionForm
                          composition={modePublishedComposition}
                          label={presentationMode === "standard" ? "Usar apresentação Atual publicada" : "Usar apresentação Hierárquica publicada"}
                          matchdayId={matchday.id}
                          returnTo={returnTo}
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

                  {isPublishedComposition && !draftComposition.is_current ? (
                    <>
                      <ActivateCompositionForm
                        composition={draftComposition}
                        label={presentationMode === "standard" ? "Usar apresentação Atual" : "Usar apresentação Hierárquica"}
                        matchdayId={matchday.id}
                        returnTo={returnTo}
                      />
                      <CreateDraftForm
                        matchdayId={matchday.id}
                        presentationMode={presentationMode}
                        returnTo={returnTo}
                      />
                    </>
                  ) : null}
                </>
              ) : (
                <CreateDraftForm matchdayId={matchday.id} presentationMode={presentationMode} returnTo={returnTo} />
              )}
              </Card>
            </div>

            {presentationMode === "hierarchical" && draftComposition ? (
              <Card title="Momentos posteriores aos 15 lugares">
                <div className="composition-admin-section-list">
                  <HierarchicalVideoEditor
                    composition={draftComposition}
                    matchdayId={matchday.id}
                    referenceItems={compositionItems}
                    returnTo={returnTo}
                    roundupItems={roundupItems}
                  />
                  <HierarchicalAuxiliaryEditor
                    articles={publishedArticles}
                    contents={publishedContents}
                    composition={draftComposition}
                    items={hierarchicalAuxiliaryItems}
                    matchdayId={matchday.id}
                    returnTo={returnTo}
                  />
                </div>
              </Card>
            ) : null}
            {presentationMode === "hierarchical" && draftComposition ? (
              <Card title="Editorial da Jornada">
                {compositionFeedback && feedbackAnchor === "hierarchical-editorial" ? (
                  <p className={`composition-admin-feedback ${compositionFeedbackKind}`}>{compositionFeedback}</p>
                ) : null}
                <HierarchicalEditorialEditor
                  composition={draftComposition}
                  matchdayId={matchday.id}
                  returnTo={returnTo}
                />
              </Card>
            ) : null}

          </div>
        </section>
      </div>
      ) : null}

      {presentationMode === "hierarchical" && isDraftComposition && draftComposition ? (
        <section className="composition-admin-panel composition-admin-preview-section">
          <header>
            <h2>Pré-visualização da apresentação Hierárquica</h2>
          </header>
          <p className="composition-admin-note">O preview usa o draft e não altera publicação nem apresentação current.</p>
          <div className="composition-admin-preview">
            <HierarchicalCompositionInterpretivePreview
              beyondMatchdayItems={hierarchicalPreviewBeyondMatchdayItems}
              editorial={hierarchicalEditorial}
              matchdayNumber={matchday.number}
              roundupHeading="A JORNADA EM VÍDEO"
              roundupItems={hierarchicalPreviewRoundupItems}
              slots={hierarchicalSlots}
              videoHighlight={hierarchicalPreviewVideoHighlight}
            />
          </div>
        </section>
      ) : null}

      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("submit", function (event) {
              var form = event.target;
              if (!form || !form.getAttribute) return;
              var action = form.getAttribute("action") || "";
              if (action.indexOf("/api/admin/editorial/composicao") !== 0) return;
              var submitter = event.submitter;
              if (!submitter || submitter.tagName !== "BUTTON") return;
              if (!submitter.dataset.originalLabel) {
                submitter.dataset.originalLabel = submitter.textContent || "";
              }
              submitter.textContent = "A guardar...";
              submitter.setAttribute("aria-busy", "true");
            });

          `
        }}
      />
    </main>
  );
}
