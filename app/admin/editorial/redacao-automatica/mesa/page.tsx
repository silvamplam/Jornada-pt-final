import Link from "next/link";

import {
  MANUAL_NEWSROOM_SOURCE_CODE,
  MANUAL_NEWSROOM_SOURCE_LABEL,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";
import {
  loadEditorialDeskReadModel,
  type EditorialDeskBankClassification,
  type EditorialDeskNewItem,
  type EditorialDeskPage,
  type EditorialDeskPrePublicationClassification,
  type EditorialDeskPublishedItem,
  type EditorialDeskThemeSummary,
} from "@/lib/redacao-automatica/newsroom-desk-read-model";
import { listRegisteredSources } from "@/lib/redacao-automatica/source-registry";

import {
  MESA_CLASSIFICATION_OPTIONS,
  MESA_TABS,
  classificationLabel,
  mesaHref,
  mesaReadModelInput,
  parseMesaQuery,
  type MesaQuery,
  type MesaSearchParams,
} from "./_mesa-query";
import styles from "./mesa.module.css";

export const dynamic = "force-dynamic";

type MesaPageProps = Readonly<{
  searchParams?: Promise<MesaSearchParams>;
}>;

const classificationSourceLabels = {
  automatic: "Automática",
  continuity_assisted: "Continuidade",
  manual: "Manual",
} as const;

const editorialStateLabels = {
  new: "Nova",
  updated: "Fonte atualizada",
  working: "Em trabalho",
  used: "Utilizada",
  seen: "Arquivo · Lida",
  dismissed: "Arquivo · Sem interesse",
} as const;

const errorCopy = {
  invalid_request: {
    title: "Pedido inválido",
    body: "Os filtros recebidos não formam um pedido válido para a Mesa da Redação.",
  },
  not_configured: {
    title: "Mesa não configurada",
    body: "A leitura administrativa necessária para abrir a Mesa não está configurada neste ambiente.",
  },
  relation_invalid: {
    title: "Dados editoriais inconsistentes",
    body: "Foi encontrada uma relação persistida inválida. A Mesa não ocultou o problema como uma coleção vazia.",
  },
  read_unavailable: {
    title: "Leitura indisponível",
    body: "Não foi possível ler a Mesa da Redação neste momento.",
  },
} as const;

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(date);
}

function ClassificationBadge({
  classification,
}: Readonly<{
  classification: EditorialDeskPrePublicationClassification | EditorialDeskBankClassification;
}>) {
  if (classification.status === "unclassified") {
    return <span className={styles.classificationBadge} data-tone="unclassified">Por classificar</span>;
  }
  return (
    <span className={styles.classificationBadge} data-tone={classification.classificationKey}>
      {classificationLabel(classification.classificationKey)}
      <small>{classificationSourceLabels[classification.classificationSource]}</small>
    </span>
  );
}

function ThemeMembership({ themeIds }: Readonly<{ themeIds: readonly string[] }>) {
  if (themeIds.length === 0) return null;
  return (
    <span className={styles.membershipBadge}>
      {themeIds.length === 1 ? "1 Tema associado" : `${themeIds.length} Temas associados`}
    </span>
  );
}

function newsroomArticleHref(item: EditorialDeskNewItem): string {
  const params = new URLSearchParams({
    view: item.sourceState.editorial.view,
    articleId: item.newsroomArticleId,
  });
  return `/admin/editorial/redacao-automatica?${params.toString()}`;
}

