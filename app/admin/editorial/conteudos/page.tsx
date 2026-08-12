import Link from "next/link";

import {
  countEditorialCompetitionItems,
  countEditorialSeasonItems,
  editorialCompetitionGroupHasSelected,
  editorialMatchdayGroupHasSelected,
  editorialSeasonGroupHasSelected,
  groupEditorialSidebarItems,
  hasSelectedEditorialItem,
  type EditorialSidebarContext,
  type EditorialSidebarItem,
} from "@/lib/groupEditorialSidebarItems";
import { fetchSupabaseAdminTable } from "@/lib/supabase";

import {
  type EditorialContent,
  type EditorialContentCompetition,
  type EditorialContentMatchday,
  type EditorialContentSeason,
  EditorialContentForm,
  adminEditorialContentsStyles,
  editorialContentsSelect,
  firstText,
  formatDateTime,
} from "./_contentForm";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    status?: string;
    created?: string;
    updated?: string;
    archived?: string;
    saved?: string;
    error?: string;
    contentId?: string;
    mode?: string;
  }>;
};

type ReadEditorialContentsResult = {
  contents: EditorialContent[];
  error: string | null;
};

type ContentContextLookups = {
  competitions: Map<string, string>;
  seasons: Map<string, string>;
  matchdays: Map<string, string>;
  seasonCompetitionIds: Map<string, string | null>;
  matchdaySeasonIds: Map<string, string | null>;
  competitionOptions: EditorialContentCompetition[];
  seasonOptions: EditorialContentSeason[];
  matchdayOptions: EditorialContentMatchday[];
};

type ContentStatusView = "active" | "archived";

const editorialNavigationLinks = [
  { href: "/admin/editorial/home", label: "HOME EDITORIAL" },
  { href: "/admin/editorial/artigos", label: "ARTIGOS / NOTÍCIAS" },
  { href: "/admin/editorial/jornada", label: "EDITORIAL DA JORNADA" },
  { href: "/admin/editorial/composicao", label: "COMPOSIÇÃO EDITORIAL" },
  { href: "/admin/gestor", label: "CENTRO DE GESTÃO" },
  { href: "/admin", label: "BACKOFFICE" },
];

const contentSidebarStyles = `
  .content-admin-header,
  .content-admin-workspace {
    width: min(100%, 1360px);
    max-width: 1360px;
    margin-left: auto;
    margin-right: auto;
  }

  .content-admin-sidebar {
    display: grid;
    gap: 12px;
  }

  .content-admin-workspace {
    display: grid;
    grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
    gap: 22px;
    align-items: start;
    margin-top: 18px;
  }

  .content-admin-sidebar-pane .content-admin-view-tabs {
    width: 100%;
    max-width: none;
    margin: 0 0 14px;
  }

  .content-admin-sidebar-pane,
  .content-admin-detail-panel {
    min-width: 0;
  }

  .content-admin-sidebar-pane {
    position: sticky;
    top: 18px;
    max-height: calc(100vh - 36px);
    overflow: auto;
  }

  .content-admin-sidebar-groups {
    display: grid;
    gap: 10px;
  }

  .content-admin-sidebar-group,
  .content-admin-sidebar-subgroup,
  .content-admin-sidebar-leaf {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
  }

  .content-admin-sidebar-subgroup,
  .content-admin-sidebar-leaf {
    margin: 10px 12px;
  }

  .content-admin-sidebar-group summary,
  .content-admin-sidebar-subgroup summary,
  .content-admin-sidebar-leaf summary {
    display: flex;
    cursor: pointer;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    color: #111827;
    font-size: 13px;
    font-weight: 850;
    list-style: none;
  }

  .content-admin-sidebar-group summary::-webkit-details-marker,
  .content-admin-sidebar-subgroup summary::-webkit-details-marker,
  .content-admin-sidebar-leaf summary::-webkit-details-marker {
    display: none;
  }

  .content-admin-sidebar-count {
    border-radius: 999px;
    background: #f3f4f6;
    padding: 3px 8px;
    color: #4b5563;
    font-size: 11px;
    font-weight: 850;
  }

  .content-admin-sidebar-list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0 12px 12px;
    list-style: none;
  }

  .content-admin-sidebar-item {
    display: grid;
    gap: 5px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
    padding: 10px 12px;
    color: #111827;
    text-decoration: none;
  }

  .content-admin-sidebar-item.is-selected {
    border-color: #111827;
    box-shadow: inset 3px 0 0 #111827;
  }

  .content-admin-sidebar-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    color: #6b7280;
    font-size: 11px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .content-admin-sidebar-item strong {
    font-size: 13px;
    line-height: 1.25;
  }

  .content-admin-sidebar-context {
    color: #4b5563;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.35;
  }

  .content-admin-detail-panel {
    display: grid;
    gap: 14px;
  }

  .content-admin-detail-panel > .content-admin-form {
    width: 100%;
    max-width: none;
    margin: 0;
  }

  .content-admin-detail-heading {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #fff;
    padding: 18px;
  }

  .content-admin-detail-heading h2 {
    margin: 0;
    font-size: 22px;
  }

  .content-admin-detail-heading p {
    margin: 6px 0 0;
    color: #6b7280;
    line-height: 1.45;
  }

  @media (max-width: 980px) {
    .content-admin-workspace {
      grid-template-columns: 1fr;
    }

    .content-admin-sidebar-pane {
      position: static;
      max-height: none;
      overflow: visible;
    }
  }
`;

