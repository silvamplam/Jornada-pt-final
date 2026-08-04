import {
  formatNewsroomPublishedAt,
} from "@/lib/redacao-automatica/editorial-workflow-ux";
import {
  isManualNewsroomSubmissionId,
  lisbonDateOnly,
} from "@/lib/redacao-automatica/manual-newsroom-entry-internal";
import {
  MANUAL_NEWSROOM_SOURCE_CODE,
  MANUAL_NEWSROOM_SOURCE_LABEL,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";
import {
  loadNewsroomEditorialInbox,
} from "@/lib/redacao-automatica/newsroom-editorial-inbox";
import {
  newsroomEditorialInboxActionValue,
  newsroomEditorialInboxView,
  type NewsroomEditorialInboxItem,
  type NewsroomEditorialInboxView,
} from "@/lib/redacao-automatica/newsroom-editorial-inbox-internal";
import {
  newsroomTopicPeriod,
  newsroomTopicPeriodDays,
} from "@/lib/redacao-automatica/newsroom-topic-search";
import { listRegisteredSources } from "@/lib/redacao-automatica/source-registry";
import {
  EDITORIAL_SOURCE_PACKAGE_GENRES,
  EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH,
  EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH,
} from "@/lib/redacao-automatica/editorial-source-package-internal";

import SourcePackageSubmitEnhancer from "./_sourcePackageSubmitEnhancer";
import CurrentFeedReveal from "./_currentFeedReveal";
import ManualNewsEntryForm from "./_manualNewsEntryForm";
import styles from "./redacao-automatica.module.css";

export const dynamic = "force-dynamic";

const REVIEW_BLOCK_SIZE = 24;

type SearchParams = Record<string, string | string[] | undefined>;

type AutomaticNewsroomPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  return value?.trim() || null;
}

