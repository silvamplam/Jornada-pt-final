import {
  listCurrentNewsroomArticles,
  searchNewsroomArticles,
  type NewsroomArticleSummary,
} from "@/lib/redacao-automatica/newsroom-article-repository";
import { getEditorialProfileOverview } from "@/lib/redacao-automatica/editorial-profile-repository";
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

import CompositionSubmitEnhancer from "./_compositionSubmitEnhancer";
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

function canUseInComposition(article: NewsroomArticleSummary): boolean {
  return article.hasUsableSnapshot
    && ["detected", "normalized", "ready_for_review"].includes(article.processingStatus);
}

const compositionErrorMessages: Record<string, string> = {
  input_invalid: "Escolhe pelo menos uma notícia e escreve as instruções para a IA.",
  submission_id_invalid: "O pedido perdeu validade. Atualiza a página e tenta novamente.",
  submission_payload_conflict: "Este pedido já foi usado com dados diferentes. Atualiza a página.",
  source_not_found: "Uma das notícias selecionadas já não está disponível.",
  source_not_eligible: "Uma das notícias selecionadas ainda não pode ser utilizada.",
  source_snapshot_missing: "Uma das notícias selecionadas ainda não tem conteúdo utilizável.",
  dossier_creation_failed: "Não foi possível preparar a notícia.",
  composition_state_unavailable: "A notícia foi iniciada, mas não foi possível preparar as fontes.",
  article_plan_save_failed: "A notícia foi guardada, mas a primeira versão não ficou preparada.",
  article_plan_ready_incomplete: "As instruções ou as fontes não são suficientes.",
  draft_creation_failed: "Não foi possível criar o rascunho para revisão.",
  generation_provider_unavailable: "A geração por IA não está configurada neste ambiente.",
  generation_input_too_large: "Foram selecionadas fontes a mais para uma única notícia.",
  generation_failed: "A IA não conseguiu produzir o texto neste momento.",
  generation_output_invalid: "A IA respondeu sem um texto utilizável.",
  generation_apply_conflict: "O rascunho foi alterado durante a geração e não foi substituído.",
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
  const editorialProfileResult = await getEditorialProfileOverview();
  const articles = feedResult.ok ? feedResult.value.items : [];
  const compositionSubmissionId = crypto.randomUUID();
  const compositionErrorCode = firstQueryValue(params.composition_error);
  const compositionErrorMessage = compositionErrorCode
    ? compositionErrorMessages[compositionErrorCode] ?? "Não foi possível criar a notícia."
    : null;
  const feedErrorCode = firstQueryValue(params.feed_error);
  const feedErrorMessage = feedErrorCode
    ? feedErrorMessages[feedErrorCode] ?? "Não foi possível atualizar a atualidade."
    : null;
  const feedState = firstQueryValue(params.feed_state);
  const feedAvailable = nonNegativeIntegerQueryValue(params.feed_available);
  const feedFailed = nonNegativeIntegerQueryValue(params.feed_failed);
  const feedSuccessMessage = feedState === "up_to_date"
    ? "A atualidade já está atualizada."
    : feedState === "updated"
      ? `${feedAvailable} ${feedAvailable === 1 ? "notícia nova ficou disponível" : "notícias novas ficaram disponíveis"}.`
      : feedState === "partial"
        ? feedAvailable > 0
          ? `${feedAvailable} ${feedAvailable === 1 ? "notícia nova ficou disponível" : "notícias novas ficaram disponíveis"}.`
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
            <p className={styles.eyebrow}>Redação automática</p>
            <h1>Criar notícia</h1>
          </div>
          <nav aria-label="Navegação editorial">
            <a href="/admin">Backoffice</a>
            <a href="/admin/editorial/redacao-automatica/linha-editorial">Linha editorial</a>
            <a className={styles.simplePrimaryLink} href="/admin/editorial/artigos">Revisão</a>
          </nav>
        </header>

        <ol className={styles.simpleSteps} aria-label="Percurso editorial">
          <li data-active="true"><span>1</span><strong>Atualidade</strong></li>
          <li><span>2</span><strong>Criar notícia</strong></li>
          <li><span>3</span><strong>Revisão</strong></li>
        </ol>

        {compositionErrorMessage ? (
          <p className={styles.simpleFeedbackError} role="status">{compositionErrorMessage}</p>
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
            action="/api/admin/editorial/redacao-automatica/dossies"
            method="post"
            id="create-editorial-composition"
            className={styles.simpleComposition}
          >
            <input type="hidden" name="action" value="compose" />
            <input type="hidden" name="submission_id" value={compositionSubmissionId} />

            <ol className={styles.simpleFeedList} data-current-feed-list>
              {articles.map((article, index) => (
                <li key={article.id} data-current-feed-item hidden={index >= 24}>
                  <label className={styles.simpleFeedChoice}>
                    <input
                      type="checkbox"
                      name="newsroom_article_id"
                      value={article.id}
                      defaultChecked={article.id === requestedArticleId}
                      disabled={!canUseInComposition(article)}
                      data-composition-source
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
                      {article.usedInComposition ? (
                        <span className={styles.simpleFeedBadge}>Usada</span>
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

            <section className={styles.simpleInstructions} aria-labelledby="ai-instructions-title">
              <div>
                <p className={styles.sectionEyebrow}>Criar notícia</p>
                <h2 id="ai-instructions-title">Instruções à IA</h2>
              </div>
              <label>
                <span>Instruções</span>
                <textarea
                  name="ai_instructions"
                  maxLength={6000}
                  rows={6}
                  required
                  placeholder="Ex.: Destacar a ausência do jogador, explicar a consequência para o próximo jogo e não especular sobre o tempo de recuperação."
                />
              </label>
              {!editorialProfileResult.ok ? (
                <p className={styles.simpleFeedbackError} role="alert">
                  A linha editorial não está disponível.
                </p>
              ) : null}
              <div className={styles.simpleCreateAction}>
                <button
                  type="submit"
                  data-composition-submit
                  disabled={!editorialProfileResult.ok}
                >
                  Criar notícia
                </button>
                <span data-composition-submit-status role="status" hidden>
                  A IA está a preparar o texto para revisão.
                </span>
              </div>
            </section>
            <CompositionSubmitEnhancer />
          </form>
        )}
      </div>
    </main>
  );
}