async function readEditorialContents(statusView: ContentStatusView): Promise<ReadEditorialContentsResult> {
  try {
    const statusFilter =
      statusView === "archived" ? "status=eq.archived" : "or=(status.is.null,status.neq.archived)";
    const contents = await fetchSupabaseAdminTable<EditorialContent>(
      `editorial_contents?select=${editorialContentsSelect}&${statusFilter}&order=published_at.desc.nullslast,created_at.desc.nullslast`,
    );

    return { contents, error: null };
  } catch (error) {
    return {
      contents: [],
      error: error instanceof Error ? error.message : "Nao foi possivel ler public.editorial_contents.",
    };
  }
}

async function readContentContextLookups(): Promise<ContentContextLookups> {
  const [competitions, seasons, matchdays] = await Promise.all([
    fetchSupabaseAdminTable<EditorialContentCompetition>(
      "competitions?select=id,name,slug&order=name.asc",
    ).catch(() => []),
    fetchSupabaseAdminTable<EditorialContentSeason>(
      "seasons?select=id,label,competition_id&order=label.desc",
    ).catch(() => []),
    fetchSupabaseAdminTable<EditorialContentMatchday>(
      "matchdays?select=id,season_id,number,label&order=number.asc",
    ).catch(() => []),
  ]);

  return {
    competitions: new Map(
      competitions.map((competition) => [
        competition.id,
        firstText(competition.name, competition.slug, "Competicao sem nome") ?? "Competicao sem nome",
      ] as [string, string]),
    ),
    seasons: new Map(
      seasons.map((season) => [season.id, firstText(season.label, "Epoca sem nome") ?? "Epoca sem nome"] as [string, string]),
    ),
    matchdays: new Map(matchdays.map((matchday) => [matchday.id, matchdayDisplayLabel(matchday)] as [string, string])),
    seasonCompetitionIds: new Map(seasons.map((season) => [season.id, season.competition_id] as [string, string | null])),
    matchdaySeasonIds: new Map(matchdays.map((matchday) => [matchday.id, matchday.season_id] as [string, string | null])),
    competitionOptions: competitions,
    seasonOptions: seasons,
    matchdayOptions: matchdays,
  };
}

function pageMessage(params: Awaited<NonNullable<PageProps["searchParams"]>>) {
  if (params.created) {
    return "Conteudo criado.";
  }
  if (params.updated) {
    return "Conteudo atualizado.";
  }
  if (params.archived) {
    return "Conteudo arquivado.";
  }
  if (params.saved) {
    return "Conteudo guardado.";
  }

  const messages: Record<string, string> = {
    "missing-title": "Indique um titulo.",
    "missing-slug": "Nao foi possivel gerar um slug.",
    "invalid-status": "Estado invalido.",
    "invalid-scope": "Ambito invalido.",
    "invalid-content-type": "Tipo de conteudo invalido.",
    "invalid-action": "Acao invalida para este formulario.",
    "missing-content": "O conteudo selecionado ja nao existe.",
    "save-failed": "Nao foi possivel guardar o conteudo.",
  };

  return params.error ? messages[params.error] ?? "Nao foi possivel guardar o conteudo." : null;
}

function contentStatusView(params: Awaited<NonNullable<PageProps["searchParams"]>>): ContentStatusView {
  return params.status === "archived" ? "archived" : "active";
}

function contentWorkspaceHref(options: { contentId?: string | null; mode?: string | null; statusView?: ContentStatusView }) {
  const params = new URLSearchParams();
  if (options.statusView === "archived") {
    params.set("status", "archived");
  }
  if (options.mode) {
    params.set("mode", options.mode);
  }
  if (options.contentId) {
    params.set("contentId", options.contentId);
  }
  const query = params.toString();
  return query ? `/admin/editorial/conteudos?${query}` : "/admin/editorial/conteudos";
}

function matchdayDisplayLabel(matchday: EditorialContentMatchday) {
  const number = Number.isFinite(matchday.number) ? `J${String(matchday.number).padStart(2, "0")}` : "";
  return [number, matchday.label].filter(Boolean).join(" - ") || "Jornada sem nome";
}

