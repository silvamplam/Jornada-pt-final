import {
  getNewsroomArticleById,
  listNewsroomArticles,
  type NewsroomArticleDetail,
  type NewsroomArticlePage,
} from "@/lib/redacao-automatica/newsroom-article-repository";
import {
  listRegisteredSources,
  type SourceOperationalStatus,
  type SourceRegistryEntry,
} from "@/lib/redacao-automatica/source-registry";
import type { ArticleProcessingStatus } from "@/lib/redacao-automatica/types";

import styles from "./redacao-automatica.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type AutomaticNewsroomPageProps = {
  searchParams?: Promise<SearchParams>;
};

const PAGE_SIZE = 20;

const editorialFlow = [
  "Tema detetado",
  "Informação reunida",
  "Notícia gerada",
  "Validação editorial",
  "Rascunho criado",
  "Revisão e publicação",
] as const;

const operationalStatusLabels: Record<SourceOperationalStatus, string> = {
  active: "Operacional",
  paused: "Em preparação",
  legal_hold: "Validação jurídica pendente",
  degraded: "Funcionamento condicionado",
  disabled: "Desativada",
};

const inactiveMonitoringStatusLabels: Record<SourceOperationalStatus, string> = {
  active: "Monitorização inativa",
  paused: "Monitorização ainda não ativa",
  legal_hold: "Monitorização inativa — validação jurídica necessária",
  degraded: "Monitorização inativa — funcionamento condicionado",
  disabled: "Monitorização desativada",
};

const operationalStatusClasses: Record<SourceOperationalStatus, string> = {
  active: styles.statusActive,
  paused: styles.statusPaused,
  legal_hold: styles.statusLegalHold,
  degraded: styles.statusDegraded,
  disabled: styles.statusDisabled,
};

const processingStatusLabels: Record<ArticleProcessingStatus, string> = {
  detected: "Detetado",
  normalized: "Normalizado",
  duplicate: "Duplicado",
  rejected: "Rejeitado",
  ready_for_review: "Por rever",
  failed: "Falhou",
};

const emptyArticlePage: NewsroomArticlePage = {
  items: [],
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  readyForReview: 0,
  hasPreviousPage: false,
  hasNextPage: false,
};

function getMonitoringStatus(source: SourceRegistryEntry) {
  const canMonitor = source.operationalStatus === "active" || source.operationalStatus === "degraded";

  if (!source.monitoringEnabled || !canMonitor) {
    return inactiveMonitoringStatusLabels[source.operationalStatus];
  }

  return source.operationalStatus === "degraded"
    ? "Monitorização ativa com funcionamento condicionado"
    : "Monitorização ativa";
}

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  return value?.trim() || null;
}

function pageNumber(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(date);
}

function inboxHref(page: number, articleId?: string): string {
  const params = new URLSearchParams();
  if (page > 1) {
    params.set("page", String(page));
  }
  if (articleId) {
    params.set("articleId", articleId);
  }

  const query = params.toString();
  return `/admin/editorial/redacao-automatica${query ? `?${query}` : ""}`;
}

