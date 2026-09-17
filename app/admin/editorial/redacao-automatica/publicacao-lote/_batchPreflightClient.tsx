"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  EDITORIAL_BATCH_ARTICLE_START_MARKER,
  type EditorialBatchArticle,
  type EditorialBatchIssue,
  type EditorialBatchPreflight,
} from "@/lib/redacao-automatica/editorial-batch-parser";
import {
  EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY,
  EDITORIAL_BATCH_TRANSFER_STORAGE_KEY,
  parseEditorialBatchTransferSourcePackage,
  preflightEditorialArticleBatchForSourcePackage,
  type EditorialBatchTransferSourcePackage,
} from "@/lib/redacao-automatica/editorial-batch-transfer";
import {
  EDITORIAL_BATCH_IMAGE_ACCEPT,
  preflightEditorialBatchImages,
  type EditorialBatchImagePreflight,
} from "@/lib/redacao-automatica/editorial-batch-image-preflight";
import {
  analyseEditorialBatchForPublication,
  editorialBatchPublicationFingerprint,
  editorialBatchPublicationUiState,
  isEditorialBatchPreflightResponseCurrent,
  requestEditorialBatchPublicationPreflight,
  shouldRequestAutomaticEditorialBatchPreflight,
} from "@/lib/redacao-automatica/editorial-batch-publication-client";

import styles from "./publicacao-lote.module.css";

type BatchCompetitionOption = Readonly<{
  id: string;
  name: string | null;
  slug: string | null;
}>;

type BatchSeasonOption = Readonly<{
  id: string;
  competition_id: string | null;
  label: string | null;
}>;

type BatchMatchdayOption = Readonly<{
  id: string;
  season_id: string | null;
  number: number | null;
  label: string | null;
}>;

type BatchPreflightClientProps = Readonly<{
  competitions: readonly BatchCompetitionOption[];
  seasons: readonly BatchSeasonOption[];
  matchdays: readonly BatchMatchdayOption[];
}>;

type ArticleResultRow = Readonly<{
  index: number;
  key: string;
  article: EditorialBatchArticle | null;
  issues: readonly EditorialBatchIssue[];
}>;

type BatchPublicationPlanItem = Readonly<{
  key: string;
  slug: string;
  mode:
    | "create"
    | "resume"
    | "update_required"
    | "update";
  articleId?: string;
  existingTitle?: string | null;
  existingSlug?: string | null;
  updateTargetFromDossier?: boolean;
  publishedAt: string;
  slot?: string;
}>;

type BatchPublicationItemStatus =
  | "pending"
  | "uploading"
  | "publishing"
  | "published"
  | "published_missing_latest"
  | "published_missing_usage"
  | "error"
  | "not_attempted";

type BatchPublicationItemState = Readonly<{
  status: BatchPublicationItemStatus;
  message: string;
  articleId?: string;
}>;

type BatchPublicationItemResponse = Readonly<{
  ok?: boolean;
  error?: string;
  detail?: string;
  articleId?: string;
  slug?: string;
  published?: boolean;
  latest?: boolean;
}>;

type ThemeContinuityBatchResponse = Readonly<{
  ok?: boolean;
  error?: string;
  detail?: string;
  finalized?: boolean;
  partialPersistence?: boolean;
  failedOutputId?: string;
  failedSlot?: string;
  completed?: readonly Readonly<{
    key: string;
    slot: string;
    outputId: string;
    articleId: string;
    slug: string;
    action: "created" | "updated" | "reused";
  }>[];
  updatedCount?: number;
  newCount?: number;
  noChangeCount?: number;
}>;

type SignedUploadResponse = Readonly<{
  ok?: boolean;
  error?: string;
  detail?: string;
  signedUrl?: string;
  publicUrl?: string;
}>;

const DEFAULT_BATCH_AUTHOR = "Silvestre Chícharo";
const BATCH_PUBLICATION_ROUTE = "/api/admin/editorial/redacao-automatica/publicacao-lote";
const MESA_ROUTE = "/admin/editorial/redacao-automatica/mesa";
const ARTICLE_IMAGE_SIGN_ROUTE = "/api/admin/editorial/artigos/upload-image/sign";

function responseDetail(payload: { error?: string; detail?: string } | null, fallback: string) {
  return firstText(payload?.detail, payload?.error, fallback);
}