function lookupContentContextLabel(id: string | null | undefined, lookup: Map<string, string>, missingLabel: string) {
  if (!id) {
    return null;
  }

  return lookup.get(id) ?? missingLabel;
}

function readableContentScope(content: EditorialContent, context: EditorialSidebarContext) {
  if (content.matchday_id) return "matchday";
  const storedScope = firstText(content.scope);
  if (storedScope === "competition" || storedScope === "matchday") return storedScope;
  return context.competitionId ? "competition" : "general";
}

function resolveContentContext(content: EditorialContent, lookups: ContentContextLookups): EditorialSidebarContext {
  const matchdayId = content.matchday_id;
  const seasonId = matchdayId ? lookups.matchdaySeasonIds.get(matchdayId) ?? content.season_id : content.season_id;
  const competitionId = seasonId ? lookups.seasonCompetitionIds.get(seasonId) ?? content.competition_id : content.competition_id;
  const hasAnyContext = Boolean(content.matchday_id || content.season_id || content.competition_id);
  const context = {
    competitionId: competitionId ?? null,
    seasonId: seasonId ?? null,
    matchdayId: matchdayId ?? null,
    competitionLabel:
      lookupContentContextLabel(competitionId, lookups.competitions, "Contexto incompleto") ??
      (hasAnyContext ? "Contexto incompleto" : "Sem competicao associada"),
    seasonLabel:
      lookupContentContextLabel(seasonId, lookups.seasons, "Contexto incompleto") ??
      (hasAnyContext ? "Contexto incompleto" : "Sem epoca associada"),
    matchdayLabel:
      lookupContentContextLabel(matchdayId, lookups.matchdays, "Contexto incompleto") ??
      (content.matchday_id ? "Contexto incompleto" : "Sem jornada associada"),
    scopeLabel: null,
  };

  return { ...context, scopeLabel: readableContentScope(content, context) };
}

function ContentSidebarLink({
  entry,
  statusView,
}: {
  entry: EditorialSidebarItem<EditorialContent>;
  statusView: ContentStatusView;
}) {
  const content = entry.item;
  const dateLabel = firstText(formatDateTime(content.published_at), formatDateTime(content.created_at));

  return (
    <Link
      className={`content-admin-sidebar-item${entry.isSelected ? " is-selected" : ""}`}
      href={contentWorkspaceHref({ contentId: content.id, statusView })}
    >
      <span className="content-admin-sidebar-meta">
        <span>{firstText(content.status, "draft")}</span>
        {content.content_type ? <span>{content.content_type}</span> : null}
      </span>
      <strong>{firstText(content.title, "Conteudo sem titulo")}</strong>
      <span className="content-admin-sidebar-context">
        {entry.context.competitionLabel} / {entry.context.seasonLabel} / {entry.context.matchdayLabel}
      </span>
      {dateLabel ? <span className="content-admin-sidebar-context">{dateLabel}</span> : null}
    </Link>
  );
}

