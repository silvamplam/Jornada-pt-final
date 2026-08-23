import { fetchSupabaseAdminTable } from "@/lib/supabase";
import { getEditorialArticleEditorData } from "@/lib/redacao-automatica/editorial-article-editor-repository-internal";
import { getEditorialArticleById } from "@/lib/redacao-automatica/editorial-article-editor-repository";

import {
  ArticleEditorForm,
  CompetitionOption,
  EditorialArticle,
  MatchdayOption,
  SeasonOption,
  editorialArticleAdminStyles,
  firstText,
  formatShortDate,
} from "./_articleForm";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    articleId?: string;
    mode?: string;
    error?: string;
    saved?: string;
    published?: string;
    placement?: string;
    placement_error?: string;
    created?: string;
    removed?: string;
    link_removed?: string;
    dossier_plan_generation?: string;
    detail?: string;
  }>;
};

type ContextOptions = {
  competitions: CompetitionOption[];
  seasons: SeasonOption[];
  matchdays: MatchdayOption[];
};

type ArticleContextSummary = {
  competitionId: string | null;
  seasonId: string | null;
  matchdayId: string | null;
  competitionLabel: string;
  seasonLabel: string;
  matchdayLabel: string;
  scopeLabel: string;
  stateLabel: string;
};

type ArticleSidebarItem = {
  article: EditorialArticle;
  articleContext: ArticleContextSummary;
  articleDate: string;
  isSelected: boolean;
};

type ArticleSidebarMatchdayGroup = {
  key: string;
  label: string;
  articles: ArticleSidebarItem[];
};

type ArticleSidebarSeasonGroup = {
  key: string;
  label: string;
  matchdayGroups: ArticleSidebarMatchdayGroup[];
};

type ArticleSidebarCompetitionGroup = {
  key: string;
  label: string;
  seasonGroups: ArticleSidebarSeasonGroup[];
};

type LinkPlacement = {
  area: string;
  position: string;
  detail?: string;
  contextLabel?: string;
  table: string;
  recordId: string;
  field: string;
  currentUrl: string;
  matchdayId?: string | null;
};

async function readEditorialArticles() {
  try {
    const articles = await fetchSupabaseAdminTable<EditorialArticle>(
      "editorial_articles?select=id,slug,title,subtitle,label,author,status,scope,image_url,published_at,created_at,updated_at,competition_id,season_id,matchday_id&order=published_at.desc.nullslast,created_at.desc.nullslast&limit=100",
    );

    return { articles, error: null as string | null };
  } catch (error) {
    return {
      articles: [] as EditorialArticle[],
      error: error instanceof Error ? error.message : "Não foi possível ler os artigos editoriais.",
    };
  }
}

async function loadContextOptions() {
  const [competitions, seasons, matchdays] = await Promise.all([
    fetchSupabaseAdminTable<CompetitionOption>("competitions?select=id,name,slug,is_active&order=name.asc"),
    fetchSupabaseAdminTable<SeasonOption>("seasons?select=id,competition_id,label,starts_on,ends_on,is_current&order=label.desc"),
    fetchSupabaseAdminTable<MatchdayOption>("matchdays?select=id,season_id,number,label,starts_on,ends_on,status&order=number.asc"),
  ]);

  return { competitions, seasons, matchdays };
}