function imageContentType(file: File) {
  const declared = file.type.trim().toLowerCase();
  if (declared) {
    return declared;
  }

  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function publicationStatusLabel(state: BatchPublicationItemState | undefined) {
  switch (state?.status) {
    case "uploading":
      return "A CARREGAR IMAGEM…";
    case "publishing":
      return "A PUBLICAR…";
    case "published":
      return "PUBLICADO";
    case "published_missing_latest":
      return "PUBLICADO · FALTA ÚLTIMAS";
    case "published_missing_usage":
      return "PUBLICADO · FALTA MARCAR FONTES";
    case "error":
      return "ERRO";
    case "not_attempted":
      return "NÃO TENTADO";
    default:
      return "PENDENTE";
  }
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const cleaned = value?.trim();
    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}

function matchdayLabel(matchday: BatchMatchdayOption) {
  const numbered = matchday.number === null
    ? null
    : `Jornada ${String(matchday.number).padStart(2, "0")}`;
  return firstText(matchday.label, numbered, matchday.id);
}

function articleResultRows(preflight: EditorialBatchPreflight): ArticleResultRow[] {
  const rows = new Map<number, {
    index: number;
    key: string;
    article: EditorialBatchArticle | null;
    issues: EditorialBatchIssue[];
  }>();

  for (const article of preflight.articles) {
    rows.set(article.index, {
      index: article.index,
      key: article.key,
      article,
      issues: [],
    });
  }

  for (const issue of preflight.issues) {
    if (issue.index === undefined || !issue.key) {
      continue;
    }

    const current = rows.get(issue.index) ?? {
      index: issue.index,
      key: issue.key,
      article: null,
      issues: [],
    };
    current.issues.push(issue);
    rows.set(issue.index, current);
  }

  return [...rows.values()].sort((left, right) => left.index - right.index);
}

function ImageSelectionPanel({
  articles,
  hasArticleText,
  selectedImages,
  imagePreflight,
  manualImageAssignments,
  onImagesSelected,
  onManualImageAssignment,
  disabled,
}: Readonly<{
  articles: readonly EditorialBatchArticle[];
  hasArticleText: boolean;
  selectedImages: readonly File[];
  imagePreflight: EditorialBatchImagePreflight<File>;
  manualImageAssignments: Readonly<Record<string, number>>;
  onImagesSelected: (files: FileList | null) => void;
  onManualImageAssignment:
    (key: string, fileIndex: number | null) => void;
  disabled: boolean;
}>) {
  const hasArticleRows = articles.length > 0;
  const statusText = !hasArticleText
    ? "A AGUARDAR LOTE"
    : !hasArticleRows
      ? "A AGUARDAR LOTE VÁLIDO"
      : imagePreflight.ready
        ? "IMAGENS PRONTAS"
        : "PRÉ-FLIGHT DE IMAGENS COM PROBLEMAS";
  const statusClass = !hasArticleText || !hasArticleRows
    ? styles.neutralBadge
    : imagePreflight.ready
      ? styles.readyBadge
      : styles.invalidBadge;
  const showImageProblemStats = hasArticleRows && !imagePreflight.ready;
  const dossierImageCount = imagePreflight.articles.filter(
    (article) => Boolean(article.imageUrl),
  ).length;

  return (
    <section className={styles.panel} aria-labelledby="batch-images-title">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Imagens</p>
          <h2 id="batch-images-title">Imagens do lote</h2>
        </div>
        <strong className={statusClass}>
          {statusText}
        </strong>
      </div>

      <div className={styles.imagePickerRow}>
        <div>
          <p className={styles.imageInstructions}>
            {dossierImageCount > 0
              ? "As imagens escolhidas na Produção já estão associadas. Selecione ficheiros locais apenas para as substituir."
              : "Selecione as imagens de uma vez. O prefixo NN- associa automaticamente; os restantes ficheiros podem ser associados manualmente abaixo."}
          </p>
          <p className={styles.selectedCount}>
            {dossierImageCount > 0
              ? `${dossierImageCount} da Produção · ${selectedImages.length} locais`
              : selectedImages.length > 0
                ? `Selecionadas: ${selectedImages.length}`
                : "Nenhuma imagem selecionada"}
          </p>
        </div>
        <label className={styles.imagePicker} htmlFor="batch-images-input">
          SELECIONAR IMAGENS
        </label>
        <input
          id="batch-images-input"
          className={styles.fileInput}
          type="file"
          multiple
          accept={EDITORIAL_BATCH_IMAGE_ACCEPT}
          disabled={disabled}
          onChange={(event) => onImagesSelected(event.currentTarget.files)}
        />
      </div>

      {showImageProblemStats ? (
        <dl className={styles.imageStats} aria-label="Problemas do pré-flight de imagens">
          {imagePreflight.selected > 0 ? (
            <div>
              <dt>Selecionadas</dt>
              <dd>{imagePreflight.selected}</dd>
            </div>
          ) : null}
          {imagePreflight.associated > 0 ? (
            <div>
              <dt>Associadas</dt>
              <dd>{imagePreflight.associated}</dd>
            </div>
          ) : null}
          {imagePreflight.missing > 0 ? (
            <div>
              <dt>Em falta</dt>
              <dd>{imagePreflight.missing}</dd>
            </div>
          ) : null}
          {imagePreflight.problems > 0 ? (
            <div>
              <dt>Problemas</dt>
              <dd>{imagePreflight.problems}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {selectedImages.length > 0 && articles.length > 0 ? (
        <section
          className={styles.articleResults}
          aria-labelledby="batch-manual-images-title"
        >
          <h3 id="batch-manual-images-title">
            Associação manual
          </h3>

          <p className={styles.imageInstructions}>
            Para imagens sem prefixo NN-, escolha explicitamente o ficheiro
            de cada artigo. A ordem dos ficheiros não é usada.
          </p>

          <ol>
            {articles.map((article) => (
              <li key={article.key}>
                <div className={styles.articleKey}>
                  {article.key}
                </div>

                <div className={styles.articleCopy}>
                  <div className={styles.articleHeading}>
                    <h4>{article.title}</h4>
                  </div>

                  <label>
                    <span>Imagem</span>
                    <select
                      value={manualImageAssignments[article.key] ?? ""}
                      disabled={disabled}
                      onChange={(event) => {
                        const value = event.currentTarget.value;

                        onManualImageAssignment(
                          article.key,
                          value === "" ? null : Number(value),
                        );
                      }}
                    >
                      <option value="">
                        Automática por NN- / Produção
                      </option>

                      {selectedImages.map((file, index) => {
                        const assignedElsewhere =
                          Object.entries(manualImageAssignments).some(
                            ([key, assignedIndex]) =>
                              key !== article.key
                              && assignedIndex === index,
                          );

                        return (
                          <option
                            key={`${file.name}-${file.size}-${index}`}
                            value={index}
                            disabled={assignedElsewhere}
                          >
                            {file.name}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {hasArticleRows && imagePreflight.fileProblems.length > 0 ? (
        <section className={styles.imageFileProblems} aria-labelledby="batch-image-files-title">
          <h3 id="batch-image-files-title">Ficheiros com problemas</h3>
          <ul>
            {imagePreflight.fileProblems.map((problem, index) => (
              <li key={`${problem.code}-${problem.file.name}-${index}`}>
                <strong>{problem.file.name}</strong>
                <span>{problem.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function ResultSummary({
  preflight,
  imagePreflight,
  imagePreviewUrls,
  contextComplete,
  authorReady,
  competitionLabel,
  seasonLabel,
  matchdayLabel: selectedMatchdayLabel,
  preservesPublishedImages,
  noChangeCount,
}: Readonly<{
  preflight: EditorialBatchPreflight;
  imagePreflight: EditorialBatchImagePreflight<File>;
  imagePreviewUrls: ReadonlyMap<File, string>;
  contextComplete: boolean;
  authorReady: boolean;
  competitionLabel: string;
  seasonLabel: string;
  matchdayLabel: string;
  preservesPublishedImages: boolean;
  noChangeCount: number;
}>) {
  const globalIssues = preflight.issues.filter((issue) => issue.index === undefined);
  const articleRows = articleResultRows(preflight);
  const imageResultByKey = new Map(
    imagePreflight.articles.map((article) => [article.key, article]),
  );
  const globallyPrepared =
    preflight.ready
    && contextComplete
    && (
      preservesPublishedImages
      || imagePreflight.ready
    )
    && authorReady;

  return (
    <section className={styles.results} aria-labelledby="batch-results-title" aria-live="polite">
      <div className={styles.resultsHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Resultado</p>
          <h2 id="batch-results-title">
            {globallyPrepared ? "Contexto editorial" : "Pré-flight do lote"}
          </h2>
        </div>
        <strong className={globallyPrepared ? styles.readyBadge : styles.invalidBadge}>
          {globallyPrepared ? "PRONTO PARA PUBLICAR" : "PRÉ-FLIGHT COM PROBLEMAS"}
        </strong>
      </div>

      {globallyPrepared ? (
        <div className={styles.preparedSummary}>
          <strong>{competitionLabel} · {seasonLabel} · {selectedMatchdayLabel}</strong>
          <p>
            {preflight.total} {preflight.total === 1 ? "artigo" : "artigos"}
            {" · "}
            {preservesPublishedImages
              ? `${preflight.total} ${preflight.total === 1 ? "imagem publicada preservada" : "imagens publicadas preservadas"}`
              : `${imagePreflight.associated} ${imagePreflight.associated === 1 ? "imagem associada" : "imagens associadas"}`}
            {" · Sem problemas"}
          </p>
        </div>
      ) : (
        <>
          {preflight.total > 0 ? (
            <dl className={styles.stats} aria-label="Resumo dos problemas do pré-flight">
              <div>
                <dt>Artigos encontrados</dt>
                <dd>{preflight.total}</dd>
              </div>
              {preflight.valid > 0 ? (
                <div>
                  <dt>Válidos</dt>
                  <dd>{preflight.valid}</dd>
                </div>
              ) : null}
              {preflight.invalid > 0 ? (
                <div>
                  <dt>Inválidos</dt>
                  <dd>{preflight.invalid}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <div className={styles.readinessGrid}>
            <article>
              <span>Lote editorial</span>
              <strong>{preflight.ready ? "Artigos válidos" : "Requer correções"}</strong>
            </article>
            <article>
              <span>Contexto</span>
              <strong>{contextComplete ? "Completo" : "Incompleto"}</strong>
              <p>
                {contextComplete
                  ? `${competitionLabel} · ${seasonLabel} · ${selectedMatchdayLabel}`
                  : "Escolha Competição, Época e Jornada."}
              </p>
            </article>
            <article>
              <span>Próxima etapa</span>
              <strong>Ainda incompleto</strong>
              <p>Completa o lote, o contexto, a autoria e as imagens.</p>
            </article>
          </div>
        </>
      )}

      {globalIssues.length > 0 ? (
        <section className={styles.globalIssues} aria-labelledby="batch-global-issues-title">
          <h3 id="batch-global-issues-title">Problemas do lote</h3>
          <ul>
            {globalIssues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                <span>{issue.code}</span>
                {issue.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.articleResults} aria-labelledby="batch-articles-title">
        <h3 id="batch-articles-title">Artigos</h3>
        {articleRows.length > 0 ? (
          <ol>
            {articleRows.map((row) => {
              const errors = row.issues.filter((issue) => issue.severity === "error");
              const isValid = errors.length === 0;
              const title = firstText(row.article?.title) || "Sem título";
              const imageResult = imageResultByKey.get(row.key);
              const previewUrl = imageResult?.file
                ? imagePreviewUrls.get(imageResult.file)
                : imageResult?.imageUrl;
              const candidateNames = imageResult?.candidates
                .map((file) => file.name)
                .join(", ");

              return (
                <li key={row.key} className={isValid ? styles.validArticle : styles.invalidArticle}>
                  <div className={styles.articleKey} aria-label={`Artigo ${row.key}`}>{row.key}</div>
                  <div className={styles.articleCopy}>
                    <div className={styles.articleHeading}>
                      <h4>{title}</h4>
                      <strong>{isValid ? "VÁLIDO" : "INVÁLIDO"}</strong>
                    </div>
                    {errors.length > 0 ? (
                      <div className={styles.articleIssues}>
                        <p>Problemas:</p>
                        <ul>
                          {errors.map((issue, index) => (
                            <li key={`${issue.code}-${issue.field ?? "article"}-${index}`}>
                              {issue.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : !globallyPrepared ? (
                      <p className={styles.validNote}>Estrutura editorial válida.</p>
                    ) : null}
                    {preservesPublishedImages ? (
                      <p className={styles.validNote}>
                        IMAGEM PUBLICADA PRESERVADA
                      </p>
                    ) : imageResult ? (
                      <div className={`${styles.imageAssociation} ${
                        imageResult.status === "associated"
                          ? styles.associatedImage
                          : styles.problemImage
                      }`}>
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={`Pré-visualização de ${imageResult.file?.name ?? imageResult.fileName ?? `artigo ${row.key}`}`}
                          />
                        ) : (
                          <div className={styles.imagePlaceholder} aria-hidden="true">SEM IMAGEM</div>
                        )}
                        <div>
                          <p>
                            {imageResult.file?.name
                              ?? imageResult.fileName
                              ?? candidateNames
                              ?? `Nenhum ficheiro ${row.key}-* selecionado`}
                          </p>
                          <strong>{imageResult.message}</strong>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={styles.noArticles}>
            {noChangeCount > 0
              ? `${noChangeCount} slots resolvidos com SEM_ALTERAÇÃO; nenhum artigo será reescrito.`
              : "Nenhum artigo estruturalmente identificável."}
          </p>
        )}
      </section>
    </section>
  );
}

function PublicationPanel({
  articles,
  states,
  error,
  isChecking,
  isPublishing,
  batchFinalized,
  canPublish,
  plan,
  confirmedUpdates,
  onConfirmUpdate,
  onRetryPreflight,
  onPublish,
  noChangeCount,
}: Readonly<{
  articles: readonly EditorialBatchArticle[];
  states: Readonly<Record<string, BatchPublicationItemState>>;
  error: string | null;
  isChecking: boolean;
  isPublishing: boolean;
  batchFinalized: boolean;
  canPublish: boolean;
  plan: readonly BatchPublicationPlanItem[] | null;
  confirmedUpdates: Readonly<Record<string, string>>;
  onConfirmUpdate:
    (key: string, articleId: string) => void;
  onRetryPreflight: () => void;
  onPublish: () => void;
  noChangeCount: number;
}>) {
  const stateValues = Object.values(states);
  const hasRun = stateValues.length > 0;
  const allItemsPublished =
    (articles.length === 0 && noChangeCount > 0)
    || (articles.length > 0 && articles.every(
      (article) =>
        states[article.key]?.status
        === "published",
    ));

  const allPublished =
    allItemsPublished
    && batchFinalized;
  const hasIncompleteRun =
    hasRun && !allPublished;

  const publicationUi = editorialBatchPublicationUiState({
    plan,
    confirmedUpdates,
    canPublish,
    isChecking,
    isPublishing,
    allPublished,
    hasIncompleteRun,
    hasError: Boolean(error),
  });
  const updateCandidates = publicationUi.updateCandidates;
  const updatesConfirmedInPanel = publicationUi.updatesConfirmed;
  const articleByKey = new Map(articles.map((article) => [article.key, article]));
  const statusToneClass = publicationUi.statusTone === "success"
    ? styles.publicationStatusSuccess
    : publicationUi.statusTone === "warning"
      ? styles.publicationStatusWarning
      : publicationUi.statusTone === "error"
        ? styles.publicationStatusError
        : styles.publicationStatusNeutral;

  return (
    <section className={styles.panel} aria-labelledby="batch-publication-title" aria-live="polite">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Publicação</p>
          <h2 id="batch-publication-title">Publicar em Últimas</h2>
        </div>
        <strong className={`${styles.publicationStatus} ${statusToneClass}`} role="status">
          {allPublished ? "PUBLICADO" : publicationUi.statusLabel}
        </strong>
      </div>

      {plan ? (
        <section
          className={styles.articleResults}
          aria-labelledby="batch-publication-items-title"
        >
          <h3 id="batch-publication-items-title">Publicação por artigo</h3>

          <ol>
            {plan.map((item) => {
              const article = articleByKey.get(item.key);
              const state = states[item.key];
              const confirmed =
                Boolean(
                  item.articleId
                  && confirmedUpdates[item.key]
                    === item.articleId,
                );
              const updateRequired = item.mode === "update_required";
              const updateConfirmed = item.mode === "update" || confirmed;
              const destinationStatus = state
                ? `ÚLTIMAS · ${publicationStatusLabel(state)}`
                : updateRequired && !updateConfirmed
                  ? "ÚLTIMAS · CONFIRMAÇÃO NECESSÁRIA"
                  : "ÚLTIMAS";
              const destinationDetail = updateRequired || item.mode === "update"
                ? item.articleId
                  ? "Este Dossiê corresponde a um artigo já publicado. A atualização manterá o mesmo artigo e o mesmo URL. A imagem atualmente publicada também será preservada."
                  : "O servidor identificou uma atualização, mas não devolveu um articleId válido. A publicação permanece bloqueada."
                : item.mode === "resume"
                  ? "Publicação já preparada; o artigo será confirmado e mantido em Últimas."
                  : "Novo artigo com destino a Últimas.";

              return (
                <li key={item.key}>
                  <div className={styles.articleKey}>
                    {item.key}
                  </div>

                  <div className={styles.articleCopy}>
                    <div className={styles.articleHeading}>
                      <h4>
                        {firstText(
                          updateRequired || item.mode === "update"
                            ? item.existingTitle
                            : article?.title,
                          item.existingSlug,
                          article?.title,
                          "Artigo",
                        )}
                      </h4>

                      <strong>{destinationStatus}</strong>
                    </div>

                    <p className={styles.validNote}>
                      {state?.message ?? destinationDetail}
                    </p>

                    {item.existingSlug ? (
                      <p className={styles.existingUrl}>
                        URL existente: {item.existingSlug}
                      </p>
                    ) : null}

                    {updateRequired ? (
                      <div className={styles.confirmationAction}>
                        {updateConfirmed ? (
                          <span className={styles.confirmedState}>Atualização confirmada</span>
                        ) : item.articleId ? (
                          <button
                            type="button"
                            disabled={isPublishing || isChecking}
                            onClick={() => {
                              if (item.articleId) {
                                onConfirmUpdate(
                                  item.key,
                                  item.articleId,
                                );
                              }
                            }}
                          >
                            CONFIRMAR ATUALIZAÇÃO
                          </button>
                        ) : (
                          <span className={styles.blockedState}>Confirmação indisponível</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <div className={styles.analysisActions}>
        <p className={error ? styles.publicationError : styles.analysisNote} role={error ? "alert" : undefined}>
          {isChecking
            ? "A verificar destino editorial…"
            : error
              ? error
              : allPublished
                ? noChangeCount > 0
                  ? `${articles.length} outputs materializados · ${noChangeCount} resolvidos com SEM_ALTERAÇÃO · ciclo consolidado.`
                  : `${articles.length} ${articles.length === 1 ? "artigo publicado" : "artigos publicados"} em Últimas.`
                : !plan
                  ? "A análise começa automaticamente assim que todos os dados necessários estiverem válidos."
                : updateCandidates.length > 0
                  ? updatesConfirmedInPanel
                    ? updateCandidates.length === 1
                      ? "A atualização foi confirmada. O artigo existente e o mesmo URL serão preservados."
                      : "As atualizações foram confirmadas. Os artigos existentes e os respetivos URLs serão preservados."
                    : updateCandidates.length === 1
                      ? "Confirma explicitamente a atualização do artigo publicado antes de continuar."
                      : "Confirma explicitamente as atualizações dos artigos publicados antes de continuar."
                  : noChangeCount > 0
                    ? `${noChangeCount} slots SEM_ALTERAÇÃO não escrevem em editorial_articles. Os restantes seguem num único batch que pára no primeiro erro.`
                    : "A publicação é sequencial e pára no primeiro erro, preservando o que já foi concluído."}
        </p>

        {publicationUi.showRetry ? (
          <button
            className={styles.retryAction}
            type="button"
            onClick={onRetryPreflight}
          >
            Tentar novamente
          </button>
        ) : publicationUi.actionLabel ? (
          <button
            type="button"
            disabled={!canPublish || isPublishing || isChecking || allPublished}
            onClick={onPublish}
          >
            {publicationUi.actionLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default function BatchPreflightClient({
  competitions,
  seasons,
  matchdays,
}: BatchPreflightClientProps) {
  const [competitionId, setCompetitionId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [matchdayId, setMatchdayId] = useState("");
  const [articleText, setArticleText] = useState("");
  const [selectedImages, setSelectedImages] = useState<readonly File[]>([]);
  const [
    manualImageAssignments,
    setManualImageAssignments,
  ] = useState<Readonly<Record<string, number>>>({});
  const [imagePreviewUrls, setImagePreviewUrls] = useState<ReadonlyMap<File, string>>(new Map());
  const [author, setAuthor] = useState(DEFAULT_BATCH_AUTHOR);
  const [sourcePackage, setSourcePackage] = useState<EditorialBatchTransferSourcePackage | null>(null);
  const [isCheckingPublication, setIsCheckingPublication] = useState(false);
  const [preflightRetryVersion, setPreflightRetryVersion] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [
    batchFinalized,
    setBatchFinalized,
  ] = useState(false);
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const [publicationStates, setPublicationStates] = useState<Readonly<Record<string, BatchPublicationItemState>>>({});
  const [publicationPlan, setPublicationPlan] =
    useState<readonly BatchPublicationPlanItem[] | null>(
      null,
    );
  const [confirmedUpdates, setConfirmedUpdates] =
    useState<Readonly<Record<string, string>>>(
      {},
    );
  const publicationStatesRef = useRef<Record<string, BatchPublicationItemState>>({});
  const publicationPlanRef = useRef<readonly BatchPublicationPlanItem[] | null>(null);
  const uploadedImageUrlsRef = useRef<Record<string, string>>({});
  const publishingRef = useRef(false);
  const publicationRequestSequenceRef = useRef(0);
  const latestPublicationFingerprintRef = useRef("");
  const lastRequestedPublicationFingerprintRef = useRef<string | null>(null);
  const activePublicationFingerprintRef = useRef<string | null>(null);
  const publicationPreflightAbortRef = useRef<AbortController | null>(null);

  const availableSeasons = useMemo(
    () => seasons.filter((season) => season.competition_id === competitionId),
    [competitionId, seasons],
  );
  const availableMatchdays = useMemo(
    () => matchdays.filter((matchday) => matchday.season_id === seasonId),
    [matchdays, seasonId],
  );
  const selectedCompetition = competitions.find((competition) => competition.id === competitionId) ?? null;
  const selectedSeason = seasons.find((season) => season.id === seasonId) ?? null;
  const selectedMatchday = matchdays.find((matchday) => matchday.id === matchdayId) ?? null;
  const preflight = useMemo(
    () => preflightEditorialArticleBatchForSourcePackage(articleText, sourcePackage),
    [articleText, sourcePackage],
  );
  const hasArticleText = Boolean(articleText.trim());
  const contextComplete = Boolean(
    selectedCompetition
      && selectedSeason
      && selectedSeason.competition_id === selectedCompetition.id
      && selectedMatchday
      && selectedMatchday.season_id === selectedSeason.id,
  );

  const sourcePackageUpdateCount =
    sourcePackage?.updateArticleCount ?? 0;
  const themeContinuity = sourcePackage?.themeContinuity ?? null;
  const publicationContextComplete = themeContinuity
    ? themeContinuity.newArticleCount === 0 || contextComplete
    : contextComplete;

  const sourcePackageContextLocked =
    Boolean(
      sourcePackageUpdateCount > 0
      && sourcePackage?.matchdayId
      && contextComplete,
    );
  const continuityContextLocked = Boolean(
    themeContinuity && themeContinuity.newArticleCount === 0,
  );

  const preservesPublishedImages =
    themeContinuity
      ? themeContinuity.newArticleCount === 0
      : Boolean(
      sourcePackageUpdateCount > 0
      && preflight.total > 0
      && sourcePackageUpdateCount
        === preflight.total,
      );
  const allAnalysedArticleKeys = useMemo(
    () => articleResultRows(preflight).map((row) => row.key),
    [preflight],
  );
  const analysedArticleKeys = useMemo(() => {
    if (!themeContinuity) return allAnalysedArticleKeys;
    const newOutputIds = new Set(themeContinuity.slots.flatMap((slot) => (
      slot.kind === "new" ? [slot.outputId] : []
    )));
    return preflight.articles.flatMap((article) => (
      article.outputId && newOutputIds.has(article.outputId) ? [article.key] : []
    ));
  }, [allAnalysedArticleKeys, preflight.articles, themeContinuity]);
  const imageArticles = useMemo(() => {
    const required = new Set(analysedArticleKeys);
    return preflight.articles.filter((article) => required.has(article.key));
  }, [analysedArticleKeys, preflight.articles]);
  const manualImageFiles = useMemo(
    () =>
      Object.entries(manualImageAssignments)
        .flatMap(([key, fileIndex]) => {
          const file = selectedImages[fileIndex];

          return file
            ? [{ key, file }]
            : [];
        }),
    [manualImageAssignments, selectedImages],
  );

  const imagePreflight = useMemo(
    () => preflightEditorialBatchImages(
      analysedArticleKeys,
      selectedImages,
      sourcePackage?.outputImages?.map((image) => ({
        key: String(image.position).padStart(2, "0"),
        imageUrl: image.imageUrl,
        fileName: image.label,
      })) ?? [],
      manualImageFiles,
    ),
    [
      analysedArticleKeys,
      manualImageFiles,
      selectedImages,
      sourcePackage,
    ],
  );
  const canPublish = Boolean(
    preflight.ready
      && (themeContinuity ? publicationContextComplete : contextComplete)
      && (
        preservesPublishedImages
        || imagePreflight.ready
      )
      && author.trim(),
  );
  const publicationFingerprint = useMemo(
    () => editorialBatchPublicationFingerprint({
      articleText,
      competitionId,
      seasonId,
      matchdayId,
      author,
      images: selectedImages,
      sourcePackage,
    }),
    [
      articleText,
      author,
      competitionId,
      matchdayId,
      seasonId,
      selectedImages,
      sourcePackage,
    ],
  );
  latestPublicationFingerprintRef.current = publicationFingerprint;

  const requiredUpdates =
    (publicationPlan ?? []).filter(
      (item) =>
        item.mode === "update_required",
    );

  const updatesConfirmed =
    requiredUpdates.every(
      (item) =>
        Boolean(
          item.articleId
          && confirmedUpdates[item.key]
            === item.articleId,
        ),
    );

  const publicationCanPublish =
    canPublish
    && Boolean(publicationPlan)
    && updatesConfirmed;

  const publicationPanelVisible = Boolean(
    canPublish
    || isCheckingPublication
    || publicationPlan
    || publicationError
    || Object.keys(publicationStates).length > 0,
  );

  useEffect(() => {
    const transferredText = window.sessionStorage.getItem(
      EDITORIAL_BATCH_TRANSFER_STORAGE_KEY,
    );
    if (!transferredText?.trim()) {
      return;
    }

    const transferredSourcePackage = parseEditorialBatchTransferSourcePackage(
      window.sessionStorage.getItem(EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY),
    );

    setArticleText(transferredText);
    setSourcePackage(transferredSourcePackage);

    if (!transferredSourcePackage?.matchdayId) {
      return;
    }

    const transferredMatchday =
      matchdays.find(
        (matchday) =>
          matchday.id
          === transferredSourcePackage.matchdayId,
      ) ?? null;

    const transferredSeason =
      transferredMatchday
        ? seasons.find(
            (season) =>
              season.id === transferredMatchday.season_id,
          ) ?? null
        : null;

    const transferredCompetition =
      transferredSeason
        ? competitions.find(
            (competition) =>
              competition.id
              === transferredSeason.competition_id,
          ) ?? null
        : null;

    if (
      !transferredMatchday
      || !transferredSeason
      || !transferredCompetition
    ) {
      setPublicationError(
        "O Dossiê identifica uma Jornada publicada, mas o contexto canónico não está disponível neste carregamento.",
      );
      return;
    }

    setCompetitionId(transferredCompetition.id);
    setSeasonId(transferredSeason.id);
    setMatchdayId(transferredMatchday.id);
  }, [competitions, matchdays, seasons]);

  useEffect(() => {
    const nextPreviewUrls = new Map<File, string>();
    for (const file of selectedImages) {
      nextPreviewUrls.set(file, URL.createObjectURL(file));
    }
    setImagePreviewUrls(nextPreviewUrls);

    return () => {
      for (const previewUrl of nextPreviewUrls.values()) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [selectedImages]);

  useEffect(() => {
    const activeFingerprint = activePublicationFingerprintRef.current;
    if (!shouldRequestAutomaticEditorialBatchPreflight({
      ready: canPublish && !publishingRef.current,
      fingerprint: publicationFingerprint,
      lastRequestedFingerprint: lastRequestedPublicationFingerprintRef.current,
      activeFingerprint,
    })) {
      return;
    }

    const requestId = publicationRequestSequenceRef.current + 1;
    publicationRequestSequenceRef.current = requestId;
    lastRequestedPublicationFingerprintRef.current = publicationFingerprint;
    activePublicationFingerprintRef.current = publicationFingerprint;
    const abortController = new AbortController();
    publicationPreflightAbortRef.current = abortController;

    publicationPlanRef.current = null;
    setPublicationPlan(null);
    setConfirmedUpdates({});
    setPublicationError(null);

    const responseIsCurrent = () => isEditorialBatchPreflightResponseCurrent({
      requestId,
      fingerprint: publicationFingerprint,
      currentRequestId: publicationRequestSequenceRef.current,
      currentFingerprint: latestPublicationFingerprintRef.current,
    });

    void analyseEditorialBatchForPublication({
      articleText,
      contextComplete: publicationContextComplete,
      imagesReady:
        preservesPublishedImages
        || imagePreflight.ready,
      matchdayId,
      author,
      sourcePackage,
      matchdayRequired: !themeContinuity || themeContinuity.newArticleCount > 0,
      callbacks: {
        onLocalPreflight: () => undefined,
        onServerPreflightSkipped: () => undefined,
        onServerPreflightStarted: () => {
          if (!responseIsCurrent()) return;
          setIsCheckingPublication(true);
        },
        requestServerPreflight: (nextPreflight) =>
          requestEditorialBatchPublicationPreflight<BatchPublicationPlanItem>({
            route: BATCH_PUBLICATION_ROUTE,
            matchdayId,
            author,
            articles: nextPreflight.articles,
            ...(sourcePackage ? { sourcePackage } : {}),
            confirmedUpdates: {},
            signal: abortController.signal,
          }),
        onServerPreflightSucceeded: (plan) => {
          if (!responseIsCurrent()) return;
          publicationPlanRef.current = plan;
          setPublicationPlan(plan);
          setPublicationError(null);
        },
        onServerPreflightFailed: (message) => {
          if (!responseIsCurrent()) return;
          publicationPlanRef.current = null;
          setPublicationPlan(null);
          setPublicationError(message);
        },
        onServerPreflightFinished: () => {
          if (!responseIsCurrent()) return;
          activePublicationFingerprintRef.current = null;
          publicationPreflightAbortRef.current = null;
          setIsCheckingPublication(false);
        },
      },
    });
  }, [
    articleText,
    author,
    canPublish,
    contextComplete,
    imagePreflight.ready,
    manualImageAssignments,
    matchdayId,
    preservesPublishedImages,
    publicationContextComplete,
    preflightRetryVersion,
    publicationFingerprint,
    sourcePackage,
  ]);

  function setPublicationState(key: string, state: BatchPublicationItemState) {
    publicationStatesRef.current = {
      ...publicationStatesRef.current,
      [key]: state,
    };
    setPublicationStates(publicationStatesRef.current);
  }

  function invalidatePublicationPreflightRequest() {
    publicationRequestSequenceRef.current += 1;
    publicationPreflightAbortRef.current?.abort();
    publicationPreflightAbortRef.current = null;
    activePublicationFingerprintRef.current = null;
    lastRequestedPublicationFingerprintRef.current = null;
    setIsCheckingPublication(false);
  }

  function clearTransferredBatch() {
    window.sessionStorage.removeItem(
      EDITORIAL_BATCH_TRANSFER_STORAGE_KEY,
    );
    window.sessionStorage.removeItem(
      EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY,
    );
  }

  function returnToMesaAfterSuccessfulPublication() {
    window.location.assign(MESA_ROUTE);
  }

  function resetPublicationRun() {
    setBatchFinalized(false);
    invalidatePublicationPreflightRequest();
    publicationPlanRef.current = null;
    setPublicationPlan(null);
    setConfirmedUpdates({});
    uploadedImageUrlsRef.current = {};
    publicationStatesRef.current = {};
    setPublicationStates({});
    setPublicationError(null);
  }

  function retryPublicationPreflight() {
    resetPublicationRun();
    setPreflightRetryVersion((current) => current + 1);
  }

  function confirmExistingUpdate(
    key: string,
    articleId: string,
  ) {
    setConfirmedUpdates(
      (current) => ({
        ...current,
        [key]: articleId,
      }),
    );

    publicationPlanRef.current = null;
    setPublicationError(null);
  }

  async function requestPublicationPreflight(
    analysedPreflight: EditorialBatchPreflight = preflight,
    updateConfirmations: Readonly<Record<string, string>> = confirmedUpdates,
  ) {
    if (!publicationContextComplete || !author.trim()) {
      throw new Error("O lote deixou de estar pronto para publicação.");
    }

    return requestEditorialBatchPublicationPreflight<BatchPublicationPlanItem>({
      route: BATCH_PUBLICATION_ROUTE,
      matchdayId,
      author,
      articles: analysedPreflight.articles,
      ...(sourcePackage ? { sourcePackage } : {}),
      confirmedUpdates: updateConfirmations,
    });
  }

  async function uploadBatchImage(file: File) {
    const contentType = imageContentType(file);
    const signResponse = await fetch(ARTICLE_IMAGE_SIGN_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType,
        size: file.size,
      }),
    });
    const signPayload = await signResponse.json().catch(() => null) as SignedUploadResponse | null;

    if (!signResponse.ok || !signPayload?.ok || !signPayload.signedUrl || !signPayload.publicUrl) {
      throw new Error(responseDetail(signPayload, `Não foi possível preparar o upload de ${file.name}.`));
    }

    const uploadResponse = await fetch(signPayload.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "max-age=31536000",
        "x-upsert": "false",
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => "");
      throw new Error(firstText(detail, `Falhou o upload de ${file.name}.`));
    }

    return signPayload.publicUrl;
  }

  async function publishPlannedItem(
    planItem: BatchPublicationPlanItem,
    article: EditorialBatchArticle,
    imageUrl: string | null,
  ) {
    const response = await fetch(BATCH_PUBLICATION_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "publish_item",
        matchdayId,
        author: author.trim(),
        article,
        imageUrl,
        publishedAt: planItem.publishedAt,
        publicationMode:
          planItem.mode,
        ...(planItem.mode === "update"
          && planItem.articleId
          ? {
              updateArticleId:
                planItem.articleId,
            }
          : {}),
        ...(sourcePackage ? { sourcePackage } : {}),
      }),
    });
    const payload = await response.json().catch(() => null) as BatchPublicationItemResponse | null;

    if (!response.ok || !payload?.ok) {
      const failure = new Error(responseDetail(payload, `Falhou a publicação do artigo ${article.key}.`));
      Object.assign(failure, { payload });
      throw failure;
    }

    return payload;
  }

  async function publishThemeContinuityBatch(
    plan: readonly BatchPublicationPlanItem[],
  ) {
    if (!sourcePackage?.themeContinuity || !sourcePackage.continuityResolution) {
      throw new Error("O contrato de continuidade deixou de estar disponível.");
    }
    const slotByOutputId = new Map(sourcePackage.themeContinuity.slots.map((slot, index) => (
      [slot.outputId, { slot, position: index + 1 }] as const
    )));
    const imageByKey = new Map(imagePreflight.articles.map((image) => [image.key, image]));
    const imageUrlsByOutputId: Record<string, string | null> = {};

    for (const article of preflight.articles) {
      const frozen = article.outputId ? slotByOutputId.get(article.outputId) : null;
      if (!frozen || !article.outputId) {
        throw new Error(`O artigo ${article.key} deixou de pertencer ao contrato congelado.`);
      }
      if (frozen.slot.kind === "existing") {
        imageUrlsByOutputId[article.outputId] = sourcePackage.outputImages?.find((image) => (
          image.position === frozen.position
        ))?.imageUrl ?? null;
        continue;
      }
      const image = imageByKey.get(article.key);
      let imageUrl = uploadedImageUrlsRef.current[article.key]
        ?? image?.imageUrl
        ?? null;
      if (!imageUrl) {
        if (!image?.file) throw new Error(`O artigo ${article.key} não tem imagem válida.`);
        setPublicationState(article.key, {
          status: "uploading",
          message: `A carregar ${image.file.name}…`,
        });
        imageUrl = await uploadBatchImage(image.file);
        uploadedImageUrlsRef.current[article.key] = imageUrl;
      }
      imageUrlsByOutputId[article.outputId] = imageUrl;
    }

    for (const item of plan) {
      setPublicationState(item.key, {
        status: "publishing",
        message: item.mode === "update"
          ? "A atualizar o target congelado…"
          : item.mode === "resume"
            ? "A verificar a publicação já persistida…"
            : "A publicar o novo artigo…",
      });
    }
    const response = await fetch(BATCH_PUBLICATION_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "publish_theme_continuity",
        matchdayId,
        author: author.trim(),
        articles: preflight.articles,
        imageUrlsByOutputId,
        sourcePackage,
      }),
    });
    const result = await response.json().catch(() => null) as ThemeContinuityBatchResponse | null;
    for (const completed of result?.completed ?? []) {
      setPublicationState(completed.key, {
        status: "published",
        message: completed.action === "reused"
          ? "Output já publicado confirmado sem duplicação."
          : completed.action === "updated"
            ? "Artigo existente atualizado com identidade preservada."
            : "Novo artigo publicado.",
        articleId: completed.articleId,
      });
    }
    if (!response.ok || !result?.ok || !result.finalized) {
      const failed = plan.find((item) => (
        result?.failedOutputId
          ? preflight.articles.find((article) => article.key === item.key)?.outputId === result.failedOutputId
          : false
      ));
      if (failed) {
        setPublicationState(failed.key, {
          status: "error",
          message: responseDetail(result, `Falhou ${result?.failedSlot ?? failed.key}.`),
        });
        const failedIndex = plan.indexOf(failed);
        for (const pending of plan.slice(failedIndex + 1)) {
          setPublicationState(pending.key, {
            status: "not_attempted",
            message: "Não tentado porque a publicação parou no output anterior.",
          });
        }
      }
      throw new Error(responseDetail(result, "A publicação da continuidade não ficou consolidada."));
    }

    setBatchFinalized(true);
    setPublicationError(null);
    clearTransferredBatch();
    returnToMesaAfterSuccessfulPublication();
  }

  async function finalizeBatchEditorialFlow() {
    const response =
      await fetch(
        BATCH_PUBLICATION_ROUTE,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action:
              "finalize_batch",
            matchdayId,
          }),
        },
      );

    const payload =
      await response.json().catch(
        () => null,
      ) as
        | {
            ok?: boolean;
            error?: string;
            detail?: string;
          }
        | null;

    if (
      !response.ok
      || !payload?.ok
    ) {
      throw new Error(
        responseDetail(
          payload,
          "Falhou a reconciliação editorial final do lote.",
        ),
      );
    }
  }

  async function publishBatch() {
    if (publishingRef.current || !canPublish || !preflight || !imagePreflight) {
      return;
    }

    publishingRef.current = true;
    setIsPublishing(true);
    setBatchFinalized(false);
    setPublicationError(null);

    try {
      const plan =
        publicationPlanRef.current
        ?? await requestPublicationPreflight();

      publicationPlanRef.current = plan;
      setPublicationPlan(plan);

      if (sourcePackage?.themeContinuity) {
        await publishThemeContinuityBatch(plan);
        return;
      }

      const updateRequired =
        plan.filter(
          (item) =>
            item.mode === "update_required",
        );

      if (updateRequired.length > 0) {
        setPublicationError(
          updateRequired.length === 1
            ? `O artigo ${updateRequired[0].key} é uma atualização de um artigo existente. Confirma a atualização antes de publicar.`
            : "Existem atualizações de artigos existentes que precisam de confirmação antes de publicar.",
        );
        return;
      }

      if (Object.keys(publicationStatesRef.current).length === 0) {
        const initialStates = Object.fromEntries(
          plan.map((item) => [item.key, { status: "pending", message: "Aguarda publicação." }]),
        ) as Record<string, BatchPublicationItemState>;
        publicationStatesRef.current = initialStates;
        setPublicationStates(initialStates);
      }

      const articleByKey = new Map(preflight.articles.map((article) => [article.key, article]));
      const imageByKey = new Map(imagePreflight.articles.map((image) => [image.key, image]));

      for (let index = 0; index < plan.length; index += 1) {
        const planItem = plan[index];
        if (publicationStatesRef.current[planItem.key]?.status === "published") {
          continue;
        }

        const article = articleByKey.get(planItem.key);
        const image = imageByKey.get(planItem.key);
        const file = image?.file ?? null;
        const requiresImage =
          planItem.mode === "create";

        if (
          !article
          || (
            requiresImage
            && !file
            && !image?.imageUrl
          )
        ) {
          throw new Error(
            `O artigo ${planItem.key} deixou de ter uma associação válida.`,
          );
        }

        try {
          let imageUrl =
            planItem.mode === "update"
              ? null
              : uploadedImageUrlsRef.current[planItem.key]
                ?? image?.imageUrl
                ?? null;

          if (
            planItem.mode === "create"
            && !imageUrl
          ) {
            setPublicationState(planItem.key, {
              status: "uploading",
              message: `A carregar ${file?.name ?? "imagem"}…`,
            });
            imageUrl = await uploadBatchImage(file as File);
            uploadedImageUrlsRef.current[planItem.key] = imageUrl;
          }

          setPublicationState(planItem.key, {
            status: "publishing",
            message:
              planItem.mode === "resume"
                ? "A confirmar o artigo existente e a garantir a entrada em Últimas…"
                : planItem.mode === "update"
                  ? "A atualizar o artigo canónico existente e a manter o mesmo URL…"
                  : "A criar o artigo canónico e a colocá-lo em Últimas…",
          });

          const result = await publishPlannedItem(planItem, article, imageUrl);
          setPublicationState(planItem.key, {
            status: "published",
            message:
              planItem.mode === "resume"
                ? "Artigo existente confirmado e garantido em Últimas."
                : planItem.mode === "update"
                  ? "Artigo existente atualizado, com o mesmo URL, e mantido em Últimas."
                  : "Artigo publicado e colocado em Últimas.",
            ...(result.articleId ? { articleId: result.articleId } : {}),
          });
        } catch (error) {
          const payload = error instanceof Error
            ? (error as Error & { payload?: BatchPublicationItemResponse }).payload
            : undefined;
          const message = error instanceof Error ? error.message : `Falhou o artigo ${planItem.key}.`;
          setPublicationState(planItem.key, {
            status: payload?.published
              ? payload.latest
                ? "published_missing_usage"
                : "published_missing_latest"
              : "error",
            message,
            ...(payload?.articleId ? { articleId: payload.articleId } : {}),
          });

          for (const pendingItem of plan.slice(index + 1)) {
            if (!publicationStatesRef.current[pendingItem.key]
              || publicationStatesRef.current[pendingItem.key].status === "pending") {
              setPublicationState(pendingItem.key, {
                status: "not_attempted",
                message: "Não tentado porque a publicação parou no artigo anterior.",
              });
            }
          }

          try {
            await finalizeBatchEditorialFlow();
            setBatchFinalized(true);
          } catch (finalizationError) {
            setPublicationError(
              `Publicação interrompida no artigo ${planItem.key}: ${message}. A reconciliação final também falhou: ${
                finalizationError instanceof Error
                  ? finalizationError.message
                  : "erro desconhecido"
              }`,
            );
            return;
          }

          setPublicationError(
            `Publicação interrompida no artigo ${planItem.key}: ${message}`,
          );
          return;
        }
      }

      await finalizeBatchEditorialFlow();
      setBatchFinalized(true);
      setPublicationError(null);
      clearTransferredBatch();
      returnToMesaAfterSuccessfulPublication();
    } catch (error) {
      setPublicationError(error instanceof Error ? error.message : "A publicação do lote falhou.");
    } finally {
      publishingRef.current = false;
      setIsPublishing(false);
    }
  }

  function handleCompetitionChange(nextCompetitionId: string) {
    resetPublicationRun();
    setCompetitionId(nextCompetitionId);
    setSeasonId("");
    setMatchdayId("");
  }

  function handleSeasonChange(nextSeasonId: string) {
    resetPublicationRun();
    setSeasonId(nextSeasonId);
    setMatchdayId("");
  }

  function handleTextChange(nextText: string) {
    resetPublicationRun();
    setArticleText(nextText);
    setManualImageAssignments({});

    if (sourcePackage) {
      window.sessionStorage.setItem(
        EDITORIAL_BATCH_TRANSFER_STORAGE_KEY,
        nextText,
      );
    }
  }

  function handleImagesSelected(files: FileList | null) {
    resetPublicationRun();
    setManualImageAssignments({});
    setSelectedImages(files ? Array.from(files) : []);
  }

  function handleManualImageAssignment(
    key: string,
    fileIndex: number | null,
  ) {
    resetPublicationRun();

    setManualImageAssignments((current) => {
      const next = {
        ...current,
      } as Record<string, number>;

      if (fileIndex === null) {
        delete next[key];
        return next;
      }

      for (const [currentKey, assignedIndex] of Object.entries(next)) {
        if (currentKey !== key && assignedIndex === fileIndex) {
          delete next[currentKey];
        }
      }

      next[key] = fileIndex;
      return next;
    });
  }

  function handleMatchdayChange(nextMatchdayId: string) {
    resetPublicationRun();
    setMatchdayId(nextMatchdayId);
  }

  function handleAuthorChange(nextAuthor: string) {
    resetPublicationRun();
    setAuthor(nextAuthor);
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.panel} aria-labelledby="batch-context-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Contexto</p>
            <h2 id="batch-context-title">Jornada do lote</h2>
          </div>
          <strong className={
            publicationContextComplete
              ? styles.contextComplete
              : hasArticleText
                ? styles.contextIncomplete
                : styles.neutralBadge
          }>
            {publicationContextComplete
              ? themeContinuity && themeContinuity.newArticleCount === 0
                ? "TARGETS CONGELADOS"
                : "CONTEXTO COMPLETO"
              : hasArticleText
                ? "CONTEXTO EM FALTA"
                : "POR DEFINIR"}
          </strong>
        </div>

        <div className={styles.contextGrid}>
          <label htmlFor="batch-competition">
            <span>Competição</span>
            <select
              id="batch-competition"
              value={competitionId}
              disabled={sourcePackageContextLocked || continuityContextLocked || isPublishing}
              onChange={(event) => handleCompetitionChange(event.target.value)}
            >
              <option value="">Escolher competição</option>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {firstText(competition.name, competition.slug, competition.id)}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="batch-season">
            <span>Época</span>
            <select
              id="batch-season"
              value={seasonId}
              disabled={
                sourcePackageContextLocked
                || continuityContextLocked
                || !competitionId
                || isPublishing
              }
              onChange={(event) => handleSeasonChange(event.target.value)}
            >
              <option value="">
                {competitionId ? "Escolher época" : "Escolha primeiro a competição"}
              </option>
              {availableSeasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {firstText(season.label, season.id)}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="batch-matchday">
            <span>Jornada</span>
            <select
              id="batch-matchday"
              value={matchdayId}
              disabled={
                sourcePackageContextLocked
                || continuityContextLocked
                || !seasonId
                || isPublishing
              }
              onChange={(event) => handleMatchdayChange(event.target.value)}
            >
              <option value="">
                {seasonId ? "Escolher jornada" : "Escolha primeiro a época"}
              </option>
              {availableMatchdays.map((matchday) => (
                <option key={matchday.id} value={matchday.id}>
                  {matchdayLabel(matchday)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {themeContinuity ? (
          <p className={styles.automaticAnalysisNote}>
            <strong>CONTINUIDADE DO TEMA</strong>
            {" · "}{themeContinuity.publishedArticleCount} slots EXISTING resolvidos por UPDATE ou SEM_ALTERAÇÃO
            {" · "}{themeContinuity.newArticleCount} slots NEW.
            {themeContinuity.newArticleCount > 0
              ? " A Jornada escolhida aplica-se apenas aos artigos NEW; cada UPDATE mantém a Jornada do target congelado."
              : " Não é necessário escolher Jornada: todos os targets já estão congelados."}
          </p>
        ) : sourcePackageUpdateCount > 0 ? (
          <p className={styles.automaticAnalysisNote}>
            <strong>
              {sourcePackageUpdateCount === 1
                ? "ATUALIZAÇÃO DE 1 ARTIGO PUBLICADO"
                : `ATUALIZAÇÃO DE ${sourcePackageUpdateCount} ARTIGOS PUBLICADOS`}
            </strong>
            {" · "}
            {contextComplete
              ? `${firstText(
                  selectedCompetition?.name,
                  selectedCompetition?.slug,
                  selectedCompetition?.id,
                )} · ${firstText(
                  selectedSeason?.label,
                  selectedSeason?.id,
                )} · ${
                  selectedMatchday
                    ? matchdayLabel(selectedMatchday)
                    : ""
                }`
              : "O Dossiê foi reconhecido como atualização. A Jornada canónica está a ser recuperada."}
          </p>
        ) : null}

        <label className={styles.textareaField} htmlFor="batch-author">
          <span>Autor do lote</span>
          <input
            id="batch-author"
            type="text"
            value={author}
            disabled={isPublishing}
            onChange={(event) => handleAuthorChange(event.target.value)}
          />
        </label>
      </section>

      <section className={styles.panel} aria-labelledby="batch-articles-input-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Artigos</p>
            <h2 id="batch-articles-input-title">Texto do lote</h2>
          </div>
          <span className={styles.limitNote}>1–30 artigos</span>
        </div>

        <details className={styles.originalTextDetails} open={!preflight.ready}>
          <summary>Ver texto original</summary>
          <label className={styles.textareaField} htmlFor="batch-article-text">
            <span>{themeContinuity ? "Blocos JORNADA_CONTINUIDADE_V1" : "Blocos JORNADA_ARTIGO_V1"}</span>
            <textarea
              id="batch-article-text"
              value={articleText}
              disabled={isPublishing}
              onChange={(event) => handleTextChange(event.target.value)}
              placeholder={`Cole aqui um ou mais blocos ${EDITORIAL_BATCH_ARTICLE_START_MARKER}...`}
              spellCheck={false}
            />
          </label>
        </details>

        <p className={styles.automaticAnalysisNote}>
          A análise é automática quando o lote, o contexto, a autoria e as imagens estão válidos.
          Não guarda nem publica artigos.
        </p>
      </section>

      {preservesPublishedImages ? (
        <section
          className={styles.panel}
          aria-labelledby="batch-images-title"
        >
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Imagens</p>
              <h2 id="batch-images-title">
                Imagens dos artigos
              </h2>
            </div>

            <strong className={styles.readyBadge}>
              IMAGENS PUBLICADAS PRESERVADAS
            </strong>
          </div>

          <p className={styles.imageInstructions}>
            Este lote atualiza artigos já publicados. As imagens atualmente
            publicadas serão mantidas. As imagens associadas à Produção não
            substituirão automaticamente nenhuma delas.
          </p>
        </section>
      ) : (
        <ImageSelectionPanel
          articles={imageArticles}
          hasArticleText={hasArticleText}
          selectedImages={selectedImages}
          imagePreflight={imagePreflight}
          manualImageAssignments={manualImageAssignments}
          onImagesSelected={handleImagesSelected}
          onManualImageAssignment={handleManualImageAssignment}
          disabled={isPublishing}
        />
      )}

      {hasArticleText || selectedImages.length > 0 ? (
        <ResultSummary
          preflight={preflight}
          imagePreflight={imagePreflight}
          imagePreviewUrls={imagePreviewUrls}
          contextComplete={publicationContextComplete}
          authorReady={Boolean(author.trim())}
          competitionLabel={continuityContextLocked ? "Targets congelados" : firstText(
            selectedCompetition?.name,
            selectedCompetition?.slug,
            selectedCompetition?.id,
          )}
          seasonLabel={continuityContextLocked ? "Jornadas preservadas" : firstText(selectedSeason?.label, selectedSeason?.id)}
          matchdayLabel={continuityContextLocked ? "sem novos artigos" : selectedMatchday ? matchdayLabel(selectedMatchday) : ""}
          preservesPublishedImages={preservesPublishedImages}
          noChangeCount={sourcePackage?.continuityResolution?.noChangeOutputIds.length ?? 0}
        />
      ) : null}

      {publicationPanelVisible ? (
        <PublicationPanel
          articles={preflight.articles}
          states={publicationStates}
          error={publicationError}
          isChecking={isCheckingPublication}
          isPublishing={isPublishing}
          batchFinalized={batchFinalized}
          canPublish={publicationCanPublish}
          plan={publicationPlan}
          confirmedUpdates={confirmedUpdates}
          onConfirmUpdate={
            confirmExistingUpdate
          }
          onRetryPreflight={retryPublicationPreflight}
          onPublish={publishBatch}
          noChangeCount={sourcePackage?.continuityResolution?.noChangeOutputIds.length ?? 0}
        />
      ) : null}
    </div>
  );
}