export default async function AdminEditorialContentsPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const statusView = contentStatusView(params);
  const [{ contents, error }, lookups, message] = await Promise.all([
    readEditorialContents(statusView),
    readContentContextLookups(),
    Promise.resolve(pageMessage(params)),
  ]);
  const isArchivedView = statusView === "archived";
  const isCreating = params.mode === "novo" || (!params.contentId && !isArchivedView);
  const selectedContent = params.contentId ? contents.find((content) => content.id === params.contentId) ?? null : null;
  const groupedContents = groupEditorialSidebarItems(
    contents.map((content): EditorialSidebarItem<EditorialContent> => ({
      item: content,
      context: resolveContentContext(content, lookups),
      isSelected: selectedContent?.id === content.id,
    })),
  );
  const renderContentItem = (entry: EditorialSidebarItem<EditorialContent>) => (
    <li key={entry.item.id}>
      <ContentSidebarLink entry={entry} statusView={statusView} />
    </li>
  );

  return (
    <main className="content-admin-shell">
      <style>{adminEditorialContentsStyles}</style>
      <style>{contentSidebarStyles}</style>

      <section className="content-admin-header">
        <div>
          <p className="content-admin-eyebrow">Editorial</p>
          <h1>Reportagens / Videos / Entrevistas</h1>
          <p>
            Conteudos editoriais audiovisuais publicados ou em preparacao. Esta area nao substitui Artigos/Noticias e
            nao alimenta automaticamente as areas fixas de video da Jornada.
          </p>
          <nav
            aria-label="Navegacao editorial"
            style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}
          >
            {editorialNavigationLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  alignItems: "center",
                  border: "1px solid rgba(255,255,255,0.38)",
                  borderRadius: 8,
                  color: "#fff",
                  display: "inline-flex",
                  fontSize: 12,
                  fontWeight: 800,
                  justifyContent: "center",
                  minHeight: 34,
                  padding: "0 12px",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <Link className="content-admin-primary-action" href={contentWorkspaceHref({ mode: "novo", statusView })}>
          Novo conteúdo
        </Link>
      </section>

      {message ? <p className="content-admin-alert">{message}</p> : null}
      {error ? <p className="content-admin-alert">{error}</p> : null}

      <section className="content-admin-workspace">
        <aside className="content-admin-sidebar-pane" aria-label="Conteudos editoriais audiovisuais">
          <nav className="content-admin-view-tabs" aria-label="Filtro de conteudos">
            <Link className={!isArchivedView ? "active" : undefined} href="/admin/editorial/conteudos">
              Ativos
            </Link>
            <Link className={isArchivedView ? "active" : undefined} href="/admin/editorial/conteudos?status=archived">
              Arquivados
            </Link>
          </nav>

          {contents.length === 0 ? (
            <section className="content-admin-empty">
              <h2>
                {isArchivedView
                  ? "Nao existem conteudos editoriais audiovisuais arquivados."
                  : "Ainda nao existem conteudos editoriais audiovisuais ativos."}
              </h2>
              <p>
                {isArchivedView
                  ? "Conteudos arquivados continuam na base e podem ser editados para voltar a draft ou published."
                  : "A criacao/edicao ja esta disponivel nesta area admin."}
              </p>
            </section>
          ) : (
            <div className="content-admin-sidebar-groups">
              {groupedContents.generalItems.length > 0 ? (
                <details
                  className="content-admin-sidebar-group"
                  open={!selectedContent || hasSelectedEditorialItem(groupedContents.generalItems)}
                >
                  <summary>
                    <span>Gerais</span>
                    <span className="content-admin-sidebar-count">{groupedContents.generalItems.length}</span>
                  </summary>
                  <ul className="content-admin-sidebar-list">
                    {groupedContents.generalItems.map(renderContentItem)}
                  </ul>
                </details>
              ) : null}

              {groupedContents.competitionGroups.map((competitionGroup) => (
                <details
                  className="content-admin-sidebar-group"
                  key={competitionGroup.key}
                  open={editorialCompetitionGroupHasSelected(competitionGroup)}
                >
                  <summary>
                    <span>{competitionGroup.label}</span>
                    <span className="content-admin-sidebar-count">{countEditorialCompetitionItems(competitionGroup)}</span>
                  </summary>
                  {competitionGroup.seasonGroups.map((seasonGroup) => (
                    <details
                      className="content-admin-sidebar-subgroup"
                      key={seasonGroup.key}
                      open={editorialSeasonGroupHasSelected(seasonGroup)}
                    >
                      <summary>
                        <span>{seasonGroup.label}</span>
                        <span className="content-admin-sidebar-count">{countEditorialSeasonItems(seasonGroup)}</span>
                      </summary>
                      {seasonGroup.matchdayGroups.map((matchdayGroup) => (
                        <details
                          className="content-admin-sidebar-leaf"
                          key={matchdayGroup.key}
                          open={editorialMatchdayGroupHasSelected(matchdayGroup)}
                        >
                          <summary>
                            <span>{matchdayGroup.label}</span>
                            <span className="content-admin-sidebar-count">{matchdayGroup.items.length}</span>
                          </summary>
                          <ul className="content-admin-sidebar-list">
                            {matchdayGroup.items.map(renderContentItem)}
                          </ul>
                        </details>
                      ))}
                    </details>
                  ))}
                </details>
              ))}
            </div>
          )}
        </aside>

        <section className="content-admin-detail-panel" aria-label="Editor de conteudo audiovisual">
          {isCreating ? (
            <EditorialContentForm
              key="create"
              mode="create"
              message={params.error ? message : null}
              competitions={lookups.competitionOptions}
              seasons={lookups.seasonOptions}
              matchdays={lookups.matchdayOptions}
            />
          ) : selectedContent ? (
            <EditorialContentForm
              key={selectedContent.id}
              mode="edit"
              content={selectedContent}
              message={params.error ? message : null}
              competitions={lookups.competitionOptions}
              seasons={lookups.seasonOptions}
              matchdays={lookups.matchdayOptions}
            />
          ) : params.contentId ? (
            <div className="content-admin-detail-heading">
              <h2>Conteudo nao encontrado.</h2>
              <p>O registo pode ter sido removido ou nao existir neste ambiente.</p>
            </div>
          ) : (
            <div className="content-admin-detail-heading">
              <h2>Escolha um conteudo ou crie uma nova peca</h2>
              <p>A sidebar fica sempre visivel. Selecione um conteudo agrupado por contexto ou use Novo conteudo.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