function pageMessage(params: Awaited<NonNullable<PageProps["searchParams"]>>) {
  if (params.created) {
    return "Artigo criado.";
  }
  if (params.saved) {
    return "Alterações guardadas.";
  }
  if (params.published) {
    if (params.placement_error) {
      return "Artigo publicado, mas a colocação editorial escolhida não foi aplicada. O artigo continua disponível para colocação manual.";
    }

    const placementMessages: Record<string, string> = {
      none: "Artigo publicado sem colocação editorial. O artigo continua disponível para colocação manual.",
      headline: "Artigo publicado e colocado na Manchete.",
      highlight: "Artigo publicado e colocado nas 3 notícias abaixo da manchete.",
      editorial_line_item: "Artigo publicado e colocado em Últimas.",
      complement: "Artigo publicado na Notícia ao lado do vídeo.",
      important_item: "Artigo publicado na Faixa de notícias.",
    };

    return placementMessages[params.placement ?? ""] ?? "Artigo publicado. O endereço público já está disponível.";
  }
  if (params.removed) {
    return "Artigo removido.";
  }
  if (params.link_removed) {
    return "Ligação removida.";
  }
  if (params.dossier_plan_generation === "generated") {
    return "Notícia preparada para revisão com imagem, título, pós-título e corpo. Revê tudo antes de publicar.";
  }
  if (params.dossier_plan_generation === "reused") {
    return "A primeira versão já existia. Foi aberto o mesmo rascunho editorial.";
  }
  if (params.dossier_plan_generation === "in_progress") {
    return "A primeira versão já está a ser gerada por outro pedido. Este é o mesmo rascunho e não foi iniciada uma segunda geração.";
  }

  const messages: Record<string, string> = {
    "invalid-action": "A ação pedida não existe.",
    "missing-title": "Indica um título para o artigo.",
    "missing-slug": "Indica um endereço ou deixa que seja gerado a partir do título.",
    "duplicate-slug": "Já existe um artigo com esse endereço.",
    "invalid-context": "A competição, época e jornada escolhidas não pertencem ao mesmo contexto.",
    "invalid-published-at": "A data de publicação não é válida.",
    "missing-ante-title": "O artigo precisa de antetítulo antes de poder ser publicado.",
    "missing-author": "O artigo precisa de autor antes de poder ser publicado.",
    "missing-post-title": "O artigo precisa de pós-título antes de poder ser publicado.",
    "context-post-title-too-long": "O pós-título destinado a Contexto não pode ultrapassar 500 caracteres.",
    "invalid-editorial-destination": "O destino editorial indicado para o artigo não é válido.",
    "missing-body": "O artigo precisa de texto antes de poder ser publicado.",
    "missing-image": "O artigo precisa de imagem antes de poder ser publicado.",
    "missing-service": "Não foi possível aceder ao serviço editorial.",
    "missing-article": "O artigo selecionado já não existe.",
    "delete-not-confirmed": "Confirme a remoção antes de apagar o artigo.",
    "invalid-link-target": "A ligação pedida não é permitida.",
    "missing-link-target": "A ligação pedida já não existe.",
    "link-mismatch": "A ligação atual já não aponta para este artigo.",
    "link-removed": "Ligação removida.",
    "article-has-links": "Este artigo ainda está ligado a zonas editoriais. Remova primeiro as ligações em Ligado em antes de apagar.",
    "required-field": "Falta preencher um campo obrigatório.",
    constraint: "Os dados introduzidos não cumprem uma regra editorial.",
    permission: "Não existem permissões para concluir esta ação.",
    "supabase-error": "Não foi possível guardar o artigo.",
    "save-failed": "Não foi possível gravar o artigo.",
  };

  if (!params.error) {
    return null;
  }

  return messages[params.error] ?? "Não foi possível gravar o artigo.";
}