function NewItem({ item }: Readonly<{ item: EditorialDeskNewItem }>) {
  const publishedAt = formatDate(item.publishedAt);
  const state = item.sourceState.editorial;
  const stateLabel = editorialStateLabels[state.label];
  return (
    <li className={styles.itemCard} data-universe="novas">
      {item.imageCandidateUrl ? (
        <div className={styles.thumbnail}>
          <img src={item.imageCandidateUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </div>
      ) : null}
      <div className={styles.itemBody}>
        <div className={styles.itemMeta}>
          <strong>{item.sourceName ?? item.sourceCode}</strong>
          {publishedAt ? <time dateTime={item.publishedAt ?? undefined}>{publishedAt}</time> : null}
          <span className={styles.stateBadge} data-state={state.label}>{stateLabel}</span>
          {item.sourceState.changedAfterKnownUsage && state.label !== "updated" ? (
            <span className={styles.stateBadge} data-state="updated">Fonte atualizada</span>
          ) : null}
          {item.sourceState.editoriallyActionable ? (
            <span className={styles.actionableBadge}>Acionável</span>
          ) : null}
        </div>

        <div className={styles.titleRow}>
          <div>
            <h2>{item.title}</h2>
            {item.subtitle ? <p className={styles.subtitle}>{item.subtitle}</p> : null}
            {item.summary && item.summary !== item.subtitle ? (
              <p className={styles.summary}>{item.summary}</p>
            ) : null}
          </div>
          <div className={styles.badgeStack}>
            <ClassificationBadge classification={item.classification} />
            <ThemeMembership themeIds={item.themeMembership.themeIds} />
          </div>
        </div>

        {item.publishedRelations.status === "known" ? (
          <aside className={styles.publishedMemory} aria-label="Memória publicada conhecida">
            <p>JORNADA JÁ PUBLICOU</p>
            <ul>
              {item.publishedRelations.items.map((relation) => {
                const dossierEvidence = relation.evidence.filter(
                  (evidence) => evidence.kind === "dossier_plan",
                );
                return (
                  <li key={relation.editorialArticleId}>
                    <div>
                      <Link href={`/admin/editorial/artigos?articleId=${encodeURIComponent(relation.editorialArticleId)}`}>
                        {relation.title}
                      </Link>
                      {formatDate(relation.publishedAt) ? (
                        <time dateTime={relation.publishedAt ?? undefined}>
                          {formatDate(relation.publishedAt)}
                        </time>
                      ) : null}
                    </div>
                    {dossierEvidence.length > 0 ? (
                      <span className={styles.evidenceLinks}>
                        {dossierEvidence.map((evidence) => (
                          <Link
                            key={`${evidence.dossierId}:${evidence.articlePlanId}`}
                            href={`/admin/editorial/redacao-automatica/dossies/${encodeURIComponent(evidence.dossierId)}`}
                          >
                            {evidence.dossierTitle}
                          </Link>
                        ))}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </aside>
        ) : (
          <p className={styles.unknownRelation}>Sem relação publicada determinística conhecida.</p>
        )}

        <footer className={styles.cardFooter}>
          <Link href={newsroomArticleHref(item)}>Abrir na Redação atual</Link>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">Abrir fonte</a>
          ) : null}
        </footer>
      </div>
    </li>
  );
}

function PublishedItem({ item }: Readonly<{ item: EditorialDeskPublishedItem }>) {
  const publishedAt = formatDate(item.publishedAt);
  const hasCanonicalContext = Boolean(
    item.canonicalContext.competitionId
    || item.canonicalContext.seasonId
    || item.canonicalContext.matchdayId,
  );
  return (
    <li className={styles.itemCard} data-universe="publicadas" data-editorial-article-id={item.editorialArticleId}>
      {item.imageUrl ? (
        <div className={styles.thumbnail}>
          <img src={item.imageUrl} alt="" loading="lazy" />
        </div>
      ) : null}
      <div className={styles.itemBody}>
        <div className={styles.itemMeta}>
          <strong>Publicada</strong>
          {publishedAt ? <time dateTime={item.publishedAt ?? undefined}>{publishedAt}</time> : null}
          {item.anteTitle ? <span>{item.anteTitle}</span> : null}
          <ThemeMembership themeIds={item.themeMembership.themeIds} />
        </div>
        <h2>{item.title}</h2>
        {item.postTitle ? <p className={styles.subtitle}>{item.postTitle}</p> : null}

        <div className={styles.contextSummary}>
          {hasCanonicalContext ? <span>Contexto canónico associado</span> : null}
          <span>
            {item.bankContexts.length === 0
              ? "Sem participação conhecida no Bank"
              : item.bankContexts.length === 1
                ? "1 contexto no Bank"
                : `${item.bankContexts.length} contextos no Bank`}
          </span>
        </div>

        {item.bankContexts.length > 0 ? (
          <details className={styles.bankContexts}>
            <summary>Ver classificação contextual</summary>
            <ol>
              {item.bankContexts.map((context, index) => (
                <li key={context.bankItemId} data-matches-filter={context.matchesFilter}>
                  <span>Contexto {index + 1}</span>
                  <ClassificationBadge classification={context.classification} />
                  <small>{context.bankStatus === "active" ? "Ativo" : "Arquivado"}</small>
                  {context.matchesFilter ? <strong>Corresponde ao filtro</strong> : null}
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        <footer className={styles.cardFooter}>
          <Link href={`/admin/editorial/artigos?articleId=${encodeURIComponent(item.editorialArticleId)}`}>
            Abrir em Artigos
          </Link>
        </footer>
      </div>
    </li>
  );
}

function ThemeItem({ item }: Readonly<{ item: EditorialDeskThemeSummary }>) {
  const hasContext = Boolean(
    item.context.competitionId
    || item.context.seasonId
    || item.context.matchdayId
    || item.context.matchId,
  );
  return (
    <li className={styles.themeCard} data-theme-id={item.id}>
      <div className={styles.itemMeta}>
        <span className={styles.stateBadge} data-state={item.status}>
          {item.status === "open" ? "Aberto" : "Arquivado"}
        </span>
        <span className={styles.classificationBadge} data-tone={item.classificationKey}>
          {classificationLabel(item.classificationKey)}
        </span>
        <time dateTime={item.updatedAt}>Atualizado {formatDate(item.updatedAt)}</time>
      </div>
      <h2>{item.title}</h2>
      {item.contextText ? <p className={styles.summary}>{item.contextText}</p> : null}
      {hasContext ? <p className={styles.contextLine}>Contexto competitivo associado</p> : null}
      <dl className={styles.themeCounts}>
        <div><dt>Fontes</dt><dd>{item.sourceCount}</dd></div>
        <div><dt>Artigos</dt><dd>{item.articleCount}</dd></div>
      </dl>
    </li>
  );
}

function EmptyState({ query }: Readonly<{ query: MesaQuery }>) {
  const unclassifiedThemes = query.tab === "temas"
    && query.classification.mode === "unclassified";
  const beyondPage = query.page > 1;
  return (
    <section className={styles.emptyState} aria-live="polite">
      <p>{beyondPage ? "Página sem resultados" : "Universo vazio"}</p>
      <h2>
        {unclassifiedThemes
          ? "Não existem Temas por classificar"
          : beyondPage
            ? "Esta página já não tem entradas"
            : `Ainda não existem entradas em ${query.tab.toUpperCase()}`}
      </h2>
      <p>
        {unclassifiedThemes
          ? "Tema exige uma classificação editorial válida. POR CLASSIFICAR aplica-se às fontes e aos contextos que admitem ausência persistida de classificação."
          : beyondPage
            ? "Volta à página anterior para continuar a consulta."
            : "A Mesa está pronta para mostrar estas entradas quando existirem no read-model."}
      </p>
      {beyondPage ? (
        <Link href={mesaHref(query, { page: Math.max(1, query.page - 1) })}>Página anterior</Link>
      ) : null}
    </section>
  );
}

function Pagination({
  query,
  page,
}: Readonly<{
  query: MesaQuery;
  page: EditorialDeskPage<unknown>;
}>) {
  if (query.page === 1 && !page.pagination.hasNextPage) return null;
  return (
    <nav className={styles.pagination} aria-label="Paginação da Mesa">
      {query.page > 1 ? (
        <Link href={mesaHref(query, { page: query.page - 1 })}>← Página anterior</Link>
      ) : <span />}
      <strong>Página {query.page}</strong>
      {page.pagination.hasNextPage ? (
        <Link href={mesaHref(query, { page: query.page + 1 })}>Página seguinte →</Link>
      ) : <span />}
    </nav>
  );
}

function ReadError({ code }: Readonly<{ code: keyof typeof errorCopy }>) {
  const copy = errorCopy[code];
  return (
    <section className={styles.errorState} role="alert">
      <p>Mesa da Redação</p>
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      <Link href="/admin/editorial/redacao-automatica/mesa?tab=novas&classification=all">
        Reabrir a Mesa
      </Link>
    </section>
  );
}

export default async function EditorialDeskPage({ searchParams }: MesaPageProps) {
  const parsed = parseMesaQuery((await searchParams) ?? {});
  if (!parsed.ok) {
    return (
      <main className={styles.shell}>
        <div className={styles.container}><ReadError code="invalid_request" /></div>
      </main>
    );
  }

  const query = parsed.value;
  const result = await loadEditorialDeskReadModel(mesaReadModelInput(query));
  const sourceOptions = [
    ...listRegisteredSources().map((source) => ({ code: source.code, name: source.name })),
    { code: MANUAL_NEWSROOM_SOURCE_CODE, name: MANUAL_NEWSROOM_SOURCE_LABEL },
  ];
  const hasCurrentSource = query.sourceCode
    ? sourceOptions.some((source) => source.code === query.sourceCode)
    : true;

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Redação · leitura editorial</p>
            <h1>Mesa da Redação</h1>
            <p>Fontes, memória publicada e continuidade temática num só ponto de leitura.</p>
          </div>
          <nav aria-label="Navegação complementar">
            <Link href="/admin">Backoffice</Link>
            <Link href="/admin/editorial/redacao-automatica">Redação atual</Link>
            <Link href="/admin/editorial/artigos">Artigos</Link>
          </nav>
        </header>

        <nav className={styles.universeTabs} aria-label="Universos da Mesa">
          {MESA_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={mesaHref(query, { tab: tab.value, page: 1 })}
              aria-current={query.tab === tab.value ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <section className={styles.filterBar} aria-labelledby="classification-filter-title">
          <div>
            <p id="classification-filter-title">Classificação</p>
            <nav className={styles.classificationFilters} aria-label="Classificação transversal">
              {MESA_CLASSIFICATION_OPTIONS.map((option) => (
                <Link
                  key={option.value}
                  href={mesaHref(query, { classificationValue: option.value, page: 1 })}
                  aria-current={query.classificationValue === option.value ? "true" : undefined}
                >
                  {option.label}
                </Link>
              ))}
            </nav>
          </div>

          {query.tab === "novas" ? (
            <form method="get" className={styles.sourceFilter}>
              <input type="hidden" name="tab" value={query.tab} />
              <input type="hidden" name="classification" value={query.classificationValue} />
              {query.competitionId ? <input type="hidden" name="competitionId" value={query.competitionId} /> : null}
              {query.seasonId ? <input type="hidden" name="seasonId" value={query.seasonId} /> : null}
              {query.matchdayId ? <input type="hidden" name="matchdayId" value={query.matchdayId} /> : null}
              <label>
                <span>Fonte</span>
                <select name="source" defaultValue={query.sourceCode ?? ""}>
                  <option value="">Todas as fontes</option>
                  {!hasCurrentSource && query.sourceCode ? (
                    <option value={query.sourceCode}>{query.sourceCode}</option>
                  ) : null}
                  {sourceOptions.map((source) => (
                    <option key={source.code} value={source.code}>{source.name}</option>
                  ))}
                </select>
              </label>
              <button type="submit">Aplicar</button>
            </form>
          ) : query.tab === "temas" ? (
            <nav className={styles.statusFilters} aria-label="Estado dos Temas">
              <Link
                href={mesaHref(query, { themeStatus: "open", page: 1 })}
                aria-current={query.themeStatus === "open" ? "true" : undefined}
              >Abertos</Link>
              <Link
                href={mesaHref(query, { themeStatus: "archived", page: 1 })}
                aria-current={query.themeStatus === "archived" ? "true" : undefined}
              >Arquivados</Link>
            </nav>
          ) : null}
        </section>

        {!result.ok ? <ReadError code={result.error.code} /> : (() => {
          const activePage = query.tab === "novas"
            ? result.value.novas
            : query.tab === "publicadas"
              ? result.value.publicadas
              : result.value.temas;
          return (
            <>
              {activePage.items.length === 0 ? <EmptyState query={query} /> : (
                <ol className={query.tab === "temas" ? styles.themeGrid : styles.itemList}>
                  {query.tab === "novas"
                    ? result.value.novas.items.map((item) => (
                        <NewItem key={item.newsroomArticleId} item={item} />
                      ))
                    : query.tab === "publicadas"
                      ? result.value.publicadas.items.map((item) => (
                          <PublishedItem key={item.editorialArticleId} item={item} />
                        ))
                      : result.value.temas.items.map((item) => (
                          <ThemeItem key={item.id} item={item} />
                        ))}
                </ol>
              )}
              <Pagination query={query} page={activePage} />
            </>
          );
        })()}
      </div>
    </main>
  );
}
