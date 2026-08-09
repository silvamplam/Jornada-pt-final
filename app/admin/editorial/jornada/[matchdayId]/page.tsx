import EditorialColorPresets, { EditorialColorInput } from "@/components/admin/EditorialColorPresets";
import EditorialHorizontalNewsEditor from "@/components/admin/EditorialHorizontalNewsEditor";
import {
  EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS,
  EDITORIAL_CONTEXT_POST_TITLE_MIN_CHARS,
} from "@/lib/editorial-context-post-title";
import { buildEditorialHorizontalNewsEditorOrders } from "@/lib/editorial-horizontal-news";
import type { EditorialMatchdayTransferSlotType } from "@/lib/editorial-matchday-news-flow";
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
import {
  getEditorialPublishedSources,
  type EditorialPublishedSource
} from "@/lib/editorial-published-sources";
import {
  EDITORIAL_ZONE_PRESENTATION_PROFILES,
  projectEditorialArticleToZone,
  type EditorialNewsFlowSlotType
} from "@/lib/editorial-zone-presentation";

export const dynamic = "force-dynamic";

type EditorialPageProps = {
  params: Promise<{
    matchdayId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

type EditorialArticleForSideBlock = {
  id: string;
  slug: string | null;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  label: string | null;
  author: string | null;
  image_url: string | null;
  published_at: string | null;
  created_at: string | null;
  status: string | null;
};

const ROUNDUP_EDITOR_SORT_ORDERS = Array.from({ length: 10 }, (_, index) => index + 1);

function buildLatestNewsEditorSortOrders(items: SupabaseMatchdayLatestNews[]) {
  const existingOrders = Array.from(
    new Set(
      items
        .map((item) => item.sort_order)
        .filter((sortOrder) => Number.isInteger(sortOrder) && sortOrder > 0)
    )
  ).sort((first, second) => first - second);
  const nextOrder = (existingOrders.at(-1) ?? 0) + 1;

  return [...existingOrders, nextOrder];
}

const editorialPageStyles = `
  body {
    margin: 0;
    background: #eef2f6;
  }

  .editorial-admin-shell {
    min-height: 100vh;
    padding: 28px;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .editorial-admin-hero,
  .editorial-admin-panel {
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .editorial-admin-hero {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    padding: 24px;
    background: linear-gradient(135deg, #10151b, #25303c);
    color: #ffffff;
  }

  .editorial-admin-hero h1,
  .editorial-admin-hero p,
  .editorial-admin-hero small {
    margin: 0;
  }

  .editorial-admin-hero h1 {
    margin-top: 8px;
    font-size: 34px;
    line-height: 1.05;
  }

  .editorial-admin-hero p {
    color: #e5252a;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .editorial-admin-hero small {
    display: block;
    margin-top: 10px;
    color: #cdd5df;
    font-size: 15px;
  }

  .editorial-admin-button {
    display: inline-block;
    width: fit-content;
    padding: 12px 16px;
    border: 0;
    border-radius: 6px;
    background: #e5252a;
    color: #ffffff;
    font: inherit;
    font-size: 13px;
    font-weight: 900;
    line-height: 1;
    text-decoration: none;
    text-transform: uppercase;
    cursor: pointer;
  }

  .editorial-admin-button.secondary {
    border: 1px solid #dce3eb;
    background: #ffffff;
    color: #10151b;
  }

  .editorial-admin-hero .editorial-admin-button.secondary {
    border-color: rgba(255, 255, 255, 0.28);
    background: transparent;
    color: #ffffff;
  }

  .editorial-admin-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
    align-content: flex-start;
  }

  .editorial-admin-actions .editorial-admin-button {
    white-space: nowrap;
  }

  .editorial-context-selector {
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

  .editorial-context-selector p,
  .editorial-context-selector strong,
  .editorial-context-selector label {
    margin: 0;
  }

  .editorial-context-selector p {
    color: #e5252a;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .editorial-context-selector strong {
    display: block;
    margin-top: 4px;
    color: #10151b;
    font-size: 13px;
    line-height: 1.35;
  }

  .editorial-context-selector-form {
    display: grid;
    grid-template-columns: repeat(3, minmax(120px, 1fr)) auto;
    gap: 10px;
    align-items: end;
  }

  .editorial-context-selector-field {
    display: grid;
    gap: 5px;
  }

  .editorial-context-selector-field label {
    color: #607086;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .editorial-context-selector-field select {
    min-height: 38px;
    width: 100%;
    border: 1px solid #cdd6e1;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 13px;
  }

  .editorial-context-selector-empty {
    color: #607086;
    font-size: 13px;
    line-height: 1.35;
  }

  .editorial-admin-block-nav {
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

  .editorial-admin-block-nav a {
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

  .editorial-admin-block-nav a:hover {
    background: #b91c1c;
  }

  .editorial-admin-zone-stack {
    display: grid;
    gap: 22px;
    margin-top: 18px;
  }

  .editorial-admin-zone {
    scroll-margin-top: 84px;
  }

  .editorial-admin-zone > .editorial-admin-zone-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: -20px -20px 18px;
    padding: 14px 20px;
    border-bottom: 1px solid #dce3eb;
    background: #f8fafc;
  }

  .editorial-admin-zone-number {
    display: inline-flex;
    min-width: 32px;
    height: 32px;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: #e5252a;
    color: #ffffff;
    font-size: 12px;
    font-weight: 900;
  }

  .editorial-admin-zone-title {
    margin: 0;
    font-size: 20px;
    line-height: 1.1;
  }

  .editorial-admin-zone .horizontal-news-admin {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }

  .editorial-admin-zone .horizontal-news-admin > header {
    display: none;
  }

  .editorial-admin-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
    gap: 18px;
    margin-top: 18px;
  }

  .editorial-admin-composition {
    margin-top: 18px;
    min-width: 0;
    max-width: 100%;
  }

  .editorial-admin-composition-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
    min-width: 0;
    max-width: 100%;
  }

  .editorial-admin-composition-card {
    display: grid;
    gap: 14px;
    align-content: start;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    padding: 16px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #f8fafc;
    overflow-wrap: anywhere;
  }

  .editorial-admin-composition-card h3 {
    margin: 0;
    font-size: 17px;
  }

  .editorial-admin-composition-card > p {
    margin: -6px 0 0;
    color: #687380;
    font-size: 14px;
    line-height: 1.45;
  }

  .editorial-admin-composition-side-stack {
    display: grid;
    gap: 16px;
    align-content: start;
    min-width: 0;
    max-width: 100%;
  }

  .editorial-admin-composition .editorial-admin-form,
  .editorial-admin-composition .editorial-admin-stack,
  .editorial-admin-composition .editorial-admin-compact-stack,
  .editorial-admin-composition .editorial-admin-field,
  .editorial-admin-composition .editorial-admin-fieldset,
  .editorial-admin-composition .editorial-admin-item-form,
  .editorial-admin-composition .editorial-admin-item-details,
  .editorial-admin-composition .editorial-admin-item-details-body {
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }

  .editorial-admin-composition .editorial-admin-field input,
  .editorial-admin-composition .editorial-admin-field textarea,
  .editorial-admin-composition .editorial-admin-field select {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .editorial-admin-composition .editorial-admin-muted,
  .editorial-admin-composition .editorial-admin-field label,
  .editorial-admin-composition .editorial-admin-fieldset legend,
  .editorial-admin-composition .editorial-admin-item-details > summary {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .editorial-admin-composition .editorial-admin-item-details > summary::after,
  .editorial-admin-composition .editorial-admin-item-status,
  .editorial-admin-composition .editorial-admin-button {
    flex: 0 0 auto;
  }

  .editorial-admin-panel {
    padding: 20px;
  }

  .editorial-admin-panel h2,
  .editorial-admin-panel h3,
  .editorial-admin-panel h4,
  .editorial-admin-panel p {
    margin: 0;
  }

  .editorial-admin-panel > header {
    margin-bottom: 16px;
  }

  .editorial-admin-panel > header p,
  .editorial-admin-muted {
    margin-top: 6px;
    color: #687380;
    font-size: 14px;
    line-height: 1.45;
  }

  .editorial-admin-form,
  .editorial-admin-stack {
    display: grid;
    gap: 14px;
  }

  .editorial-admin-compact-stack {
    display: grid;
    gap: 10px;
  }

  .editorial-admin-field {
    display: grid;
    gap: 6px;
  }

  .editorial-admin-field label,
  .editorial-admin-fieldset legend {
    color: #425061;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .editorial-admin-field input,
  .editorial-admin-field textarea,
  .editorial-admin-field select {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #c8d2dd;
    border-radius: 6px;
    padding: 11px 12px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
  }

  .editorial-admin-compact-stack .editorial-admin-field {
    gap: 4px;
  }

  .editorial-admin-compact-stack .editorial-admin-field input,
  .editorial-admin-compact-stack .editorial-admin-field select {
    padding: 9px 10px;
  }

  .editorial-admin-field textarea {
    min-height: 110px;
    resize: vertical;
  }

  .editorial-admin-preview {
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #f8fafc;
  }

  .editorial-admin-preview img {
    display: block;
    width: 100%;
    max-height: 220px;
    object-fit: cover;
  }

  .editorial-admin-fieldset {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 16px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
  }

  .editorial-admin-compact-card {
    gap: 10px;
    padding: 12px;
  }

  .editorial-admin-compact-card legend {
    padding: 0 4px;
  }

  .editorial-admin-compact-card .editorial-admin-preview img {
    max-height: 120px;
  }

  .editorial-admin-technical-details {
    padding: 10px 12px;
    border: 1px dashed #c8d2dd;
    border-radius: 8px;
    background: #fbfcfe;
  }

  .editorial-admin-technical-details summary {
    cursor: pointer;
    color: #425061;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .editorial-admin-technical-details .editorial-admin-field {
    margin-top: 10px;
  }

  .editorial-admin-item-form {
    display: block;
  }

  .editorial-admin-item-details {
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    scroll-margin-top: 84px;
  }

  .editorial-admin-item-details > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    cursor: pointer;
    color: #10151b;
    font-size: 14px;
    font-weight: 900;
    list-style: none;
  }

  .editorial-admin-item-details > summary::-webkit-details-marker {
    display: none;
  }

  .editorial-admin-item-details > summary::after {
    color: #687380;
    content: "Abrir";
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .editorial-admin-item-details[open] > summary {
    border-bottom: 1px solid #dce3eb;
  }

  .editorial-admin-item-details[open] > summary::after {
    content: "Fechar";
  }

  .editorial-admin-item-details-body {
    display: grid;
    gap: 12px;
    padding: 14px;
    background: #fbfcfe;
  }

  .editorial-admin-item-summary-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .editorial-admin-item-status {
    flex: 0 0 auto;
    padding: 4px 8px;
    border-radius: 999px;
    background: #eef2f6;
    color: #425061;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .editorial-admin-item-label {
    flex: 0 0 auto;
    color: #687380;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .editorial-admin-upload-inline {
    display: grid;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid #dce3eb;
  }

  .editorial-admin-upload-inline .editorial-admin-button {
    padding: 10px 12px;
  }

  .editorial-admin-hidden-form {
    display: none;
  }

  .editorial-admin-highlight-1 {
    background: #f9fafb;
  }

  .editorial-admin-highlight-2 {
    background: #f4f6f8;
  }

  .editorial-admin-highlight-3 {
    background: #eef2f6;
  }

  .editorial-admin-message {
    margin-top: 18px;
    padding: 12px 14px;
    border: 1px solid #b7e1c0;
    border-radius: 8px;
    background: #effaf1;
    color: #1f6d31;
    font-size: 14px;
    font-weight: 800;
  }

  .editorial-admin-message.warning {
    border-color: #ffd0d0;
    background: #fff3f3;
    color: #9d1c1f;
  }

  .editorial-admin-live-note {
    display: grid;
    gap: 4px;
    margin-top: 10px;
    padding: 10px 12px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #f8fafc;
    color: #425061;
    font-size: 13px;
    line-height: 1.45;
  }

  .editorial-admin-live-note strong {
    color: #10151b;
  }

  .editorial-admin-live-note.warning {
    border-color: #f2c36b;
    background: #fff8e8;
    color: #674a12;
  }

  #manchete,
  #ultimas-noticias,
  #contexto,
  #tres-noticias,
  #video,
  #noticia-ao-lado-video,
  #faixa-noticias {
    scroll-margin-top: 84px;
  }

  .editorial-admin-note-list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding-left: 18px;
    color: #5d6875;
    line-height: 1.45;
  }

  .editorial-complement-mode-section[hidden],
  .editorial-below-mode-section[hidden] {
    display: none;
  }

  .editorial-admin-transfer {
    display: grid;
    gap: 8px;
    margin-top: 12px;
    padding: 12px;
    border: 1px solid #dce3eb;
    border-radius: 7px;
    background: #f8fafc;
  }

  .editorial-admin-transfer-row {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) auto;
    gap: 8px;
    align-items: end;
  }

  .editorial-admin-transfer label {
    display: grid;
    gap: 5px;
    color: #354154;
    font-size: 11px;
    font-weight: 800;
  }

  .editorial-admin-transfer select {
    min-height: 38px;
    border: 1px solid #cdd6e1;
    border-radius: 5px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
  }

  .editorial-admin-transfer small {
    color: #607086;
    line-height: 1.4;
  }

  @media (max-width: 980px) {
    .editorial-admin-shell {
      padding: 16px;
    }

    .editorial-admin-hero,
    .editorial-admin-grid,
    .editorial-admin-composition-grid {
      grid-template-columns: 1fr;
    }

    .editorial-admin-hero {
      display: grid;
    }

    .editorial-admin-actions {
      justify-content: stretch;
    }

    .editorial-admin-actions .editorial-admin-button {
      width: 100%;
      text-align: center;
    }

    .editorial-context-selector,
    .editorial-context-selector-form {
      grid-template-columns: 1fr;
    }

    .editorial-admin-transfer-row {
      grid-template-columns: 1fr;
    }
  }
`;

function oneParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function cleanText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function paddedOrder(value: number) {
  return String(value).padStart(2, "0");
}

function itemSummaryTitle(order: number, title: string | null | undefined, emptyLabel: string) {
  return `#${paddedOrder(order)} - ${cleanText(title) || emptyLabel}`;
}

function articlePublicHref(article: EditorialArticleForSideBlock) {
  const slug = cleanText(article.slug);
  return slug ? `/noticias/${encodeURIComponent(slug)}` : "";
}

function excerptFromBody(value: string | null | undefined) {
  const text = cleanText(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= 180) {
    return text;
  }

  return `${text.slice(0, 177).trim()}...`;
}

function sideBlockTextFromArticle(article: EditorialArticleForSideBlock) {
  return cleanText(article.subtitle) || excerptFromBody(article.body);
}

function publishedSourceComplementLabel(source: EditorialPublishedSource) {
  if (source.source_type === "article") {
    return cleanText(source.label) || "Artigo";
  }

  return cleanText(source.label) || cleanText(source.content_type) || "Conteudo";
}

function publishedSourceComplementText(source: EditorialPublishedSource) {
  return cleanText(source.subtitle) || cleanText(source.summary);
}

function publishedSourceComplementImageUrl(source: EditorialPublishedSource) {
  return cleanText(source.thumbnail_url) || cleanText(source.image_url);
}

function publishedSourceOptionLabel(source: EditorialPublishedSource) {
  const sourceKind = source.source_type === "article" ? "Artigo" : publishedSourceComplementLabel(source);
  return `${cleanText(source.title) || cleanText(source.source_slug) || source.source_id} - ${sourceKind}`;
}

function publishedSourceProjection(source: EditorialPublishedSource, slotType: EditorialNewsFlowSlotType) {
  if (source.source_type === "article") {
    return projectEditorialArticleToZone(
      {
        id: source.source_id,
        slug: source.source_slug,
        label: source.label,
        title: source.title,
        subtitle: source.subtitle,
        image_url: source.image_url,
        author: source.author,
        published_at: source.published_at
      },
      slotType
    );
  }

  const profile = EDITORIAL_ZONE_PRESENTATION_PROFILES[slotType];
  return {
    label: profile.antetitleLines > 0 ? publishedSourceComplementLabel(source) : null,
    title: cleanText(source.title) || null,
    subtitle: profile.subtitleDefaultVisible === false ? null : publishedSourceComplementText(source) || null,
    imageUrl: profile.showImage ? publishedSourceComplementImageUrl(source) || null : null,
    linkUrl: cleanText(source.link_url) || null
  };
}

type NewsTransferTargetOption = {
  targetSlotType: EditorialMatchdayTransferSlotType;
  targetId: string | null;
  label: string;
  confirmMessage: string | null;
};

type NewsDisplacedTargetOption = {
  value: string;
  label: string;
};

function transferChoiceValue(slotType: EditorialMatchdayTransferSlotType, targetId?: string | null) {
  return `${slotType}::${cleanText(targetId)}`;
}

function shortTransferTitle(value?: string | null) {
  const clean = cleanText(value);
  if (!clean) return "conteúdo atual";
  return clean.length > 72 ? `${clean.slice(0, 69)}…` : clean;
}

function NewsTransferControl({
  matchdayId,
  articleId,
  sourceSlotType,
  sourceId,
  returnTo,
  hasPlacement,
  targetOptions,
  displacedOptions = []
}: {
  matchdayId: string;
  articleId: string | null;
  sourceSlotType: EditorialMatchdayTransferSlotType;
  sourceId: string | null;
  returnTo: string;
  hasPlacement: boolean;
  targetOptions: NewsTransferTargetOption[];
  displacedOptions?: NewsDisplacedTargetOption[];
}) {
  if (!hasPlacement || !sourceId) {
    return null;
  }

  if (!articleId) {
    return (
      <div className="editorial-admin-transfer">
        <small>Para transferir esta notícia entre zonas, liga-a primeiro a um artigo publicado através de “Escolher artigo”.</small>
      </div>
    );
  }

  const targets = targetOptions.filter((option) => option.targetSlotType !== sourceSlotType);

  return (
    <form action="/api/admin/gestor" className="editorial-admin-transfer" data-news-transfer-form method="post">
      <input type="hidden" name="action_type" value="transfer_matchday_news_article" />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="matchday_id" value={matchdayId} />
      <input type="hidden" name="article_id" value={articleId} />
      <input type="hidden" name="source_slot_type" value={sourceSlotType} />
      <input type="hidden" name="source_id" value={sourceId} />
      <div className="editorial-admin-transfer-row">
        <label>
          Transferir para
          <select name="target_choice" defaultValue="" required>
            <option value="" disabled>Escolher zona</option>
            {targets.map((option) => (
              <option
                data-confirm-message={option.confirmMessage ?? undefined}
                data-target-occupied={option.targetId ? "1" : "0"}
                key={transferChoiceValue(option.targetSlotType, option.targetId)}
                value={transferChoiceValue(option.targetSlotType, option.targetId)}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label data-displaced-target-field hidden>
          Enviar a notícia substituída para
          <select name="displaced_target_choice" defaultValue="" disabled>
            <option value="" disabled>Escolher destino</option>
            {displacedOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button className="editorial-admin-button secondary" type="submit">Transferir</button>
      </div>
      <small>Se o destino estiver ocupado, escolhe para onde vai a notícia que sai. Nunca existe troca automática; o artigo original não é reescrito.</small>
    </form>
  );
}

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
      fetchSupabaseAdminTable<SupabaseCountry>("countries?select=id,name&order=name.asc"),
      fetchSupabaseAdminTable<SupabaseCompetition>("competitions?select=id,country_id,name,slug,is_active&order=name.asc"),
      fetchSupabaseAdminTable<SupabaseSeason>(
        "seasons?select=id,competition_id,label,is_current,starts_on,ends_on&order=label.desc"
      ),
      fetchSupabaseAdminTable<SupabaseMatchday>("matchdays?select=id,season_id,number,label,starts_on,ends_on,status&order=number.asc")
    ]);

    return { countries, competitions, seasons, matchdays, error: "" };
  } catch (error) {
    return {
      countries: [],
      competitions: [],
      seasons: [],
      matchdays: [],
      error: error instanceof Error ? error.message : "Nao foi possivel ler jornadas."
    };
  }
}

function formatContextSelectorMatchdayLabel(
  matchday: SupabaseMatchday,
  seasonById: Map<string, SupabaseSeason>,
  competitionById: Map<string, SupabaseCompetition>,
  countryById: Map<string, SupabaseCountry>
) {
  const optionSeason = matchday.season_id ? seasonById.get(matchday.season_id) : null;
  const optionCompetition = optionSeason?.competition_id ? competitionById.get(optionSeason.competition_id) : null;
  const optionCountry = optionCompetition?.country_id ? countryById.get(optionCompetition.country_id) : null;

  return [
    optionCountry?.name,
    optionCompetition?.name,
    optionSeason?.label,
    matchday.label ?? (matchday.number ? `Jornada ${matchday.number}` : "Jornada")
  ]
    .filter(Boolean)
    .join(" · ");
}

type MatchdayEditorialForAdmin = SupabaseMatchdayEditorial & {
  headline_link_url?: string | null;
  below_headline_subtitle?: string | null;
  latest_zone_title_color?: string | null;
};

type MatchdayHighlightForAdmin = SupabaseMatchdayHighlight & {
  link_url?: string | null;
  subtitle?: string | null;
};

async function readMatchdayEditorial(matchdayId: string): Promise<MatchdayEditorialForAdmin | null> {
  try {
    return await readFirst<MatchdayEditorialForAdmin>(
      `matchday_editorials?select=id,matchday_id,title,summary,title_color,image_url,headline_link_url,below_headline_mode,below_headline_heading,below_headline_subtitle,below_headline_heading_color,complementary_mode,complementary_roundup_item_id,complementary_label,complementary_text_color,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status,roundup_video_heading,roundup_video_heading_color,side_block_status,side_block_type,side_block_label,side_block_label_color,side_block_title,side_block_title_color,side_block_author,side_block_text,side_block_image_url,side_block_link_url,latest_zone_mode,latest_zone_title,latest_zone_title_color,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}`
    );
  } catch {
    return readFirst<MatchdayEditorialForAdmin>(
      `matchday_editorials?select=id,matchday_id,title,summary,title_color,image_url,headline_link_url,below_headline_mode,below_headline_heading,below_headline_heading_color,complementary_mode,complementary_roundup_item_id,complementary_label,complementary_text_color,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status,roundup_video_heading,roundup_video_heading_color,side_block_status,side_block_type,side_block_label,side_block_title,side_block_title_color,side_block_author,side_block_text,side_block_image_url,side_block_link_url,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}`
    ).catch(() => null);
  }
}

async function readMatchdayHighlights(matchdayId: string): Promise<MatchdayHighlightForAdmin[]> {
  try {
    return await fetchSupabaseAdminTable<MatchdayHighlightForAdmin>(
      `matchday_highlights?select=id,matchday_id,label,label_color,title,subtitle,image_url,link_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&order=sort_order.asc&limit=3`
    );
  } catch {
    return fetchSupabaseAdminTable<MatchdayHighlightForAdmin>(
      `matchday_highlights?select=id,matchday_id,label,title,image_url,link_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&order=sort_order.asc&limit=3`
    ).catch(() => []);
  }
}

async function readMatchdayRoundupItems(matchdayId: string): Promise<SupabaseMatchdayRoundupItem[]> {
  return fetchSupabaseAdminTable<SupabaseMatchdayRoundupItem>(
    `matchday_roundup_items?select=id,matchday_id,label,title,subtitle,image_url,video_url,duration,type,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&order=sort_order.asc&limit=10`
  ).catch(() => []);
}

async function readMatchdayHorizontalNews(matchdayId: string): Promise<SupabaseMatchdayHorizontalNews[]> {
  return fetchSupabaseAdminTable<SupabaseMatchdayHorizontalNews>(
    `matchday_horizontal_news?select=id,matchday_id,label,label_color,title,subtitle,image_url,link_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&order=sort_order.asc`
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

async function readPublishedEditorialArticles(): Promise<EditorialArticleForSideBlock[]> {
  return fetchSupabaseAdminTable<EditorialArticleForSideBlock>(
    "editorial_articles?select=id,slug,title,subtitle,body,label,author,image_url,published_at,created_at,status&status=eq.published&order=published_at.desc.nullslast,created_at.desc.nullslast&limit=50"
  ).catch(() => []);
}

type FeedbackScope = "manchete" | "bloco-lateral" | "composicao" | "destaques" | "resumo-jornada" | "faixa-horizontal" | "bloco-complementar" | "ultimas-noticias";

function messageFor(created?: string, error?: string, scope?: FeedbackScope, detail?: string) {
  const createdLabels: Record<string, string> = {
    save_matchday_headline: "Manchete guardada. ✓",
    save_matchday_side_block: "Contexto guardado. ✓",
    save_matchday_complement: "Notícia ao lado do vídeo guardada. ✓",
    save_matchday_below_headline: "3 notícias guardadas. ✓",
    save_matchday_editorial: "Editorial guardada. ✓",
    save_matchday_highlights: "3 notícias guardadas. ✓",
    save_matchday_highlight_item: "Notícia guardada. ✓",
    save_matchday_roundup_items: "Vídeos guardados. ✓",
    save_matchday_roundup_settings: "Vídeo guardado. ✓",
    save_matchday_roundup_item: "Vídeo guardado. ✓",
    save_matchday_latest_news: "Últimas guardadas. ✓",
    save_matchday_latest_news_item: "Notícia guardada. ✓",
    save_matchday_horizontal_news_item: "Notícia guardada. ✓",
    move_matchday_horizontal_news_item: "Ordem da Faixa atualizada. ✓",
    transfer_matchday_news_article: "Notícia transferida. ✓",
    upload_matchday_editorial_image: "Imagem da manchete carregada. ✓",
    upload_matchday_highlight_image: "Imagem da notícia carregada. ✓"
  };
  const scopedCreatedLabels: Partial<Record<FeedbackScope, Record<string, string>>> = {
    manchete: {
      save_matchday_headline: "Manchete guardada. ✓",
      save_matchday_editorial: "Manchete guardada. ✓",
      upload_matchday_editorial_image: "Imagem da manchete carregada. ✓",
      transfer_matchday_news_article: "Notícia transferida. ✓"
    },
    composicao: {
      save_matchday_below_headline: "3 notícias guardadas. ✓",
      save_matchday_editorial: "Editorial guardada. ✓"
    },
    "bloco-lateral": {
      save_matchday_side_block: "Contexto guardado. ✓",
      save_matchday_editorial: "Contexto guardado. ✓"
    },
    destaques: {
      save_matchday_highlights: "3 notícias guardadas. ✓",
      save_matchday_highlight_item: "Notícia guardada. ✓",
      upload_matchday_highlight_image: "Imagem da notícia carregada. ✓",
      transfer_matchday_news_article: "Notícia transferida. ✓"
    },
    "resumo-jornada": {
      save_matchday_roundup_items: "Vídeos guardados. ✓",
      save_matchday_roundup_settings: "Vídeo guardado. ✓",
      save_matchday_roundup_item: "Vídeo guardado. ✓"
    },
    "faixa-horizontal": {
      save_matchday_horizontal_news_item: "Notícia guardada. ✓",
      move_matchday_horizontal_news_item: "Ordem da Faixa atualizada. ✓",
      transfer_matchday_news_article: "Notícia transferida. ✓"
    },
    "bloco-complementar": {
      save_matchday_complement: "Notícia ao lado do vídeo guardada. ✓",
      save_matchday_editorial: "Notícia ao lado do vídeo guardada. ✓",
      transfer_matchday_news_article: "Notícia transferida. ✓"
    },
    "ultimas-noticias": {
      save_matchday_latest_news: "Últimas guardadas. ✓",
      save_matchday_latest_news_item: "Notícia guardada. ✓",
      transfer_matchday_news_article: "Notícia transferida. ✓"
    }
  };
  const errorLabels: Record<string, string> = {
    "missing-service": "Liga primeiro a Supabase na Vercel.",
    "missing-fields": "Preenche os campos obrigatorios antes de guardar.",
    "matchday-invalid": "A jornada escolhida ja nao existe.",
    "roundup-item-invalid": "O vídeo escolhido não pertence a esta jornada.",
    "editorial-title-required": "Para publicar, indica uma manchete da jornada.",
    "highlight-title-required": "Para publicar a notícia, indica o título.",
    "latest-news-title-required": "Para publicar uma noticia, indica o titulo.",
    "horizontal-news-title-required": "Para publicar a notícia na faixa, indica o título.",
    "horizontal-news-save-failed": "Não foi possível guardar a faixa de notícias.",
    "context-post-title-too-long": "O pós-título do Contexto não pode ultrapassar 500 caracteres.",
    "editorial-image-type": "O ficheiro tem de ser uma imagem JPG, PNG ou WebP.",
    "editorial-image-size": "A imagem nao pode ter mais de 5MB.",
    "editorial-image-upload": "Nao foi possivel carregar a imagem. Confirma o bucket de Storage.",
    "latest-news-save-failed": "Não foi possível guardar as Últimas.",
    "news-flow-transfer-failed": "Não foi possível transferir a notícia.",
    save: "Nao foi possivel guardar. Confirma se a base de dados esta atualizada."
  };

  if (created && createdLabels[created]) {
    return <div className="editorial-admin-message">{(scope ? scopedCreatedLabels[scope]?.[created] : undefined) ?? createdLabels[created]}</div>;
  }

  if (error) {
    return (
      <div className="editorial-admin-message warning">
        <span>{errorLabels[error] ?? errorLabels.save}</span>
        {detail ? <small>{detail}</small> : null}
      </div>
    );
  }

  return null;
}

function scopedMessageFor(created: string | undefined, error: string | undefined, currentScope: string | undefined, scope: FeedbackScope, detail?: string) {
  if (currentScope !== scope) {
    return null;
  }

  return messageFor(created, error, scope, detail);
}

export default async function AdminMatchdayEditorialPage({ params, searchParams }: EditorialPageProps) {
  const { matchdayId } = await params;
  const query = (await searchParams) ?? {};
  const created = oneParam(query, "created");
  const error = oneParam(query, "error");
  const feedbackScope = oneParam(query, "feedback_scope");
  const feedbackItem = oneParam(query, "feedback_item");
  const latestNewsErrorDetail = oneParam(query, "latest_news_error_detail");
  const horizontalNewsErrorDetail = oneParam(query, "horizontal_news_error_detail");
  const newsFlowErrorDetail = oneParam(query, "news_flow_error_detail");
  const context = await readMatchdayContext(matchdayId);

  if (!context) {
    return (
      <main className="editorial-admin-shell">
        <style>{editorialPageStyles}</style>
        <section className="editorial-admin-panel" id="manchete">
          <header>
            <h1>Jornada nao encontrada</h1>
            <p className="editorial-admin-muted">A pagina editorial so pode abrir a partir de uma jornada existente.</p>
          </header>
          <a className="editorial-admin-button secondary" href="/admin/gestor">
            Voltar ao gestor
          </a>
        </section>
      </main>
    );
  }

  const { matchday, season, competition, country } = context;
  const editorial = await readMatchdayEditorial(matchday.id);
  const highlights = await readMatchdayHighlights(matchday.id);
  const roundupItems = await readMatchdayRoundupItems(matchday.id);
  const latestNews = await readMatchdayLatestNews(matchday.id);
  const latestNewsEditorSortOrders = buildLatestNewsEditorSortOrders(latestNews);
  const horizontalNews = await readMatchdayHorizontalNews(matchday.id);
  const publishedEditorialArticles = await readPublishedEditorialArticles();
  const publishedSources = await getEditorialPublishedSources({
    competitionId: competition.id,
    seasonId: season.id,
    matchdayId: matchday.id
  }).catch(() => []);
  const articleIdByLink = new Map(
    publishedSources
      .filter((source) => source.source_type === "article")
      .map((source) => [cleanText(source.link_url), source.source_id] as const)
      .filter(([linkUrl]) => Boolean(linkUrl))
  );
  const articleIdForPlacement = (linkUrl?: string | null, explicitArticleId?: string | null) =>
    cleanText(explicitArticleId) || articleIdByLink.get(cleanText(linkUrl)) || null;
  const sideBlockArticleOptions = publishedEditorialArticles.filter((article) => articlePublicHref(article));
  const belowHeadlineMode = editorial?.below_headline_mode === "roundup" ? "roundup" : "highlights";
  const roundupMode = editorial?.complementary_mode === "roundup_video" ? "roundup_video" : "none";
  const latestZoneMode = editorial?.latest_zone_mode === "editorial_line" ? "editorial_line" : "latest_news";
  const belowHeadlineHeadingFallback = `Jornada ${String(matchday.number).padStart(2, "0")}`;
  const roundupVideoHeadingFallback = `Jornada ${String(matchday.number).padStart(2, "0")} · Jogos Vídeo Resumo`;
  const returnTo = `/admin/editorial/jornada/${matchday.id}`;
  const scopedReturnTo = (scope: FeedbackScope, anchor: string = scope) => `${returnTo}?feedback_scope=${scope}#${anchor}`;
  const returnToManchete = scopedReturnTo("manchete");
  const returnToBlocoLateral = scopedReturnTo("bloco-lateral", "contexto");
  const returnToDestaques = scopedReturnTo("destaques", "tres-noticias");
  const returnToResumo = scopedReturnTo("resumo-jornada", "video");
  const returnToComplementar = scopedReturnTo("bloco-complementar", "noticia-ao-lado-video");
  const returnToFaixaHorizontal = scopedReturnTo("faixa-horizontal", "faixa-noticias");
  const returnToUltimasNoticias = scopedReturnTo("ultimas-noticias");
  const returnToHighlightItem = (order: number) =>
    `${returnTo}?feedback_scope=destaques&feedback_item=highlight-${paddedOrder(order)}#highlight-item-${paddedOrder(order)}`;
  const returnToResumoItem = (order: number) =>
    `${returnTo}?feedback_scope=resumo-jornada&feedback_item=roundup-${paddedOrder(order)}#roundup-item-${paddedOrder(order)}`;
  const returnToHorizontalNewsItem = (order: number) =>
    `${returnTo}?feedback_scope=faixa-horizontal&feedback_item=horizontal-news-${paddedOrder(order)}#faixa-noticias-editor-item-${paddedOrder(order)}`;
  const returnToLatestNewsItem = (order: number) =>
    `${returnTo}?feedback_scope=ultimas-noticias&feedback_item=latest-news-${paddedOrder(order)}#latest-news-item-${paddedOrder(order)}`;
  const itemMessageFor = (scope: FeedbackScope, itemKey: string, detail?: string) =>
    feedbackScope === scope && feedbackItem === itemKey ? messageFor(created, error, scope, detail) : null;
  const contextLabel = `${country?.name ?? "Pais"} · ${competition.name} · ${season.label} · ${matchday.label}`;
  const contextSelector = await readContextSelectorData();
  const selectorCountryById = new Map(contextSelector.countries.map((item) => [item.id, item]));
  const selectorCompetitionById = new Map(contextSelector.competitions.map((item) => [item.id, item]));
  const selectorSeasonById = new Map(contextSelector.seasons.map((item) => [item.id, item]));
  const belowHeadlineSettingsFormId = "below-headline-settings-form";
  const horizontalNewsSources = publishedSources.map((source) => {
    const projection = publishedSourceProjection(source, "important_item");
    return {
      key: `${source.source_type}:${source.source_id}`,
      optionLabel: publishedSourceOptionLabel(source),
      label: projection.label ?? "",
      title: projection.title ?? "",
      subtitle: projection.subtitle ?? "",
      imageUrl: projection.imageUrl ?? "",
      linkUrl: projection.linkUrl ?? ""
    };
  });
  const horizontalNewsEditorItems = horizontalNews.map((item) => ({
    id: item.id,
    sortOrder: item.sort_order,
    label: item.label,
    labelColor: item.label_color ?? null,
    title: item.title,
    subtitle: item.subtitle,
    imageUrl: item.image_url,
    linkUrl: item.link_url,
    status: item.status
  }));
  const horizontalNewsEditorOrders = buildEditorialHorizontalNewsEditorOrders(horizontalNewsEditorItems);
  const horizontalNewsOpenOrder = horizontalNewsEditorOrders.find(
    (order) => feedbackScope === "faixa-horizontal" && feedbackItem === `horizontal-news-${paddedOrder(order)}`
  ) ?? null;

  const newsTransferTargetOptions: NewsTransferTargetOption[] = [];
  const headlineOccupied = Boolean(
    cleanText(editorial?.headline_link_url)
    || cleanText(editorial?.title)
    || cleanText(editorial?.summary)
    || cleanText(editorial?.image_url)
  );
  newsTransferTargetOptions.push({
    targetSlotType: "headline",
    targetId: headlineOccupied ? editorial?.id ?? null : null,
    label: headlineOccupied
      ? `Manchete — substituir “${shortTransferTitle(editorial?.title)}”`
      : "Manchete",
    confirmMessage: headlineOccupied
      ? "A Manchete está ocupada. Escolhe para onde vai a notícia atual antes de concluir a transferência."
      : null
  });

  newsTransferTargetOptions.push({
    targetSlotType: "editorial_line_item",
    targetId: null,
    label: "Últimas — acrescentar por cronologia",
    confirmMessage: null
  });

  const contextOccupied = Boolean(
    cleanText(editorial?.side_block_link_url)
    || cleanText(editorial?.side_block_title)
    || cleanText(editorial?.side_block_text)
    || cleanText(editorial?.side_block_image_url)
  );
  newsTransferTargetOptions.push({
    targetSlotType: "side_block",
    targetId: contextOccupied ? editorial?.id ?? null : null,
    label: contextOccupied
      ? `Contexto — substituir “${shortTransferTitle(editorial?.side_block_title)}”`
      : "Contexto",
    confirmMessage: contextOccupied
      ? "Contexto está ocupado. Escolhe para onde vai a notícia atual antes de concluir a transferência."
      : null
  });

  const occupiedHighlights = highlights.filter(
    (item) => Boolean(cleanText(item.label) || cleanText(item.title) || cleanText(item.subtitle) || cleanText(item.image_url) || cleanText(item.link_url))
  );
  if (occupiedHighlights.length < 3) {
    newsTransferTargetOptions.push({
      targetSlotType: "highlight",
      targetId: null,
      label: "3 notícias abaixo da manchete — posição livre",
      confirmMessage: null
    });
  } else {
    occupiedHighlights.forEach((item) => {
      newsTransferTargetOptions.push({
        targetSlotType: "highlight",
        targetId: item.id,
        label: `3 notícias — substituir #${paddedOrder(item.sort_order)} “${shortTransferTitle(item.title)}”`,
        confirmMessage: "A posição escolhida está ocupada. Escolhe para onde vai a notícia atual antes de concluir a transferência."
      });
    });
  }

  const complementOccupied = Boolean(
    cleanText(editorial?.complementary_label)
    || cleanText(editorial?.complementary_title)
    || cleanText(editorial?.complementary_text)
    || cleanText(editorial?.complementary_image_url)
    || cleanText(editorial?.complementary_link_url)
  );
  newsTransferTargetOptions.push({
    targetSlotType: "complement",
    targetId: complementOccupied ? editorial?.id ?? null : null,
    label: complementOccupied
      ? `Notícia ao lado do vídeo — substituir “${shortTransferTitle(editorial?.complementary_title)}”`
      : "Notícia ao lado do vídeo",
    confirmMessage: complementOccupied
      ? "A notícia ao lado do vídeo está ocupada. Escolhe para onde vai a notícia atual antes de concluir a transferência."
      : null
  });

  newsTransferTargetOptions.push({
    targetSlotType: "important_item",
    targetId: null,
    label: "Faixa de notícias — acrescentar",
    confirmMessage: null
  });
  horizontalNews
    .filter((item) => item.status === "published" && Boolean(cleanText(item.link_url) || cleanText(item.title)))
    .forEach((item) => {
      newsTransferTargetOptions.push({
        targetSlotType: "important_item",
        targetId: item.id,
        label: `Faixa de notícias — substituir #${paddedOrder(item.sort_order)} “${shortTransferTitle(item.title)}”`,
        confirmMessage: "A posição escolhida na Faixa está ocupada. Escolhe para onde vai a notícia atual antes de concluir a transferência."
      });
    });

  function newsDisplacedTargetOptionsForSource(
    sourceSlotType: EditorialMatchdayTransferSlotType,
    sourceId: string | null,
  ): NewsDisplacedTargetOption[] {
    const options: NewsDisplacedTargetOption[] = [
      { value: "unplaced::", label: "Sem colocação editorial" }
    ];

    if (sourceSlotType === "headline") {
      options.push({ value: "headline::", label: "Manchete — posição de origem" });
    } else if (!headlineOccupied) {
      options.push({ value: "headline::", label: "Manchete" });
    }

    if (sourceSlotType === "editorial_line_item") {
      options.push({ value: "editorial_line_item::", label: "Últimas — posição de origem, com reordenação cronológica" });
    } else {
      options.push({ value: "editorial_line_item::", label: "Últimas — acrescentar por cronologia" });
    }

    if (sourceSlotType === "side_block") {
      options.push({ value: "side_block::", label: "Contexto — posição de origem" });
    } else if (!contextOccupied) {
      options.push({ value: "side_block::", label: "Contexto" });
    }

    const sourceHighlight = sourceSlotType === "highlight"
      ? occupiedHighlights.find((item) => item.id === sourceId) ?? null
      : null;
    [1, 2, 3].forEach((order) => {
      const occupied = occupiedHighlights.some((item) => item.sort_order === order);
      if (sourceHighlight?.sort_order === order) {
        options.push({
          value: `highlight::${order}`,
          label: `3 notícias — posição de origem #${paddedOrder(order)}`
        });
      } else if (!occupied) {
        options.push({
          value: `highlight::${order}`,
          label: `3 notícias abaixo da manchete — posição #${paddedOrder(order)}`
        });
      }
    });

    if (sourceSlotType === "complement") {
      options.push({ value: "complement::", label: "Notícia ao lado do vídeo — posição de origem" });
    } else if (!complementOccupied) {
      options.push({ value: "complement::", label: "Notícia ao lado do vídeo" });
    }

    if (sourceSlotType === "important_item") {
      const sourceHorizontal = horizontalNews.find((item) => item.id === sourceId) ?? null;
      options.push({
        value: "important_item::",
        label: sourceHorizontal
          ? `Faixa — posição de origem #${paddedOrder(sourceHorizontal.sort_order)}`
          : "Faixa — posição de origem"
      });
    } else {
      options.push({ value: "important_item::", label: "Faixa de notícias — acrescentar" });
    }

    return options;
  }

  const highlightsEditor = (
    <>
      <div className="editorial-admin-compact-stack">
        {[1, 2, 3].map((order) => {
          const highlight = highlights.find((item) => item.sort_order === order);
          const highlightFormId = `matchday-highlight-${order}-form`;
          const itemKey = `highlight-${paddedOrder(order)}`;
          const itemAnchor = `highlight-item-${paddedOrder(order)}`;
          return (
            <details className="editorial-admin-item-details" data-highlight-card={order} id={itemAnchor} key={order} open={feedbackScope === "destaques" && feedbackItem === itemKey}>
              <summary>
                <span className="editorial-admin-item-summary-title">{itemSummaryTitle(order, highlight?.title, "Rascunho vazio")}</span>
                {highlight?.label ? <span className="editorial-admin-item-label">{highlight.label}</span> : null}
                <span className="editorial-admin-item-status">{highlight?.status === "published" ? "Publicado" : "Rascunho"}</span>
              </summary>
              <form className="editorial-admin-hidden-form" action="/api/admin/gestor" id={highlightFormId} method="post">
                <input type="hidden" name="action_type" value="save_matchday_highlight_item" />
                <input type="hidden" name="return_to" value={returnToHighlightItem(order)} />
                <input type="hidden" name="matchday_id" value={matchday.id} />
                <input type="hidden" name="highlight_id" value={highlight?.id ?? ""} />
                <input type="hidden" name="highlight_sort_order" value={order} />
              </form>
              <div className="editorial-admin-item-details-body">
                {itemMessageFor("destaques", itemKey, newsFlowErrorDetail)}
                <div className="editorial-admin-field">
                  <label htmlFor={`highlight-${order}-label`}>Antetítulo</label>
                  <input form={highlightFormId} id={`highlight-${order}-label`} name="highlight_label" defaultValue={highlight?.label ?? ""} placeholder={order === 1 ? "ANTEVISAO" : order === 2 ? "AMBIENTE" : "CONTEXTO"} />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`highlight-${order}-label-color`}>Cor do antetitulo</label>
                  <EditorialColorInput
                    form={highlightFormId}
                    id={`highlight-${order}-label-color`}
                    name="highlight_label_color"
                    defaultValue={highlight?.label_color ?? ""}
                    placeholder="#c40000"
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`highlight-${order}-title`}>Titulo</label>
                  <input
                    form={highlightFormId}
                    id={`highlight-${order}-title`}
                    name="highlight_title"
                    defaultValue={highlight?.title ?? ""}
                    placeholder={order === 1 ? "Os pontos de atencao antes da bola rolar" : order === 2 ? "A jornada vista pelas bancadas e pelos protagonistas" : "O que pode mudar na tabela depois dos resultados"}
                  />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`highlight-${order}-subtitle`}>Pós-título</label>
                  <input form={highlightFormId} id={`highlight-${order}-subtitle`} name="highlight_subtitle" defaultValue={highlight?.subtitle ?? ""} placeholder="Resumo curto opcional do destaque" />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`highlight-${order}-image-url`}>Imagem URL</label>
                  <input form={highlightFormId} id={`highlight-${order}-image-url`} name="highlight_image_url" defaultValue={highlight?.image_url ?? ""} placeholder="https://exemplo.com/imagem.jpg" />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`highlight-${order}-link-url`}>Link da notícia</label>
                  <input form={highlightFormId} id={`highlight-${order}-link-url`} name="highlight_link_url" defaultValue={highlight?.link_url ?? ""} placeholder="/noticias/slug-do-artigo" />
                </div>
                <fieldset className="editorial-admin-fieldset editorial-admin-compact-card">
                  <legend>Escolher artigo</legend>
                  <div className="editorial-admin-field">
                    <label htmlFor={`highlight-${order}-article-source`}>Preencher com artigo publicado</label>
                    <select id={`highlight-${order}-article-source`} data-highlight-article-select defaultValue="">
                      <option value="">Escolher fonte publicada</option>
                      {publishedSources.map((source) => {
                        const projection = publishedSourceProjection(source, "highlight");
                        return (
                          <option
                            key={`${source.source_type}-${source.source_id}`}
                            value={`${source.source_type}:${source.source_id}`}
                            data-highlight-label={projection.label ?? ""}
                            data-highlight-title={projection.title ?? ""}
                            data-highlight-subtitle={projection.subtitle ?? ""}
                            data-highlight-image-url={projection.imageUrl ?? ""}
                            data-highlight-link-url={projection.linkUrl ?? ""}
                          >
                            {publishedSourceOptionLabel(source)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </fieldset>
                {highlight?.image_url ? (
                  <div className="editorial-admin-preview">
                    <img alt="" src={highlight.image_url} />
                  </div>
                ) : null}
                <div className="editorial-admin-field">
                  <label htmlFor={`highlight-${order}-status`}>Estado</label>
                  <select form={highlightFormId} id={`highlight-${order}-status`} name="highlight_status" defaultValue={highlight?.status ?? "draft"}>
                    <option value="draft">Rascunho</option>
                    <option value="published">Publicado</option>
                  </select>
                </div>
                <button className="editorial-admin-button" form={highlightFormId} type="submit">
                  Guardar notícia #{paddedOrder(order)}
                </button>
                <form action="/api/admin/gestor/editorial-image" className="editorial-admin-upload-inline" encType="multipart/form-data" method="post">
                  <input type="hidden" name="return_to" value={returnToHighlightItem(order)} />
                  <input type="hidden" name="matchday_id" value={matchday.id} />
                  <input type="hidden" name="target" value="highlight" />
                  <input type="hidden" name="sort_order" value={order} />
                  <div className="editorial-admin-field">
                    <label htmlFor={`highlight-${order}-image-upload`}>Carregar imagem da notícia {order}</label>
                    <input accept="image/jpeg,image/png,image/webp" id={`highlight-${order}-image-upload`} name="image" type="file" />
                  </div>
                  <button className="editorial-admin-button secondary" type="submit">
                    Carregar imagem
                  </button>
                </form>
                <NewsTransferControl
                  matchdayId={matchday.id}
                  articleId={articleIdForPlacement(highlight?.link_url)}
                  sourceSlotType="highlight"
                  sourceId={highlight?.id ?? null}
                  returnTo={returnToHighlightItem(order)}
                  hasPlacement={highlight?.status === "published" && Boolean(cleanText(highlight?.link_url) || cleanText(highlight?.title))}
                  targetOptions={newsTransferTargetOptions}
                  displacedOptions={newsDisplacedTargetOptionsForSource("highlight", highlight?.id ?? null)}
                />
              </div>
            </details>
          );
        })}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var cards = Array.prototype.slice.call(document.querySelectorAll('[data-highlight-card]'));
              cards.forEach(function (card) {
                var order = card.getAttribute('data-highlight-card');
                var select = card.querySelector('[data-highlight-article-select]');
                if (!order || !select) return;
                function setFieldValue(field, value) {
                  if (!field) return;
                  field.value = value || '';
                  field.dispatchEvent(new Event('input', { bubbles: true }));
                  field.dispatchEvent(new Event('change', { bubbles: true }));
                }
                function finishPublishedSource() {
                  var message = select.parentElement.querySelector('[data-source-applied-message]');
                  if (!message) {
                    message = document.createElement('span');
                    message.setAttribute('data-source-applied-message', 'true');
                    message.style.display = 'block';
                    message.style.marginTop = '6px';
                    message.style.color = '#475569';
                    message.style.fontSize = '12px';
                    message.style.fontWeight = '700';
                    select.insertAdjacentElement('afterend', message);
                  }
                  message.textContent = 'Fonte aplicada. Reve e guarda a zona.';
                  window.clearTimeout(select._sourceAppliedTimer);
                  select._sourceAppliedTimer = window.setTimeout(function () {
                    message.textContent = '';
                  }, 3500);
                  select.value = '';
                }
                function setHighlightField(name, value) {
                  var field = card.querySelector('[name="highlight_' + name + '"]');
                  setFieldValue(field, value);
                }
                function applyHighlightArticle() {
                  var option = select.options[select.selectedIndex];
                  if (!option || !option.value) return;
                  setHighlightField('label', option.dataset.highlightLabel);
                  setHighlightField('title', option.dataset.highlightTitle);
                  setHighlightField('subtitle', option.dataset.highlightSubtitle);
                  setHighlightField('image_url', option.dataset.highlightImageUrl);
                  setHighlightField('link_url', option.dataset.highlightLinkUrl);
                  finishPublishedSource();
                }
                select.addEventListener('change', applyHighlightArticle);
              });
            })();
          `
        }}
      />
    </>
  );

  const roundupEditor = (
    <div className="editorial-admin-compact-stack">
      {ROUNDUP_EDITOR_SORT_ORDERS.map((order) => {
        const item = roundupItems.find((roundupItem) => roundupItem.sort_order === order);
        const itemKey = `roundup-${paddedOrder(order)}`;
        const itemAnchor = `roundup-item-${paddedOrder(order)}`;
        return (
          <form action="/api/admin/gestor" className="editorial-admin-form editorial-admin-item-form" key={order} method="post">
            <input type="hidden" name="action_type" value="save_matchday_roundup_item" />
            <input type="hidden" name="return_to" value={returnToResumoItem(order)} />
            <input type="hidden" name="matchday_id" value={matchday.id} />
            <details className="editorial-admin-item-details" id={itemAnchor} open={feedbackScope === "resumo-jornada" && feedbackItem === itemKey}>
              <summary>
                <span className="editorial-admin-item-summary-title">{itemSummaryTitle(order, item?.title, "Item sem titulo")}</span>
                <span className="editorial-admin-item-status">{item?.status === "published" ? "Publicado" : "Rascunho"}</span>
              </summary>
              <div className="editorial-admin-item-details-body">
                {itemMessageFor("resumo-jornada", itemKey)}
                <input type="hidden" name="roundup_id" value={item?.id ?? ""} />
                <input type="hidden" name="roundup_sort_order" value={order} />
                <div className="editorial-admin-field">
                  <label htmlFor={`roundup-${order}-sort-order`}>Ordem</label>
                  <input id={`roundup-${order}-sort-order`} readOnly value={order} />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`roundup-${order}-label`}>Antetítulo</label>
                  <input id={`roundup-${order}-label`} name="roundup_label" defaultValue={item?.label ?? ""} placeholder={order === 1 ? "VIDEO" : order === 2 ? "GOLOS" : order === 3 ? "NOTICIA" : "RESUMO"} />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`roundup-${order}-title`}>Titulo</label>
                  <input
                    id={`roundup-${order}-title`}
                    name="roundup_title"
                    defaultValue={item?.title ?? ""}
                    placeholder={order === 1 ? "Girona 0 - 1 Rayo Vallecano" : order === 2 ? "Villarreal 2 - 3 Real Oviedo" : order === 3 ? "Mallorca 0 - 1 FC Barcelona" : "Titulo do item da jornada"}
                  />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`roundup-${order}-subtitle`}>Pós-título</label>
                  <input id={`roundup-${order}-subtitle`} name="roundup_subtitle" defaultValue={item?.subtitle ?? ""} placeholder={order === 1 ? "Resumo completo" : order === 2 ? "Golos e melhores momentos" : order === 3 ? "Noticia de contexto" : "Descricao curta"} />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`roundup-${order}-video-url`}>Video URL</label>
                  <input id={`roundup-${order}-video-url`} name="roundup_video_url" defaultValue={item?.video_url ?? ""} placeholder="https://exemplo.com/video" />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`roundup-${order}-duration`}>Duracao</label>
                  <input id={`roundup-${order}-duration`} name="roundup_duration" defaultValue={item?.duration ?? ""} placeholder="5:42" />
                </div>
                <details className="editorial-admin-technical-details">
                  <summary>Imagem</summary>
                  <div className="editorial-admin-field">
                    <label htmlFor={`roundup-${order}-image-url`}>Imagem URL</label>
                    <input id={`roundup-${order}-image-url`} name="roundup_image_url" defaultValue={item?.image_url ?? ""} placeholder="https://exemplo.com/imagem.jpg" />
                  </div>
                </details>
                <div className="editorial-admin-field">
                  <label htmlFor={`roundup-${order}-type`}>Tipo</label>
                  <select id={`roundup-${order}-type`} name="roundup_type" defaultValue={item?.type ?? "resumo"}>
                    <option value="video">Video</option>
                    <option value="golos">Golos</option>
                    <option value="resumo">Resumo</option>
                    <option value="noticia">Noticia</option>
                  </select>
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`roundup-${order}-status`}>Estado</label>
                  <select id={`roundup-${order}-status`} name="roundup_status" defaultValue={item?.status ?? "draft"}>
                    <option value="draft">Rascunho</option>
                    <option value="published">Publicado</option>
                  </select>
                </div>
                <button className="editorial-admin-button" type="submit">
                  Guardar video #{paddedOrder(order)}
                </button>
              </div>
            </details>
          </form>
        );
      })}
    </div>
  );

  const latestNewsEditor = (
    <div className="editorial-admin-form">
      <form className="editorial-admin-form" action="/api/admin/gestor" method="post">
        <input type="hidden" name="action_type" value="save_matchday_latest_news" />
        <input type="hidden" name="return_to" value={returnToUltimasNoticias} />
        <input type="hidden" name="matchday_id" value={matchday.id} />
        <fieldset className="editorial-admin-fieldset">
          <legend>Apresentação</legend>
          <div className="editorial-admin-grid two">
            <div className="editorial-admin-field">
              <label htmlFor="latest-zone-mode">Formato</label>
              <select id="latest-zone-mode" name="latest_zone_mode" defaultValue={latestZoneMode}>
                <option value="latest_news">Últimas</option>
                <option value="editorial_line">Cartões</option>
              </select>
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="latest-zone-title">Título da zona</label>
              <input
                id="latest-zone-title"
                name="latest_zone_title"
                defaultValue={editorial?.latest_zone_title ?? ""}
                placeholder={latestZoneMode === "latest_news" ? "Principais acontecimentos" : "Pode ficar vazio"}
              />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="latest-zone-title-color">Cor do título da zona</label>
              <EditorialColorInput
                id="latest-zone-title-color"
                name="latest_zone_title_color"
                defaultValue={editorial?.latest_zone_title_color ?? ""}
                placeholder="#0b1f3a"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
          </div>
          <button className="editorial-admin-button secondary" type="submit">
            Guardar Últimas
          </button>
        </fieldset>
      </form>
      <div className="editorial-admin-compact-stack">
        {latestNewsEditorSortOrders.map((order) => {
          const item = latestNews.find((newsItem) => newsItem.sort_order === order);
          const itemKey = `latest-news-${paddedOrder(order)}`;
          const itemAnchor = `latest-news-item-${paddedOrder(order)}`;
          return (
            <div key={order}>
            <form action="/api/admin/gestor" className="editorial-admin-form editorial-admin-item-form" data-latest-news-card={order} method="post">
              <input type="hidden" name="action_type" value="save_matchday_latest_news_item" />
              <input type="hidden" name="return_to" value={returnToLatestNewsItem(order)} />
              <input type="hidden" name="matchday_id" value={matchday.id} />
              <details className="editorial-admin-item-details" id={itemAnchor} open={feedbackScope === "ultimas-noticias" && feedbackItem === itemKey}>
                <summary>
                  <span className="editorial-admin-item-summary-title">{itemSummaryTitle(order, item?.title, "Rascunho vazio")}</span>
                  <span className="editorial-admin-item-status">{item?.status === "published" ? "Publicado" : "Rascunho"}</span>
                </summary>
                <div className="editorial-admin-item-details-body">
                  {itemMessageFor("ultimas-noticias", itemKey, newsFlowErrorDetail || latestNewsErrorDetail)}
                  <input type="hidden" name="latest_news_id" value={item?.id ?? ""} />
                  <input type="hidden" name="latest_news_sort_order" value={order} />
                  <input type="hidden" name="latest_news_article_id" value={item?.article_id ?? ""} />
                  <div className="editorial-admin-field">
                    <label htmlFor={`latest-news-${order}-sort-order`}>Ordem</label>
                    <input id={`latest-news-${order}-sort-order`} readOnly value={order} />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor={`latest-news-${order}-time-label`}>Antetitulo</label>
                    <input id={`latest-news-${order}-time-label`} name="latest_news_time_label" defaultValue={item?.time_label ?? ""} placeholder="22:30 ou ANALISE" />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor={`latest-news-${order}-time-label-color`}>Cor do antetitulo</label>
                    <EditorialColorInput
                      id={`latest-news-${order}-time-label-color`}
                      name="latest_news_time_label_color"
                      defaultValue={item?.time_label_color ?? ""}
                      placeholder="#c40000"
                      pattern="^#[0-9A-Fa-f]{6}$"
                    />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor={`latest-news-${order}-title`}>Titulo</label>
                    <input id={`latest-news-${order}-title`} name="latest_news_title" defaultValue={item?.title ?? ""} placeholder="Titulo curto da noticia" />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor={`latest-news-${order}-subtitle`}>Pós-título</label>
                    <input id={`latest-news-${order}-subtitle`} name="latest_news_subtitle" defaultValue={item?.subtitle ?? ""} placeholder="Resumo curto opcional" />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor={`latest-news-${order}-image-url`}>Imagem URL opcional</label>
                    <input id={`latest-news-${order}-image-url`} name="latest_news_image_url" defaultValue={item?.image_url ?? ""} placeholder="https://exemplo.com/imagem.jpg" />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor={`latest-news-${order}-link-url`}>Link para leitura completa</label>
                    <input id={`latest-news-${order}-link-url`} name="latest_news_link_url" defaultValue={item?.link_url ?? ""} placeholder="/noticias/slug-do-artigo" />
                  </div>
                  <fieldset className="editorial-admin-fieldset editorial-admin-compact-card">
                    <legend>Escolher artigo</legend>
                    <div className="editorial-admin-field">
                      <label htmlFor={`latest-news-${order}-article-source`}>Preencher com artigo publicado</label>
                      <select id={`latest-news-${order}-article-source`} data-latest-news-article-select defaultValue="">
                        <option value="">Escolher fonte publicada</option>
                        {publishedSources.map((source) => {
                          const projection = publishedSourceProjection(source, "editorial_line_item");
                          return (
                            <option
                              key={`${source.source_type}-${source.source_id}`}
                              value={`${source.source_type}:${source.source_id}`}
                              data-latest-news-article-id={source.source_type === "article" ? source.source_id : ""}
                              data-latest-news-time-label={projection.label ?? ""}
                              data-latest-news-title={projection.title ?? ""}
                              data-latest-news-subtitle={projection.subtitle ?? ""}
                              data-latest-news-image-url={projection.imageUrl ?? ""}
                              data-latest-news-link-url={projection.linkUrl ?? ""}
                            >
                              {publishedSourceOptionLabel(source)}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </fieldset>
                  {item?.image_url ? (
                    <div className="editorial-admin-preview">
                      <img alt="" src={item.image_url} />
                    </div>
                  ) : null}
                  <div className="editorial-admin-field">
                    <label htmlFor={`latest-news-${order}-status`}>Estado</label>
                    <select id={`latest-news-${order}-status`} name="latest_news_status" defaultValue={item?.status ?? "draft"}>
                      <option value="draft">Rascunho</option>
                      <option value="published">Publicado</option>
                    </select>
                  </div>
                  <button className="editorial-admin-button" type="submit">
                    Guardar item #{paddedOrder(order)}
                  </button>
                </div>
              </details>
            </form>
            <NewsTransferControl
              matchdayId={matchday.id}
              articleId={articleIdForPlacement(item?.link_url, item?.article_id)}
              sourceSlotType="editorial_line_item"
              sourceId={item?.id ?? null}
              returnTo={returnToLatestNewsItem(order)}
              hasPlacement={item?.status === "published" && Boolean(cleanText(item?.link_url) || cleanText(item?.title))}
              targetOptions={newsTransferTargetOptions}
              displacedOptions={newsDisplacedTargetOptionsForSource("editorial_line_item", item?.id ?? null)}
            />
            </div>
          );
        })}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var cards = Array.prototype.slice.call(document.querySelectorAll('[data-latest-news-card]'));
              cards.forEach(function (card) {
                var order = card.getAttribute('data-latest-news-card');
                var select = card.querySelector('[data-latest-news-article-select]');
                if (!order || !select) return;
                function setFieldValue(field, value) {
                  if (!field) return;
                  field.value = value || '';
                  field.dispatchEvent(new Event('input', { bubbles: true }));
                  field.dispatchEvent(new Event('change', { bubbles: true }));
                }
                function finishPublishedSource() {
                  var message = select.parentElement.querySelector('[data-source-applied-message]');
                  if (!message) {
                    message = document.createElement('span');
                    message.setAttribute('data-source-applied-message', 'true');
                    message.style.display = 'block';
                    message.style.marginTop = '6px';
                    message.style.color = '#475569';
                    message.style.fontSize = '12px';
                    message.style.fontWeight = '700';
                    select.insertAdjacentElement('afterend', message);
                  }
                  message.textContent = 'Fonte aplicada. Reve e guarda a zona.';
                  window.clearTimeout(select._sourceAppliedTimer);
                  select._sourceAppliedTimer = window.setTimeout(function () {
                    message.textContent = '';
                  }, 3500);
                  select.value = '';
                }
                function setLatestNewsField(name, value) {
                  var field = card.querySelector('[name="latest_news_' + name + '"]');
                  setFieldValue(field, value);
                }
                function applyLatestNewsArticle() {
                  var option = select.options[select.selectedIndex];
                  if (!option || !option.value) return;
                  setLatestNewsField('article_id', option.dataset.latestNewsArticleId);
                  setLatestNewsField('time_label', option.dataset.latestNewsTimeLabel);
                  setLatestNewsField('title', option.dataset.latestNewsTitle);
                  setLatestNewsField('subtitle', option.dataset.latestNewsSubtitle);
                  setLatestNewsField('image_url', option.dataset.latestNewsImageUrl);
                  setLatestNewsField('link_url', option.dataset.latestNewsLinkUrl);
                  finishPublishedSource();
                }
                select.addEventListener('change', applyLatestNewsArticle);
              });
            })();
          `
        }}
      />
    </div>
  );

  return (
    <main className="editorial-admin-shell">
      <style>{editorialPageStyles}</style>
      <EditorialColorPresets />

      <section className="editorial-admin-hero">
        <div>
          <p>1.ª página da jornada</p>
          <h1>Editar editorial</h1>
          <small>{contextLabel}</small>
        </div>
        <nav className="editorial-admin-actions" aria-label="Navegação do Editorial da Jornada">
          <a className="editorial-admin-button secondary" href="/admin/editorial/home">
            Home Editorial
          </a>
          <a className="editorial-admin-button secondary" href="/admin/editorial/redacao-automatica">
            Redação automática
          </a>
          <a className="editorial-admin-button secondary" href="/admin/editorial/artigos">
            Artigos / Notícias
          </a>
          <a className="editorial-admin-button secondary" href="/admin/editorial/conteudos">
            CONTEÚDOS / AUDIOVISUAL
          </a>
          <a className="editorial-admin-button secondary" href={`/admin/editorial/composicao/${encodeURIComponent(matchday.id)}`}>
            Abrir composição
          </a>
          <a className="editorial-admin-button secondary" href="/admin/gestor">
            Gestor
          </a>
          <a className="editorial-admin-button secondary" href="/admin">
            Voltar ao Backoffice
          </a>
        </nav>
      </section>

      <section className="editorial-context-selector" aria-label="Alterar jornada editorial">
        <div>
          <p>Alterar jornada</p>
          <strong>{contextLabel}</strong>
        </div>
        {contextSelector.error ? (
          <span className="editorial-context-selector-empty">Nao foi possivel carregar o seletor: {contextSelector.error}</span>
        ) : (
          <form className="editorial-context-selector-form" data-context-switcher data-target-base="/admin/editorial/jornada">
            <div className="editorial-context-selector-field">
              <label htmlFor="editorial-context-competition">Competicao</label>
              <select id="editorial-context-competition" name="competition_id" defaultValue={competition.id}>
                <option value="">Escolher competicao</option>
                {contextSelector.competitions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {[selectorCountryById.get(item.country_id ?? "")?.name, item.name].filter(Boolean).join(" / ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="editorial-context-selector-field">
              <label htmlFor="editorial-context-season">Epoca</label>
              <select id="editorial-context-season" name="season_id" defaultValue={season.id}>
                <option value="">Escolher epoca</option>
                {contextSelector.seasons.map((item) => {
                  const optionHidden = Boolean(competition.id) && item.competition_id !== competition.id;

                  return (
                    <option
                      key={item.id}
                      value={item.id}
                      data-competition={item.competition_id ?? ""}
                      hidden={optionHidden}
                      disabled={optionHidden}
                    >
                      {item.label ?? "Epoca sem nome"}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="editorial-context-selector-field">
              <label htmlFor="editorial-context-matchday">Jornada</label>
              <select id="editorial-context-matchday" name="matchday_id" defaultValue={matchday.id}>
                <option value="">Escolher jornada</option>
                {contextSelector.matchdays.map((item) => {
                  const optionSeason = item.season_id ? selectorSeasonById.get(item.season_id) : null;
                  const optionHidden =
                    (Boolean(competition.id) && optionSeason?.competition_id !== competition.id)
                    || (Boolean(season.id) && item.season_id !== season.id);

                  return (
                    <option
                      key={item.id}
                      value={item.id}
                      data-season={item.season_id ?? ""}
                      data-competition={optionSeason?.competition_id ?? ""}
                      hidden={optionHidden}
                      disabled={optionHidden}
                    >
                      {formatContextSelectorMatchdayLabel(item, selectorSeasonById, selectorCompetitionById, selectorCountryById)}
                    </option>
                  );
                })}
              </select>
            </div>
            <button className="editorial-admin-button" type="submit">
              Abrir Editorial da Jornada
            </button>
          </form>
        )}
      </section>

      <nav className="editorial-admin-block-nav" aria-label="Zonas da Editorial da Jornada">
        <a href="#manchete">01 Manchete</a>
        <a href="#ultimas-noticias">02 Últimas</a>
        <a href="#contexto">03 Contexto</a>
        <a href="#tres-noticias">04 3 notícias</a>
        <a href="#video">05 Vídeo</a>
        <a href="#noticia-ao-lado-video">06 Ao lado do vídeo</a>
        <a href="#faixa-noticias">07 Faixa de notícias</a>
      </nav>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("DOMContentLoaded", function () {
              Array.prototype.forEach.call(document.querySelectorAll("[data-context-switcher]"), function (form) {
                var competition = form.querySelector('select[name="competition_id"]');
                var season = form.querySelector('select[name="season_id"]');
                var matchday = form.querySelector('select[name="matchday_id"]');
                var button = form.querySelector('button[type="submit"]');
                if (!competition || !season || !matchday || !button) return;

                function syncOptions() {
                  var competitionId = competition.value;
                  var seasonId = season.value;

                  Array.prototype.forEach.call(season.options, function (option) {
                    if (!option.value) return;
                    var visible = !competitionId || option.getAttribute("data-competition") === competitionId;
                    option.hidden = !visible;
                    option.disabled = !visible;
                  });

                  if (season.selectedOptions[0] && season.selectedOptions[0].disabled) {
                    season.value = "";
                    seasonId = "";
                  }

                  Array.prototype.forEach.call(matchday.options, function (option) {
                    if (!option.value) return;
                    var matchesCompetition = !competitionId || option.getAttribute("data-competition") === competitionId;
                    var matchesSeason = !seasonId || option.getAttribute("data-season") === seasonId;
                    var visible = matchesCompetition && matchesSeason;
                    option.hidden = !visible;
                    option.disabled = !visible;
                  });

                  if (matchday.selectedOptions[0] && matchday.selectedOptions[0].disabled) {
                    matchday.value = "";
                  }

                  button.disabled = !matchday.value;
                }

                competition.addEventListener("change", syncOptions);
                season.addEventListener("change", syncOptions);
                matchday.addEventListener("change", syncOptions);

                form.addEventListener("submit", function (event) {
                  event.preventDefault();
                  if (!matchday.value) {
                    syncOptions();
                    return;
                  }

                  window.location.href = form.getAttribute("data-target-base") + "/" + encodeURIComponent(matchday.value);
                });

                syncOptions();
              });
            });
          `
        }}
      />

      <div className="editorial-admin-zone-stack" data-composition-form>
        <section className="editorial-admin-panel editorial-admin-zone" id="manchete">
          <header className="editorial-admin-zone-header">
            <span className="editorial-admin-zone-number">01</span>
            <h2 className="editorial-admin-zone-title">Manchete</h2>
          </header>
          {scopedMessageFor(created, error, feedbackScope, "manchete", newsFlowErrorDetail)}
          <form className="editorial-admin-form" action="/api/admin/gestor" data-headline-form method="post">
            <input type="hidden" name="action_type" value="save_matchday_headline" />
            <input type="hidden" name="return_to" value={returnToManchete} />
            <input type="hidden" name="matchday_id" value={matchday.id} />
            <div className="editorial-admin-field">
              <label htmlFor="matchday-editorial-title">Manchete</label>
              <input
                id="matchday-editorial-title"
                name="title"
                defaultValue={editorial?.title ?? ""}
                placeholder="Ex: Girona abre a jornada com autoridade"
              />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="matchday-editorial-summary">Pós-título</label>
              <textarea
                id="matchday-editorial-summary"
                name="summary"
                defaultValue={editorial?.summary ?? ""}
                placeholder="Resumo editorial curto da jornada."
              />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="matchday-editorial-title-color">Cor do titulo</label>
              <EditorialColorInput
                id="matchday-editorial-title-color"
                name="title_color"
                defaultValue={editorial?.title_color ?? ""}
                placeholder="#e5252a"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="matchday-editorial-image-url">Imagem da manchete URL</label>
              <input
                id="matchday-editorial-image-url"
                name="image_url"
                defaultValue={editorial?.image_url ?? ""}
                placeholder="https://exemplo.com/imagem.jpg"
              />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="matchday-editorial-headline-link-url">Link da manchete</label>
              <input
                id="matchday-editorial-headline-link-url"
                name="headline_link_url"
                defaultValue={editorial?.headline_link_url ?? ""}
                placeholder="/noticias/slug-do-artigo"
              />
            </div>
            <fieldset className="editorial-admin-fieldset editorial-admin-compact-card">
              <legend>Escolher artigo</legend>
              <div className="editorial-admin-field">
                <label htmlFor="headline-article-source">Preencher com artigo publicado</label>
                <select id="headline-article-source" data-headline-article-select defaultValue="">
                  <option value="">Escolher fonte publicada</option>
                  {publishedSources.map((source) => {
                    const projection = publishedSourceProjection(source, "headline");
                    return (
                      <option
                        key={`${source.source_type}-${source.source_id}`}
                        value={`${source.source_type}:${source.source_id}`}
                        data-headline-title={projection.title ?? ""}
                        data-headline-summary={projection.subtitle ?? ""}
                        data-headline-image-url={projection.imageUrl ?? ""}
                        data-headline-link-url={projection.linkUrl ?? ""}
                      >
                        {publishedSourceOptionLabel(source)}
                      </option>
                    );
                  })}
                </select>
              </div>
            </fieldset>
            {editorial?.image_url ? (
              <div className="editorial-admin-preview">
                <img alt="" src={editorial.image_url} />
              </div>
            ) : null}
            <div className="editorial-admin-field">
              <label htmlFor="matchday-editorial-status">Estado</label>
              <select id="matchday-editorial-status" name="status" defaultValue={editorial?.status ?? "draft"}>
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
              </select>
            </div>
            <button className="editorial-admin-button" type="submit">
              Guardar manchete
            </button>
          </form>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function () {
                  var form = document.querySelector('[data-headline-form]');
                  if (!form) return;
                  var select = form.querySelector('[data-headline-article-select]');
                  if (!select) return;
                  function setFieldValue(field, value) {
                    if (!field) return;
                    field.value = value || '';
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                  function finishPublishedSource() {
                    var message = select.parentElement.querySelector('[data-source-applied-message]');
                    if (!message) {
                      message = document.createElement('span');
                      message.setAttribute('data-source-applied-message', 'true');
                      message.style.display = 'block';
                      message.style.marginTop = '6px';
                      message.style.color = '#475569';
                      message.style.fontSize = '12px';
                      message.style.fontWeight = '700';
                      select.insertAdjacentElement('afterend', message);
                    }
                    message.textContent = 'Fonte aplicada. Reve e guarda a zona.';
                    window.clearTimeout(select._sourceAppliedTimer);
                    select._sourceAppliedTimer = window.setTimeout(function () {
                      message.textContent = '';
                    }, 3500);
                    select.value = '';
                  }
                  function setField(name, value) {
                    var field = form.querySelector('[name="' + name + '"]');
                    setFieldValue(field, value);
                  }
                  function applySelectedArticle() {
                    var option = select.options[select.selectedIndex];
                    if (!option || !option.value) return;
                    setField('title', option.dataset.headlineTitle);
                    setField('summary', option.dataset.headlineSummary);
                    setField('image_url', option.dataset.headlineImageUrl);
                    setField('headline_link_url', option.dataset.headlineLinkUrl);
                    finishPublishedSource();
                  }
                  select.addEventListener('change', applySelectedArticle);
                })();
              `
            }}
          />
          <form
            className="editorial-admin-form"
            action="/api/admin/gestor/editorial-image"
            encType="multipart/form-data"
            method="post"
            style={{ marginTop: 16 }}
          >
            <input type="hidden" name="return_to" value={returnToManchete} />
            <input type="hidden" name="matchday_id" value={matchday.id} />
            <div className="editorial-admin-field">
              <label htmlFor="matchday-editorial-image-upload">Carregar imagem da manchete</label>
              <input accept="image/jpeg,image/png,image/webp" id="matchday-editorial-image-upload" name="image" type="file" />
            </div>
            <button className="editorial-admin-button secondary" type="submit">
              Carregar imagem da manchete
            </button>
          </form>
          <NewsTransferControl
            matchdayId={matchday.id}
            articleId={articleIdForPlacement(editorial?.headline_link_url)}
            sourceSlotType="headline"
            sourceId={editorial?.id ?? null}
            returnTo={returnToManchete}
            hasPlacement={editorial?.status === "published" && Boolean(cleanText(editorial?.headline_link_url) || cleanText(editorial?.title))}
            targetOptions={newsTransferTargetOptions}
            displacedOptions={newsDisplacedTargetOptionsForSource("headline", editorial?.id ?? null)}
          />
        </section>

        <section className="editorial-admin-panel editorial-admin-zone" id="ultimas-noticias">
          <header className="editorial-admin-zone-header">
            <span className="editorial-admin-zone-number">02</span>
            <h2 className="editorial-admin-zone-title">Últimas</h2>
          </header>
                {scopedMessageFor(created, error, feedbackScope, "ultimas-noticias", newsFlowErrorDetail || latestNewsErrorDetail)}
                {latestNewsEditor}
        </section>

        <section className="editorial-admin-panel editorial-admin-zone" id="contexto">
          <header className="editorial-admin-zone-header">
            <span className="editorial-admin-zone-number">03</span>
            <h2 className="editorial-admin-zone-title">Contexto</h2>
          </header>
          {scopedMessageFor(created, error, feedbackScope, "bloco-lateral")}
          <form className="editorial-admin-form" action="/api/admin/gestor" data-side-block-form method="post">
            <input type="hidden" name="action_type" value="save_matchday_side_block" />
            <input type="hidden" name="return_to" value={returnToBlocoLateral} />
            <input type="hidden" name="matchday_id" value={matchday.id} />
            <div className="editorial-admin-field">
              <label htmlFor="side-block-status">Estado</label>
              <select id="side-block-status" name="side_block_status" defaultValue={editorial?.side_block_status ?? "draft"}>
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
              </select>
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-type">Tipo</label>
              <select id="side-block-type" name="side_block_type" defaultValue={editorial?.side_block_type ?? "opiniao"}>
                <option value="opiniao">Opiniao</option>
                <option value="arbitragem">Arbitragem</option>
                <option value="balanco">Balanco</option>
                <option value="analise">Analise</option>
                <option value="cronica">Cronica</option>
                <option value="figura-da-jornada">Figura da jornada</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-label">Antetitulo</label>
              <input id="side-block-label" name="side_block_label" defaultValue={editorial?.side_block_label ?? ""} placeholder="OPINIAO" />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-label-color">Cor do antetitulo</label>
              <EditorialColorInput
                id="side-block-label-color"
                name="side_block_label_color"
                defaultValue={editorial?.side_block_label_color ?? ""}
                placeholder="#c40000"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-title">Titulo</label>
              <input id="side-block-title" name="side_block_title" defaultValue={editorial?.side_block_title ?? ""} placeholder="A jornada que muda expectativas" />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-title-color">Cor do titulo</label>
              <EditorialColorInput
                id="side-block-title-color"
                name="side_block_title_color"
                defaultValue={editorial?.side_block_title_color ?? ""}
                placeholder="#0b1f3a"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-author">Autor, opcional</label>
              <input id="side-block-author" name="side_block_author" defaultValue={editorial?.side_block_author ?? ""} placeholder="Silvestre Chicharo" />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-text">Pós-título / texto</label>
              <textarea
                id="side-block-text"
                name="side_block_text"
                defaultValue={editorial?.side_block_text ?? ""}
                maxLength={EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS}
                placeholder="Texto curto para a chamada editorial lateral."
              />
              <small>
                Procurar {EDITORIAL_CONTEXT_POST_TITLE_MIN_CHARS}–{EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS} caracteres, sem acrescentar informação não sustentada apenas para preencher espaço.
              </small>
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-image-url">Imagem opcional</label>
              <input id="side-block-image-url" name="side_block_image_url" defaultValue={editorial?.side_block_image_url ?? ""} placeholder="https://exemplo.com/imagem.jpg" />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-link-url">Link opcional</label>
              <input id="side-block-link-url" name="side_block_link_url" defaultValue={editorial?.side_block_link_url ?? ""} placeholder="/noticias/slug-do-artigo" />
            </div>
            <fieldset className="editorial-admin-fieldset editorial-admin-compact-card">
              <legend>Escolher artigo</legend>
              <div className="editorial-admin-field">
                <label htmlFor="side-block-article-source">Preencher com artigo publicado</label>
                <select id="side-block-article-source" data-side-block-article-select defaultValue="">
                  <option value="">Escolher fonte publicada</option>
                  {publishedSources.map((source) => (
                    <option
                      key={`${source.source_type}-${source.source_id}`}
                      value={`${source.source_type}:${source.source_id}`}
                      data-side-title={cleanText(source.title)}
                      data-side-text={publishedSourceComplementText(source)}
                      data-side-label={publishedSourceComplementLabel(source)}
                      data-side-author={cleanText(source.author)}
                      data-side-image-url={publishedSourceComplementImageUrl(source)}
                      data-side-link-url={cleanText(source.link_url)}
                    >
                      {publishedSourceOptionLabel(source)}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>
            <button className="editorial-admin-button" type="submit">
              Guardar contexto
            </button>
          </form>
          <NewsTransferControl
            matchdayId={matchday.id}
            articleId={articleIdForPlacement(editorial?.side_block_link_url)}
            sourceSlotType="side_block"
            sourceId={editorial?.id ?? null}
            returnTo={returnToBlocoLateral}
            hasPlacement={editorial?.side_block_status === "published" && Boolean(cleanText(editorial?.side_block_link_url) || cleanText(editorial?.side_block_title))}
            targetOptions={newsTransferTargetOptions}
            displacedOptions={newsDisplacedTargetOptionsForSource("side_block", editorial?.id ?? null)}
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function () {
                  var form = document.querySelector('[data-side-block-form]');
                  if (!form) return;
                  var select = form.querySelector('[data-side-block-article-select]');
                  if (!select) return;
                  function setFieldValue(field, value) {
                    if (!field) return;
                    field.value = value || '';
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                  function finishPublishedSource() {
                    var message = select.parentElement.querySelector('[data-source-applied-message]');
                    if (!message) {
                      message = document.createElement('span');
                      message.setAttribute('data-source-applied-message', 'true');
                      message.style.display = 'block';
                      message.style.marginTop = '6px';
                      message.style.color = '#475569';
                      message.style.fontSize = '12px';
                      message.style.fontWeight = '700';
                      select.insertAdjacentElement('afterend', message);
                    }
                    message.textContent = 'Fonte aplicada. Reve e guarda a zona.';
                    window.clearTimeout(select._sourceAppliedTimer);
                    select._sourceAppliedTimer = window.setTimeout(function () {
                      message.textContent = '';
                    }, 3500);
                    select.value = '';
                  }
                  function setField(name, value) {
                    var field = form.querySelector('[name="' + name + '"]');
                    setFieldValue(field, value);
                  }
                  function applySelectedArticle() {
                    var option = select.options[select.selectedIndex];
                    if (!option || !option.value) return;
                    setField('side_block_title', option.getAttribute('data-side-title') || '');
                    setField('side_block_text', option.getAttribute('data-side-text') || '');
                    setField('side_block_label', option.getAttribute('data-side-label') || '');
                    setField('side_block_author', option.getAttribute('data-side-author') || '');
                    setField('side_block_image_url', option.getAttribute('data-side-image-url') || '');
                    setField('side_block_link_url', option.getAttribute('data-side-link-url') || '');
                    finishPublishedSource();
                  }
                  select.addEventListener('change', applySelectedArticle);
                })();
              `
            }}
          />
        </section>

        <section className="editorial-admin-panel editorial-admin-zone" id="tres-noticias">
          <header className="editorial-admin-zone-header">
            <span className="editorial-admin-zone-number">04</span>
            <h2 className="editorial-admin-zone-title">3 notícias abaixo da manchete</h2>
          </header>
                {scopedMessageFor(created, error, feedbackScope, "destaques")}
                <form className="editorial-admin-form" action="/api/admin/gestor" id={belowHeadlineSettingsFormId} method="post">
                  <input type="hidden" name="action_type" value="save_matchday_below_headline" />
                  <input type="hidden" name="return_to" value={returnToDestaques} />
                  <input type="hidden" name="matchday_id" value={matchday.id} />
                  <div className="editorial-admin-field">
                    <label htmlFor="composition-below-headline-mode">Estado</label>
                    <select id="composition-below-headline-mode" name="below_headline_mode" defaultValue={belowHeadlineMode}>
                      <option value="highlights">Ativos</option>
                      <option value="roundup">Inativos</option>
                    </select>
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="below-headline-heading">Titulo da zona</label>
                    <input id="below-headline-heading" name="below_headline_heading" defaultValue={editorial?.below_headline_heading ?? ""} placeholder={belowHeadlineHeadingFallback} />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="below-headline-heading-color">Cor do titulo da zona</label>
                    <EditorialColorInput
                      id="below-headline-heading-color"
                      name="below_headline_heading_color"
                      defaultValue={editorial?.below_headline_heading_color ?? ""}
                      placeholder="#0b1f3a"
                      pattern="^#[0-9A-Fa-f]{6}$"
                    />
                  </div>
                  <button className="editorial-admin-button" type="submit">
                    Guardar 3 notícias
                  </button>
                </form>
                {highlightsEditor}
        </section>

        <section className="editorial-admin-panel editorial-admin-zone" id="video">
          <header className="editorial-admin-zone-header">
            <span className="editorial-admin-zone-number">05</span>
            <h2 className="editorial-admin-zone-title">Vídeo</h2>
          </header>
                {scopedMessageFor(created, error, feedbackScope, "resumo-jornada")}
                <form className="editorial-admin-form" action="/api/admin/gestor" method="post">
                  <input type="hidden" name="action_type" value="save_matchday_roundup_settings" />
                  <input type="hidden" name="return_to" value={returnToResumo} />
                  <input type="hidden" name="matchday_id" value={matchday.id} />
                  <div className="editorial-admin-field">
                    <label htmlFor="roundup-zone-mode">Estado</label>
                    <select id="roundup-zone-mode" name="complementary_mode" defaultValue={roundupMode}>
                      <option value="roundup_video">Ativo</option>
                      <option value="none">Inativo</option>
                    </select>
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="roundup-video-heading">Titulo da zona</label>
                    <input id="roundup-video-heading" name="roundup_video_heading" defaultValue={editorial?.roundup_video_heading ?? ""} placeholder={roundupVideoHeadingFallback} />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="roundup-video-heading-color">Cor do titulo da zona</label>
                    <EditorialColorInput
                      id="roundup-video-heading-color"
                      name="roundup_video_heading_color"
                      defaultValue={editorial?.roundup_video_heading_color ?? ""}
                      placeholder="#003f8f"
                      pattern="^#[0-9A-Fa-f]{6}$"
                    />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="complementary-roundup-item">Video inicial opcional</label>
                    <select id="complementary-roundup-item" name="complementary_roundup_item_id" defaultValue={editorial?.complementary_roundup_item_id ?? ""}>
                      <option value="">Usar primeiro item publicado</option>
                      {roundupItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.sort_order}. {item.title || item.label || "Item sem titulo"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="editorial-admin-button" type="submit">
                    Guardar vídeo
                  </button>
                </form>
                {roundupEditor}
        </section>

        <section className="editorial-admin-panel editorial-admin-zone" id="noticia-ao-lado-video">
          <header className="editorial-admin-zone-header">
            <span className="editorial-admin-zone-number">06</span>
            <h2 className="editorial-admin-zone-title">Notícia ao lado do vídeo</h2>
          </header>
                <form className="editorial-admin-form" action="/api/admin/gestor" data-complementary-form method="post">
                  {scopedMessageFor(created, error, feedbackScope, "bloco-complementar", newsFlowErrorDetail)}
                  <input type="hidden" name="action_type" value="save_matchday_complement" />
                  <input type="hidden" name="return_to" value={returnToComplementar} />
                  <input type="hidden" name="matchday_id" value={matchday.id} />
                  <div className="editorial-admin-field">
                    <label htmlFor="complementary-status">Estado</label>
                    <select id="complementary-status" name="complementary_status" defaultValue={editorial?.complementary_status ?? "draft"}>
                      <option value="published">Ativo</option>
                      <option value="draft">Inativo</option>
                    </select>
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="complementary-label">Titulo da zona</label>
                    <input id="complementary-label" name="complementary_label" defaultValue={editorial?.complementary_label ?? ""} placeholder="DESTAQUE" />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="complementary-label-color">Cor do titulo da zona</label>
                    <EditorialColorInput
                      id="complementary-label-color"
                      name="complementary_text_color"
                      defaultValue={editorial?.complementary_text_color ?? ""}
                      placeholder="#10151b"
                      pattern="^#[0-9A-Fa-f]{6}$"
                    />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="complementary-title">Título</label>
                    <input id="complementary-title" name="complementary_title" defaultValue={editorial?.complementary_title ?? ""} placeholder="Um detalhe editorial para acompanhar a manchete" />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="complementary-text">Pós-título</label>
                    <textarea id="complementary-text" name="complementary_text" defaultValue={editorial?.complementary_text ?? ""} placeholder="Texto curto do complemento da manchete." />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="complementary-image-url">Imagem URL</label>
                    <input id="complementary-image-url" name="complementary_image_url" defaultValue={editorial?.complementary_image_url ?? ""} placeholder="https://exemplo.com/imagem.jpg" />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="complementary-link-url">Link da noticia completa</label>
                    <input id="complementary-link-url" name="complementary_link_url" defaultValue={editorial?.complementary_link_url ?? ""} placeholder="/noticias/slug-do-artigo" />
                  </div>
                  <fieldset className="editorial-admin-fieldset editorial-admin-compact-card">
                    <legend>Escolher artigo</legend>
                    <div className="editorial-admin-field">
                      <label htmlFor="complementary-article-source">Preencher com artigo publicado</label>
                      <select id="complementary-article-source" data-complementary-article-select defaultValue="">
                        <option value="">Escolher fonte publicada</option>
                        {publishedSources.map((source) => {
                          const projection = publishedSourceProjection(source, "complement");
                          return (
                            <option
                              key={`${source.source_type}-${source.source_id}`}
                              value={`${source.source_type}:${source.source_id}`}
                              data-complementary-label={projection.label ?? ""}
                              data-complementary-title={projection.title ?? ""}
                              data-complementary-text={projection.subtitle ?? ""}
                              data-complementary-image-url={projection.imageUrl ?? ""}
                              data-complementary-link-url={projection.linkUrl ?? ""}
                            >
                              {publishedSourceOptionLabel(source)}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    </fieldset>
                  <button className="editorial-admin-button" type="submit">
                    Guardar notícia
                  </button>
                </form>
                <NewsTransferControl
                  matchdayId={matchday.id}
                  articleId={articleIdForPlacement(editorial?.complementary_link_url)}
                  sourceSlotType="complement"
                  sourceId={editorial?.id ?? null}
                  returnTo={returnToComplementar}
                  hasPlacement={editorial?.complementary_status === "published" && Boolean(cleanText(editorial?.complementary_link_url) || cleanText(editorial?.complementary_title))}
                  targetOptions={newsTransferTargetOptions}
                  displacedOptions={newsDisplacedTargetOptionsForSource("complement", editorial?.id ?? null)}
                />
        </section>

        <section className="editorial-admin-panel editorial-admin-zone" id="faixa-noticias">
          <header className="editorial-admin-zone-header">
            <span className="editorial-admin-zone-number">07</span>
            <h2 className="editorial-admin-zone-title">Faixa de notícias</h2>
          </header>
              {feedbackScope === "faixa-horizontal" && !feedbackItem ? (
                <div>{messageFor(created, error, "faixa-horizontal", horizontalNewsErrorDetail)}</div>
              ) : null}
              {horizontalNewsEditorOrders.map((order) => (
                <form
                  action="/api/admin/gestor"
                  className="editorial-admin-hidden-form"
                  id={`matchday-horizontal-news-form-${order}`}
                  key={`matchday-horizontal-news-form-${order}`}
                  method="post"
                />
              ))}
              <EditorialHorizontalNewsEditor
                id="faixa-noticias-editor"
                title=""
                description=""
                tableName=""
                items={horizontalNewsEditorItems}
                orders={horizontalNewsEditorOrders}
                sources={horizontalNewsSources}
                formIdForOrder={(order) => `matchday-horizontal-news-form-${order}`}
                hiddenFieldsForOrder={(order) => [
                  { name: "action_type", value: "save_matchday_horizontal_news_item" },
                  { name: "return_to", value: returnToHorizontalNewsItem(order) },
                  { name: "matchday_id", value: matchday.id }
                ]}
                messageForOrder={(order) =>
                  itemMessageFor("faixa-horizontal", `horizontal-news-${paddedOrder(order)}`, newsFlowErrorDetail || horizontalNewsErrorDetail)
                }
                transferControlForOrder={(order, item) => (
                  <NewsTransferControl
                    matchdayId={matchday.id}
                    articleId={articleIdForPlacement(item?.linkUrl)}
                    sourceSlotType="important_item"
                    sourceId={item?.id ?? null}
                    returnTo={returnToHorizontalNewsItem(order)}
                    hasPlacement={item?.status === "published" && Boolean(cleanText(item?.linkUrl) || cleanText(item?.title))}
                    targetOptions={newsTransferTargetOptions}
                    displacedOptions={newsDisplacedTargetOptionsForSource("important_item", item?.id ?? null)}
                  />
                )}
                reorderControlForOrder={(_order, item) => {
                  if (!item) return null;
                  const index = horizontalNewsEditorItems.findIndex((candidate) => candidate.id === item.id);
                  const isFirst = index <= 0;
                  const isLast = index < 0 || index >= horizontalNewsEditorItems.length - 1;
                  return (
                    <form action="/api/admin/gestor" className="horizontal-news-admin-order-form" method="post">
                      <input type="hidden" name="action_type" value="move_matchday_horizontal_news_item" />
                      <input type="hidden" name="return_to" value={returnToFaixaHorizontal} />
                      <input type="hidden" name="matchday_id" value={matchday.id} />
                      <input type="hidden" name="horizontal_news_id" value={item.id} />
                      <button className="secondary" type="submit" name="horizontal_news_direction" value="up" disabled={isFirst}>
                        Subir / esquerda
                      </button>
                      <button className="secondary" type="submit" name="horizontal_news_direction" value="down" disabled={isLast}>
                        Descer / direita
                      </button>
                    </form>
                  );
                }}
                openOrder={horizontalNewsOpenOrder}
              />
        </section>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                document.querySelectorAll('[data-news-transfer-form]').forEach(function (form) {
                  if (form.getAttribute('data-news-transfer-bound') === '1') return;
                  form.setAttribute('data-news-transfer-bound', '1');
                  var select = form.querySelector('select[name="target_choice"]');
                  var displacedField = form.querySelector('[data-displaced-target-field]');
                  var displacedSelect = form.querySelector('select[name="displaced_target_choice"]');

                  function updateDisplacedDestination() {
                    var option = select && select.selectedOptions ? select.selectedOptions[0] : null;
                    var needsDisplacedDestination = Boolean(
                      displacedSelect && option && option.getAttribute('data-target-occupied') === '1'
                    );
                    if (displacedField) displacedField.hidden = !needsDisplacedDestination;
                    if (displacedSelect) {
                      displacedSelect.disabled = !needsDisplacedDestination;
                      displacedSelect.required = needsDisplacedDestination;
                      if (!needsDisplacedDestination) displacedSelect.value = '';
                    }
                  }

                  if (select) select.addEventListener('change', updateDisplacedDestination);
                  updateDisplacedDestination();

                  form.addEventListener('submit', function (event) {
                    updateDisplacedDestination();
                    var option = select && select.selectedOptions ? select.selectedOptions[0] : null;
                    var message = option ? option.getAttribute('data-confirm-message') : '';
                    if (message && !window.confirm(message)) {
                      event.preventDefault();
                    }
                  });
                });
              })();
            `
          }}
        />

        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var form = document.querySelector('[data-composition-form]');
                if (!form) return;
                var complementArticleSelect = form.querySelector('[data-complementary-article-select]');
                function setFieldValue(field, value) {
                  if (!field) return;
                  field.value = value || '';
                  field.dispatchEvent(new Event('input', { bubbles: true }));
                  field.dispatchEvent(new Event('change', { bubbles: true }));
                }
                function finishPublishedSource() {
                  if (!complementArticleSelect) return;
                  var message = complementArticleSelect.parentElement.querySelector('[data-source-applied-message]');
                  if (!message) {
                    message = document.createElement('span');
                    message.setAttribute('data-source-applied-message', 'true');
                    message.style.display = 'block';
                    message.style.marginTop = '6px';
                    message.style.color = '#475569';
                    message.style.fontSize = '12px';
                    message.style.fontWeight = '700';
                    complementArticleSelect.insertAdjacentElement('afterend', message);
                  }
                  message.textContent = 'Fonte aplicada. Reve e guarda a zona.';
                  window.clearTimeout(complementArticleSelect._sourceAppliedTimer);
                  complementArticleSelect._sourceAppliedTimer = window.setTimeout(function () {
                    message.textContent = '';
                  }, 3500);
                  complementArticleSelect.value = '';
                }
                function setComplementField(name, value) {
                  var field = form.querySelector('[data-complementary-form] [name="' + name + '"]');
                  setFieldValue(field, value);
                }
                function applyComplementArticle() {
                  if (!complementArticleSelect) return;
                  var option = complementArticleSelect.options[complementArticleSelect.selectedIndex];
                  if (!option || !option.value) return;
                  setComplementField('complementary_label', option.dataset.complementaryLabel);
                  setComplementField('complementary_title', option.dataset.complementaryTitle);
                  setComplementField('complementary_text', option.dataset.complementaryText);
                  setComplementField('complementary_image_url', option.dataset.complementaryImageUrl);
                  setComplementField('complementary_link_url', option.dataset.complementaryLinkUrl);
                  finishPublishedSource();
                }
                if (complementArticleSelect) complementArticleSelect.addEventListener('change', applyComplementArticle);
              })();
            `
          }}
        />
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("submit", function (event) {
              var form = event.target;
              if (!form || !form.getAttribute) return;
              var action = form.getAttribute("action") || "";
              if (action.indexOf("/api/admin/gestor") !== 0) return;
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
