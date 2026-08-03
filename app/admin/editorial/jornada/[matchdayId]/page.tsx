import EditorialHorizontalNewsEditor from "@/components/admin/EditorialHorizontalNewsEditor";
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
const LATEST_NEWS_EDITOR_SORT_ORDERS = Array.from({ length: 8 }, (_, index) => index + 1);

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
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
    border: 1px solid #f2c7ca;
    border-radius: 8px;
    background: #ffffff;
    padding: 10px;
    box-shadow: 0 10px 24px rgba(8, 15, 24, 0.08);
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
    scroll-margin-top: 18px;
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
  #composicao,
  #destaques,
  #resumo-jornada,
  #bloco-complementar,
  #ultimas-noticias {
    scroll-margin-top: 18px;
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
      `matchday_editorials?select=id,matchday_id,title,summary,title_color,image_url,headline_link_url,below_headline_mode,below_headline_heading,below_headline_subtitle,below_headline_heading_color,complementary_mode,complementary_roundup_item_id,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status,roundup_video_heading,roundup_video_heading_color,side_block_status,side_block_type,side_block_label,side_block_label_color,side_block_title,side_block_title_color,side_block_author,side_block_text,side_block_image_url,side_block_link_url,latest_zone_mode,latest_zone_title,latest_zone_title_color,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}`
    );
  } catch {
    return readFirst<MatchdayEditorialForAdmin>(
      `matchday_editorials?select=id,matchday_id,title,summary,title_color,image_url,headline_link_url,below_headline_mode,below_headline_heading,below_headline_heading_color,complementary_mode,complementary_roundup_item_id,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status,roundup_video_heading,roundup_video_heading_color,side_block_status,side_block_type,side_block_label,side_block_title,side_block_title_color,side_block_author,side_block_text,side_block_image_url,side_block_link_url,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
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
    `matchday_horizontal_news?select=id,matchday_id,label,title,subtitle,image_url,link_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&order=sort_order.asc&limit=4`
  ).catch(() => []);
}

async function readMatchdayLatestNews(matchdayId: string): Promise<SupabaseMatchdayLatestNews[]> {
  try {
    return await fetchSupabaseAdminTable<SupabaseMatchdayLatestNews>(
      `matchday_latest_news?select=id,matchday_id,time_label,time_label_color,title,subtitle,image_url,link_url,article_id,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&order=sort_order.asc&limit=8`
    );
  } catch {
    return fetchSupabaseAdminTable<SupabaseMatchdayLatestNews>(
      `matchday_latest_news?select=id,matchday_id,time_label,title,image_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&order=sort_order.asc&limit=8`
    ).catch(() => []);
  }
}

type PublishedReferenceCompositionSummary = {
  id: string;
  internal_name: string | null;
  published_at: string | null;
};

async function readPublishedReferenceComposition(matchdayId: string): Promise<PublishedReferenceCompositionSummary | null> {
  return fetchSupabaseAdminTable<PublishedReferenceCompositionSummary>(
    `matchday_reference_compositions?select=id,internal_name,published_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&status=eq.published&is_current=is.true&order=published_at.desc.nullslast&limit=1`
  )
    .then((rows) => rows[0] ?? null)
    .catch(() => null);
}

async function readPublishedEditorialArticles(): Promise<EditorialArticleForSideBlock[]> {
  return fetchSupabaseAdminTable<EditorialArticleForSideBlock>(
    "editorial_articles?select=id,slug,title,subtitle,body,label,author,image_url,published_at,created_at,status&status=eq.published&order=published_at.desc.nullslast,created_at.desc.nullslast&limit=50"
  ).catch(() => []);
}

type FeedbackScope = "manchete" | "bloco-lateral" | "composicao" | "destaques" | "resumo-jornada" | "faixa-horizontal" | "bloco-complementar" | "ultimas-noticias";

function messageFor(created?: string, error?: string, scope?: FeedbackScope, detail?: string) {
  const createdLabels: Record<string, string> = {
    save_matchday_headline: "Manchete guardada.",
    save_matchday_side_block: "Bloco lateral guardado.",
    save_matchday_complement: "Bloco complementar guardado.",
    save_matchday_below_headline: "Zona abaixo da manchete guardada.",
    save_matchday_editorial: "Linha editorial da jornada guardada.",
    save_matchday_highlights: "Destaques guardados e definidos como zona ativa abaixo da manchete.",
    save_matchday_highlight_item: "Destaque guardado.",
    save_matchday_roundup_items: "Resumo da Jornada guardado e definido como zona ativa abaixo da manchete.",
    save_matchday_roundup_item: "Item do Resumo da Jornada guardado.",
    save_matchday_latest_news: "Zona final da capa guardada.",
    save_matchday_latest_news_item: "Item da zona final guardado.",
    save_matchday_horizontal_news_item: "Item da faixa horizontal guardado.",
    upload_matchday_editorial_image: "Imagem da manchete carregada.",
    upload_matchday_highlight_image: "Imagem do destaque carregada."
  };
  const scopedCreatedLabels: Partial<Record<FeedbackScope, Record<string, string>>> = {
    manchete: {
      save_matchday_headline: "Manchete guardada.",
      save_matchday_editorial: "Manchete guardada.",
      upload_matchday_editorial_image: "Imagem da manchete carregada."
    },
    composicao: {
      save_matchday_below_headline: "Zona abaixo da manchete guardada.",
      save_matchday_editorial: "Composicao guardada."
    },
    "bloco-lateral": {
      save_matchday_side_block: "Bloco lateral da jornada guardado.",
      save_matchday_editorial: "Bloco lateral da jornada guardado."
    },
    destaques: {
      save_matchday_highlights: "Destaques guardados.",
      save_matchday_highlight_item: "Destaque guardado.",
      upload_matchday_highlight_image: "Imagem do destaque carregada."
    },
    "resumo-jornada": {
      save_matchday_roundup_items: "Resumo da Jornada guardado.",
      save_matchday_roundup_item: "Item do Resumo da Jornada guardado."
    },
    "faixa-horizontal": {
      save_matchday_horizontal_news_item: "Item da faixa horizontal guardado."
    },
    "bloco-complementar": {
      save_matchday_complement: "Bloco complementar guardado.",
      save_matchday_editorial: "Bloco complementar guardado."
    },
    "ultimas-noticias": {
      save_matchday_latest_news: "Zona final da capa guardada.",
      save_matchday_latest_news_item: "Item da zona final guardado."
    }
  };
  const errorLabels: Record<string, string> = {
    "missing-service": "Liga primeiro a Supabase na Vercel.",
    "missing-fields": "Preenche os campos obrigatorios antes de guardar.",
    "matchday-invalid": "A jornada escolhida ja nao existe.",
    "roundup-item-invalid": "O item escolhido do Resumo da Jornada nao pertence a esta jornada.",
    "editorial-title-required": "Para publicar, indica uma manchete da jornada.",
    "highlight-title-required": "Para publicar um destaque, indica o titulo.",
    "latest-news-title-required": "Para publicar uma noticia, indica o titulo.",
    "horizontal-news-title-required": "Para publicar uma noticia na faixa horizontal, indica o titulo.",
    "horizontal-news-save-failed": "Nao foi possivel guardar a faixa horizontal de noticias.",
    "editorial-image-type": "O ficheiro tem de ser uma imagem JPG, PNG ou WebP.",
    "editorial-image-size": "A imagem nao pode ter mais de 5MB.",
    "editorial-image-upload": "Nao foi possivel carregar a imagem. Confirma o bucket de Storage.",
    "latest-news-save-failed": "Nao foi possivel guardar a Zona Editorial Final.",
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
  const horizontalNews = await readMatchdayHorizontalNews(matchday.id);
  const publishedReferenceComposition = await readPublishedReferenceComposition(matchday.id);
  const publishedEditorialArticles = await readPublishedEditorialArticles();
  const publishedSources = await getEditorialPublishedSources({
    competitionId: competition.id,
    seasonId: season.id,
    matchdayId: matchday.id
  }).catch(() => []);
  const sideBlockArticleOptions = publishedEditorialArticles.filter((article) => articlePublicHref(article));
  const belowHeadlineMode = editorial?.below_headline_mode === "roundup" ? "roundup" : "highlights";
  const complementaryMode = editorial?.complementary_mode ?? "none";
  const latestZoneMode = editorial?.latest_zone_mode === "editorial_line" ? "editorial_line" : "latest_news";
  const belowHeadlineHeadingFallback = `Jornada ${String(matchday.number).padStart(2, "0")}`;
  const roundupVideoHeadingFallback = `Jornada ${String(matchday.number).padStart(2, "0")} · Jogos Vídeo Resumo`;
  const returnTo = `/admin/editorial/jornada/${matchday.id}`;
  const scopedReturnTo = (scope: FeedbackScope, anchor = scope) => `${returnTo}?feedback_scope=${scope}#${anchor}`;
  const returnToManchete = scopedReturnTo("manchete");
  const returnToBlocoLateral = scopedReturnTo("bloco-lateral");
  const returnToComposicao = scopedReturnTo("composicao");
  const returnToDestaques = scopedReturnTo("destaques");
  const returnToResumo = scopedReturnTo("resumo-jornada");
  const returnToComplementar = scopedReturnTo("bloco-complementar");
  const returnToUltimasNoticias = scopedReturnTo("ultimas-noticias");
  const returnToHighlightItem = (order: number) =>
    `${returnTo}?feedback_scope=destaques&feedback_item=highlight-${paddedOrder(order)}#highlight-item-${paddedOrder(order)}`;
  const returnToResumoItem = (order: number) =>
    `${returnTo}?feedback_scope=resumo-jornada&feedback_item=roundup-${paddedOrder(order)}#roundup-item-${paddedOrder(order)}`;
  const returnToHorizontalNewsItem = (order: number) =>
    `${returnTo}?feedback_scope=faixa-horizontal&feedback_item=horizontal-news-${paddedOrder(order)}#faixa-horizontal-item-${paddedOrder(order)}`;
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
  const horizontalNewsSources = publishedSources.map((source) => ({
    key: `${source.source_type}:${source.source_id}`,
    optionLabel: publishedSourceOptionLabel(source),
    label: publishedSourceComplementLabel(source),
    title: cleanText(source.title),
    subtitle: publishedSourceComplementText(source),
    imageUrl: publishedSourceComplementImageUrl(source),
    linkUrl: cleanText(source.link_url)
  }));
  const horizontalNewsOpenOrder = [1, 2, 3, 4].find(
    (order) => feedbackScope === "faixa-horizontal" && feedbackItem === `horizontal-news-${paddedOrder(order)}`
  ) ?? null;

  const highlightsEditor = (
    <>
      <div className="editorial-admin-compact-stack">
        {[1, 2, 3].map((order) => {
          const highlight = highlights.find((item) => item.sort_order === order);
          const highlightFormId = `matchday-highlight-${order}-form`;
          const itemKey = `highlight-${paddedOrder(order)}`;
          const itemAnchor = `highlight-item-${paddedOrder(order)}`;
          return (
            <details className="editorial-admin-item-details" data-highlight-card={order} id={itemAnchor} key={order}>
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
                {itemMessageFor("destaques", itemKey)}
                <div className="editorial-admin-field">
                  <label htmlFor={`highlight-${order}-label`}>Etiqueta</label>
                  <input form={highlightFormId} id={`highlight-${order}-label`} name="highlight_label" defaultValue={highlight?.label ?? ""} placeholder={order === 1 ? "ANTEVISAO" : order === 2 ? "AMBIENTE" : "CONTEXTO"} />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`highlight-${order}-label-color`}>Cor do antetitulo</label>
                  <input
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
                  <label htmlFor={`highlight-${order}-subtitle`}>Subtitulo / texto curto</label>
                  <input form={highlightFormId} id={`highlight-${order}-subtitle`} name="highlight_subtitle" defaultValue={highlight?.subtitle ?? ""} placeholder="Resumo curto opcional do destaque" />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`highlight-${order}-image-url`}>Imagem URL</label>
                  <input form={highlightFormId} id={`highlight-${order}-image-url`} name="highlight_image_url" defaultValue={highlight?.image_url ?? ""} placeholder="https://exemplo.com/imagem.jpg" />
                </div>
                <div className="editorial-admin-field">
                  <label htmlFor={`highlight-${order}-link-url`}>Link do destaque</label>
                  <input form={highlightFormId} id={`highlight-${order}-link-url`} name="highlight_link_url" defaultValue={highlight?.link_url ?? ""} placeholder="/noticias/slug-do-artigo" />
                </div>
                <fieldset className="editorial-admin-fieldset editorial-admin-compact-card">
                  <legend>Ligar fonte publicada ao destaque</legend>
                  <div className="editorial-admin-field">
                    <label htmlFor={`highlight-${order}-article-source`}>Preencher destaque com fonte publicada</label>
                    <select id={`highlight-${order}-article-source`} data-highlight-article-select defaultValue="">
                      <option value="">Escolher fonte publicada</option>
                      {publishedSources.map((source) => (
                        <option
                          key={`${source.source_type}-${source.source_id}`}
                          value={`${source.source_type}:${source.source_id}`}
                          data-highlight-label={publishedSourceComplementLabel(source)}
                          data-highlight-title={cleanText(source.title)}
                          data-highlight-subtitle={publishedSourceComplementText(source)}
                          data-highlight-image-url={publishedSourceComplementImageUrl(source)}
                          data-highlight-link-url={cleanText(source.link_url)}
                        >
                          {publishedSourceOptionLabel(source)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="editorial-admin-muted">
                    Ao escolher uma fonte, o destaque recebe etiqueta, titulo, imagem e link interno. Pode ajustar manualmente antes de guardar.
                  </p>
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
                  Guardar destaque #{paddedOrder(order)}
                </button>
                <form action="/api/admin/gestor/editorial-image" className="editorial-admin-upload-inline" encType="multipart/form-data" method="post">
                  <input type="hidden" name="return_to" value={returnToHighlightItem(order)} />
                  <input type="hidden" name="matchday_id" value={matchday.id} />
                  <input type="hidden" name="target" value="highlight" />
                  <input type="hidden" name="sort_order" value={order} />
                  <div className="editorial-admin-field">
                    <label htmlFor={`highlight-${order}-image-upload`}>Carregar imagem do destaque {order}</label>
                    <input accept="image/jpeg,image/png,image/webp" id={`highlight-${order}-image-upload`} name="image" type="file" />
                  </div>
                  <button className="editorial-admin-button secondary" type="submit">
                    Carregar imagem
                  </button>
                </form>
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
            <details className="editorial-admin-item-details" id={itemAnchor}>
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
                  <label htmlFor={`roundup-${order}-label`}>Etiqueta</label>
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
                  <label htmlFor={`roundup-${order}-subtitle`}>Descricao</label>
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
                  <summary>Thumbnail / imagem avancado</summary>
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
          <legend>Modo da zona</legend>
          <div className="editorial-admin-grid two">
            <div className="editorial-admin-field">
              <label htmlFor="latest-zone-mode">Modo da zona</label>
              <select id="latest-zone-mode" name="latest_zone_mode" defaultValue={latestZoneMode}>
                <option value="latest_news">Ultimas noticias</option>
                <option value="editorial_line">Linha editorial</option>
              </select>
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="latest-zone-title">Titulo publico da zona</label>
              <input
                id="latest-zone-title"
                name="latest_zone_title"
                defaultValue={editorial?.latest_zone_title ?? ""}
                placeholder={latestZoneMode === "latest_news" ? "Principais acontecimentos" : "Pode ficar vazio"}
              />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="latest-zone-title-color">Cor do titulo publico da zona</label>
              <input
                id="latest-zone-title-color"
                name="latest_zone_title_color"
                defaultValue={editorial?.latest_zone_title_color ?? ""}
                placeholder="#0b1f3a"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
          </div>
          <button className="editorial-admin-button secondary" type="submit">
            Guardar modo da zona
          </button>
        </fieldset>
      </form>
      <div className="editorial-admin-compact-stack">
        {LATEST_NEWS_EDITOR_SORT_ORDERS.map((order) => {
          const item = latestNews.find((newsItem) => newsItem.sort_order === order);
          const itemKey = `latest-news-${paddedOrder(order)}`;
          const itemAnchor = `latest-news-item-${paddedOrder(order)}`;
          return (
            <form action="/api/admin/gestor" className="editorial-admin-form editorial-admin-item-form" data-latest-news-card={order} key={order} method="post">
              <input type="hidden" name="action_type" value="save_matchday_latest_news_item" />
              <input type="hidden" name="return_to" value={returnToLatestNewsItem(order)} />
              <input type="hidden" name="matchday_id" value={matchday.id} />
              <details className="editorial-admin-item-details" id={itemAnchor}>
                <summary>
                  <span className="editorial-admin-item-summary-title">{itemSummaryTitle(order, item?.title, "Rascunho vazio")}</span>
                  <span className="editorial-admin-item-status">{item?.status === "published" ? "Publicado" : "Rascunho"}</span>
                </summary>
                <div className="editorial-admin-item-details-body">
                  {itemMessageFor("ultimas-noticias", itemKey, latestNewsErrorDetail)}
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
                    <input id={`latest-news-${order}-time-label-color`} name="latest_news_time_label_color" defaultValue={item?.time_label_color ?? ""} placeholder="#c40000" pattern="^#[0-9A-Fa-f]{6}$" />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor={`latest-news-${order}-title`}>Titulo</label>
                    <input id={`latest-news-${order}-title`} name="latest_news_title" defaultValue={item?.title ?? ""} placeholder="Titulo curto da noticia" />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor={`latest-news-${order}-subtitle`}>Subtitulo / resumo</label>
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
                    <legend>Ligar fonte publicada</legend>
                    <div className="editorial-admin-field">
                      <label htmlFor={`latest-news-${order}-article-source`}>Preencher com fonte publicada</label>
                      <select id={`latest-news-${order}-article-source`} data-latest-news-article-select defaultValue="">
                        <option value="">Escolher fonte publicada</option>
                        {publishedSources.map((source) => (
                          <option
                            key={`${source.source_type}-${source.source_id}`}
                            value={`${source.source_type}:${source.source_id}`}
                            data-latest-news-title={cleanText(source.title)}
                            data-latest-news-subtitle={publishedSourceComplementText(source)}
                            data-latest-news-image-url={publishedSourceComplementImageUrl(source)}
                            data-latest-news-link-url={cleanText(source.link_url)}
                          >
                            {publishedSourceOptionLabel(source)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="editorial-admin-muted">
                      Ao escolher uma fonte, este item recebe titulo, subtitulo, imagem e link interno. Pode ajustar manualmente antes de guardar.
                    </p>
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
                  setLatestNewsField('article_id', '');
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
          <a className="editorial-admin-button secondary" href="/admin/editorial/artigos">
            Artigos / Notícias
          </a>
          <a className="editorial-admin-button secondary" href="/admin/editorial/conteudos">
            CONTEÚDOS / AUDIOVISUAL
          </a>
          <a className="editorial-admin-button secondary" href={`/admin/editorial/composicao/${encodeURIComponent(matchday.id)}`}>
            Composição Editorial
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

      <nav className="editorial-admin-block-nav" aria-label="Navegacao interna da Editorial da Jornada">
        <a href="#composicao">Abaixo da manchete</a>
        <a href="#faixa-horizontal">Faixa horizontal</a>
        <a href="#ultimas-noticias">Zona Final</a>
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

      {feedbackScope ? null : messageFor(created, error)}

      <div className="editorial-admin-grid">
        <section className="editorial-admin-panel" id="manchete">
          <header>
            <h2>Manchete viva da jornada</h2>
            <p>Fonte viva da atualidade desta jornada. Estes campos gravam em matchday_editorials.</p>
            {publishedReferenceComposition ? (
              <div className="editorial-admin-live-note warning">
                <strong>Composicao publicada/current detetada.</strong>
                <span>A pagina publica pode estar a usar a composicao publicada em vez destes campos vivos.</span>
              </div>
            ) : (
              <div className="editorial-admin-live-note">
                <strong>Sem composicao publicada/current ativa.</strong>
                <span>A pagina publica usa esta manchete viva quando estiver publicada.</span>
              </div>
            )}
          </header>
          {scopedMessageFor(created, error, feedbackScope, "manchete")}
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
              <label htmlFor="matchday-editorial-summary">Resumo curto</label>
              <textarea
                id="matchday-editorial-summary"
                name="summary"
                defaultValue={editorial?.summary ?? ""}
                placeholder="Resumo editorial curto da jornada."
              />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="matchday-editorial-title-color">Cor do titulo</label>
              <input
                id="matchday-editorial-title-color"
                name="title_color"
                defaultValue={editorial?.title_color ?? ""}
                placeholder="#e5252a"
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
              <legend>Ligar fonte publicada à manchete</legend>
              <div className="editorial-admin-field">
                <label htmlFor="headline-article-source">Preencher manchete com fonte publicada</label>
                <select id="headline-article-source" data-headline-article-select defaultValue="">
                  <option value="">Escolher fonte publicada</option>
                  {publishedSources.map((source) => (
                    <option
                      key={`${source.source_type}-${source.source_id}`}
                      value={`${source.source_type}:${source.source_id}`}
                      data-headline-title={cleanText(source.title)}
                      data-headline-summary={publishedSourceComplementText(source)}
                      data-headline-image-url={publishedSourceComplementImageUrl(source)}
                      data-headline-link-url={cleanText(source.link_url)}
                    >
                      {publishedSourceOptionLabel(source)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="editorial-admin-muted">
                Preenche titulo, resumo, imagem e link interno. Pode ajustar antes de guardar.
              </p>
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
        </section>

        <aside className="editorial-admin-panel" id="bloco-lateral">
          <header>
            <h2>Bloco lateral / fonte viva</h2>
            <p>Chamada editorial independente da manchete viva.</p>
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
              <input id="side-block-label-color" name="side_block_label_color" defaultValue={editorial?.side_block_label_color ?? ""} placeholder="#c40000" pattern="^#[0-9A-Fa-f]{6}$" />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-title">Titulo</label>
              <input id="side-block-title" name="side_block_title" defaultValue={editorial?.side_block_title ?? ""} placeholder="A jornada que muda expectativas" />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-title-color">Cor do titulo</label>
              <input id="side-block-title-color" name="side_block_title_color" defaultValue={editorial?.side_block_title_color ?? ""} placeholder="#0b1f3a" />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-author">Autor, opcional</label>
              <input id="side-block-author" name="side_block_author" defaultValue={editorial?.side_block_author ?? ""} placeholder="Silvestre Chicharo" />
            </div>
            <div className="editorial-admin-field">
              <label htmlFor="side-block-text">Texto / excerto</label>
              <textarea id="side-block-text" name="side_block_text" defaultValue={editorial?.side_block_text ?? ""} placeholder="Texto curto para a chamada editorial lateral." />
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
              <legend>Ligar fonte publicada ao bloco lateral</legend>
              <div className="editorial-admin-field">
                <label htmlFor="side-block-article-source">Preencher bloco lateral com fonte publicada</label>
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
              <p className="editorial-admin-muted">
                Preenche os campos do bloco lateral. Podes ajustar antes de guardar.
              </p>
            </fieldset>
            <button className="editorial-admin-button" type="submit">
              Guardar bloco lateral
            </button>
          </form>
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
        </aside>
      </div>

      <section className="editorial-admin-panel editorial-admin-composition" id="composicao">
        <header>
          <h2>Composicao abaixo da manchete</h2>
          <p>Controla os dois espacos editoriais que aparecem por baixo da manchete na primeira pagina.</p>
        </header>
        {scopedMessageFor(created, error, feedbackScope, "composicao")}
        <div data-composition-form>
          <div className="editorial-admin-composition-grid">
              <div className="editorial-admin-composition-card">
                <h3>Zona abaixo da manchete</h3>
                <p>Escolhe que conjunto ocupa a area inferior esquerda da composicao.</p>
                <form className="editorial-admin-form" action="/api/admin/gestor" data-below-mode-form id={belowHeadlineSettingsFormId} method="post">
                <input type="hidden" name="action_type" value="save_matchday_below_headline" />
                <input type="hidden" name="return_to" value={returnToComposicao} />
                <input type="hidden" name="matchday_id" value={matchday.id} />
                <div className="editorial-admin-field">
                  <label htmlFor="composition-below-headline-mode">Tipo de conteudo abaixo da manchete</label>
                  <select id="composition-below-headline-mode" name="below_headline_mode" defaultValue={belowHeadlineMode}>
                    <option value="highlights">Destaques abaixo da manchete</option>
                    <option value="roundup">Resumo da Jornada</option>
                  </select>
                </div>
                <button className="editorial-admin-button" type="submit">
                  Guardar escolha
                </button>
              </form>
              <div className="editorial-below-mode-section" data-below-section="highlights" hidden={belowHeadlineMode !== "highlights"} id="destaques">
                <h4>Destaques abaixo da manchete</h4>
                <p className="editorial-admin-muted">Edita os tres destaques editoriais desta zona e o texto superior que aparece no publico.</p>
                <div className="editorial-admin-compact-stack">
                  <div className="editorial-admin-field">
                    <label htmlFor="below-headline-heading">Texto do topo</label>
                    <input form={belowHeadlineSettingsFormId} id="below-headline-heading" name="below_headline_heading" defaultValue={editorial?.below_headline_heading ?? ""} placeholder={belowHeadlineHeadingFallback} />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="below-headline-subtitle">Subtitulo da zona abaixo da manchete</label>
                    <input form={belowHeadlineSettingsFormId} id="below-headline-subtitle" name="below_headline_subtitle" defaultValue={editorial?.below_headline_subtitle ?? ""} placeholder="Linha de apoio opcional para os destaques" />
                  </div>
                  <div className="editorial-admin-field">
                    <label htmlFor="below-headline-heading-color">Cor do texto do topo</label>
                    <input form={belowHeadlineSettingsFormId} id="below-headline-heading-color" name="below_headline_heading_color" defaultValue={editorial?.below_headline_heading_color ?? ""} placeholder="#0b1f3a" />
                  </div>
                  <button className="editorial-admin-button secondary" form={belowHeadlineSettingsFormId} type="submit">
                    Guardar texto do topo
                  </button>
                  <p className="editorial-admin-muted">Se ficarem vazios, a pagina publica usa {belowHeadlineHeadingFallback} e a cor atual.</p>
                </div>
                {scopedMessageFor(created, error, feedbackScope, "destaques")}
                {highlightsEditor}
              </div>
              <div className="editorial-below-mode-section" data-below-section="roundup" hidden={belowHeadlineMode !== "roundup"} id="resumo-jornada">
                <h4>Resumo da Jornada</h4>
                <p className="editorial-admin-muted">Edita ate dez entradas para videos, golos, resumos ou noticias da jornada.</p>
                {scopedMessageFor(created, error, feedbackScope, "resumo-jornada")}
                {roundupEditor}
              </div>
              {[1, 2, 3, 4].map((order) => (
                <form
                  action="/api/admin/gestor"
                  className="editorial-admin-hidden-form"
                  id={`matchday-horizontal-news-form-${order}`}
                  key={`matchday-horizontal-news-form-${order}`}
                  method="post"
                />
              ))}
              <EditorialHorizontalNewsEditor
                id="faixa-horizontal"
                description="Publica ate quatro noticias entre o conteudo editorial e a classificacao. Sem noticias publicadas, a faixa desaparece por completo."
                tableName="matchday_horizontal_news"
                items={horizontalNews.map((item) => ({
                  id: item.id,
                  sortOrder: item.sort_order,
                  label: item.label,
                  title: item.title,
                  subtitle: item.subtitle,
                  imageUrl: item.image_url,
                  linkUrl: item.link_url,
                  status: item.status
                }))}
                sources={horizontalNewsSources}
                formIdForOrder={(order) => `matchday-horizontal-news-form-${order}`}
                hiddenFieldsForOrder={(order) => [
                  { name: "action_type", value: "save_matchday_horizontal_news_item" },
                  { name: "return_to", value: returnToHorizontalNewsItem(order) },
                  { name: "matchday_id", value: matchday.id }
                ]}
                messageForOrder={(order) =>
                  itemMessageFor("faixa-horizontal", `horizontal-news-${paddedOrder(order)}`, horizontalNewsErrorDetail)
                }
                openOrder={horizontalNewsOpenOrder}
              />
            </div>

            <div className="editorial-admin-composition-side-stack">
              <div className="editorial-admin-composition-card">
                <h3>Complemento da Manchete</h3>
                <p>Bloco complementar da fonte viva, separado da manchete principal.</p>
                <form className="editorial-admin-form" action="/api/admin/gestor" data-complementary-form method="post" id="bloco-complementar">
                  {scopedMessageFor(created, error, feedbackScope, "bloco-complementar")}
                  <input type="hidden" name="action_type" value="save_matchday_complement" />
                  <input type="hidden" name="return_to" value={returnToComplementar} />
                  <input type="hidden" name="matchday_id" value={matchday.id} />
                  <div className="editorial-admin-field">
                    <label htmlFor="complementary-mode">Tipo de bloco complementar</label>
                    <select id="complementary-mode" name="complementary_mode" defaultValue={complementaryMode}>
                      <option value="none">Nenhum</option>
                      <option value="complementary_story">Complemento da manchete</option>
                      <option value="roundup_video">Video do Resumo da Jornada</option>
                    </select>
                  </div>
                  <div className="editorial-complement-mode-section" data-complementary-section="none" hidden={complementaryMode !== "none"}>
                    <p className="editorial-admin-muted">O Bloco complementar fica desativado na pagina publica.</p>
                  </div>
                  <div className="editorial-complement-mode-section" data-complementary-section="roundup_video" hidden={complementaryMode !== "roundup_video"}>
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
                      <p className="editorial-admin-muted">Este modo usa a lista publicada do Resumo da Jornada. O visitante escolhe o video na pagina publica; este campo apenas define o primeiro item, se precisares.</p>
                    </div>
                    <div className="editorial-admin-field">
                      <label htmlFor="roundup-video-heading">Titulo da lista / Cabecalho do resumo</label>
                      <input id="roundup-video-heading" name="roundup_video_heading" defaultValue={editorial?.roundup_video_heading ?? ""} placeholder={roundupVideoHeadingFallback} />
                      <p className="editorial-admin-muted">Se ficar vazio, a pagina publica usa automaticamente: {roundupVideoHeadingFallback}</p>
                    </div>
                    <div className="editorial-admin-field">
                      <label htmlFor="roundup-video-heading-color">Cor do cabecalho</label>
                      <input id="roundup-video-heading-color" name="roundup_video_heading_color" defaultValue={editorial?.roundup_video_heading_color ?? ""} placeholder="#003f8f" />
                      <p className="editorial-admin-muted">Se ficar vazio, mantém a cor atual da pagina publica.</p>
                    </div>
                  </div>
                  <div className="editorial-complement-mode-section" data-complementary-section="complementary_story" hidden={complementaryMode !== "complementary_story"}>
                    <input type="hidden" name="complementary_roundup_item_id" value={editorial?.complementary_roundup_item_id ?? ""} />
                    <div className="editorial-admin-field">
                      <label htmlFor="complementary-label">Antetitulo / etiqueta</label>
                      <input id="complementary-label" name="complementary_label" defaultValue={editorial?.complementary_label ?? ""} placeholder="DESTAQUE" />
                    </div>
                    <div className="editorial-admin-field">
                      <label htmlFor="complementary-title">Titulo</label>
                      <input id="complementary-title" name="complementary_title" defaultValue={editorial?.complementary_title ?? ""} placeholder="Um detalhe editorial para acompanhar a manchete" />
                    </div>
                    <div className="editorial-admin-field">
                      <label htmlFor="complementary-text">Texto curto / conteudo breve</label>
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
                      <legend>Ligar fonte publicada ao complemento</legend>
                      <div className="editorial-admin-field">
                        <label htmlFor="complementary-article-source">Preencher complemento com fonte publicada</label>
                        <select id="complementary-article-source" data-complementary-article-select defaultValue="">
                          <option value="">Escolher fonte publicada</option>
                          {publishedSources.map((source) => (
                            <option
                              key={`${source.source_type}-${source.source_id}`}
                              value={`${source.source_type}:${source.source_id}`}
                              data-complementary-label={publishedSourceComplementLabel(source)}
                              data-complementary-title={cleanText(source.title)}
                              data-complementary-text={publishedSourceComplementText(source)}
                              data-complementary-image-url={publishedSourceComplementImageUrl(source)}
                              data-complementary-link-url={cleanText(source.link_url)}
                            >
                              {publishedSourceOptionLabel(source)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="editorial-admin-muted">
                        Preenche etiqueta, titulo, texto, imagem e link publico. Pode ajustar antes de guardar.
                      </p>
                    </fieldset>
                    <div className="editorial-admin-field">
                      <label htmlFor="complementary-status">Estado</label>
                      <select id="complementary-status" name="complementary_status" defaultValue={editorial?.complementary_status ?? "draft"}>
                        <option value="draft">Rascunho</option>
                        <option value="published">Publicado</option>
                      </select>
                    </div>
                  </div>
                  <button className="editorial-admin-button" type="submit">
                    Guardar bloco complementar
                  </button>
                </form>
              </div>

              <section className="editorial-admin-composition-card" id="ultimas-noticias">
                <h3>Zona editorial final</h3>
                <p>Escolhe entre atualidade e Linha editorial. Em Linha editorial, podes publicar cartoes com imagem, titulo, subtitulo e link.</p>
                {scopedMessageFor(created, error, feedbackScope, "ultimas-noticias", latestNewsErrorDetail)}
                {latestNewsEditor}
              </section>
            </div>
          </div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var form = document.querySelector('[data-composition-form]');
                if (!form) return;
                var belowSelect = form.querySelector('[name="below_headline_mode"]');
                var complementSelect = form.querySelector('[data-complementary-form] [name="complementary_mode"]');
                var complementArticleSelect = form.querySelector('[data-complementary-article-select]');
                var belowSections = Array.prototype.slice.call(form.querySelectorAll('[data-below-section]'));
                var sections = Array.prototype.slice.call(form.querySelectorAll('[data-complementary-section]'));
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
                function syncBelowSections() {
                  var mode = belowSelect ? belowSelect.value : 'highlights';
                  belowSections.forEach(function (section) {
                    section.hidden = section.getAttribute('data-below-section') !== mode;
                  });
                }
                function syncComplementSections() {
                  var mode = complementSelect ? complementSelect.value : 'none';
                  sections.forEach(function (section) {
                    section.hidden = section.getAttribute('data-complementary-section') !== mode;
                  });
                }
                function syncComplementWithBelowMode() {
                  if (!belowSelect || !complementSelect) {
                    syncBelowSections();
                    return;
                  }
                  complementSelect.value = belowSelect.value === 'roundup' ? 'roundup_video' : 'complementary_story';
                  syncBelowSections();
                  syncComplementSections();
                }
                if (belowSelect) belowSelect.addEventListener('change', syncComplementWithBelowMode);
                if (complementSelect) complementSelect.addEventListener('change', syncComplementSections);
                if (complementArticleSelect) complementArticleSelect.addEventListener('change', applyComplementArticle);
                syncBelowSections();
                syncComplementSections();
              })();
            `
          }}
        />
      </section>
    </main>
  );
}
