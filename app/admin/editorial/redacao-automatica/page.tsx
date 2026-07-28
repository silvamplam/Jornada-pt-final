import {
  findNewsroomEditorialDraft,
  type LinkedEditorialArticle,
} from "@/lib/redacao-automatica/editorial-draft-service";
import {
  getNewsroomArticleById,
  listNewsroomArticles,
  type NewsroomArticleDetail,
  type NewsroomArticlePage,
  type NewsroomArticleSummary,
} from "@/lib/redacao-automatica/newsroom-article-repository";
import {
  listEditorialDossiers,
  type EditorialDossierSourceRole,
  type EditorialDossierStatus,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
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

const dossierStatusLabels: Record<EditorialDossierStatus, string> = {
  draft: "Em preparação",
  ready_for_generation: "Pronto para gerar",
  completed: "Concluído",
  archived: "Arquivado",
};

const dossierSourceRoleLabels: Record<EditorialDossierSourceRole, string> = {
  primary: "Principal",
  corroboration: "Confirmação",
  context: "Contexto",
  complementary: "Complementar",
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

function canUseInDossier(article: NewsroomArticleSummary): boolean {
  return article.hasUsableSnapshot
    && ["detected", "normalized", "ready_for_review"].includes(article.processingStatus);
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
  page,
  editorialArticle,
  draftLookupFailed,
  draftErrorMessage,
  reviewErrorMessage,
  reviewSuccessMessage,
}: {
  article: NewsroomArticleDetail;
  sourceName: string;
  page: number;
  editorialArticle: LinkedEditorialArticle | null;
  draftLookupFailed: boolean;
  draftErrorMessage: string | null;
  reviewErrorMessage: string | null;
  reviewSuccessMessage: string | null;
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

      <section className={styles.draftAction} aria-labelledby="editorial-draft-title">
        <div>
          <p className={styles.sectionEyebrow}>Integração editorial</p>
          <h4 id="editorial-draft-title">
            {article.processingStatus === "ready_for_review" || editorialArticle
              ? "Rascunho editorial"
              : "Validação editorial"}
          </h4>
        </div>
        {draftErrorMessage ? (
          <p className={styles.draftActionError} role="status">{draftErrorMessage}</p>
        ) : null}
        {reviewErrorMessage ? (
          <p className={styles.draftActionError} role="status">{reviewErrorMessage}</p>
        ) : null}
        {reviewSuccessMessage ? (
          <p className={styles.reviewActionSuccess} role="status">{reviewSuccessMessage}</p>
        ) : null}
        {editorialArticle ? (
          <div className={styles.draftActionReady}>
            <p>
              {editorialArticle.status === "published"
                ? "Este artigo-fonte já está ligado a um artigo publicado."
                : "Este artigo-fonte já tem um rascunho editorial."}
            </p>
            <a href={`/admin/editorial/artigos?articleId=${encodeURIComponent(editorialArticle.id)}`}>
              {editorialArticle.status === "published" ? "Abrir artigo editorial" : "Abrir rascunho editorial"}
            </a>
          </div>
        ) : draftLookupFailed ? (
          <p className={styles.draftActionNote}>
            Não foi possível confirmar a existência de um rascunho. A criação fica indisponível para evitar duplicações.
          </p>
        ) : !article.snapshot?.body.length ? (
          <p className={styles.draftActionNote}>
            A validação editorial fica disponível quando existir um snapshot normalizado com corpo editorial.
          </p>
        ) : article.processingStatus === "detected" || article.processingStatus === "normalized" ? (
          <form action="/api/admin/editorial/redacao-automatica/review" method="post">
            <input type="hidden" name="newsroom_article_id" value={article.id} />
            <input type="hidden" name="return_to" value={inboxHref(page, article.id)} />
            <p>
              Confirma manualmente que o artigo-fonte e o respetivo snapshot podem avançar para validação editorial.
              Esta ação não cria nem publica qualquer artigo.
            </p>
            <button type="submit">Marcar como Por rever</button>
          </form>
        ) : article.processingStatus !== "ready_for_review" ? (
          <p className={styles.draftActionNote}>
            O estado atual do artigo não permite avançar para a criação de rascunho.
          </p>
        ) : (
          <form action="/api/admin/editorial/redacao-automatica/drafts" method="post">
            <input type="hidden" name="newsroom_article_id" value={article.id} />
            <input type="hidden" name="return_to" value={inboxHref(page, article.id)} />
            <p>
              Cria um rascunho em estado draft com o título, subtítulo, imagem e corpo normalizado já persistidos.
              A publicação continua exclusivamente manual.
            </p>
            <button type="submit">Criar rascunho editorial</button>
          </form>
        )}
      </section>

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

  const [listResult, dossierListResult] = await Promise.all([
    listNewsroomArticles({ page: requestedPage, pageSize: PAGE_SIZE }),
    listEditorialDossiers(12),
  ]);
  const detailResult = selectedArticleId
    ? await getNewsroomArticleById(selectedArticleId)
    : null;
  const draftResult = selectedArticleId
    ? await findNewsroomEditorialDraft(selectedArticleId)
    : null;
  const articlePage = listResult.ok ? listResult.value : emptyArticlePage;
  const selectedArticle = detailResult?.ok ? detailResult.value : null;
  const selectedEditorialArticle = draftResult?.ok ? draftResult.value : null;
  const hasReadError = !listResult.ok || (detailResult !== null && !detailResult.ok);
  const draftLookupFailed = draftResult !== null && !draftResult.ok;
  const draftErrorCode = firstQueryValue(params.draft_error);
  const draftErrorMessages: Record<string, string> = {
    input_invalid: "O artigo selecionado não é válido.",
    service_unavailable: "O serviço editorial não está configurado.",
    newsroom_article_not_found: "O artigo da caixa de entrada já não existe.",
    newsroom_article_not_ready: "O artigo ainda não está disponível para validação editorial.",
    newsroom_snapshot_missing: "O artigo ainda não tem um snapshot normalizado utilizável.",
    draft_creation_failed: "Não foi possível criar ou localizar o rascunho editorial.",
  };
  const draftErrorMessage = draftErrorCode
    ? draftErrorMessages[draftErrorCode] ?? "Não foi possível concluir a criação do rascunho."
    : null;
  const reviewErrorCode = firstQueryValue(params.review_error);
  const reviewErrorMessages: Record<string, string> = {
    input_invalid: "O artigo selecionado não é válido.",
    service_unavailable: "O serviço da caixa de entrada não está configurado.",
    newsroom_article_not_found: "O artigo da caixa de entrada já não existe.",
    newsroom_snapshot_missing: "O artigo ainda não tem um snapshot normalizado utilizável.",
    newsroom_article_not_reviewable: "O estado atual do artigo não permite marcá-lo como Por rever.",
    status_update_failed: "Não foi possível marcar o artigo como Por rever.",
  };
  const reviewErrorMessage = reviewErrorCode
    ? reviewErrorMessages[reviewErrorCode] ?? "Não foi possível concluir a validação editorial."
    : null;
  const reviewState = firstQueryValue(params.review_state);
  const reviewSuccessMessage = reviewState === "updated"
    ? "O artigo foi marcado como Por rever. Já pode criar o rascunho editorial."
    : reviewState === "reused"
      ? "O artigo já estava marcado como Por rever."
      : null;

  const dossiers = dossierListResult.ok ? dossierListResult.value : [];
  const dossierErrorCode = firstQueryValue(params.dossier_error);
  const dossierErrorMessages: Record<string, string> = {
    input_invalid: "Indica um título e seleciona pelo menos uma fonte válida.",
    service_unavailable: "O serviço dos Dossiês não está configurado.",
    source_not_found: "Uma das fontes selecionadas já não existe.",
    source_not_eligible: "Uma das fontes selecionadas não está disponível para o Dossiê.",
    source_snapshot_missing: "Uma das fontes não tem um snapshot normalizado utilizável.",
    dossier_creation_failed: "Não foi possível criar o Dossiê com todas as fontes.",
  };
  const dossierErrorMessage = dossierErrorCode
    ? dossierErrorMessages[dossierErrorCode] ?? "Não foi possível criar o Dossiê."
    : null;

  const editorialSummary = [
    { label: "Artigos persistidos", value: listResult.ok ? String(articlePage.total) : "—" },
    { label: "Por rever", value: listResult.ok ? String(articlePage.readyForReview) : "—" },
    { label: "Fontes configuradas", value: String(sources.length) },
    { label: "Dossiês em preparação", value: dossierListResult.ok ? String(dossiers.length) : "—" },
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
            A caixa de entrada permite leitura e criação manual controlada de rascunhos. A monitorização das fontes continua inativa.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="editorial-dossiers-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Mesa de preparação</p>
              <h2 id="editorial-dossiers-title">Dossiês de redação</h2>
            </div>
            <p>Seleciona várias fontes na Caixa de entrada, define a prioridade inicial e guarda as orientações humanas.</p>
          </div>

          {dossierErrorMessage ? (
            <p className={styles.dossierError} role="status">{dossierErrorMessage}</p>
          ) : null}

          <div className={styles.dossierWorkspace}>
            <form
              action="/api/admin/editorial/redacao-automatica/dossies"
              method="post"
              id="create-editorial-dossier"
              className={styles.dossierCreateForm}
            >
              <input type="hidden" name="action" value="create" />
              <label>
                <span>Título interno do Dossiê</span>
                <input
                  name="title"
                  maxLength={180}
                  required
                  placeholder="Ex.: FC Porto prepara próximo jogo após apresentação"
                />
              </label>
              <label>
                <span>Orientações editoriais</span>
                <textarea
                  name="editorial_instructions"
                  maxLength={12000}
                  rows={6}
                  placeholder="Define o que é mais importante, a ordem da informação, o ângulo e o resultado pretendido."
                />
              </label>
              <label>
                <span>Contexto a introduzir</span>
                <textarea
                  name="context_instructions"
                  maxLength={8000}
                  rows={4}
                  placeholder="Acrescenta o contexto competitivo ou editorial que deve enquadrar a notícia."
                />
              </label>
              <p>
                Depois de preencher, seleciona as fontes na lista abaixo. O snapshot mais recente de cada fonte será congelado no momento da criação.
              </p>
              <button type="submit">Criar Dossiê com as fontes selecionadas</button>
            </form>

            <div className={styles.dossierListPanel}>
              <div className={styles.dossierListHeading}>
                <strong>Dossiês guardados</strong>
                <span>{dossierListResult.ok ? dossiers.length : "—"}</span>
              </div>
              {!dossierListResult.ok ? (
                <p className={styles.detailEmpty}>Não foi possível ler os Dossiês neste momento.</p>
              ) : dossiers.length === 0 ? (
                <p className={styles.detailEmpty}>Ainda não existem Dossiês de redação.</p>
              ) : (
                <ol className={styles.dossierList}>
                  {dossiers.map((dossier) => (
                    <li key={dossier.id}>
                      <div>
                        <span>{dossierStatusLabels[dossier.status]}</span>
                        <strong>{dossier.title}</strong>
                        <small>
                          {dossier.sourceCount} {dossier.sourceCount === 1 ? "fonte" : "fontes"}
                          {" · "}
                          {formatDate(dossier.updatedAt)}
                        </small>
                      </div>
                      <a href={`/admin/editorial/redacao-automatica/dossies/${encodeURIComponent(dossier.id)}`}>
                        Abrir Dossiê
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="newsroom-inbox-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Persistência de artigos-fonte</p>
              <h2 id="newsroom-inbox-title">Caixa de entrada</h2>
            </div>
            <p>Consulta, seleciona e combina artigos-fonte sem executar nova recolha externa.</p>
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
                      {canUseInDossier(article) ? (
                        <div className={styles.articleDossierSelection}>
                          <label className={styles.articleDossierCheckbox}>
                            <input
                              type="checkbox"
                              name="newsroom_article_id"
                              value={article.id}
                              form="create-editorial-dossier"
                            />
                            <span>Usar no Dossiê</span>
                          </label>
                          <label>
                            <span>Prioridade</span>
                            <input
                              type="number"
                              name={`source_priority_${article.id}`}
                              defaultValue={articlePage.items.indexOf(article) + 1}
                              min={1}
                              max={99}
                              form="create-editorial-dossier"
                            />
                          </label>
                          <label>
                            <span>Papel</span>
                            <select
                              name={`source_role_${article.id}`}
                              defaultValue="complementary"
                              form="create-editorial-dossier"
                            >
                              {Object.entries(dossierSourceRoleLabels).map(([value, label]) => (
                                <option value={value} key={value}>{label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : (
                        <p className={styles.articleDossierUnavailable}>
                          {!article.hasUsableSnapshot
                            ? "Sem snapshot normalizado utilizável"
                            : "Estado indisponível para Dossiê"}
                        </p>
                      )}
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
                  page={articlePage.page}
                  editorialArticle={selectedEditorialArticle}
                  draftLookupFailed={draftLookupFailed}
                  draftErrorMessage={draftErrorMessage}
                  reviewErrorMessage={reviewErrorMessage}
                  reviewSuccessMessage={reviewSuccessMessage}
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
              Um artigo marcado como “Por rever” e com snapshot normalizado pode agora originar manualmente um
              rascunho no sistema editorial existente, mantendo a proveniência e abrindo o editor normal de artigos.
            </p>
            <p className={styles.futureActionNote}>
              A ação nunca publica automaticamente e não executa nova recolha externa.
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