function nonNegativeIntegerQueryValue(value: string | string[] | undefined): number {
  const parsed = Number(firstQueryValue(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function canUseInSourcePackage(article: NewsroomEditorialInboxItem): boolean {
  return article.hasUsableSnapshot
    && ["detected", "normalized", "ready_for_review"].includes(article.processingStatus);
}

function inboxHref(
  view: NewsroomEditorialInboxView,
  period: string,
  sourceCode: string | null,
  query: string,
): string {
  const params = new URLSearchParams({ view, period });
  if (sourceCode) {
    params.set("source", sourceCode);
  }
  if (query) {
    params.set("query", query);
  }

  return `/admin/editorial/redacao-automatica?${params.toString()}`;
}

function inboxLabel(article: NewsroomEditorialInboxItem): string {
  if (article.editorial.view === "pending") {
    return article.editorial.label === "updated" ? "Atualizada" : "Nova";
  }
  if (article.editorial.view === "working") {
    return "Em trabalho";
  }

  return article.editorial.label === "dismissed" ? "Dispensada" : "Vista";
}

function viewTitle(view: NewsroomEditorialInboxView): string {
  if (view === "working") {
    return "Em trabalho";
  }
  if (view === "archive") {
    return "Arquivo / contexto";
  }
  return "Por rever";
}

function viewDescription(view: NewsroomEditorialInboxView): string {
  if (view === "working") {
    return "Notícias que decidiste acompanhar ou usar numa peça.";
  }
  if (view === "archive") {
    return "Notícias já vistas ou dispensadas. Usa-as apenas quando precisares de contexto.";
  }
  return "Apenas notícias ainda não decididas ou alteradas depois de já terem sido vistas.";
}

const sourcePackageErrorMessages: Record<string, string> = {
  input_invalid: "Seleciona entre 1 e 20 notícias e confirma os dados editoriais do pacote.",
  source_read_failed: "Não foi possível ler as notícias selecionadas neste momento.",
  package_write_failed: "Não foi possível guardar o pacote editorial neste momento.",
};

const feedErrorMessages: Record<string, string> = {
  source_unavailable: "Não existem fontes disponíveis para atualizar.",
  collection_unavailable: "Não foi possível consultar as fontes neste momento.",
  archive_unavailable: "As fontes foram consultadas, mas não foi possível atualizar a atualidade.",
};

const inboxErrorMessages: Record<string, string> = {
  input_invalid: "A decisão editorial perdeu validade. Atualiza a página e tenta novamente.",
  service_unavailable: "A organização editorial não está configurada neste ambiente.",
  snapshot_stale: "Uma das notícias mudou entretanto. Atualiza a página antes de fechar o bloco.",
  write_failed: "Não foi possível guardar a decisão editorial.",
};

const manualEntryErrorMessages: Record<string, string> = {
  submission_id_invalid: "O pedido perdeu validade. Atualiza a página e tenta novamente.",
  title_invalid: "Escreve um título válido.",
  body_invalid: "Escreve um corpo válido.",
  published_date_invalid: "Escolhe uma data válida.",
  published_date_future: "A data não pode estar no futuro.",
  image_invalid: "A imagem escolhida não é válida.",
  service_unavailable: "A entrada manual não está configurada neste ambiente.",
  submission_payload_conflict: "Este pedido já foi usado com dados diferentes.",
  save_failed: "Não foi possível guardar a notícia manual neste momento.",
};

export default async function AutomaticNewsroomPage({
  searchParams,
}: AutomaticNewsroomPageProps) {
  const params = (await searchParams) ?? {};
  const period = newsroomTopicPeriod(firstQueryValue(params.period) ?? "7");
  const periodDays = newsroomTopicPeriodDays(period);
  const sourceCode = firstQueryValue(params.source);
  const query = firstQueryValue(params.query) ?? firstQueryValue(params.topic) ?? "";
  const view = newsroomEditorialInboxView(firstQueryValue(params.view));
  const requestedArticleId = firstQueryValue(params.articleId);
  const registeredSources = listRegisteredSources();
  const availableSources = registeredSources.filter((source) => (
    source.manualCollectionEnabled
    && Boolean(source.adapterKey?.trim())
    && source.operationalStatus !== "disabled"
    && source.operationalStatus !== "legal_hold"
  ));
  const sourceNames = new Map<string, string>([
    ...registeredSources.map((source): [string, string] => [source.code, source.name]),
    [MANUAL_NEWSROOM_SOURCE_CODE, MANUAL_NEWSROOM_SOURCE_LABEL],
  ]);
  const inboxResult = await loadNewsroomEditorialInbox({
    view,
    query,
    periodDays,
    sourceCode,
  });
  const articles = inboxResult.ok ? inboxResult.value.items : [];
  const visibleArticles = view === "pending"
    ? articles.slice(0, REVIEW_BLOCK_SIZE)
    : articles;
  const blockItems = view === "pending"
    ? visibleArticles.filter((article) => article.latestSnapshotId)
    : [];
  const returnTo = inboxHref(view, period, sourceCode, query);
  const sourcePackageErrorCode = firstQueryValue(params.package_error);
  const sourcePackageErrorMessage = sourcePackageErrorCode
    ? sourcePackageErrorMessages[sourcePackageErrorCode] ?? "Não foi possível preparar as fontes."
    : null;
  const feedErrorCode = firstQueryValue(params.feed_error);
  const feedErrorMessage = feedErrorCode
    ? feedErrorMessages[feedErrorCode] ?? "Não foi possível atualizar a atualidade."
    : null;
  const feedState = firstQueryValue(params.feed_state);
  const feedAvailable = nonNegativeIntegerQueryValue(params.feed_available);
  const hasFeedBreakdown = [params.feed_created, params.feed_updated, params.feed_existing]
    .some((value) => firstQueryValue(value) !== null);
  const feedCreated = hasFeedBreakdown
    ? nonNegativeIntegerQueryValue(params.feed_created)
    : feedAvailable;
  const feedUpdated = nonNegativeIntegerQueryValue(params.feed_updated);
  const feedExisting = nonNegativeIntegerQueryValue(params.feed_existing);
  const feedFailed = nonNegativeIntegerQueryValue(params.feed_failed);
  const feedClassified = feedCreated + feedUpdated + feedExisting;
  const feedBreakdownMessage = `Recolha técnica: ${feedCreated} novas, ${feedUpdated} atualizadas e ${feedExisting} já existentes.`;
  const feedSuccessMessage = feedState === "up_to_date"
    ? feedBreakdownMessage
    : feedState === "updated"
      ? feedBreakdownMessage
      : feedState === "partial"
        ? feedClassified > 0
          ? feedBreakdownMessage
          : "A atualização ficou incompleta. Tenta novamente."
        : null;
  const inboxErrorCode = firstQueryValue(params.inbox_error);
  const inboxErrorMessage = inboxErrorCode
    ? inboxErrorMessages[inboxErrorCode] ?? "Não foi possível guardar a decisão editorial."
    : null;
  const inboxState = firstQueryValue(params.inbox_state);
  const inboxCount = nonNegativeIntegerQueryValue(params.inbox_count);
  const inboxSuccessMessage = inboxState === "close_block"
    ? `Bloco fechado: ${inboxCount} notícias deixaram de estar por rever.`
    : inboxState === "working"
      ? "Notícia colocada em trabalho."
      : inboxState === "seen"
        ? "Notícia marcada como vista."
        : inboxState === "dismissed"
          ? "Notícia dispensada e mantida no arquivo."
          : inboxState === "reopen"
            ? "Notícia devolvida a Por rever."
            : null;
  const manualEntryErrorCode = firstQueryValue(params.manual_entry_error);
  const manualEntryErrorMessage = manualEntryErrorCode
    ? manualEntryErrorMessages[manualEntryErrorCode] ?? "Não foi possível guardar a notícia manual."
    : null;
  const manualEntryState = firstQueryValue(params.manual_entry_state);
  const manualEntrySuccessMessage = manualEntryState === "created"
    ? "A notícia manual foi guardada."
    : manualEntryState === "reused"
      ? "A notícia manual já estava guardada."
      : null;
  const requestedManualSubmissionId = firstQueryValue(params.manual_submission_id) ?? "";
  const manualSubmissionId = isManualNewsroomSubmissionId(requestedManualSubmissionId)
    ? requestedManualSubmissionId
    : crypto.randomUUID();
  const manualEntryMaxDate = lisbonDateOnly(new Date()) ?? new Date().toISOString().slice(0, 10);
  const manualEntryInitiallyOpen = firstQueryValue(params.manual_entry_open) === "1"
    || Boolean(manualEntryErrorMessage);

  return (
    <main className={styles.shell}>
      <div className={styles.simpleContainer}>
        <header className={styles.simpleHero}>
          <div>
            <p className={styles.eyebrow}>Preparação editorial</p>
            <h1>Preparar fontes</h1>
          </div>
          <nav aria-label="Navegação editorial">
            <a href="/admin">Backoffice</a>
            <a className={styles.simplePrimaryLink} href="/admin/editorial/artigos">Artigos</a>
          </nav>
        </header>

        <ol className={styles.simpleSteps} aria-label="Percurso editorial">
          <li data-active="true"><span>1</span><strong>Atualidade</strong></li>
          <li><span>2</span><strong>Preparar fontes</strong></li>
          <li><span>3</span><strong>Artigos</strong></li>
        </ol>

        {sourcePackageErrorMessage ? (
          <p className={styles.simpleFeedbackError} role="status">{sourcePackageErrorMessage}</p>
        ) : null}
        {manualEntryErrorMessage ? (
          <p className={styles.simpleFeedbackError} role="status">{manualEntryErrorMessage}</p>
        ) : manualEntrySuccessMessage ? (
          <p className={styles.simpleFeedbackSuccess} role="status">{manualEntrySuccessMessage}</p>
        ) : null}
        {inboxErrorMessage ? (
          <p className={styles.simpleFeedbackError} role="status">{inboxErrorMessage}</p>
        ) : inboxSuccessMessage ? (
          <p className={styles.simpleFeedbackSuccess} role="status">{inboxSuccessMessage}</p>
        ) : null}
        {feedErrorMessage ? (
          <p className={styles.simpleFeedbackError} role="status">{feedErrorMessage}</p>
        ) : feedSuccessMessage ? (
          <p className={styles.simpleFeedbackSuccess} role="status">
            {feedSuccessMessage}
            {feedFailed > 0 ? " Algumas ligações não puderam ser lidas." : ""}
          </p>
        ) : null}

        <nav className={styles.inboxTabs} aria-label="Estados da atualidade">
          <a href={inboxHref("pending", period, sourceCode, query)} data-active={view === "pending"}>
            Por rever <span>{inboxResult.ok ? inboxResult.value.pendingCount : 0}</span>
          </a>
          <a href={inboxHref("working", period, sourceCode, query)} data-active={view === "working"}>
            Em trabalho <span>{inboxResult.ok ? inboxResult.value.workingCount : 0}</span>
          </a>
          <a href={inboxHref("archive", period, sourceCode, query)} data-active={view === "archive"}>
            Arquivo <span>{inboxResult.ok ? inboxResult.value.archiveCount : 0}</span>
          </a>
        </nav>

        <section className={styles.simpleToolbar} aria-labelledby="current-feed-title">
          <div>
            <h2 id="current-feed-title">{viewTitle(view)}</h2>
            <p>{viewDescription(view)}</p>
          </div>
          <div className={styles.simpleToolbarActions}>
            <form method="get" className={styles.simpleFilters}>
              <input type="hidden" name="view" value={view} />
              <label className={styles.simpleSearchField}>
                <span>Tema</span>
                <input
                  type="search"
                  name="query"
                  defaultValue={query}
                  placeholder="Pesquisar"
                />
              </label>
              <label>
                <span>Período</span>
                <select name="period" defaultValue={period}>
                  <option value="1">24 horas</option>
                  <option value="7">7 dias</option>
                  <option value="30">30 dias</option>
                  <option value="all">Tudo</option>
                </select>
              </label>
              <label>
                <span>Fonte</span>
                <select name="source" defaultValue={sourceCode ?? ""}>
                  <option value="">Todas</option>
                  {availableSources.map((source) => (
                    <option value={source.code} key={source.code}>{source.name}</option>
                  ))}
                  <option value={MANUAL_NEWSROOM_SOURCE_CODE}>{MANUAL_NEWSROOM_SOURCE_LABEL}</option>
                </select>
              </label>
              <button type="submit">Pesquisar</button>
            </form>
            <form action="/api/admin/editorial/redacao-automatica/current-feed" method="post">
              <input type="hidden" name="view" value={view} />
              <input type="hidden" name="query" value={query} />
              <input type="hidden" name="period" value={period} />
              <input type="hidden" name="source" value={sourceCode ?? ""} />
              <button className={styles.simpleRefreshButton} type="submit">Atualizar</button>
            </form>
            <ManualNewsEntryForm
              submissionId={manualSubmissionId}
              maxDate={manualEntryMaxDate}
              initiallyOpen={manualEntryInitiallyOpen}
            />
          </div>
        </section>

        {!inboxResult.ok ? (
          <p className={styles.simpleEmpty}>Não foi possível ler a atualidade.</p>
        ) : articles.length === 0 ? (
          <p className={styles.simpleEmpty}>
            {query
              ? `Não existem notícias nesta área relacionadas com “${query}”.`
              : view === "pending"
                ? "Não há notícias por rever neste período."
                : view === "working"
                  ? "Não há notícias em trabalho."
                  : "O arquivo ainda está vazio neste período."}
          </p>
        ) : (
          <form
            action="/api/admin/editorial/redacao-automatica/source-package"
            method="post"
            id="create-editorial-source-package"
            className={styles.simpleComposition}
          >
            <input type="hidden" name="inbox_return_to" value={returnTo} />
            <div className={styles.inboxBlockSummary}>
              <strong>
                {view === "pending"
                  ? `Bloco atual: ${visibleArticles.length} de ${articles.length} por rever`
                  : `${articles.length} notícias nesta área`}
              </strong>
              {view === "pending" ? (
                <span>Decide o que fica em trabalho. No fim, fecha o bloco para não voltares a lê-lo.</span>
              ) : null}
            </div>

            <ol className={styles.simpleFeedList} data-current-feed-list>
              {visibleArticles.map((article, index) => (
                <li key={article.id} data-current-feed-item hidden={view !== "pending" && index >= REVIEW_BLOCK_SIZE}>
                  <label className={styles.simpleFeedChoice}>
                    <input
                      type="checkbox"
                      name="newsroom_article_id"
                      value={article.id}
                      defaultChecked={article.id === requestedArticleId}
                      disabled={!canUseInSourcePackage(article)}
                      data-source-package-source
                    />
                    <span>Escolher</span>
                  </label>
                  <input
                    type="hidden"
                    name={`source_snapshot_${article.id}`}
                    value={article.latestSnapshotId ?? ""}
                  />
                  {article.imageUrl ? (
                    <div className={styles.simpleFeedImage}>
                      <img src={article.imageUrl} alt="" loading="lazy" />
                    </div>
                  ) : null}
                  <div className={styles.simpleFeedContent}>
                    <div className={styles.simpleFeedMeta}>
                      <strong>{sourceNames.get(article.sourceCode) ?? article.sourceCode}</strong>
                      <span className={styles.simpleFeedBadge} data-kind={article.editorial.label}>
                        {inboxLabel(article)}
                      </span>
                      {article.editorial.changedAfterReview && article.editorial.view === "working" ? (
                        <span className={styles.simpleFeedBadge} data-kind="updated">Atualizada</span>
                      ) : null}
                      {article.publishedAt ? (
                        <time dateTime={article.publishedAt}>
                          {formatNewsroomPublishedAt(
                            article.publishedAt,
                            article.publishedAtPrecision,
                          )}
                        </time>
                      ) : null}
                    </div>
                    <h3>{article.title}</h3>
                    {article.summary || article.subtitle ? (
                      <p>{article.summary ?? article.subtitle}</p>
                    ) : null}
                    <div className={styles.inboxCardFooter}>
                      {article.sourceUrl && !article.isManualEntry ? (
                        <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer">
                          Abrir fonte
                        </a>
                      ) : <span />}
                      {article.latestSnapshotId ? (
                        <div className={styles.inboxCardActions}>
                          {article.editorial.view !== "working" ? (
                            <button
                              type="submit"
                              name="inbox_action"
                              value={newsroomEditorialInboxActionValue(
                                "working",
                                article.id,
                                article.latestSnapshotId,
                              )}
                              formAction="/api/admin/editorial/redacao-automatica/inbox"
                              formMethod="post"
                              formNoValidate
                            >
                              Em trabalho
                            </button>
                          ) : null}
                          {article.editorial.view !== "archive" || article.editorial.label !== "seen" ? (
                            <button
                              type="submit"
                              name="inbox_action"
                              value={newsroomEditorialInboxActionValue(
                                "seen",
                                article.id,
                                article.latestSnapshotId,
                              )}
                              formAction="/api/admin/editorial/redacao-automatica/inbox"
                              formMethod="post"
                              formNoValidate
                            >
                              Vista
                            </button>
                          ) : null}
                          {article.editorial.view !== "archive" || article.editorial.label !== "dismissed" ? (
                            <button
                              type="submit"
                              name="inbox_action"
                              value={newsroomEditorialInboxActionValue(
                                "dismissed",
                                article.id,
                                article.latestSnapshotId,
                              )}
                              formAction="/api/admin/editorial/redacao-automatica/inbox"
                              formMethod="post"
                              formNoValidate
                            >
                              Dispensar
                            </button>
                          ) : null}
                          {article.editorial.view === "archive" ? (
                            <button
                              type="submit"
                              name="inbox_action"
                              value={newsroomEditorialInboxActionValue(
                                "reopen",
                                article.id,
                                article.latestSnapshotId,
                              )}
                              formAction="/api/admin/editorial/redacao-automatica/inbox"
                              formMethod="post"
                              formNoValidate
                            >
                              Voltar a rever
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            {view !== "pending" ? <CurrentFeedReveal total={visibleArticles.length} /> : null}

            {view === "pending" && blockItems.length > 0 ? (
              <section className={styles.inboxCloseBlock}>
                {blockItems.map((article) => (
                  <input
                    key={article.id}
                    type="hidden"
                    name="inbox_block_item"
                    value={`${article.id}:${article.latestSnapshotId}`}
                  />
                ))}
                <div>
                  <strong>Terminaste este bloco?</strong>
                  <span>
                    As notícias que não colocaste em trabalho passam a vistas e desaparecem de Por rever.
                  </span>
                </div>
                <button
                  type="submit"
                  name="inbox_action"
                  value="close_block"
                  formAction="/api/admin/editorial/redacao-automatica/inbox"
                  formMethod="post"
                  formNoValidate
                >
                  Fechar este bloco
                </button>
              </section>
            ) : null}

            <section className={styles.simpleInstructions} aria-labelledby="source-package-title">
              <div>
                <p className={styles.sectionEyebrow}>Pacote editorial de fontes</p>
                <h2 id="source-package-title">Preparar ficheiro Markdown</h2>
                <p>
                  Seleciona entre 1 e 20 notícias, escolhe o género e acrescenta a tua orientação.
                  O sistema junta a instrução de redação às fontes integrais e guarda as imagens
                  localmente. Nada é enviado à IA.
                </p>
              </div>

              <div className={styles.sourcePackageEditorialFields}>
                <fieldset className={styles.sourcePackageGenreFieldset}>
                  <legend>Género jornalístico</legend>
                  <div className={styles.sourcePackageGenreOptions}>
                    {EDITORIAL_SOURCE_PACKAGE_GENRES.map((genre, index) => (
                      <label key={genre.value}>
                        <input
                          type="radio"
                          name="editorial_genre"
                          value={genre.value}
                          defaultChecked={index === 0}
                        />
                        <span>{genre.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label>
                  <span>Título sugerido <small>opcional</small></span>
                  <input
                    type="text"
                    name="suggested_title"
                    maxLength={EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH}
                    placeholder="Escreve uma proposta para a IA melhorar ou substituir"
                  />
                </label>

                <label>
                  <span>Instruções adicionais <small>opcional</small></span>
                  <textarea
                    name="editorial_instructions"
                    rows={5}
                    maxLength={EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH}
                    placeholder="Ex.: dar prioridade às declarações principais; evitar centrar o texto na arbitragem; usar tom crítico sem adjetivação excessiva."
                  />
                </label>

                <p className={styles.sourcePackageEditorialNote}>
                  O ficheiro começa pela tarefa editorial correspondente ao género escolhido,
                  seguida do título sugerido, das tuas instruções e das fontes integrais.
                </p>
              </div>

              <div className={styles.simpleCreateAction}>
                <span data-source-package-selection-count>0 notícias selecionadas</span>
                <button
                  type="submit"
                  data-source-package-submit
                  disabled
                >
                  Preparar fontes
                </button>
                <span data-source-package-submit-status role="status" hidden />
              </div>
            </section>
            <SourcePackageSubmitEnhancer />
          </form>
        )}
      </div>
    </main>
  );
}