const articleContextLinkStyles = `
  .article-admin-sidebar-context {
    display: block;
    overflow: hidden;
    color: #4b5563;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .article-admin-sidebar-groups {
    display: grid;
    gap: 10px;
  }

  .article-admin-sidebar-group,
  .article-admin-sidebar-subgroup,
  .article-admin-sidebar-leaf {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #ffffff;
  }

  .article-admin-sidebar-subgroup,
  .article-admin-sidebar-leaf {
    margin-top: 8px;
  }

  .article-admin-sidebar-group summary,
  .article-admin-sidebar-subgroup summary,
  .article-admin-sidebar-leaf summary {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 9px 11px;
    color: #111827;
    cursor: pointer;
    font-size: 12px;
    font-weight: 900;
  }

  .article-admin-sidebar-subgroup summary {
    color: #374151;
    font-size: 11px;
  }

  .article-admin-sidebar-leaf summary {
    color: #4b5563;
    font-size: 11px;
  }

  .article-admin-sidebar-count {
    flex: 0 0 auto;
    color: #6b7280;
    font-size: 10px;
    font-weight: 800;
  }

  .article-admin-sidebar-list.is-nested {
    padding: 0 8px 8px;
  }

  .article-admin-diagnostic {
    display: grid;
    gap: 16px;
    padding: 18px 22px;
    border-bottom: 1px solid #e5e7eb;
    background: #fbfdff;
  }

  .article-admin-diagnostic-header {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }

  .article-admin-diagnostic-header h3 {
    margin: 0;
    color: #111827;
    font-size: 15px;
  }

  .article-admin-public-link {
    color: #1d4ed8;
    font-size: 12px;
    font-weight: 850;
    text-decoration: none;
  }

  .article-admin-public-link:hover {
    text-decoration: underline;
  }

  .article-admin-context-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .article-admin-context-card {
    display: grid;
    gap: 5px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 9px;
    background: #ffffff;
  }

  .article-admin-context-card span {
    color: #6b7280;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .article-admin-context-card strong {
    overflow: hidden;
    color: #111827;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .article-admin-link-list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .article-admin-link-item {
    display: grid;
    gap: 4px;
    padding: 11px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 9px;
    background: #ffffff;
  }

  .article-admin-link-item strong {
    color: #111827;
    font-size: 13px;
  }

  .article-admin-link-item span {
    color: #4b5563;
    font-size: 12px;
    line-height: 1.35;
  }

  .article-admin-link-context {
    color: #1f2937 !important;
    font-weight: 800;
  }

  .article-admin-link-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }

  .article-admin-link-source {
    color: #6b7280 !important;
    font-family: Consolas, "Liberation Mono", monospace;
    font-size: 11px !important;
  }

  .article-admin-remove-link-form {
    margin: 0;
  }

  .article-admin-remove-link-form button {
    min-height: 32px;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 0 10px;
    background: #fff7f7;
    color: #991b1b;
    font-size: 12px;
    font-weight: 850;
    cursor: pointer;
  }

  .article-admin-remove-link-form button:hover {
    border-color: #fca5a5;
    background: #fee2e2;
  }

  .article-admin-empty-note {
    margin: 0;
    padding: 12px;
    border: 1px dashed #cbd5e1;
    border-radius: 9px;
    background: #ffffff;
    color: #64748b;
    font-size: 13px;
    line-height: 1.45;
  }

  .article-admin-linked-removal {
    display: block;
  }

  .article-admin-linked-removal-copy {
    width: 100%;
  }

  .article-admin-linked-removal-list {
    margin-top: 12px;
  }

  .article-admin-linked-removal .article-admin-link-item {
    border-color: #fecaca;
  }

  .article-admin-linked-removal .article-admin-link-item > strong {
    margin: 0;
    color: #111827;
  }

  .article-admin-linked-removal .article-admin-link-item span {
    color: #4b5563;
  }

  .article-admin-linked-removal .article-admin-remove-link-form {
    margin-top: 5px;
  }

  .article-admin-linked-removal-note {
    margin-top: 10px !important;
    font-size: 13px;
  }
  @media (max-width: 900px) {
    .article-admin-context-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 560px) {
    .article-admin-context-grid {
      grid-template-columns: 1fr;
    }
  }
  .editorial-admin-more-navigation {
    position: relative;
  }

  .editorial-admin-more-navigation summary {
    cursor: pointer;
    list-style: none;
  }

  .editorial-admin-more-navigation summary::-webkit-details-marker {
    display: none;
  }

  .editorial-admin-more-navigation > div {
    position: absolute;
    z-index: 10;
    top: calc(100% + 8px);
    right: 0;
    display: grid;
    min-width: 220px;
    gap: 6px;
    padding: 10px;
    border: 1px solid #334155;
    border-radius: 10px;
    background: #111827;
    box-shadow: 0 14px 35px rgb(15 23 42 / 28%);
  }

  .editorial-admin-more-navigation > div a {
    display: block;
  }

  .article-admin-public-pending {
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  .article-admin-link-technical {
    margin-left: auto;
    color: #64748b;
    font-size: 11px;
  }

  .article-admin-link-technical summary {
    cursor: pointer;
    font-weight: 800;
  }

  .article-admin-link-technical span {
    display: block;
    margin-top: 6px;
  }

  .article-admin-error-technical {
    margin: -10px 0 18px;
    padding: 10px 12px;
    border: 1px solid #fecaca;
    border-radius: 8px;
    background: #fff7f7;
    color: #7f1d1d;
    font-size: 12px;
  }

  .article-admin-error-technical summary {
    cursor: pointer;
    font-weight: 900;
  }

  .article-admin-error-technical code {
    display: block;
    margin-top: 8px;
    white-space: normal;
  }

  .editorial-admin-more-navigation > summary {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 0 14px;
    background: #fff;
    color: #111827;
    font-size: 13px;
    font-weight: 700;
  }

  .editorial-admin-header > div:first-child {
    flex: 1 1 560px;
    min-width: 0;
  }

  .editorial-admin-header-actions {
    display: flex;
    flex: 0 1 auto;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
    margin-left: auto;
  }

  .editorial-admin-header-actions > a,
  .editorial-admin-header-actions > .editorial-admin-more-navigation > summary {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.34);
    border-radius: 8px;
    padding: 0 14px;
    background: transparent;
    color: #ffffff;
    font-size: 13px;
    font-weight: 800;
    line-height: 1;
    text-decoration: none;
    white-space: nowrap;
  }

  .editorial-admin-header-actions > a:hover,
  .editorial-admin-header-actions > .editorial-admin-more-navigation > summary:hover {
    border-color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.08);
  }

  .editorial-admin-header-actions > .editorial-admin-header-primary {
    border-color: #ffffff;
    background: #ffffff;
    color: #10151b;
  }

  .editorial-admin-header-actions > .editorial-admin-header-primary:hover {
    background: #f1f5f9;
    color: #10151b;
  }

  .editorial-admin-header-actions .editorial-admin-more-navigation > div {
    min-width: 230px;
  }

  .editorial-admin-header-actions .editorial-admin-more-navigation > div a {
    display: block;
    border-radius: 7px;
    padding: 9px 10px;
    color: #f8fafc;
    font-size: 13px;
    font-weight: 750;
    text-decoration: none;
  }

  .editorial-admin-header-actions .editorial-admin-more-navigation > div a:hover {
    background: #1f2937;
  }

  @media (max-width: 820px) {
    .editorial-admin-header-actions {
      justify-content: flex-start;
      margin-left: 0;
    }
  }

`;

function statusLabel(status: string | null) {
  if (status === "published") {
    return "Publicado";
  }

  return "Rascunho";
}

