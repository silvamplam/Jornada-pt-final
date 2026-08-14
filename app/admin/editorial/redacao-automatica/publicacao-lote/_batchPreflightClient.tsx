"use client";

import { useEffect, useMemo, useState } from "react";

import {
  EDITORIAL_BATCH_ARTICLE_START_MARKER,
  preflightEditorialArticleBatch,
  type EditorialBatchArticle,
  type EditorialBatchIssue,
  type EditorialBatchPreflight,
} from "@/lib/redacao-automatica/editorial-batch-parser";
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
}: Readonly<{
  selectedImages: readonly File[];
  imagePreflight: EditorialBatchImagePreflight<File> | null;
  associationStale: boolean;
  onImagesSelected: (files: FileList | null) => void;
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
  competitionLabel,
  seasonLabel,
  matchdayLabel: selectedMatchdayLabel,
}: Readonly<{
  preflight: EditorialBatchPreflight;
  imagePreflight: EditorialBatchImagePreflight<File>;
  imagePreviewUrls: ReadonlyMap<File, string>;
  contextComplete: boolean;
  competitionLabel: string;
  seasonLabel: string;
  matchdayLabel: string;
}>) {
  const globalIssues = preflight.issues.filter((issue) => issue.index === undefined);
  const articleRows = articleResultRows(preflight);
  const imageResultByKey = new Map(
    imagePreflight.articles.map((article) => [article.key, article]),
  );
  const globallyPrepared = preflight.ready && contextComplete && imagePreflight.ready;

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
          <strong>{globallyPrepared ? "Pré-flight completo" : "Ainda incompleto"}</strong>
          <p>Esta fase não publica nem envia imagens.</p>
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

  function handleCompetitionChange(nextCompetitionId: string) {
    setCompetitionId(nextCompetitionId);
    setSeasonId("");
    setMatchdayId("");
  }

  function handleSeasonChange(nextSeasonId: string) {
    setSeasonId(nextSeasonId);
    setMatchdayId("");
  }

  function handleTextChange(nextText: string) {
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
    setSelectedImages(files ? Array.from(files) : []);
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
              disabled={!competitionId}
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
              disabled={!seasonId}
              onChange={(event) => setMatchdayId(event.target.value)}
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
            onChange={(event) => handleTextChange(event.target.value)}
            placeholder={`Cole aqui um ou mais blocos ${EDITORIAL_BATCH_ARTICLE_START_MARKER}...`}
            spellCheck={false}
          />
        </label>

        <div className={styles.analysisActions}>
          <p className={styles.analysisNote}>
            A análise é local e determinística. Não guarda nem publica artigos.
          </p>
          <button type="button" onClick={analyseBatch}>Analisar lote</button>
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
      />

      {preflight && imagePreflight ? (
        <ResultSummary
          preflight={preflight}
          imagePreflight={imagePreflight}
          imagePreviewUrls={imagePreviewUrls}
          contextComplete={contextComplete}
          competitionLabel={firstText(selectedCompetition?.name, selectedCompetition?.slug)}
          seasonLabel={firstText(selectedSeason?.label)}
          matchdayLabel={selectedMatchday ? matchdayLabel(selectedMatchday) : ""}
        />
      ) : null}
    </div>
  );
}
