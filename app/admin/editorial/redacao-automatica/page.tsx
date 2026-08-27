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
  isEditorialSourcePackageLocation,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import {
  readEditorialSourcePackage,
} from "@/lib/redacao-automatica/editorial-source-package";

import SourcePackageSubmitEnhancer from "./_sourcePackageSubmitEnhancer";
import UsedDossierList from "./_usedDossierList";
import InboxBulkActions from "./_inboxBulkActions";
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
  reuse?: Readonly<{
    year: string;
    month: string;
    packageId: string;
    articlePosition: number;
  }> | null,
): string {
  const params = new URLSearchParams({ view, period });

  if (sourceCode) {
    params.set("source", sourceCode);
  }

  if (query) {
    params.set("query", query);
  }

  if (view === "working" && reuse) {
    params.set("reuse_year", reuse.year);
    params.set("reuse_month", reuse.month);
    params.set("reuse_package", reuse.packageId);
    params.set("reuse_article", String(reuse.articlePosition));
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
  if (article.editorial.view === "used") {
    return "Utilizada";
  }

  return article.editorial.label === "dismissed" ? "Sem interesse" : "Lida";
}

function viewTitle(view: NewsroomEditorialInboxView): string {
  if (view === "working") {
    return "Em trabalho";
  }
  if (view === "used") {
    return "Utilizadas";
  }
  if (view === "archive") {
    return "Arquivo";
  }
  return "Por rever";
}

function viewDescription(view: NewsroomEditorialInboxView): string {
  if (view === "working") {
    return "Notícias que decidiste trabalhar agora ou manter disponíveis para um artigo.";
  }
  if (view === "used") {
    return "Fontes que já deram origem a artigos publicados, organizadas pelos Dossiês em que foram utilizadas.";
  }
  if (view === "archive") {
    return "Notícias que decidiste não trabalhar neste momento.";
  }
  return "Notícias novas ou atualizadas que ainda precisam de uma decisão editorial.";
}

const sourcePackageErrorMessages: Record<string, string> = {
  input_invalid: "Seleciona entre 1 e 20 notícias e confirma os dados editoriais do pacote.",
  source_read_failed: "Não foi possível ler as notícias selecionadas neste momento.",
  update_target_read_failed: "Não foi possível ler os artigos publicados que este Dossiê pretende atualizar.",
  update_target_invalid: "Um dos artigos publicados associados ao Dossiê já não corresponde ao alvo esperado. A atualização foi bloqueada.",
  package_write_failed: "Não foi possível guardar o pacote editorial neste momento.",
};

const dossierJoinErrorMessages: Record<string, string> = {
  input_invalid: "Seleciona pelo menos dois Dossiês válidos.",
  canonical_invalid: "Escolhe qual dos artigos publicados deve ficar como principal.",
  canonical_read_failed: "Não foi possível confirmar o artigo principal.",
  package_read_failed: "Não foi possível recuperar um dos Dossiês selecionados.",
  dossier_empty: "Um dos Dossiês selecionados já não contém fontes utilizáveis.",
  source_limit_exceeded: "A união ultrapassa o limite atual de 20 fontes por Dossiê.",
  source_normalization_failed: "As fontes dos Dossiês não puderam ser consolidadas com segurança.",
  source_read_failed: "Não foi possível reler uma das fontes consolidadas.",
  package_write_failed: "Não foi possível guardar o Dossiê consolidado.",
  usage_mark_failed: "O novo Dossiê foi criado, mas não ficou associado ao artigo principal.",
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
  ante_title_invalid: "Escreve um antetítulo válido.",
  title_invalid: "Escreve um título válido.",
  post_title_invalid: "Escreve um pós-título / resumo válido.",
  author_invalid: "Indica o autor.",
  body_invalid: "Escreve um corpo válido.",
  published_date_invalid: "Escolhe uma data válida.",
  published_time_invalid: "Escolhe uma hora válida.",
  published_at_future: "A data/hora não pode estar no futuro.",
  image_invalid: "Escolhe uma imagem válida.",
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

  const reuseYear = firstQueryValue(params.reuse_year) ?? "";
  const reuseMonth = firstQueryValue(params.reuse_month) ?? "";
  const reusePackageId = firstQueryValue(params.reuse_package) ?? "";
  const reuseArticlePosition = Number(firstQueryValue(params.reuse_article));

  const reuseLocation = isEditorialSourcePackageLocation({
    year: reuseYear,
    month: reuseMonth,
    packageId: reusePackageId,
  }) && Number.isInteger(reuseArticlePosition) && reuseArticlePosition > 0
    ? {
        year: reuseYear,
        month: reuseMonth,
        packageId: reusePackageId,
        articlePosition: reuseArticlePosition,
      }
    : null;

  const reusePackageResult = view === "working" && reuseLocation
    ? await readEditorialSourcePackage(reuseLocation)
    : null;

  const reuseManifest = reusePackageResult?.ok
    ? reusePackageResult.value.manifest
    : null;

  const reuseEntries = reuseManifest && reuseLocation
    ? reuseManifest.entries.filter(
        (entry) => entry.articlePosition === reuseLocation.articlePosition,
      )
    : [];

  const reuseState = reuseManifest
    && reuseLocation
    && reuseEntries.length > 0
    ? {
        ...reuseLocation,
        genre: reuseManifest.genre,
        suggestedTitle: reuseManifest.suggestedTitle,
        additionalInstructions: reuseManifest.additionalInstructions,
        entries: reuseEntries,
      }
    : null;

  const reuseInstructions = reuseState
    ? [
        `ATUALIZAÇÃO DE DOSSIÊ: as primeiras ${reuseState.entries.length} fontes já pertenciam a este assunto. As fontes selecionadas agora são informação nova. Reavalie integralmente o assunto, preserve a informação anterior que continue relevante e integre o novo segundo a sua importância jornalística.`,
        reuseState.additionalInstructions,
      ].filter(Boolean).join("\n\n")
    : "";

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
  const returnTo = inboxHref(
    view,
    period,
    sourceCode,
    query,
    reuseState,
  );
  const sourcePackageErrorCode = firstQueryValue(params.package_error);
  const sourcePackageErrorMessage = sourcePackageErrorCode
    ? sourcePackageErrorMessages[sourcePackageErrorCode] ?? "Não foi possível preparar as fontes."
    : null;
  const dossierJoinErrorCode =
    firstQueryValue(params.dossier_join_error);
  const dossierJoinErrorMessage = dossierJoinErrorCode
    ? dossierJoinErrorMessages[dossierJoinErrorCode]
      ?? "Não foi possível juntar os Dossiês."
    : null;

  const dossiersJoined =
    firstQueryValue(params.dossiers_joined) === "1";
  const joinedSources =
    nonNegativeIntegerQueryValue(params.joined_sources);

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
      ? `${inboxCount} ${inboxCount === 1 ? "notícia colocada" : "notícias colocadas"} em trabalho.`
      : inboxState === "seen"
        ? "Notícia marcada como lida."
        : inboxState === "dismissed"
          ? `${inboxCount} ${inboxCount === 1 ? "notícia marcada" : "notícias marcadas"} como sem interesse e enviada${inboxCount === 1 ? "" : "s"} para Arquivo.`
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
            <a href="/admin/editorial/redacao-automatica/publicacao-lote">Publicação em lote</a>
            <a className={styles.simplePrimaryLink} href="/admin/editorial/artigos">Artigos</a>
          </nav>
        </header>

        <ol className={styles.simpleSteps} aria-label="Percurso editorial">
          <li data-active="true"><span>1</span><strong>Atualidade</strong></li>
          <li><span>2</span><strong>Preparar fontes</strong></li>
          <li><span>3</span><strong>Artigos</strong></li>
        </ol>

        {sourcePackageErrorMessage ? (
          <p className={styles.simpleFeedbackError} role="status">
            {sourcePackageErrorMessage}
          </p>
        ) : null}

        {dossierJoinErrorMessage ? (
          <p className={styles.simpleFeedbackError} role="status">
            {dossierJoinErrorMessage}
          </p>
        ) : dossiersJoined ? (
          <p className={styles.simpleFeedbackSuccess} role="status">
            Dossiês unidos num único assunto.
            {joinedSources > 0
              ? ` ${joinedSources} fontes únicas ficaram reunidas.`
              : ""}
          </p>
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
          <a
            href={inboxHref(
              "working",
              period,
              sourceCode,
              query,
              reuseState,
            )}
            data-active={view === "working"}
          >
            Em trabalho <span>{inboxResult.ok ? inboxResult.value.workingCount : 0}</span>
          </a>
          <a href={inboxHref("archive", period, sourceCode, query)} data-active={view === "archive"}>
            Arquivo <span>{inboxResult.ok ? inboxResult.value.archiveCount : 0}</span>
          </a>
          <a href={inboxHref("used", period, sourceCode, query)} data-active={view === "used"}>
            Utilizadas <span>{inboxResult.ok ? inboxResult.value.usedCount : 0}</span>
          </a>
        </nav>

        <section className={styles.simpleToolbar} aria-labelledby="current-feed-title">
          <div className={styles.simpleToolbarHeader}>
            <div>
              <h2 id="current-feed-title">{viewTitle(view)}</h2>
              <p>{viewDescription(view)}</p>
            </div>
            <div className={styles.simpleToolbarPrimaryActions}>
              <form action="/api/admin/editorial/redacao-automatica/current-feed" method="post">
                <input type="hidden" name="view" value={view} />
                <input type="hidden" name="query" value={query} />
                <input type="hidden" name="period" value={period} />
                <input type="hidden" name="source" value={sourceCode ?? ""} />

                {view === "working" && reuseState ? (
                  <>
                    <input
                      type="hidden"
                      name="reuse_year"
                      value={reuseState.year}
                    />
                    <input
                      type="hidden"
                      name="reuse_month"
                      value={reuseState.month}
                    />
                    <input
                      type="hidden"
                      name="reuse_package"
                      value={reuseState.packageId}
                    />
                    <input
                      type="hidden"
                      name="reuse_article"
                      value={reuseState.articlePosition}
                    />
                  </>
                ) : null}
                <button className={styles.simpleRefreshButton} type="submit">Atualizar</button>
              </form>
              <ManualNewsEntryForm
                submissionId={manualSubmissionId}
                maxDate={manualEntryMaxDate}
                initiallyOpen={manualEntryInitiallyOpen}
              />
            </div>
          </div>
          <form method="get" className={styles.simpleFilters}>
            <input type="hidden" name="view" value={view} />

            {view === "working" && reuseState ? (
              <>
                <input
                  type="hidden"
                  name="reuse_year"
                  value={reuseState.year}
                />
                <input
                  type="hidden"
                  name="reuse_month"
                  value={reuseState.month}
                />
                <input
                  type="hidden"
                  name="reuse_package"
                  value={reuseState.packageId}
                />
                <input
                  type="hidden"
                  name="reuse_article"
                  value={reuseState.articlePosition}
                />
              </>
            ) : null}
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
                  : view === "used"
                    ? "Ainda não há fontes utilizadas neste período."
                    : "O arquivo ainda está vazio neste período."}
          </p>
        ) : (
          <form
            action="/api/admin/editorial/redacao-automatica/source-package"
            method="post"
            id="create-editorial-source-package"
            className={styles.simpleComposition}
            data-source-package-reuse={reuseState ? "1" : undefined}
            data-source-package-reuse-base-count={reuseState?.entries.length ?? 0}
          >
            <input type="hidden" name="inbox_return_to" value={returnTo} />

            {reuseState ? (
              <>
                <input type="hidden" name="reuse_year" value={reuseState.year} />
                <input type="hidden" name="reuse_month" value={reuseState.month} />
                <input
                  type="hidden"
                  name="reuse_package"
                  value={reuseState.packageId}
                />
                <input
                  type="hidden"
                  name="reuse_article"
                  value={reuseState.articlePosition}
                />

                <section
                  className={styles.reuseDossierBanner}
                  aria-labelledby="reuse-dossier-title"
                >
                  <div className={styles.reuseDossierHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Dossiê existente</p>
                      <h2 id="reuse-dossier-title">Reutilizar Dossiê</h2>
                      <p>
                        As fontes anteriores já estão carregadas. Seleciona abaixo
                        apenas a informação nova que queres acrescentar.
                      </p>
                    </div>

                    <strong>
                      {reuseState.entries.length}{" "}
                      {reuseState.entries.length === 1
                        ? "fonte anterior"
                        : "fontes anteriores"}
                    </strong>
                  </div>

                  <ol className={styles.reuseDossierSources}>
                    {reuseState.entries.map((entry, index) => (
                      <li
                        key={`${entry.newsroomArticleId ?? "fonte"}-${index}`}
                      >
                        <span>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <strong>
                            {entry.title ?? "Fonte anteriormente utilizada"}
                          </strong>
                          <small>
                            {entry.sourceName ?? "Fonte"}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <p className={styles.reuseDossierNote}>
                    As fontes anteriores mantêm-se e aqui selecionam-se apenas as
                    novas fontes. As imagens de cada peça são decididas ou revistas
                    depois, em Saídas editoriais do Dossiê.
                  </p>
                </section>
              </>
            ) : null}
            <div className={styles.inboxBlockSummary}>
              <strong>
                {view === "pending"
                  ? `Bloco atual: ${visibleArticles.length} de ${articles.length} por rever`
                  : `${articles.length} notícias nesta área`}
              </strong>
              {view === "pending" ? (
                <span>Marca uma ou várias notícias e decide em conjunto: Em trabalho ou Sem interesse.</span>
              ) : view === "working" ? (
                <span>Seleciona uma ou várias notícias e envia-as em conjunto para Sem interesse.</span>
              ) : null}
            </div>

            {view === "used" ? (
              <UsedDossierList
                articles={visibleArticles}
                sourceNames={sourceNames}
              />
            ) : (
            <ol className={styles.simpleFeedList} data-current-feed-list>
              {visibleArticles.map((article, index) => (
                <li key={article.id} data-current-feed-item hidden={view !== "pending" && index >= REVIEW_BLOCK_SIZE}>
                  {view === "pending" && article.latestSnapshotId ? (
                    <label className={styles.simpleFeedChoice}>
                      <input
                        type="checkbox"
                        name="inbox_bulk_item"
                        value={`${article.id}:${article.latestSnapshotId}`}
                        data-inbox-bulk-item
                      />
                      <span>Selecionar</span>
                    </label>
                  ) : view === "working" ? (
                    <>

                      <input
                        type="hidden"
                        name={`source_snapshot_${article.id}`}
                        value={article.latestSnapshotId ?? ""}
                      />
                      <label
                        className={styles.sourcePackageGroupChoice}
                        data-source-package-group-control
                        hidden
                      >
                        <span>Dossiê</span>
                        <select
                          name={`source_group_${article.id}`}
                          data-source-package-group
                          disabled
                          aria-label={`Dossiê para ${article.title}`}
                        />
                      </label>
                    </>
                  ) : null}
                  {article.imageUrl ? (
                    <div className={styles.simpleFeedImage}>
                      <img src={article.imageUrl} alt="" loading="lazy" />
                    </div>
                  ) : null}
                  <div className={styles.simpleFeedContent}>
                    {view === "working" ? (
                      <div className={styles.workingChoiceRow}>
                        <label className={styles.workingChoice}>
                          <input
                            type="checkbox"
                            name="newsroom_article_id"
                            value={article.id}
                            defaultChecked={article.id === requestedArticleId}
                            disabled={!canUseInSourcePackage(article)}
                            data-source-package-source
                          />
                          <span>Fonte</span>
                        </label>

                        {article.latestSnapshotId ? (
                          <label className={styles.workingChoice}>
                            <input
                              type="checkbox"
                              name="inbox_bulk_item"
                              value={`${article.id}:${article.latestSnapshotId}`}
                              data-inbox-bulk-item
                            />
                            <span>Sem interesse</span>
                          </label>
                        ) : null}
                      </div>
                    ) : null}
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
                      {article.latestSnapshotId && view === "archive" ? (
                        <div className={styles.inboxCardActions}>
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
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            )}

            {view !== "pending" && view !== "used" ? (
              <CurrentFeedReveal total={visibleArticles.length} />
            ) : null}

            {view === "pending" || view === "working" ? (
              <InboxBulkActions view={view} />
            ) : null}


            {view === "working" ? (
              <>
              <section className={styles.simpleInstructions} aria-labelledby="source-package-title">
              <div>
                <p className={styles.sectionEyebrow}>Pacote editorial de fontes</p>
                <h2 id="source-package-title">Preparar artigos</h2>
                <p>
                  {reuseState ? (
                    <>
                      O Dossiê já contém {reuseState.entries.length}{" "}
                      {reuseState.entries.length === 1 ? "fonte" : "fontes"}.
                      Seleciona apenas as novas fontes a acrescentar. O pacote final
                      voltará a incluir toda a informação anterior mais estas novas
                      fontes. Nada é enviado automaticamente à IA.
                    </>
                  ) : (
                    <>
                      Seleciona entre 1 e 20 fontes. Cada fonte começa num Dossiê
                      próprio; quando duas ou mais pertencem ao mesmo assunto,
                      junta-as no mesmo Dossiê. Cada Dossiê pode dar origem a um ou
                      mais artigos finais. O número de artigos, o foco de cada peça
                      e as respetivas imagens são definidos depois de preparar as fontes.
                      Nada é enviado à IA.
                    </>
                  )}
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
                          defaultChecked={
                            reuseState
                              ? genre.value === reuseState.genre
                              : index === 0
                          }
                        />
                        <span>{genre.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label data-source-package-suggested-title hidden>
                  <span>Assunto principal <small>opcional · apenas para um artigo</small></span>
                  <input
                    type="text"
                    name="suggested_title"
                    defaultValue={reuseState?.suggestedTitle ?? ""}
                    maxLength={EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH}
                    placeholder="Indica o tema, protagonista ou foco principal da notícia"
                  />
                </label>

                <label>
                  <span>Instruções adicionais <small>opcional</small></span>
                  <textarea
                    name="editorial_instructions"
                    defaultValue={reuseInstructions}
                    rows={5}
                    maxLength={EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH}
                    placeholder="Ex.: dar prioridade às declarações principais; evitar centrar o texto na arbitragem; usar tom crítico sem adjetivação excessiva."
                  />
                </label>

                <p className={styles.sourcePackageEditorialNote}>
                  O ficheiro mantém cada Dossiê separado. Cada Dossiê pode dar origem
                  a um ou mais artigos finais; o número de artigos e as respetivas imagens
                  são definidos depois de preparar as fontes. As instruções adicionais
                  aplicam-se ao lote inteiro.
                </p>
              </div>

              <div className={styles.simpleCreateAction}>
                <span data-source-package-selection-count>0 fontes selecionadas</span>
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
              </>
            ) : null}
          </form>
        )}
      </div>
    </main>
  );
}