function ArticleDetail({
  article,
  sourceName,
}: {
  article: NewsroomArticleDetail;
  sourceName: string;
}) {
  const snapshot = article.snapshot;

  return (
    <article className={styles.articleDetail} aria-labelledby="selected-article-title">
      <div className={styles.detailHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Leitura do artigo-fonte</p>
          <h3 id="selected-article-title">{article.title}</h3>
        </div>
        <span className={styles.processingStatus}>{processingStatusLabels[article.processingStatus]}</span>
      </div>

      {article.subtitle ? <p className={styles.articleSubtitle}>{article.subtitle}</p> : null}
      {article.summary ? <p className={styles.articleSummary}>{article.summary}</p> : null}

      <dl className={styles.detailFacts}>
        <div><dt>Fonte</dt><dd>{sourceName}</dd></div>
        <div><dt>Autor</dt><dd>{article.author ?? "—"}</dd></div>
        <div><dt>Publicação</dt><dd>{formatDate(article.publishedAt)}</dd></div>
        <div><dt>Modificação</dt><dd>{formatDate(article.modifiedAt)}</dd></div>
        <div><dt>Deteção</dt><dd>{formatDate(article.detectedAt)}</dd></div>
        <div><dt>Identificador externo</dt><dd>{article.externalId ?? "—"}</dd></div>
      </dl>

      <div className={styles.sourceLinks}>
        <a href={article.originalUrl} target="_blank" rel="noopener noreferrer">
          Abrir URL original
        </a>
        <span title={article.normalizedUrl}>URL normalizada preservada</span>
      </div>

      {article.imageUrl ? (
        <figure className={styles.articleImage}>
          <img
            alt={`Imagem associada a ${article.title}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            src={article.imageUrl}
          />
        </figure>
      ) : null}

      <section className={styles.bodySection} aria-labelledby="normalized-body-title">
        <div className={styles.bodyHeader}>
          <h4 id="normalized-body-title">Corpo normalizado</h4>
          <span>{snapshot ? `${snapshot.body.length} blocos` : "Sem snapshot"}</span>
        </div>
        {snapshot?.body.length ? (
          <div className={styles.normalizedBody}>
            {snapshot.body.map((block, index) => block.type === "heading" ? (
              <h5 key={`${block.type}-${index}`}>{block.text}</h5>
            ) : (
              <p key={`${block.type}-${index}`}>{block.text}</p>
            ))}
          </div>
        ) : (
          <p className={styles.detailEmpty}>O artigo ainda não tem um snapshot de corpo disponível.</p>
        )}
      </section>

      {snapshot ? (
        <section className={styles.provenance} aria-labelledby="technical-provenance-title">
          <h4 id="technical-provenance-title">Proveniência técnica</h4>
          <dl>
            <div><dt>Snapshot</dt><dd>{snapshot.id}</dd></div>
            <div><dt>Hash de conteúdo</dt><dd>{snapshot.contentHash}</dd></div>
            <div><dt>Extração</dt><dd>{formatDate(snapshot.extractedAt)}</dd></div>
            <div><dt>Blocos normalizados</dt><dd>{snapshot.body.length}</dd></div>
          </dl>
        </section>
      ) : null}
    </article>
  );
}

export default async function AutomaticNewsroomPage({ searchParams }: AutomaticNewsroomPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedArticleId = firstQueryValue(params.articleId);
  const requestedPage = pageNumber(firstQueryValue(params.page));
  const sources = listRegisteredSources();
  const sourceNames = new Map(sources.map((source) => [source.code, source.name]));

  const listResult = await listNewsroomArticles({ page: requestedPage, pageSize: PAGE_SIZE });
  const detailResult = selectedArticleId
    ? await getNewsroomArticleById(selectedArticleId)
    : null;
  const articlePage = listResult.ok ? listResult.value : emptyArticlePage;
  const selectedArticle = detailResult?.ok ? detailResult.value : null;
  const hasReadError = !listResult.ok || (detailResult !== null && !detailResult.ok);

  const editorialSummary = [
    { label: "Artigos persistidos", value: listResult.ok ? String(articlePage.total) : "—" },
    { label: "Por rever", value: listResult.ok ? String(articlePage.readyForReview) : "—" },
    { label: "Fontes configuradas", value: String(sources.length) },
    { label: "Recolha automática", value: "Inativa" },
  ] as const;

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Área editorial</p>
            <h1>Redação automática</h1>
            <p className={styles.description}>
              Área destinada à deteção de temas, acompanhamento de dossiês e preparação automática de notícias
              para validação editorial.
            </p>
          </div>
          <nav className={styles.heroActions} aria-label="Navegação da Redação automática">
            <a href="/admin">Voltar ao backoffice</a>
            <a className={styles.primaryAction} href="/admin/editorial/artigos">
              Ver artigos editoriais
            </a>
          </nav>
        </header>

        <section className={styles.summarySection} aria-labelledby="editorial-summary-title">
          <h2 className={styles.visuallyHidden} id="editorial-summary-title">Resumo editorial</h2>
          <div className={styles.summaryGrid}>
            {editorialSummary.map((item) => (
              <article className={styles.summaryCard} key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
          <p className={styles.emptyDataNote}>
            A caixa de entrada é exclusivamente de leitura. A monitorização das fontes continua inativa.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="newsroom-inbox-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Persistência de artigos-fonte</p>
              <h2 id="newsroom-inbox-title">Caixa de entrada</h2>
            </div>
            <p>Consulta read-only dos artigos e snapshots já persistidos, sem ações editoriais ou recolha externa.</p>
          </div>

          {hasReadError ? (
            <div className={styles.readError} role="status">
              <strong>Caixa de entrada temporariamente indisponível.</strong>
              <span>Não foi possível concluir a leitura. Tente novamente mais tarde.</span>
            </div>
          ) : articlePage.items.length === 0 ? (
            <div className={styles.inboxEmpty}>
              <strong>Ainda não existem artigos recolhidos.</strong>
              <span>A caixa de entrada será preenchida apenas quando existir uma recolha autorizada.</span>
            </div>
          ) : (
            <div className={styles.inboxLayout}>
              <div className={styles.articleListColumn}>
                <div className={styles.listSummary}>
                  <strong>{articlePage.total} artigos</strong>
                  <span>Página {articlePage.page}</span>
                </div>
                <ol className={styles.articleList}>
                  {articlePage.items.map((article) => (
                    <li className={article.id === selectedArticle?.id ? styles.articleItemSelected : undefined} key={article.id}>
                      <div className={styles.articleItemTopline}>
                        <span>{sourceNames.get(article.sourceCode) ?? article.sourceCode}</span>
                        <span className={styles.processingStatus}>{processingStatusLabels[article.processingStatus]}</span>
                      </div>
                      <h3>{article.title}</h3>
                      <dl className={styles.articleMetadata}>
                        <div><dt>Autor</dt><dd>{article.author ?? "—"}</dd></div>
                        <div><dt>Publicação</dt><dd>{formatDate(article.publishedAt)}</dd></div>
                        <div><dt>Deteção</dt><dd>{formatDate(article.detectedAt)}</dd></div>
                        <div><dt>Imagem</dt><dd>{article.imageUrl ? "Disponível" : "Sem imagem"}</dd></div>
                      </dl>
                      <a className={styles.openArticleLink} href={inboxHref(articlePage.page, article.id)}>
                        Abrir
                      </a>
                    </li>
                  ))}
                </ol>
                {(articlePage.hasPreviousPage || articlePage.hasNextPage) ? (
                  <nav className={styles.pagination} aria-label="Paginação da caixa de entrada">
                    {articlePage.hasPreviousPage ? (
                      <a href={inboxHref(articlePage.page - 1)}>Página anterior</a>
                    ) : <span />}
                    {articlePage.hasNextPage ? (
                      <a href={inboxHref(articlePage.page + 1)}>Página seguinte</a>
                    ) : null}
                  </nav>
                ) : null}
              </div>

              {selectedArticle ? (
                <ArticleDetail
                  article={selectedArticle}
                  sourceName={sourceNames.get(selectedArticle.sourceCode) ?? selectedArticle.sourceCode}
                />
              ) : (
                <aside className={styles.detailPlaceholder}>
                  <strong>Selecione um artigo</strong>
                  <span>Use “Abrir” para consultar o conteúdo e a proveniência do snapshot mais recente.</span>
                </aside>
              )}
            </div>
          )}
        </section>

        <section className={styles.section} aria-labelledby="planned-sources-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Configuração inicial</p>
              <h2 id="planned-sources-title">Fontes previstas</h2>
            </div>
            <p>A ativação de cada fonte dependerá da respetiva validação técnica e jurídica.</p>
          </div>

          <div className={styles.sourceGrid}>
            {sources.map((source) => (
              <article className={styles.sourceCard} key={source.code}>
                <div className={styles.sourceCardHeader}>
                  <div>
                    <span>Fonte prevista</span>
                    <h3>{source.name}</h3>
                  </div>
                  <span className={`${styles.statusBadge} ${operationalStatusClasses[source.operationalStatus]}`}>
                    {operationalStatusLabels[source.operationalStatus]}
                  </span>
                </div>
                <p className={styles.monitoringStatus}>{getMonitoringStatus(source)}</p>
                <p>{source.editorialNote}</p>
                {source.legalNote ? <p className={styles.legalNote}>{source.legalNote}</p> : null}
              </article>
            ))}
          </div>

          <aside className={styles.extensibilityNote} aria-label="Evolução das fontes">
            <strong>Evolução progressiva</strong>
            <p>
              A área será preparada para receber novas fontes de forma progressiva, sem alterar o funcionamento
              dos temas, dossiês e artigos.
            </p>
          </aside>
        </section>

        <section className={styles.section} aria-labelledby="editorial-flow-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Processo futuro</p>
              <h2 id="editorial-flow-title">Fluxo editorial</h2>
            </div>
            <p>A validação editorial mantém-se antes da criação do rascunho e da revisão final.</p>
          </div>

          <ol className={styles.flowGrid}>
            {editorialFlow.map((step, index) => (
              <li key={step}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.section} ${styles.integrationSection}`} aria-labelledby="integration-title">
          <div>
            <p className={styles.sectionEyebrow}>Continuidade do processo</p>
            <h2 id="integration-title">Integração editorial</h2>
            <p>
              A notícia validada será futuramente guardada como rascunho no sistema editorial existente e aberta
              no editor normal de artigos.
            </p>
            <p className={styles.futureActionNote}>
              A validação e a criação do rascunho serão disponibilizadas numa fase posterior.
            </p>
          </div>
          <a className={styles.integrationLink} href="/admin/editorial/artigos">
            Abrir artigos editoriais
          </a>
        </section>
      </div>
    </main>
  );
}
