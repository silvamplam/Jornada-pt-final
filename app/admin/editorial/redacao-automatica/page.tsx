import {
  findNewsroomEditorialDraft,
  type LinkedEditorialArticle,
} from "@/lib/redacao-automatica/editorial-draft-service";
import {
  getNewsroomArticleById,
  searchNewsroomArticles,
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
import {
  editorialWorkflowSteps,
  formatNewsroomPublishedAt,
} from "@/lib/redacao-automatica/editorial-workflow-ux";
import {
  hasNewsroomTopicSearchTerms,
  newsroomTopicPeriod,
  newsroomTopicPeriodDays,
} from "@/lib/redacao-automatica/newsroom-topic-search";
import {
  parseNewsroomExternalTopicSearchSourceReports,
  type FailureReasonCount,
  type NewsroomTopicFailureStage,
  type NewsroomTopicSourceTechnicalReport,
} from "@/lib/redacao-automatica/newsroom-external-topic-search-internal";
import {
  MANUAL_NEWSROOM_SOURCE_CODE,
  MANUAL_NEWSROOM_SOURCE_LABEL,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";
import {
  isManualNewsroomSubmissionId,
  lisbonDateOnly,
} from "@/lib/redacao-automatica/manual-newsroom-entry-internal";
import { getEditorialProfileOverview } from "@/lib/redacao-automatica/editorial-profile-repository";

import CompositionSubmitEnhancer from "./_compositionSubmitEnhancer";
import ManualNewsEntryForm from "./_manualNewsEntryForm";
import styles from "./redacao-automatica.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type AutomaticNewsroomPageProps = {
  searchParams?: Promise<SearchParams>;
};

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
  pageSize: 0,
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

function nonNegativeIntegerQueryValue(value: string | string[] | undefined): number {
  const parsed = Number(firstQueryValue(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function queryIdSet(value: string | string[] | undefined): ReadonlySet<string> {
  const rawValue = firstQueryValue(value);
  return new Set(
    (rawValue ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
}

function topicSearchSourceReports(
  value: string | string[] | undefined,
): readonly NewsroomTopicSourceTechnicalReport[] {
  return parseNewsroomExternalTopicSearchSourceReports(firstQueryValue(value));
}

const failureStageLabels: Record<NewsroomTopicFailureStage, string> = {
  validation: "validação",
  configuration: "configuração",
  listing: "listagem",
  loading: "carregamento",
  article: "artigo",
  parsing: "análise",
  normalization: "normalização",
  persistence: "persistência",
  snapshot: "snapshot",
};

function topicSearchFailureLabel(failure: FailureReasonCount): string {
  const persistenceCode = failure.persistenceCode ?? (
    failure.code === "persistence_conflict"
    || failure.code === "persistence_unavailable"
      ? failure.code
      : null
  );
  if (persistenceCode === "persistence_conflict") {
    return "Conflito ao guardar o artigo";
  }
  if (persistenceCode === "persistence_unavailable") {
    return "Serviço de persistência indisponível";
  }

  if (failure.code === "http_error") {
    if (failure.statusCode === 403) {
      return "HTTP 403 — acesso recusado pela fonte";
    }
    if (failure.statusCode === 404) {
      return "HTTP 404 — página não encontrada";
    }
    return failure.statusCode === undefined
      ? "Erro HTTP ao consultar a fonte"
      : `HTTP ${failure.statusCode} — resposta recusada pela fonte`;
  }

  const labels: Partial<Record<FailureReasonCount["code"], string>> = {
    timeout: "A fonte não respondeu a tempo",
    redirect_blocked: "Redirecionamento não autorizado",
    response_too_large: "A página excedeu o tamanho permitido",
    unsupported_content: "A resposta não era uma página HTML suportada",
    load_failed: "Não foi possível carregar a página",
    parsing_failed: "Página não reconhecida ou não analisável",
    parse_failed: "Página não reconhecida ou não analisável",
    normalized_article_invalid: "Campos ou conteúdo obrigatório insuficiente",
    required_field_missing: "Campos ou conteúdo obrigatório insuficiente",
    persistence_failed: "Artigo lido mas não guardado",
  };

  return labels[failure.code]
    ?? `Falha técnica na etapa ${failureStageLabels[failure.stage]}`;
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

function canUseInComposition(article: NewsroomArticleSummary): boolean {
  return article.hasUsableSnapshot
    && ["detected", "normalized", "ready_for_review"].includes(article.processingStatus);
}

function compositionHref({
  topic,
  period,
  sourceCode,
  articleId,
}: {
  topic: string;
  period: string;
  sourceCode: string | null;
  articleId?: string;
}): string {
  const params = new URLSearchParams();
  if (topic) {
    params.set("topic", topic);
  }
  if (period) {
    params.set("period", period);
  }
  if (sourceCode) {
    params.set("source", sourceCode);
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
  returnTo,
  editorialArticle,
  draftLookupFailed,
  draftErrorMessage,
  reviewErrorMessage,
  reviewSuccessMessage,
}: {
  article: NewsroomArticleDetail;
  sourceName: string;
  returnTo: string;
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
        <div>
          <dt>Publicação</dt>
          <dd>
            {article.publishedAt
              ? formatNewsroomPublishedAt(
                  article.publishedAt,
                  article.publishedAtPrecision,
                )
              : "—"}
          </dd>
        </div>
        <div><dt>Modificação</dt><dd>{formatDate(article.modifiedAt)}</dd></div>
        <div><dt>Deteção</dt><dd>{formatDate(article.detectedAt)}</dd></div>
      </dl>

      {article.isManualEntry ? (
        <p className={styles.manualSourceNote}>
          Entrada manual — não existe uma ligação externa associada.
        </p>
      ) : (
        <div className={styles.sourceLinks}>
          {article.originalUrl ? (
            <a href={article.originalUrl} target="_blank" rel="noopener noreferrer">
              Abrir URL original
            </a>
          ) : null}
          {article.normalizedUrl ? <span title={article.normalizedUrl}>Origem preservada</span> : null}
        </div>
      )}

      <details className={styles.advancedAction}>
        <summary>Modo direto (avançado)</summary>
        <p className={styles.advancedActionIntro}>
          Cria um rascunho diretamente a partir desta fonte, sem composição de várias fontes.
        </p>
        <section className={styles.draftAction} aria-labelledby="editorial-draft-title">
          <div>
            <p className={styles.sectionEyebrow}>Integração editorial direta</p>
            <h4 id="editorial-draft-title">
              {article.processingStatus === "ready_for_review" || editorialArticle
                ? "Rascunho editorial"
                : "Validação editorial"}
            </h4>
          </div>
          {draftErrorMessage ? <p className={styles.draftActionError} role="status">{draftErrorMessage}</p> : null}
          {reviewErrorMessage ? <p className={styles.draftActionError} role="status">{reviewErrorMessage}</p> : null}
          {reviewSuccessMessage ? <p className={styles.reviewActionSuccess} role="status">{reviewSuccessMessage}</p> : null}
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
            <p className={styles.draftActionNote}>A validação editorial fica disponível quando existir conteúdo utilizável.</p>
          ) : article.processingStatus === "detected" || article.processingStatus === "normalized" ? (
            <form action="/api/admin/editorial/redacao-automatica/review" method="post">
              <input type="hidden" name="newsroom_article_id" value={article.id} />
              <input type="hidden" name="return_to" value={returnTo} />
              <p>Confirma que esta fonte pode avançar. Esta ação não cria nem publica qualquer artigo.</p>
              <button type="submit">Marcar como Por rever</button>
            </form>
          ) : article.processingStatus !== "ready_for_review" ? (
            <p className={styles.draftActionNote}>O estado atual do artigo não permite criar um rascunho direto.</p>
          ) : (
            <form action="/api/admin/editorial/redacao-automatica/drafts" method="post">
              <input type="hidden" name="newsroom_article_id" value={article.id} />
              <input type="hidden" name="return_to" value={returnTo} />
              <p>Cria um rascunho com o conteúdo desta fonte. A publicação continua manual.</p>
              <button type="submit">Criar rascunho editorial</button>
            </form>
          )}
        </section>
      </details>

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
          <h4 id="normalized-body-title">Conteúdo da fonte</h4>
          <span>{snapshot?.body.length ? "Disponível" : "Sem conteúdo"}</span>
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
          <p className={styles.detailEmpty}>O artigo ainda não tem conteúdo disponível.</p>
        )}
      </section>

      {snapshot ? (
        <details className={styles.technicalDetails}>
          <summary>Ver dados técnicos da fonte</summary>
          <section className={styles.provenance} aria-labelledby="technical-provenance-title">
            <h4 id="technical-provenance-title">Proveniência técnica</h4>
            <dl>
              <div><dt>Identificador externo</dt><dd>{article.externalId ?? "—"}</dd></div>
              <div><dt>Snapshot</dt><dd>{snapshot.id}</dd></div>
              <div><dt>Hash de conteúdo</dt><dd>{snapshot.contentHash}</dd></div>
              <div><dt>Extração</dt><dd>{formatDate(snapshot.extractedAt)}</dd></div>
              <div><dt>Blocos normalizados</dt><dd>{snapshot.body.length}</dd></div>
            </dl>
          </section>
        </details>
      ) : null}
    </article>
  );
}

export default async function AutomaticNewsroomPage({ searchParams }: AutomaticNewsroomPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedArticleId = firstQueryValue(params.articleId);
  const topic = firstQueryValue(params.topic) ?? "";
  const period = newsroomTopicPeriod(firstQueryValue(params.period));
  const sources = listRegisteredSources();
  const searchableSources = sources.filter((source) => (
    source.manualCollectionEnabled === true
    && Boolean(source.adapterKey?.trim())
    && source.operationalStatus !== "legal_hold"
    && source.operationalStatus !== "disabled"
  ));
  const requestedSourceCode = firstQueryValue(params.source);
  const searchSourceCode = searchableSources.some((source) => source.code === requestedSourceCode)
    ? requestedSourceCode
    : null;
  const sourceNames = new Map([
    ...sources.map((source) => [source.code, source.name] as const),
    [MANUAL_NEWSROOM_SOURCE_CODE, MANUAL_NEWSROOM_SOURCE_LABEL] as const,
  ]);
  const topicSearchRequested = hasNewsroomTopicSearchTerms(topic);
  const listResult = topicSearchRequested
    ? await searchNewsroomArticles({
      query: topic,
      periodDays: newsroomTopicPeriodDays(period),
      sourceCode: searchSourceCode,
    })
    : { ok: true as const, value: emptyArticlePage };
  const dossierListResult = await listEditorialDossiers(12);
  const editorialProfileResult = await getEditorialProfileOverview();
  const detailResult = selectedArticleId ? await getNewsroomArticleById(selectedArticleId) : null;
  const draftResult = selectedArticleId ? await findNewsroomEditorialDraft(selectedArticleId) : null;
  const articlePage = listResult.ok ? listResult.value : emptyArticlePage;
  const selectedArticle = detailResult?.ok ? detailResult.value : null;
  const selectedEditorialArticle = draftResult?.ok ? draftResult.value : null;
  const topicSearchFailed = topicSearchRequested && !listResult.ok;
  const externalSearchState = firstQueryValue(params.external_search_state);
  const externalSearchErrorCode = firstQueryValue(params.external_search_error);
  const externalSearchCandidateLinks = nonNegativeIntegerQueryValue(
    params.external_search_candidate_links,
  );
  const externalSearchRawDiscovered = nonNegativeIntegerQueryValue(
    params.external_search_raw_discovered,
  );
  const externalSearchRejectedLinks = nonNegativeIntegerQueryValue(
    params.external_search_rejected_links,
  );
  const externalSearchListingDuplicates = nonNegativeIntegerQueryValue(
    params.external_search_listing_duplicates,
  );
  const externalSearchUniqueCandidates = nonNegativeIntegerQueryValue(
    params.external_search_unique_candidates,
  );
  const externalSearchPositiveCandidates = nonNegativeIntegerQueryValue(
    params.external_search_positive_candidates,
  );
  const externalSearchZeroCandidates = nonNegativeIntegerQueryValue(
    params.external_search_zero_candidates,
  );
  const externalSearchPositiveTruncated = nonNegativeIntegerQueryValue(
    params.external_search_positive_truncated,
  );
  const externalSearchRecoveryAttempted = nonNegativeIntegerQueryValue(
    params.external_search_recovery_attempted,
  );
  const externalSearchAttemptedArticles = nonNegativeIntegerQueryValue(
    params.external_search_attempted_articles,
  );
  const externalSearchReadArticles = nonNegativeIntegerQueryValue(
    params.external_search_read_articles,
  );
  const externalSearchFailedSources = nonNegativeIntegerQueryValue(params.external_search_failed_sources);
  const externalSearchFailedArticles = nonNegativeIntegerQueryValue(params.external_search_failed_articles);
  const externalSearchExcludedMissingDate = nonNegativeIntegerQueryValue(
    params.external_search_excluded_missing_date,
  );
  const externalSearchExcludedInvalidDate = nonNegativeIntegerQueryValue(
    params.external_search_excluded_invalid_date,
  );
  const externalSearchExcludedFuture = nonNegativeIntegerQueryValue(
    params.external_search_excluded_future,
  );
  const externalSearchExcludedPeriod = nonNegativeIntegerQueryValue(
    params.external_search_excluded_period,
  );
  const externalSearchExcludedSnapshot = nonNegativeIntegerQueryValue(
    params.external_search_excluded_snapshot,
  );
  const externalSearchExcludedState = nonNegativeIntegerQueryValue(
    params.external_search_excluded_state,
  );
  const externalSearchExcludedTopic = nonNegativeIntegerQueryValue(
    params.external_search_excluded_topic,
  );
  const externalSearchExcludedDuplicate = nonNegativeIntegerQueryValue(
    params.external_search_excluded_duplicate,
  );
  const externalSearchSourceReports = topicSearchSourceReports(
    params.external_search_source_reports,
  );
  const collectedResultIds = queryIdSet(params.external_search_collected_ids);
  const collectedResultCount = articlePage.items.filter((article) => (
    collectedResultIds.has(article.id.toLowerCase())
  )).length;
  const availableResultCount = articlePage.items.length - collectedResultCount;
  const externalSearchErrorMessages: Record<string, string> = {
    input_invalid: "Escreve um tema com termos suficientes para pesquisar nas fontes.",
    source_unavailable: "A fonte selecionada ainda não permite pesquisa externa controlada.",
    collection_unavailable: "Não foi possível consultar as fontes selecionadas neste momento.",
    archive_unavailable: "Não foi possível consultar o arquivo persistido neste momento.",
  };
  const externalSearchErrorMessage = externalSearchErrorCode
    ? externalSearchErrorMessages[externalSearchErrorCode] ?? "Não foi possível concluir a pesquisa nas fontes."
    : null;
  const draftLookupFailed = draftResult !== null && !draftResult.ok;
  const searchReturnTo = compositionHref({ topic, period, sourceCode: searchSourceCode });

  const draftErrorCode = firstQueryValue(params.draft_error);
  const draftErrorMessages: Record<string, string> = {
    input_invalid: "O artigo selecionado não é válido.",
    service_unavailable: "O serviço editorial não está configurado.",
    newsroom_article_not_found: "O artigo da caixa de entrada já não existe.",
    newsroom_article_not_ready: "O artigo ainda não está disponível para validação editorial.",
    newsroom_snapshot_missing: "O artigo ainda não tem conteúdo utilizável.",
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
    newsroom_snapshot_missing: "O artigo ainda não tem conteúdo utilizável.",
    newsroom_article_not_reviewable: "O estado atual do artigo não permite marcá-lo como Por rever.",
    status_update_failed: "Não foi possível marcar o artigo como Por rever.",
  };
  const reviewErrorMessage = reviewErrorCode
    ? reviewErrorMessages[reviewErrorCode] ?? "Não foi possível concluir a validação editorial."
    : null;
  const reviewState = firstQueryValue(params.review_state);
  const reviewSuccessMessage = reviewState === "updated"
    ? "O artigo foi marcado como Por rever."
    : reviewState === "reused"
      ? "O artigo já estava marcado como Por rever."
      : null;

  const manualEntryErrorCode = firstQueryValue(params.manual_entry_error);
  const manualEntryErrorMessages: Record<string, string> = {
    submission_id_invalid: "O identificador persistente desta submissão é inválido. Atualiza a página antes de tentar novamente.",
    title_invalid: "Preenche um título válido com até 180 caracteres.",
    body_invalid: "Preenche o corpo da notícia em texto simples.",
    published_date_invalid: "Escolhe uma data de publicação real.",
    published_date_future: "A data da notícia não pode estar no futuro.",
    image_invalid: "A imagem não corresponde ao upload administrativo autorizado.",
    service_unavailable: "A entrada manual não está configurada neste ambiente.",
    submission_payload_conflict: "Esta submissão já foi usada com conteúdo diferente. A notícia anteriormente guardada foi preservada.",
    save_failed: "Não foi possível guardar a notícia manual neste momento.",
  };
  const manualEntryErrorMessage = manualEntryErrorCode
    ? manualEntryErrorMessages[manualEntryErrorCode] ?? "Não foi possível guardar a notícia manual."
    : null;
  const manualEntryState = firstQueryValue(params.manual_entry_state);
  const manualEntrySuccessMessage = manualEntryState === "created"
    ? "A notícia manual foi guardada no arquivo."
    : manualEntryState === "reused"
      ? "A notícia manual já estava guardada e foi reutilizada."
      : null;
  const requestedManualSubmissionId = firstQueryValue(params.manual_submission_id) ?? "";
  const manualSubmissionId = isManualNewsroomSubmissionId(requestedManualSubmissionId)
    ? requestedManualSubmissionId.trim().toLowerCase()
    : crypto.randomUUID();
  const manualEntryMaxDate = lisbonDateOnly(new Date())
    ?? new Date().toISOString().slice(0, 10);
  const manualEntryInitiallyOpen = firstQueryValue(params.manual_entry_open) === "1"
    || Boolean(manualEntryErrorMessage);

  const compositionErrorCode = firstQueryValue(params.composition_error);
  const compositionErrorMessages: Record<string, string> = {
    input_invalid: "Seleciona pelo menos uma fonte e preenche o assunto, a combinação e os destaques.",
    submission_id_invalid: "O identificador persistente desta submissão é inválido. Atualiza a página antes de tentar novamente.",
    submission_payload_conflict: "Esta submissão já foi usada com dados editoriais diferentes. O conjunto anterior foi preservado.",
    composition_failed: "Não foi possível criar ou retomar atomicamente esta composição.",
    generation_claim_failed: "A composição foi preservada, mas não foi possível reclamar a geração neste momento.",
    service_unavailable: "A composição editorial não está configurada neste ambiente.",
    source_not_found: "Uma das fontes selecionadas já não está disponível.",
    source_not_eligible: "Uma das fontes selecionadas ainda não pode ser utilizada.",
    source_snapshot_missing: "Uma das fontes ainda não tem conteúdo utilizável.",
    dossier_creation_failed: "Não foi possível preparar o trabalho editorial.",
    composition_state_unavailable: "O trabalho foi criado, mas não foi possível preparar as fontes para a composição.",
    article_plan_save_failed: "O trabalho foi guardado, mas não foi possível preparar a primeira versão.",
    article_plan_ready_incomplete: "As instruções ou as fontes não são suficientes para gerar a primeira versão.",
    draft_creation_failed: "O planeamento ficou guardado, mas não foi possível criar o rascunho.",
    generation_provider_unavailable: "A geração por IA não está configurada neste ambiente.",
    generation_input_too_large: "O conjunto de fontes é demasiado extenso para esta composição.",
    generation_failed: "A IA não conseguiu produzir a primeira versão neste momento.",
    generation_output_invalid: "A IA respondeu sem conteúdo editorial utilizável.",
    generation_apply_conflict: "O rascunho foi alterado durante a geração e não foi substituído.",
  };
  const compositionErrorMessage = compositionErrorCode
    ? compositionErrorMessages[compositionErrorCode] ?? "Não foi possível concluir a composição."
    : null;
  const compositionDossierId = firstQueryValue(params.composition_dossier_id);
  const compositionSubmissionId = crypto.randomUUID();

  const dossiers = dossierListResult.ok ? dossierListResult.value : [];

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Área editorial</p>
            <h1>Nova composição</h1>
            <p className={styles.description}>
              Pesquisa um tema nas fontes autorizadas, escolhe as notícias relacionadas e explica como a IA deve construir o artigo.
            </p>
          </div>
          <nav className={styles.heroActions} aria-label="Navegação da composição editorial">
            <a href="/admin">Voltar ao backoffice</a>
            <a href="/admin/editorial/redacao-automatica/linha-editorial">Linha editorial</a>
            <a className={styles.primaryAction} href="/admin/editorial/artigos">Artigos em revisão</a>
          </nav>
        </header>

        <section className={styles.compositionJourney} aria-labelledby="composition-journey-title">
          <div>
            <p className={styles.sectionEyebrow}>Percurso principal</p>
            <h2 id="composition-journey-title">Do tema à revisão final</h2>
            <p>A pesquisa consulta o arquivo e atualiza as páginas autorizadas. A publicação continua sempre dependente da revisão humana.</p>
          </div>
          <ol>
            <li><span>1</span><strong>Pesquisar tema</strong></li>
            <li><span>2</span><strong>Ver notícias relacionadas</strong></li>
            <li><span>3</span><strong>Escolher fontes</strong></li>
            <li><span>4</span><strong>Dar instruções</strong></li>
            <li><span>5</span><strong>Gerar primeira versão</strong></li>
            <li><span>6</span><strong>Rever e publicar nos Artigos</strong></li>
          </ol>
        </section>

        <section className={styles.topicSearch} aria-labelledby="topic-search-title">
          <div className={styles.compositionStepHeader}>
            <span>1</span>
            <div>
              <p className={styles.sectionEyebrow}>Pesquisa editorial</p>
              <h2 id="topic-search-title">Sobre o que queres escrever?</h2>
              <p>Consulta primeiro o arquivo e atualiza as páginas recentes das fontes autorizadas antes de apresentar os resultados.</p>
            </div>
          </div>
          <form
            action="/api/admin/editorial/redacao-automatica/topic-search"
            method="post"
            className={styles.topicSearchForm}
            id="automatic-topic-search"
          >
            <label className={styles.topicSearchQuery}>
              <span>Tema a pesquisar</span>
              <input
                type="search"
                name="topic"
                defaultValue={topic}
                maxLength={180}
                required
                placeholder="Ex.: Vitória de Guimarães estágio de pré-época"
              />
            </label>
            <label>
              <span>Período</span>
              <select name="period" defaultValue={period}>
                <option value="1">Últimas 24 horas</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="all">Todo o arquivo recolhido</option>
              </select>
            </label>
            <label>
              <span>Fonte</span>
              <select name="source" defaultValue={searchSourceCode ?? ""}>
                <option value="">Todas as fontes</option>
                {searchableSources.map((source) => (
                  <option value={source.code} key={source.code}>{source.name}</option>
                ))}
              </select>
            </label>
          </form>
          <div className={styles.collectionActions}>
            <button type="submit" form="automatic-topic-search">
              Pesquisar nas fontes autorizadas
            </button>
            <ManualNewsEntryForm
              submissionId={manualSubmissionId}
              maxDate={manualEntryMaxDate}
              initiallyOpen={manualEntryInitiallyOpen}
            />
          </div>
          <p className={styles.topicSearchNote}>
            A pesquisa é iniciada apenas por esta ação, usa carregamento HTTP controlado e não gera nem publica qualquer artigo.
          </p>
        </section>

        {manualEntryErrorMessage ? (
          <div className={`${styles.topicSearchFeedback} ${styles.topicSearchFeedbackError}`} role="status">
            <strong>A notícia manual não foi guardada.</strong>
            <span>{manualEntryErrorMessage}</span>
          </div>
        ) : manualEntrySuccessMessage ? (
          <div className={`${styles.topicSearchFeedback} ${styles.topicSearchFeedbackSuccess}`} role="status">
            <strong>{manualEntrySuccessMessage}</strong>
            <span>Podes selecioná-la abaixo e combiná-la com as restantes fontes.</span>
          </div>
        ) : null}

        {externalSearchErrorMessage ? (
          <div className={`${styles.topicSearchFeedback} ${styles.topicSearchFeedbackError}`} role="status">
            <strong>A pesquisa nas fontes não ficou concluída.</strong>
            <span>{externalSearchErrorMessage}</span>
          </div>
        ) : externalSearchState ? (
          <div
            className={`${styles.topicSearchFeedback} ${
              externalSearchState === "partial"
                ? styles.topicSearchFeedbackWarning
                : styles.topicSearchFeedbackSuccess
            }`}
            role="status"
          >
            <strong>{articlePage.items.length} notícias relacionadas encontradas</strong>
            <ul className={styles.topicSearchCounts}>
              <li>{externalSearchAttemptedArticles} artigos tentados</li>
              <li>{externalSearchReadArticles} artigos lidos</li>
              <li>{availableResultCount} já estavam disponíveis</li>
              <li>{collectedResultCount} foram recolhidas nesta pesquisa</li>
              <li>{externalSearchFailedArticles} outras ligações não puderam ser lidas</li>
              {externalSearchExcludedMissingDate > 0 ? (
                <li>{externalSearchExcludedMissingDate} excluídos por falta de data de publicação</li>
              ) : null}
              {externalSearchExcludedInvalidDate > 0 ? (
                <li>{externalSearchExcludedInvalidDate} excluídos por data de publicação inválida</li>
              ) : null}
              {externalSearchExcludedFuture > 0 ? (
                <li>{externalSearchExcludedFuture} excluídos por data futura</li>
              ) : null}
              {externalSearchExcludedPeriod > 0 ? (
                <li>{externalSearchExcludedPeriod} ficaram fora do período</li>
              ) : null}
              {externalSearchExcludedTopic > 0 ? (
                <li>{externalSearchExcludedTopic} não confirmaram o tema pesquisado</li>
              ) : null}
              {externalSearchExcludedSnapshot > 0 ? (
                <li>{externalSearchExcludedSnapshot} não tinham conteúdo utilizável</li>
              ) : null}
              {externalSearchExcludedState > 0 ? (
                <li>{externalSearchExcludedState} tinham estado não elegível</li>
              ) : null}
              {externalSearchExcludedDuplicate > 0 ? (
                <li>{externalSearchExcludedDuplicate} eram duplicados canónicos</li>
              ) : null}
              {externalSearchFailedSources > 0 ? (
                <li>{externalSearchFailedSources} fontes não responderam</li>
              ) : null}
            </ul>
            <details className={styles.topicSearchTechnicalDetails}>
              <summary>Detalhes técnicos da pesquisa</summary>
              <ul>
                <li>{externalSearchRawDiscovered} ligações descobertas nas listagens</li>
                <li>{externalSearchRejectedLinks} ligações rejeitadas na normalização</li>
                <li>{externalSearchListingDuplicates} duplicados de listagem</li>
                <li>{externalSearchUniqueCandidates || externalSearchCandidateLinks} candidatos únicos</li>
                <li>{externalSearchPositiveCandidates} candidatos com pontuação positiva</li>
                <li>{externalSearchZeroCandidates} candidatos com pontuação zero, não tentados</li>
                <li>{externalSearchPositiveTruncated} candidatos positivos não tentados por limite</li>
                <li>{externalSearchRecoveryAttempted} recuperações controladas de artigos antigos</li>
              </ul>
              {externalSearchSourceReports.length > 0 ? (
                <ul>
                  {externalSearchSourceReports.map((report) => (
                    <li key={report.sourceCode}>
                      <strong>{sourceNames.get(report.sourceCode) ?? report.sourceCode}</strong>:{" "}
                      {report.rawDiscoveredLinkCount} descobertas,{" "}
                      {report.uniqueCandidateCount} únicas,{" "}
                      {report.positiveCandidateCount} positivas,{" "}
                      {report.attemptedArticleCount} tentadas,{" "}
                      {report.readArticleCount} lidas,{" "}
                      {report.failedArticleCount} falhadas,{" "}
                      {report.finalEligibleArticleCount} elegíveis
                      {report.failures.length > 0 ? (
                        <>
                          <div>
                            {report.failedArticleCount === 1
                              ? "1 artigo não pôde ser processado"
                              : `${report.failedArticleCount} artigos não puderam ser processados`}
                          </div>
                          <ul>
                            {report.failures.map((failure) => (
                              <li
                                key={[
                                  failure.stage,
                                  failure.code,
                                  failure.statusCode ?? "",
                                  failure.persistenceCode ?? "",
                                ].join(":")}
                              >
                                {failure.count} — {topicSearchFailureLabel(failure)}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
          </div>
        ) : null}

        {compositionErrorMessage ? (
          <div className={styles.compositionError} role="status">
            <strong>A composição não ficou concluída.</strong>
            <span>{compositionErrorMessage}</span>
            {compositionDossierId ? (
              <a href={`/admin/editorial/redacao-automatica/dossies/${encodeURIComponent(compositionDossierId)}`}>
                Abrir recuperação avançada
              </a>
            ) : null}
          </div>
        ) : null}

        {topicSearchRequested && !topicSearchFailed && articlePage.items.length > 0 ? (
          <form
            action="/api/admin/editorial/redacao-automatica/dossies"
            method="post"
            id="create-editorial-composition"
            className={styles.compositionForm}
          >
          <input type="hidden" name="action" value="compose" />
          <input type="hidden" name="submission_id" value={compositionSubmissionId} />

          <section className={styles.compositionSources} aria-labelledby="composition-sources-title">
            <div className={styles.compositionStepHeader}>
              <span>2</span>
              <div>
                <p className={styles.sectionEyebrow}>Resultados e seleção</p>
                <h2 id="composition-sources-title">Ver notícias e escolher os artigos de base</h2>
                <p>Seleciona uma ou várias fontes. A primeira, se não definires outra, será tratada como principal.</p>
              </div>
            </div>

            <div className={styles.compositionSourceSummary}>
              <strong>{articlePage.items.length} notícias relacionadas com “{topic}”</strong>
              <span>
                {availableResultCount} já disponíveis · {collectedResultCount} recolhidas nesta pesquisa
              </span>
            </div>
            <ol className={styles.compositionSourceList}>
              {articlePage.items.map((article, index) => (
                <li key={article.id}>
                  <div className={styles.compositionSourceChoice}>
                    <div className={styles.compositionSourceActions}>
                      <label>
                        <input
                          type="checkbox"
                          name="newsroom_article_id"
                          value={article.id}
                          disabled={!canUseInComposition(article)}
                        />
                        <span>Selecionar</span>
                      </label>
                      {article.sourceUrl && !article.isManualEntry ? (
                        <a
                          href={article.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Consultar fonte
                        </a>
                      ) : (
                        <span className={styles.manualSourceBadge}>Entrada manual</span>
                      )}
                    </div>
                    <strong>{article.title}</strong>
                    <small>{sourceNames.get(article.sourceCode) ?? article.sourceCode}</small>
                    {article.publishedAt ? (
                      <time dateTime={article.publishedAt}>
                        Publicado em {formatNewsroomPublishedAt(
                          article.publishedAt,
                          article.publishedAtPrecision,
                        )}
                      </time>
                    ) : null}
                    {article.summary || article.subtitle ? (
                      <p>{article.summary ?? article.subtitle}</p>
                    ) : null}
                    <em>
                      {article.isManualEntry
                        ? "Entrada manual"
                        : collectedResultIds.has(article.id.toLowerCase())
                          ? "Recolhida nesta pesquisa"
                          : "Já disponível"}
                    </em>
                  </div>
                  {canUseInComposition(article) ? (
                    <div className={styles.compositionSourceControls}>
                      <input
                        type="hidden"
                        name={`source_snapshot_${article.id}`}
                        value={article.latestSnapshotId ?? ""}
                      />
                      <label>
                        <span>Prioridade</span>
                        <input
                          type="number"
                          name={`source_priority_${article.id}`}
                          defaultValue={index + 1}
                          min={1}
                          max={99}
                        />
                      </label>
                      <label>
                        <span>Função na composição</span>
                        <select
                          name={`source_role_${article.id}`}
                          defaultValue={index === 0 ? "primary" : "complementary"}
                        >
                          {Object.entries(dossierSourceRoleLabels).map(([value, label]) => (
                            <option value={value} key={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.compositionInstructions} aria-labelledby="composition-instructions-title">
            <div className={styles.compositionStepHeader}>
              <span>4</span>
              <div>
                <p className={styles.sectionEyebrow}>Orientação humana</p>
                <h2 id="composition-instructions-title">Explicar à IA o artigo pretendido</h2>
                <p>Estas instruções determinam o ângulo, a hierarquia e a forma de combinar as fontes.</p>
              </div>
            </div>

            <label>
              <span>Assunto ou título de trabalho</span>
              <input
                name="working_title"
                defaultValue={topic}
                maxLength={180}
                required
                placeholder="Ex.: Vitória encerra estágio e prepara a nova época"
              />
            </label>

            <label>
              <span>Como unir as fontes</span>
              <textarea
                name="combine_instructions"
                maxLength={6000}
                rows={5}
                required
                placeholder="Explica a relação entre as fontes, qual conduz o texto e como a informação complementar deve ser integrada."
              />
            </label>

            <label>
              <span>Assuntos a destacar e como tratá-los</span>
              <textarea
                name="highlight_instructions"
                maxLength={6000}
                rows={5}
                required
                placeholder="Indica os factos, declarações ou temas prioritários, a ordem e o destaque que devem receber."
              />
            </label>

            <div className={styles.compositionOptionalGrid}>
              <label>
                <span>Contexto a introduzir</span>
                <textarea
                  name="context_instructions"
                  maxLength={4000}
                  rows={4}
                  placeholder="Acrescenta o enquadramento necessário para o leitor compreender o artigo."
                />
              </label>
              <label>
                <span>O que evitar</span>
                <textarea
                  name="avoid_instructions"
                  maxLength={4000}
                  rows={4}
                  placeholder="Indica informação a excluir, misturas a evitar ou conclusões que não devem ser feitas."
                />
              </label>
            </div>

            <div className={styles.compositionFormatGrid}>
              <label>
                <span>Género</span>
                <select name="article_kind" defaultValue="news">
                  <option value="news">Notícia</option>
                  <option value="analysis">Análise</option>
                  <option value="preview">Antevisão</option>
                  <option value="summary">Síntese</option>
                </select>
              </label>
              <label>
                <span>Extensão</span>
                <select name="length_mode" defaultValue="standard">
                  <option value="brief">Breve</option>
                  <option value="standard">Normal</option>
                  <option value="developed">Desenvolvido</option>
                </select>
              </label>
            </div>

            <div className={styles.compositionGenerate}>
              <div>
                <span>5</span>
                <p>
                  A primeira versão será criada como rascunho e abrirá automaticamente na página dos Artigos para revisão final.
                </p>
                <p className={styles.editorialProfileGenerationNote}>
                  {editorialProfileResult.ok
                    ? `Linha editorial ativa: versão ${editorialProfileResult.profile.activeVersion.versionNumber} · ${editorialProfileResult.profile.activeVersion.contentHash.slice(0, 12)}… A versão será fixada no plano pelo servidor.`
                    : "Linha editorial indisponível. A geração será recusada até existir uma versão ativa validada."}
                </p>
              </div>
              <div className={styles.compositionSubmit}>
                <button type="submit" data-composition-submit>Gerar primeira versão</button>
                <span data-composition-submit-status role="status" hidden>
                  A composição está a ser criada ou retomada. Não feches esta página.
                </span>
              </div>
            </div>
          </section>
          <CompositionSubmitEnhancer />
          </form>
        ) : topicSearchFailed ? (
          <div className={styles.topicSearchState} role="status">
            <strong>Não foi possível pesquisar as notícias.</strong>
            <span>Tenta novamente sem alterar nem perder qualquer trabalho editorial.</span>
          </div>
        ) : topicSearchRequested ? (
          <div className={styles.topicSearchState}>
            <strong>Não foram encontradas notícias relacionadas com “{topic}”.</strong>
            <span>
              {externalSearchState || externalSearchErrorMessage
                ? "As fontes atuais já foram consultadas. Experimenta um tema mais específico, outro período ou todas as fontes."
                : "Carrega em Pesquisar nas fontes para atualizar as notícias disponíveis para este tema."}
            </span>
          </div>
        ) : (
          <div className={styles.topicSearchState}>
            <strong>Começa pela pesquisa do tema.</strong>
            <span>Os artigos de base só aparecem depois de pesquisares o assunto sobre o qual queres escrever.</span>
          </div>
        )}

        <details className={styles.advancedWorkspace} open={Boolean(selectedArticle)}>
          <summary>Trabalhos guardados e ferramentas avançadas</summary>
          <div className={styles.advancedWorkspaceContent}>
            <section className={styles.section} aria-labelledby="saved-work-title">
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Recuperação e auditoria</p>
                  <h2 id="saved-work-title">Trabalhos guardados</h2>
                </div>
                <p>Usa esta área apenas para consultar ou recuperar uma composição interrompida.</p>
              </div>
              {!dossierListResult.ok ? (
                <p className={styles.detailEmpty}>Não foi possível ler os trabalhos guardados.</p>
              ) : dossiers.length === 0 ? (
                <p className={styles.detailEmpty}>Ainda não existem trabalhos guardados.</p>
              ) : (
                <ol className={styles.dossierList}>
                  {dossiers.map((dossier) => (
                    <li key={dossier.id}>
                      <div>
                        <span>{dossierStatusLabels[dossier.status]}</span>
                        <strong>{dossier.title}</strong>
                        <small>{dossier.sourceCount} {dossier.sourceCount === 1 ? "fonte" : "fontes"} · {formatDate(dossier.updatedAt)}</small>
                      </div>
                      <a href={`/admin/editorial/redacao-automatica/dossies/${encodeURIComponent(dossier.id)}`}>
                        Abrir gestão avançada
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {selectedArticle ? (
              <section className={styles.section} id="advanced-source-preview" aria-labelledby="advanced-source-title">
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Consulta avançada</p>
                    <h2 id="advanced-source-title">Fonte selecionada</h2>
                  </div>
                </div>
                <ArticleDetail
                  article={selectedArticle}
                  sourceName={sourceNames.get(selectedArticle.sourceCode) ?? selectedArticle.sourceCode}
                  returnTo={searchReturnTo}
                  editorialArticle={selectedEditorialArticle}
                  draftLookupFailed={draftLookupFailed}
                  draftErrorMessage={draftErrorMessage}
                  reviewErrorMessage={reviewErrorMessage}
                  reviewSuccessMessage={reviewSuccessMessage}
                />
              </section>
            ) : null}

            <details className={styles.technicalArea}>
              <summary>Configuração técnica das fontes</summary>
              <div className={styles.technicalAreaContent}>
                <section className={styles.section} aria-labelledby="planned-sources-title">
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Configuração inicial</p>
                      <h2 id="planned-sources-title">Fontes previstas</h2>
                    </div>
                  </div>
                  <div className={styles.sourceGrid}>
                    {sources.map((source) => (
                      <article className={styles.sourceCard} key={source.code}>
                        <div className={styles.sourceCardHeader}>
                          <div><span>Fonte prevista</span><h3>{source.name}</h3></div>
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
                </section>
                <section className={styles.section} aria-labelledby="technical-flow-title">
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Auditoria preservada</p>
                      <h2 id="technical-flow-title">Etapas internas</h2>
                    </div>
                  </div>
                  <ol className={styles.flowGrid}>
                    {editorialWorkflowSteps.map((step, index) => (
                      <li key={step.id}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><strong>{step.label}</strong></li>
                    ))}
                  </ol>
                </section>
              </div>
            </details>
          </div>
        </details>
      </div>
    </main>
  );
}
