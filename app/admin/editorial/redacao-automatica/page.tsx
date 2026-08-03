import {
  listCurrentNewsroomArticles,
  searchNewsroomArticles,
  type NewsroomArticleSummary,
} from "@/lib/redacao-automatica/newsroom-article-repository";
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

function canUseInSourcePackage(article: NewsroomArticleSummary): boolean {
  return article.hasUsableSnapshot
    && ["detected", "normalized", "ready_for_review"].includes(article.processingStatus);
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
  const feedResult = query
    ? await searchNewsroomArticles({ query, periodDays, sourceCode })
    : await listCurrentNewsroomArticles({ periodDays, sourceCode });
  const articles = feedResult.ok ? feedResult.value.items : [];
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
  const feedBreakdownMessage = `Novas: ${feedCreated}. Atualizadas: ${feedUpdated}. Já estavam no arquivo: ${feedExisting}.`;
  const feedSuccessMessage = feedState === "up_to_date"
    ? feedBreakdownMessage
    : feedState === "updated"
      ? feedBreakdownMessage
      : feedState === "partial"
        ? feedClassified > 0
          ? feedBreakdownMessage
          : "A atualização ficou incompleta. Tenta novamente."
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
        {feedErrorMessage ? (
          <p className={styles.simpleFeedbackError} role="status">{feedErrorMessage}</p>
        ) : feedSuccessMessage ? (
          <p className={styles.simpleFeedbackSuccess} role="status">
            {feedSuccessMessage}
            {feedFailed > 0 ? " Algumas ligações não puderam ser lidas." : ""}
          </p>
        ) : null}

        <section className={styles.simpleToolbar} aria-labelledby="current-feed-title">
          <div>
            <h2 id="current-feed-title">Atualidade</h2>
          </div>
          <div className={styles.simpleToolbarActions}>
            <form method="get" className={styles.simpleFilters}>
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

        {!feedResult.ok ? (
          <p className={styles.simpleEmpty}>Não foi possível ler a atualidade.</p>
        ) : articles.length === 0 ? (
          <p className={styles.simpleEmpty}>
            {query ? `Não existem notícias relacionadas com “${query}”.` : "Não existem notícias neste período."}
          </p>
        ) : (
          <form
            action="/api/admin/editorial/redacao-automatica/source-package"
            method="post"
            id="create-editorial-source-package"
            className={styles.simpleComposition}
          >
            <ol className={styles.simpleFeedList} data-current-feed-list>
              {articles.map((article, index) => (
                <li key={article.id} data-current-feed-item hidden={index >= 24}>
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
                    {article.sourceUrl && !article.isManualEntry ? (
                      <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer">
                        Abrir fonte
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
            <CurrentFeedReveal total={articles.length} />

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
