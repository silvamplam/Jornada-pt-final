"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  EDITORIAL_BATCH_ARTICLE_START_MARKER,
  preflightEditorialArticleBatch,
  type EditorialBatchArticle,
  type EditorialBatchIssue,
  type EditorialBatchPreflight,
} from "@/lib/redacao-automatica/editorial-batch-parser";
import {
  EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY,
  EDITORIAL_BATCH_TRANSFER_STORAGE_KEY,
  parseEditorialBatchTransferSourcePackage,
  type EditorialBatchTransferSourcePackage,
} from "@/lib/redacao-automatica/editorial-batch-transfer";
import {
  EDITORIAL_BATCH_IMAGE_ACCEPT,
  preflightEditorialBatchImages,
  type EditorialBatchImagePreflight,
} from "@/lib/redacao-automatica/editorial-batch-image-preflight";

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
  publishedAt: string;
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

type BatchPublicationPreflightResponse = Readonly<{
  ok?: boolean;
  error?: string;
  detail?: string;
  items?: readonly BatchPublicationPlanItem[];
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

type SignedUploadResponse = Readonly<{
  ok?: boolean;
  error?: string;
  detail?: string;
  signedUrl?: string;
  publicUrl?: string;
}>;

const DEFAULT_BATCH_AUTHOR = "Silvestre Chícharo";
const BATCH_PUBLICATION_ROUTE = "/api/admin/editorial/redacao-automatica/publicacao-lote";
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
      return "PUBLICADO EM ÚLTIMAS";
    case "published_missing_latest":
      return "PUBLICADO, FALTA ÚLTIMAS";
    case "published_missing_usage":
      return "PUBLICADO, FALTA MARCAR FONTES";
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
  selectedImages,
  imagePreflight,
  associationStale,
  onImagesSelected,
  disabled,
}: Readonly<{
  selectedImages: readonly File[];
  imagePreflight: EditorialBatchImagePreflight<File> | null;
  associationStale: boolean;
  onImagesSelected: (files: FileList | null) => void;
  disabled: boolean;
}>) {
  const statusText = imagePreflight
    ? imagePreflight.ready
      ? "PRÉ-FLIGHT DE IMAGENS VÁLIDO"
      : "PRÉ-FLIGHT DE IMAGENS COM PROBLEMAS"
    : associationStale
      ? "ASSOCIAÇÃO DESATUALIZADA"
      : "AGUARDA ANÁLISE DO LOTE";

  return (
    <section className={styles.panel} aria-labelledby="batch-images-title">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Imagens</p>
          <h2 id="batch-images-title">Associação local</h2>
        </div>
        <strong className={imagePreflight?.ready ? styles.readyBadge : styles.invalidBadge}>
          {statusText}
        </strong>
      </div>

      <div className={styles.imagePickerRow}>
        <div>
          <p className={styles.imageInstructions}>
            Selecione todas as imagens de uma vez. A associação usa apenas o prefixo NN-.
          </p>
          <p className={styles.selectedCount}>Selecionadas: {selectedImages.length}</p>
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

      {imagePreflight ? (
        <>
          <dl className={styles.imageStats} aria-label="Resumo do pré-flight de imagens">
            <div>
              <dt>Selecionadas</dt>
              <dd>{imagePreflight.selected}</dd>
            </div>
            <div>
              <dt>Associadas</dt>
              <dd>{imagePreflight.associated}</dd>
            </div>
            <div>
              <dt>Em falta</dt>
              <dd>{imagePreflight.missing}</dd>
            </div>
            <div>
              <dt>Problemas</dt>
              <dd>{imagePreflight.problems}</dd>
            </div>
          </dl>

          {imagePreflight.fileProblems.length > 0 ? (
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
        </>
      ) : (
        <p className={styles.imagePendingNotice} role="status">
          {associationStale
            ? "Texto alterado — a validade das associações foi anulada. Analise o lote novamente."
            : "Analise o lote para associar as imagens selecionadas às keys dos artigos."}
        </p>
      )}
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
}: Readonly<{
  preflight: EditorialBatchPreflight;
  imagePreflight: EditorialBatchImagePreflight<File>;
  imagePreviewUrls: ReadonlyMap<File, string>;
  contextComplete: boolean;
  authorReady: boolean;
  competitionLabel: string;
  seasonLabel: string;
  matchdayLabel: string;
}>) {
  const globalIssues = preflight.issues.filter((issue) => issue.index === undefined);
  const articleRows = articleResultRows(preflight);
  const imageResultByKey = new Map(
    imagePreflight.articles.map((article) => [article.key, article]),
  );
  const globallyPrepared = preflight.ready && contextComplete && imagePreflight.ready && authorReady;

  return (
    <section className={styles.results} aria-labelledby="batch-results-title" aria-live="polite">
      <div className={styles.resultsHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Resultado</p>
          <h2 id="batch-results-title">Pré-flight do lote</h2>
        </div>
        <strong className={globallyPrepared ? styles.readyBadge : styles.invalidBadge}>
          {globallyPrepared ? "PRÉ-FLIGHT VÁLIDO" : "PRÉ-FLIGHT COM PROBLEMAS"}
        </strong>
      </div>

      <dl className={styles.stats} aria-label="Resumo do pré-flight">
        <div>
          <dt>Artigos encontrados</dt>
          <dd>{preflight.total}</dd>
        </div>
        <div>
          <dt>Válidos</dt>
          <dd>{preflight.valid}</dd>
        </div>
        <div>
          <dt>Inválidos</dt>
          <dd>{preflight.invalid}</dd>
        </div>
      </dl>

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
          <strong>{globallyPrepared ? "Pronto para publicar" : "Ainda incompleto"}</strong>
          <p>A publicação envia cada imagem, cria o artigo canónico e coloca-o em Últimas.</p>
        </article>
      </div>

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
                : undefined;
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
                    ) : (
                      <p className={styles.validNote}>Estrutura editorial válida.</p>
                    )}
                    {imageResult ? (
                      <div className={`${styles.imageAssociation} ${
                        imageResult.status === "associated"
                          ? styles.associatedImage
                          : styles.problemImage
                      }`}>
                        {previewUrl && imageResult.file ? (
                          <img
                            src={previewUrl}
                            alt={`Pré-visualização local de ${imageResult.file.name}`}
                          />
                        ) : (
                          <div className={styles.imagePlaceholder} aria-hidden="true">SEM IMAGEM</div>
                        )}
                        <div>
                          <p>
                            {imageResult.file?.name
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
          <p className={styles.noArticles}>Nenhum artigo estruturalmente identificável.</p>
        )}
      </section>
    </section>
  );
}

function PublicationPanel({
  articles,
  states,
  error,
  isPublishing,
  canPublish,
  plan,
  confirmedUpdates,
  onConfirmUpdate,
  onPublish,
}: Readonly<{
  articles: readonly EditorialBatchArticle[];
  states: Readonly<Record<string, BatchPublicationItemState>>;
  error: string | null;
  isPublishing: boolean;
  canPublish: boolean;
  plan: readonly BatchPublicationPlanItem[] | null;
  confirmedUpdates: Readonly<Record<string, string>>;
  onConfirmUpdate:
    (key: string, articleId: string) => void;
  onPublish: () => void;
}>) {
  const stateValues = Object.values(states);
  const hasRun = stateValues.length > 0;
  const allPublished = articles.length > 0
    && articles.every((article) => states[article.key]?.status === "published");
  const hasIncompleteRun =
    hasRun && !allPublished;

  const updateCandidates =
    (plan ?? []).filter(
      (item) =>
        item.mode === "update_required"
        && Boolean(item.articleId),
    );

  return (
    <section className={styles.panel} aria-labelledby="batch-publication-title" aria-live="polite">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Publicação</p>
          <h2 id="batch-publication-title">Publicar em Últimas</h2>
        </div>
        <strong className={allPublished ? styles.readyBadge : styles.invalidBadge}>
          {allPublished ? "LOTE PUBLICADO" : isPublishing ? "PUBLICAÇÃO EM CURSO" : "PRONTO"}
        </strong>
      </div>

      {updateCandidates.length > 0 ? (
        <section
          className={styles.articleResults}
          aria-labelledby="batch-update-confirmations-title"
        >
          <h3 id="batch-update-confirmations-title">
            Atualizações a confirmar
          </h3>

          <ol>
            {updateCandidates.map((item) => {
              const confirmed =
                Boolean(
                  item.articleId
                  && confirmedUpdates[item.key]
                    === item.articleId,
                );

              return (
                <li key={item.key}>
                  <div className={styles.articleKey}>
                    {item.key}
                  </div>

                  <div className={styles.articleCopy}>
                    <div className={styles.articleHeading}>
                      <h4>
                        {firstText(
                          item.existingTitle,
                          item.existingSlug,
                          "Artigo existente",
                        )}
                      </h4>

                      <strong>
                        {confirmed
                          ? "ATUALIZAÇÃO CONFIRMADA"
                          : "CONFIRMAÇÃO NECESSÁRIA"}
                      </strong>
                    </div>

                    <p className={styles.validNote}>
                      Esta saída do Dossiê corresponde a um
                      artigo já publicado da mesma jornada.
                      A atualização mantém o mesmo artigo e
                      o mesmo URL.
                    </p>

                    <div className={styles.analysisActions}>
                      <p className={styles.analysisNote}>
                        {item.existingSlug ?? ""}
                      </p>

                      <button
                        type="button"
                        disabled={
                          confirmed
                          || isPublishing
                          || !item.articleId
                        }
                        onClick={() => {
                          if (item.articleId) {
                            onConfirmUpdate(
                              item.key,
                              item.articleId,
                            );
                          }
                        }}
                      >
                        {confirmed
                          ? "ATUALIZAÇÃO CONFIRMADA"
                          : "CONFIRMAR ATUALIZAÇÃO"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <div className={styles.analysisActions}>
        <p className={styles.analysisNote}>
          {error
            ? error
            : allPublished
              ? "Todos os artigos ficaram publicados e colocados em Últimas."
              : "A publicação é sequencial e pára no primeiro erro, preservando o que já foi concluído."}
        </p>
        <button
          type="button"
          disabled={!canPublish || isPublishing || allPublished}
          onClick={onPublish}
        >
          {isPublishing
            ? "A PUBLICAR…"
            : hasIncompleteRun
              ? "RETOMAR PUBLICAÇÃO"
              : allPublished
                ? "LOTE PUBLICADO"
                : "PUBLICAR LOTE"}
        </button>
      </div>

      {hasRun ? (
        <section className={styles.articleResults} aria-labelledby="batch-publication-items-title">
          <h3 id="batch-publication-items-title">Estado por artigo</h3>
          <ol>
            {articles.map((article) => {
              const state = states[article.key];
              return (
                <li key={article.key}>
                  <div className={styles.articleKey}>{article.key}</div>
                  <div className={styles.articleCopy}>
                    <div className={styles.articleHeading}>
                      <h4>{article.title}</h4>
                      <strong>{publicationStatusLabel(state)}</strong>
                    </div>
                    <p className={styles.validNote}>{state?.message ?? "Aguarda publicação."}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
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
  const [preflight, setPreflight] = useState<EditorialBatchPreflight | null>(null);
  const [textChangedAfterAnalysis, setTextChangedAfterAnalysis] = useState(false);
  const [selectedImages, setSelectedImages] = useState<readonly File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<ReadonlyMap<File, string>>(new Map());
  const [author, setAuthor] = useState(DEFAULT_BATCH_AUTHOR);
  const [sourcePackage, setSourcePackage] = useState<EditorialBatchTransferSourcePackage | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
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
  const contextComplete = Boolean(
    selectedCompetition
      && selectedSeason
      && selectedSeason.competition_id === selectedCompetition.id
      && selectedMatchday
      && selectedMatchday.season_id === selectedSeason.id,
  );
  const analysedArticleKeys = useMemo(
    () => preflight ? articleResultRows(preflight).map((row) => row.key) : [],
    [preflight],
  );
  const imagePreflight = useMemo(
    () => preflight
      ? preflightEditorialBatchImages(analysedArticleKeys, selectedImages)
      : null,
    [analysedArticleKeys, preflight, selectedImages],
  );
  const canPublish = Boolean(
    preflight?.ready
      && contextComplete
      && imagePreflight?.ready
      && author.trim(),
  );

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
    canPublish && updatesConfirmed;

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
    window.sessionStorage.removeItem(EDITORIAL_BATCH_TRANSFER_STORAGE_KEY);
    window.sessionStorage.removeItem(EDITORIAL_BATCH_TRANSFER_SOURCE_PACKAGE_STORAGE_KEY);
    setArticleText(transferredText);
    setSourcePackage(transferredSourcePackage);
    setPreflight(preflightEditorialArticleBatch(transferredText));
    setTextChangedAfterAnalysis(false);
  }, []);

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

  function setPublicationState(key: string, state: BatchPublicationItemState) {
    publicationStatesRef.current = {
      ...publicationStatesRef.current,
      [key]: state,
    };
    setPublicationStates(publicationStatesRef.current);
  }

  function resetPublicationRun() {
    publicationPlanRef.current = null;
    setPublicationPlan(null);
    setConfirmedUpdates({});
    uploadedImageUrlsRef.current = {};
    publicationStatesRef.current = {};
    setPublicationStates({});
    setPublicationError(null);
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

  async function requestPublicationPreflight() {
    if (!preflight || !matchdayId || !author.trim()) {
      throw new Error("O lote deixou de estar pronto para publicação.");
    }

    const response = await fetch(BATCH_PUBLICATION_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "preflight",
        matchdayId,
        author: author.trim(),
        articles: preflight.articles,
        ...(sourcePackage ? { sourcePackage } : {}),
        ...(Object.keys(confirmedUpdates).length > 0
          ? { confirmedUpdates }
          : {}),
      }),
    });
    const payload = await response.json().catch(() => null) as BatchPublicationPreflightResponse | null;

    if (!response.ok || !payload?.ok || !payload.items) {
      throw new Error(responseDetail(payload, "A verificação final da publicação falhou."));
    }

    return payload.items;
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

  async function publishBatch() {
    if (publishingRef.current || !canPublish || !preflight || !imagePreflight) {
      return;
    }

    publishingRef.current = true;
    setIsPublishing(true);
    setPublicationError(null);

    try {
      const plan =
        publicationPlanRef.current
        ?? await requestPublicationPreflight();

      publicationPlanRef.current = plan;
      setPublicationPlan(plan);

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
      const imageByKey = new Map(imagePreflight.articles.map((image) => [image.key, image.file]));

      for (let index = 0; index < plan.length; index += 1) {
        const planItem = plan[index];
        if (publicationStatesRef.current[planItem.key]?.status === "published") {
          continue;
        }

        const article = articleByKey.get(planItem.key);
        const file = imageByKey.get(planItem.key);
        const requiresImage =
          planItem.mode === "create"
          || planItem.mode === "update";

        if (
          !article
          || (
            requiresImage
            && !file
          )
        ) {
          throw new Error(
            `O artigo ${planItem.key} deixou de ter uma associação válida.`,
          );
        }

        try {
          let imageUrl = uploadedImageUrlsRef.current[planItem.key] ?? null;

          if (
            (
              planItem.mode === "create"
              || planItem.mode === "update"
            )
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

          setPublicationError(`Publicação interrompida no artigo ${planItem.key}: ${message}`);
          return;
        }
      }

      setPublicationError(null);
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
    if (preflight) {
      setPreflight(null);
      setTextChangedAfterAnalysis(true);
    }
  }

  function analyseBatch() {
    setPreflight(preflightEditorialArticleBatch(articleText));
    setTextChangedAfterAnalysis(false);
  }

  function handleImagesSelected(files: FileList | null) {
    resetPublicationRun();
    setSelectedImages(files ? Array.from(files) : []);
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
          <strong className={contextComplete ? styles.contextComplete : styles.contextIncomplete}>
            {contextComplete ? "CONTEXTO COMPLETO" : "CONTEXTO EM FALTA"}
          </strong>
        </div>

        <div className={styles.contextGrid}>
          <label htmlFor="batch-competition">
            <span>Competição</span>
            <select
              id="batch-competition"
              value={competitionId}
              disabled={isPublishing}
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
              disabled={!competitionId || isPublishing}
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
              disabled={!seasonId || isPublishing}
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

        <label className={styles.textareaField} htmlFor="batch-article-text">
          <span>Blocos JORNADA_ARTIGO_V1</span>
          <textarea
            id="batch-article-text"
            rows={18}
            value={articleText}
            disabled={isPublishing}
            onChange={(event) => handleTextChange(event.target.value)}
            placeholder={`Cole aqui um ou mais blocos ${EDITORIAL_BATCH_ARTICLE_START_MARKER}...`}
            spellCheck={false}
          />
        </label>

        <div className={styles.analysisActions}>
          <p className={styles.analysisNote}>
            A análise é local e determinística. Não guarda nem publica artigos.
          </p>
          <button type="button" disabled={isPublishing} onClick={analyseBatch}>Analisar lote</button>
        </div>

        {textChangedAfterAnalysis ? (
          <p className={styles.staleNotice} role="status">
            Texto alterado — analisar novamente.
          </p>
        ) : null}
      </section>

      <ImageSelectionPanel
        selectedImages={selectedImages}
        imagePreflight={imagePreflight}
        associationStale={textChangedAfterAnalysis}
        onImagesSelected={handleImagesSelected}
        disabled={isPublishing}
      />

      {preflight && imagePreflight ? (
        <ResultSummary
          preflight={preflight}
          imagePreflight={imagePreflight}
          imagePreviewUrls={imagePreviewUrls}
          contextComplete={contextComplete}
          authorReady={Boolean(author.trim())}
          competitionLabel={firstText(selectedCompetition?.name, selectedCompetition?.slug)}
          seasonLabel={firstText(selectedSeason?.label)}
          matchdayLabel={selectedMatchday ? matchdayLabel(selectedMatchday) : ""}
        />
      ) : null}

      {preflight && imagePreflight && (canPublish || Object.keys(publicationStates).length > 0) ? (
        <PublicationPanel
          articles={preflight.articles}
          states={publicationStates}
          error={publicationError}
          isPublishing={isPublishing}
          canPublish={publicationCanPublish}
          plan={publicationPlan}
          confirmedUpdates={confirmedUpdates}
          onConfirmUpdate={
            confirmExistingUpdate
          }
          onPublish={publishBatch}
        />
      ) : null}
    </div>
  );
}