function compactId(value?: string | null) {
  if (!value) {
    return "";
  }

  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function publicArticlePath(article: EditorialArticle) {
  const slug = article.slug?.trim();
  return slug ? `/noticias/${encodeURIComponent(slug)}` : null;
}

function readableScope(article: EditorialArticle) {
  if (article.matchday_id) return "Jornada";
  if (article.season_id) return "Epoca";
  if (article.competition_id) return "Competicao";
  return "Home";
}

function readableMatchdayLabel(matchday?: MatchdayOption | null) {
  if (!matchday) {
    return "";
  }

  const numberLabel = typeof matchday.number === "number" ? `Jornada ${String(matchday.number).padStart(2, "0")}` : "";
  return firstText(matchday.label, numberLabel, matchday.id);
}

function resolveArticleContext(article: EditorialArticle, context: ContextOptions): ArticleContextSummary {
  const matchday = article.matchday_id ? context.matchdays.find((item) => item.id === article.matchday_id) ?? null : null;
  const seasonId = matchday?.season_id ?? article.season_id;
  const season = seasonId ? context.seasons.find((item) => item.id === seasonId) ?? null : null;
  const competitionId = season?.competition_id ?? article.competition_id;
  const competition = competitionId ? context.competitions.find((item) => item.id === competitionId) ?? null : null;
  const hasAnyContext = Boolean(article.matchday_id || article.season_id || article.competition_id);

  return {
    competitionId,
    seasonId,
    matchdayId: matchday?.id ?? article.matchday_id ?? null,
    competitionLabel: firstText(competition?.name, competition?.slug) || (hasAnyContext ? "Contexto incompleto" : "Sem competicao associada"),
    seasonLabel: firstText(season?.label) || (hasAnyContext ? "Contexto incompleto" : "Sem epoca associada"),
    matchdayLabel: readableMatchdayLabel(matchday) || (article.matchday_id ? "Contexto incompleto" : "Sem jornada associada"),
    scopeLabel: readableScope(article),
    stateLabel: statusLabel(article.status),
  };
}

function countCompetitionArticles(group: ArticleSidebarCompetitionGroup) {
  return group.seasonGroups.reduce(
    (competitionCount, seasonGroup) =>
      competitionCount +
      seasonGroup.matchdayGroups.reduce((seasonCount, matchdayGroup) => seasonCount + matchdayGroup.articles.length, 0),
    0,
  );
}

function hasSelectedArticle(items: ArticleSidebarItem[]) {
  return items.some((item) => item.isSelected);
}

function matchdayGroupHasSelected(group: ArticleSidebarMatchdayGroup) {
  return hasSelectedArticle(group.articles);
}

function seasonGroupHasSelected(group: ArticleSidebarSeasonGroup) {
  return group.matchdayGroups.some(matchdayGroupHasSelected);
}

function competitionGroupHasSelected(group: ArticleSidebarCompetitionGroup) {
  return group.seasonGroups.some(seasonGroupHasSelected);
}

function findOrCreateCompetitionGroup(groups: ArticleSidebarCompetitionGroup[], item: ArticleSidebarItem) {
  const key = item.articleContext.competitionId ?? "contexto-incompleto";
  let group = groups.find((entry) => entry.key === key);

  if (!group) {
    group = { key, label: item.articleContext.competitionLabel, seasonGroups: [] };
    groups.push(group);
  }

  return group;
}

function findOrCreateSeasonGroup(group: ArticleSidebarCompetitionGroup, item: ArticleSidebarItem) {
  const key = item.articleContext.seasonId ?? "sem-epoca";
  const label = item.articleContext.seasonId ? item.articleContext.seasonLabel : "Sem epoca associada";
  let seasonGroup = group.seasonGroups.find((entry) => entry.key === key);

  if (!seasonGroup) {
    seasonGroup = { key, label, matchdayGroups: [] };
    group.seasonGroups.push(seasonGroup);
  }

  return seasonGroup;
}

function findOrCreateMatchdayGroup(group: ArticleSidebarSeasonGroup, item: ArticleSidebarItem) {
  const key = item.articleContext.matchdayId ?? "sem-jornada";
  const label = item.articleContext.matchdayId ? item.articleContext.matchdayLabel : "Sem jornada associada";
  let matchdayGroup = group.matchdayGroups.find((entry) => entry.key === key);

  if (!matchdayGroup) {
    matchdayGroup = { key, label, articles: [] };
    group.matchdayGroups.push(matchdayGroup);
  }

  return matchdayGroup;
}

function groupArticleSidebarItems(items: ArticleSidebarItem[]) {
  const generalItems: ArticleSidebarItem[] = [];
  const competitionGroups: ArticleSidebarCompetitionGroup[] = [];

  items.forEach((item) => {
    const isGeneral = !item.articleContext.competitionId;

    if (isGeneral) {
      generalItems.push(item);
      return;
    }

    const competitionGroup = findOrCreateCompetitionGroup(competitionGroups, item);
    const seasonGroup = findOrCreateSeasonGroup(competitionGroup, item);
    const matchdayGroup = findOrCreateMatchdayGroup(seasonGroup, item);
    matchdayGroup.articles.push(item);
  });

  return { generalItems, competitionGroups };
}

async function safeRead<T>(query: string) {
  try {
    return await fetchSupabaseAdminTable<T>(query);
  } catch {
    return [] as T[];
  }
}

function placementMatchdayDetail(matchdayId: string | null | undefined, context: ContextOptions) {
  if (!matchdayId) {
    return "";
  }

  const summary = resolveArticleContext(
    {
      id: "",
      slug: null,
      title: null,
      subtitle: null,
      body: null,
      label: null,
      author: null,
      status: null,
      scope: null,
      image_url: null,
      image_caption: null,
      published_at: null,
      created_at: null,
      updated_at: null,
      competition_id: null,
      season_id: null,
      matchday_id: matchdayId,
    },
    context,
  );

  return [summary.competitionLabel, summary.seasonLabel, summary.matchdayLabel].filter(Boolean).join(" / ");
}

async function readArticleLinkPlacements(article: EditorialArticle, context: ContextOptions) {
  const publicPath = publicArticlePath(article);
  if (!publicPath) {
    return { publicPath: null as string | null, placements: [] as LinkPlacement[] };
  }

  type MatchdayEditorialLinkRow = {
    id: string;
    matchday_id: string | null;
    headline_link_url?: string | null;
    complementary_link_url?: string | null;
    side_block_link_url?: string | null;
  };
  type MatchdayHighlightLinkRow = {
    id: string;
    matchday_id: string | null;
    sort_order: number | null;
    title: string | null;
    link_url: string | null;
  };
  type MatchdayLatestLinkRow = {
    id: string;
    matchday_id: string | null;
    sort_order: number | null;
    time_label: string | null;
    title: string | null;
    link_url: string | null;
  };
  type ReferenceItemLinkRow = {
    id: string;
    composition_id: string | null;
    slot_type: string | null;
    source_type: string | null;
    sort_order: number | null;
    title_snapshot: string | null;
    link_url_snapshot: string | null;
  };
  type ReferenceCompositionRow = {
    id: string;
    matchday_id: string | null;
    status: string | null;
    is_current?: boolean | null;
    internal_name?: string | null;
  };
  type SiteEditorialLinkRow = {
    id: string;
    headline_link_url?: string | null;
    complementary_link_url?: string | null;
    side_block_link_url?: string | null;
  };
  type SiteEditorialListLinkRow = {
    id: string;
    sort_order: number | null;
    title: string | null;
    link_url: string | null;
  };

  const encodedPath = encodeURIComponent(publicPath);
  const [
    headlineRows,
    complementaryRows,
    sideRows,
    highlightRows,
    latestRows,
    referenceRows,
    siteHeadlineRows,
    siteComplementaryRows,
    siteSideRows,
    siteHighlightRows,
    siteLatestRows,
  ] = await Promise.all([
    safeRead<MatchdayEditorialLinkRow>(`matchday_editorials?select=id,matchday_id,headline_link_url&headline_link_url=eq.${encodedPath}&limit=50`),
    safeRead<MatchdayEditorialLinkRow>(
      `matchday_editorials?select=id,matchday_id,complementary_link_url&complementary_link_url=eq.${encodedPath}&limit=50`,
    ),
    safeRead<MatchdayEditorialLinkRow>(`matchday_editorials?select=id,matchday_id,side_block_link_url&side_block_link_url=eq.${encodedPath}&limit=50`),
    safeRead<MatchdayHighlightLinkRow>(
      `matchday_highlights?select=id,matchday_id,sort_order,title,link_url&link_url=eq.${encodedPath}&limit=100`,
    ),
    safeRead<MatchdayLatestLinkRow>(
      `matchday_latest_news?select=id,matchday_id,sort_order,time_label,title,link_url&link_url=eq.${encodedPath}&limit=100`,
    ),
    safeRead<ReferenceItemLinkRow>(
      `matchday_reference_composition_items?select=id,composition_id,slot_type,source_type,sort_order,title_snapshot,link_url_snapshot&link_url_snapshot=eq.${encodedPath}&limit=100`,
    ),
    safeRead<SiteEditorialLinkRow>(`site_editorials?select=id,headline_link_url&headline_link_url=eq.${encodedPath}&limit=20`),
    safeRead<SiteEditorialLinkRow>(`site_editorials?select=id,complementary_link_url&complementary_link_url=eq.${encodedPath}&limit=20`),
    safeRead<SiteEditorialLinkRow>(`site_editorials?select=id,side_block_link_url&side_block_link_url=eq.${encodedPath}&limit=20`),
    safeRead<SiteEditorialListLinkRow>(
      `site_editorial_highlights?select=id,sort_order,title,link_url&link_url=eq.${encodedPath}&limit=100`,
    ),
    safeRead<SiteEditorialListLinkRow>(
      `site_editorial_latest_news?select=id,sort_order,title,link_url&link_url=eq.${encodedPath}&limit=100`,
    ),
  ]);

  const compositionIds = Array.from(new Set(referenceRows.map((row) => row.composition_id).filter(Boolean))) as string[];
  const compositionRows =
    compositionIds.length > 0
      ? await safeRead<ReferenceCompositionRow>(
          `matchday_reference_compositions?select=id,matchday_id,status,is_current,internal_name&id=in.(${compositionIds
            .map((id) => encodeURIComponent(id))
            .join(",")})&limit=100`,
        )
      : [];
  const compositionsById = new Map(compositionRows.map((row) => [row.id, row]));
  const placements: LinkPlacement[] = [];
  const pushPlacement = (
    base: {
      area: string;
      position: string;
      table: string;
      recordId: string;
      field: string;
      detail?: string;
      matchdayId?: string | null;
    },
  ) => {
    const contextLabel = placementMatchdayDetail(base.matchdayId, context);

    placements.push({
      area: base.area,
      position: base.position,
      detail: firstText(base.detail) || undefined,
      contextLabel: contextLabel || (base.matchdayId ? "Contexto não resolvido" : undefined),
      table: base.table,
      recordId: base.recordId,
      field: base.field,
      currentUrl: publicPath,
      matchdayId: base.matchdayId,
    });
  };
  const pushMatchdayPlacement = (
    row: { id: string; matchday_id?: string | null },
    area: string,
    position: string,
    table: string,
    field: string,
    detail?: string,
  ) => {
    pushPlacement({
      area,
      position,
      detail,
      table,
      recordId: row.id,
      field,
      matchdayId: row.matchday_id,
    });
  };

  headlineRows.forEach((row) => pushMatchdayPlacement(row, "Editorial da Jornada", "Manchete", "matchday_editorials", "headline_link_url"));
  complementaryRows.forEach((row) =>
    pushMatchdayPlacement(row, "Editorial da Jornada", "Complemento", "matchday_editorials", "complementary_link_url"),
  );
  sideRows.forEach((row) => pushMatchdayPlacement(row, "Editorial da Jornada", "Bloco lateral", "matchday_editorials", "side_block_link_url"));
  highlightRows.forEach((row) =>
    pushMatchdayPlacement(row, "Destaques da Jornada", `Posicao ${row.sort_order ?? "sem ordem"}`, "matchday_highlights", "link_url", row.title ?? undefined),
  );
  latestRows.forEach((row) =>
    pushMatchdayPlacement(
      row,
      "Zona Editorial Final da Jornada",
      row.time_label ? `${row.time_label} / Posicao ${row.sort_order ?? "sem ordem"}` : `Posicao ${row.sort_order ?? "sem ordem"}`,
      "matchday_latest_news",
      "link_url",
      row.title ?? undefined,
    ),
  );
  referenceRows.forEach((row) => {
    const composition = row.composition_id ? compositionsById.get(row.composition_id) : null;
    pushPlacement({
      area: "Composicao Editorial",
      position: firstText(row.slot_type, row.source_type) || "Item",
      detail: firstText(row.title_snapshot, composition?.internal_name, row.composition_id ? `Composicao ${compactId(row.composition_id)}` : null),
      table: "matchday_reference_composition_items",
      recordId: row.id,
      field: "link_url_snapshot",
      matchdayId: composition?.matchday_id ?? null,
    });
  });
  siteHeadlineRows.forEach((row) =>
    pushPlacement({ area: "Home Editorial", position: "Manchete", table: "site_editorials", recordId: row.id, field: "headline_link_url" }),
  );
  siteComplementaryRows.forEach((row) =>
    pushPlacement({ area: "Home Editorial", position: "Complemento", table: "site_editorials", recordId: row.id, field: "complementary_link_url" }),
  );
  siteSideRows.forEach((row) =>
    pushPlacement({ area: "Home Editorial", position: "Bloco lateral", table: "site_editorials", recordId: row.id, field: "side_block_link_url" }),
  );
  siteHighlightRows.forEach((row) =>
    pushPlacement({
      area: "Home Editorial",
      position: `Destaque ${row.sort_order ?? "sem ordem"}`,
      detail: row.title ?? undefined,
      table: "site_editorial_highlights",
      recordId: row.id,
      field: "link_url",
    }),
  );
  siteLatestRows.forEach((row) =>
    pushPlacement({
      area: "Home Editorial",
      position: `Zona Editorial Final ${row.sort_order ?? "sem ordem"}`,
      detail: row.title ?? undefined,
      table: "site_editorial_latest_news",
      recordId: row.id,
      field: "link_url",
    }),
  );

  return { publicPath, placements };
}

export default async function AdminEditorialArticlesPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const [{ articles, error }, context, editorData] = await Promise.all([
    readEditorialArticles(),
    loadContextOptions(),
    getEditorialArticleEditorData(
      params.articleId,
      params.mode,
      getEditorialArticleById,
    ),
  ]);
  const selectedArticle = editorData.article;
  const requestedArticleState = editorData.state;
  const isEditing = Boolean(selectedArticle);
  const canCreate = editorData.request.kind === "absent";
  const message = pageMessage(params);
  const technicalDetail = params.error && params.detail ? params.detail : null;
  const selectedLinkData = selectedArticle ? await readArticleLinkPlacements(selectedArticle, context) : { publicPath: null, placements: [] as LinkPlacement[] };
  const sidebarItems = articles.map((article) => ({
    article,
    articleContext: resolveArticleContext(article, context),
    articleDate: article.status === "published"
      ? firstText(formatShortDate(article.published_at), "Publicado")
      : "Por publicar",
    isSelected: selectedArticle?.id === article.id,
  }));
  const groupedSidebarArticles = groupArticleSidebarItems(sidebarItems);
  const renderSidebarItem = (item: ArticleSidebarItem) => (
    <li key={item.article.id}>
      <a
        className={`article-admin-sidebar-item${item.isSelected ? " is-selected" : ""}`}
        href={`/admin/editorial/artigos?articleId=${encodeURIComponent(item.article.id)}`}
      >
        <span className="article-admin-sidebar-meta">
          <span>{statusLabel(item.article.status)}</span>
          {item.article.label ? <span>{item.article.label}</span> : null}
        </span>
        <strong>{item.article.title ?? "Sem titulo"}</strong>
        {item.articleDate ? (
          <span className="article-admin-sidebar-meta">
            <span>{item.articleDate}</span>
          </span>
        ) : null}
        <span className="article-admin-sidebar-context">
          {item.articleContext.competitionLabel} / {item.articleContext.seasonLabel} / {item.articleContext.matchdayLabel}
        </span>
      </a>
    </li>
  );

  return (
    <main className="editorial-admin-shell">
      <div className="editorial-admin-container">
        <header className="editorial-admin-header editorial-admin-hero">
          <div>
            <h1>Revisão e publicação</h1>
            <p>
              Revê o conteúdo, completa os elementos editoriais e publica apenas quando o artigo estiver validado.
            </p>
          </div>
          <nav className="editorial-admin-header-actions" aria-label="Navegação e ações de artigos">
            <a href="/admin/editorial/redacao-automatica">
              Redação automática
            </a>
            <details className="editorial-admin-more-navigation">
              <summary>Outras áreas</summary>
              <div>
                <a href="/admin">Backoffice</a>
                <a href="/admin/editorial/home">Home Editorial</a>
                <a href="/admin/editorial/conteudos">Vídeo</a>
                <a href="/admin/editorial/composicao">Composição Editorial</a>
                <a href="/admin/editorial/jornada">Editorial da Jornada</a>
                <a href="/admin/gestor">Centro de Gestão</a>
              </div>
            </details>
            <a
              className="editorial-admin-header-primary"
              href="/admin/editorial/artigos?mode=novo"
            >
              Criar artigo manual
            </a>
          </nav>
        </header>

        {message ? <p className="article-admin-alert">{message}</p> : null}
        {technicalDetail ? (
          <details className="article-admin-error-technical">
            <summary>Detalhes técnicos do erro</summary>
            <code>{technicalDetail}</code>
          </details>
        ) : null}

        <div className="article-admin-workspace">
          <aside className="article-admin-sidebar" aria-label="Artigos existentes">
            <div className="article-admin-sidebar-header">
              <h2>Artigos em revisão e publicados</h2>
              <p>{articles.length} artigos disponíveis.</p>
            </div>

            {error ? <p className="article-admin-alert">{error}</p> : null}
            {!error && articles.length === 0 ? <p className="article-admin-sidebar-item">Não há artigos editoriais para apresentar.</p> : null}

            {articles.length > 0 ? (
              <div className="article-admin-sidebar-groups">
                {groupedSidebarArticles.generalItems.length > 0 ? (
                  <details className="article-admin-sidebar-group" open={!selectedArticle || hasSelectedArticle(groupedSidebarArticles.generalItems)}>
                    <summary>
                      <span>Home</span>
                      <span className="article-admin-sidebar-count">{groupedSidebarArticles.generalItems.length}</span>
                    </summary>
                    <ul className="article-admin-sidebar-list is-nested">
                      {groupedSidebarArticles.generalItems.map(renderSidebarItem)}
                    </ul>
                  </details>
                ) : null}

                {groupedSidebarArticles.competitionGroups.map((competitionGroup) => (
                  <details
                    className="article-admin-sidebar-group"
                    key={competitionGroup.key}
                    open={competitionGroupHasSelected(competitionGroup)}
                  >
                    <summary>
                      <span>{competitionGroup.label}</span>
                      <span className="article-admin-sidebar-count">{countCompetitionArticles(competitionGroup)}</span>
                    </summary>
                    {competitionGroup.seasonGroups.map((seasonGroup) => (
                      <details
                        className="article-admin-sidebar-subgroup"
                        key={seasonGroup.key}
                        open={seasonGroupHasSelected(seasonGroup)}
                      >
                        <summary>
                          <span>{seasonGroup.label}</span>
                          <span className="article-admin-sidebar-count">
                            {seasonGroup.matchdayGroups.reduce((total, matchdayGroup) => total + matchdayGroup.articles.length, 0)}
                          </span>
                        </summary>
                        {seasonGroup.matchdayGroups.map((matchdayGroup) => (
                          <details
                            className="article-admin-sidebar-leaf"
                            key={matchdayGroup.key}
                            open={matchdayGroupHasSelected(matchdayGroup)}
                          >
                            <summary>
                              <span>{matchdayGroup.label}</span>
                              <span className="article-admin-sidebar-count">{matchdayGroup.articles.length}</span>
                            </summary>
                            <ul className="article-admin-sidebar-list is-nested">
                              {matchdayGroup.articles.map(renderSidebarItem)}
                            </ul>
                          </details>
                        ))}
                      </details>
                    ))}
                  </details>
                ))}
              </div>
            ) : null}
          </aside>

          <section className="article-admin-editor">
            <div className="article-admin-editor-header">
              <h2>{isEditing ? "Rever artigo" : canCreate ? "Criar artigo manual" : "Artigo pedido"}</h2>
              <p>
                {isEditing
                  ? "Guarda a revisão sem publicar ou usa a ação explícita de publicação quando o texto estiver validado."
                  : canCreate
                    ? "Cria um rascunho manual e publica apenas depois de rever o conteúdo."
                    : "O pedido foi tratado sem abrir o formulário de criação e sem escrever dados."}
              </p>
            </div>

            {requestedArticleState === "invalid" ? (
              <p className="article-admin-alert" role="alert">
                O identificador do artigo é inválido. Confirma a ligação e tenta novamente.
              </p>
            ) : null}
            {requestedArticleState === "not_found" ? (
              <p className="article-admin-alert" role="alert">
                Artigo não encontrado. O identificador é válido, mas não corresponde a nenhum artigo editorial.
              </p>
            ) : null}
            {requestedArticleState === "unavailable" ? (
              <p className="article-admin-alert" role="alert">
                Não foi possível carregar o artigo pedido neste momento.
              </p>
            ) : null}

            {selectedArticle || canCreate ? (
              <ArticleEditorForm
                mode={isEditing ? "edit" : "create"}
                article={selectedArticle}
                competitions={context.competitions}
                seasons={context.seasons}
                matchdays={context.matchdays}
                returnTo={
                  isEditing && selectedArticle
                    ? `/admin/editorial/artigos?articleId=${encodeURIComponent(selectedArticle.id)}`
                    : "/admin/editorial/artigos"
                }
              />
            ) : null}
            {selectedArticle ? (
              selectedLinkData.placements.length > 0 ? (
                <div className="article-admin-delete-form article-admin-linked-removal">
                  <div className="article-admin-linked-removal-copy">
                    <strong>Remover artigo bloqueado</strong>
                    <p>Este artigo está ligado em:</p>

                    <ul className="article-admin-link-list article-admin-linked-removal-list">
                      {selectedLinkData.placements.map((placement, index) => (
                        <li
                          className="article-admin-link-item"
                          key={`${placement.table}-${placement.position}-${index}`}
                        >
                          <strong>
                            {placement.area} — {placement.position}
                          </strong>
                          {placement.contextLabel ? (
                            <span className="article-admin-link-context">
                              {placement.contextLabel}
                            </span>
                          ) : null}
                          {placement.detail ? <span>{placement.detail}</span> : null}

                          <form
                            className="article-admin-remove-link-form"
                            action="/api/admin/editorial/artigos"
                            method="post"
                          >
                            <input type="hidden" name="action_type" value="remove_article_link" />
                            <input type="hidden" name="slug" value={selectedArticle.slug ?? ""} />
                            <input type="hidden" name="target_table" value={placement.table} />
                            <input type="hidden" name="target_id" value={placement.recordId} />
                            <input type="hidden" name="target_field" value={placement.field} />
                            <input type="hidden" name="expected_url" value={placement.currentUrl} />
                            <input
                              type="hidden"
                              name="return_to"
                              value={`/admin/editorial/artigos?articleId=${encodeURIComponent(selectedArticle.id)}`}
                            />
                            <button
                              type="submit"
                              title="Retira o artigo apenas desta zona editorial."
                            >
                              Desvincular
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>

                    <p className="article-admin-linked-removal-note">
                      Depois de desvincular todas as zonas editoriais, a remoção do artigo fica disponível.
                    </p>
                  </div>
                </div>
              ) : (
                <form className="article-admin-delete-form" action="/api/admin/editorial/artigos" method="post">
                  <input type="hidden" name="action_type" value="delete_article" />
                  <input type="hidden" name="article_id" value={selectedArticle.id} />
                  <input type="hidden" name="return_to" value="/admin/editorial/artigos" />
                  <div>
                    <strong>Remover artigo</strong>
                    <p>Remove definitivamente este artigo. O respetivo endereço público deixará de funcionar.</p>
                    <label className="article-admin-delete-confirm">
                      <input name="confirm_delete" type="checkbox" value="yes" required />
                      <span>Confirmo que quero remover este artigo editorial.</span>
                    </label>
                  </div>
                  <button type="submit">Remover artigo</button>
                </form>
              )
            ) : null}
          </section>
        </div>
      </div>

      <style>{editorialArticleAdminStyles}</style>
      <style>{articleContextLinkStyles}</style>
    </main>
  );
}
