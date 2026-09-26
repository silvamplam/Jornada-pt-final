import BackofficeImage from "@/components/admin/BackofficeImage";
import Link from "next/link";
import type { OperationalDeskSourceItem } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";
import type { MesaMaterialSelection } from "./_mesa-selection-state";
import { MesaPublishedArticleSelection, MesaClassificationBadge, MesaClassificationEditor, MesaOperationalSourceRow, MesaSelectionToggle, MesaSelectedVersionNotice, MesaSourceThemeMenu } from "./_mesa-selection-client";
import { MesaSourceChanges, MesaRemoveThemeSource } from "./_mesa-source-changes";
import styles from "./mesa.module.css";
function formatSourceLabel(item: OperationalDeskSourceItem): string { return item.sourceName ?? item.sourceCode; }
export function mesaSourceUsableSnapshot(item: OperationalDeskSourceItem) {
  return item.snapshot && (item.snapshot.hasUsableBody ?? item.snapshot.body.some(
    (block) => block.text.trim().length > 0,
  )) ? item.snapshot : null;
}

export function mesaSourceSelectionMaterial(
  item: OperationalDeskSourceItem,
): MesaMaterialSelection {
  const usableSnapshot = mesaSourceUsableSnapshot(item);
  return {
    kind: "source",
    lifecycle: item.lifecycle,
    newsroomArticleId: item.newsroomArticleId,
    newsroomSnapshotId: usableSnapshot?.id ?? null,
    classificationKey: item.classification.status === "classified"
      ? item.classification.classificationKey
      : null,
    title: item.title,
    sourceLabel: item.sourceName ?? item.sourceCode,
    imageUrl: item.imageCandidateUrl,
  };
}

function formatDate(value: string | null): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));
}

export function MesaSourceItem({
  item,
  fixtureMode = false,
  themeId,
  allowDiscard = true,
  allowRemove = false,
  allowSelection = true,
}: Readonly<{
  item: OperationalDeskSourceItem;
  fixtureMode?: boolean;
  themeId?: string;
  allowDiscard?: boolean;
  allowRemove?: boolean;
  allowSelection?: boolean;
}>) {
  const dateValue = item.publishedAt ?? item.lastDetectedAt;
  const formattedDate = formatDate(dateValue);
  const material = mesaSourceSelectionMaterial(item);
  const usableSnapshot = mesaSourceUsableSnapshot(item);
  const classificationKey = material.classificationKey;

  return (
    <MesaOperationalSourceRow allowDiscard={allowDiscard} source={{
      newsroomArticleId: item.newsroomArticleId,
      newsroomSnapshotId: usableSnapshot?.id ?? null,
      lifecycle: item.lifecycle,
      classificationKey,
    }}>
      {allowSelection ? <div className={styles.sourceSelection}>
        <MesaSelectionToggle material={material} />
      </div> : <div className={styles.sourceSelection} aria-hidden="true" />}
      <div className={styles.sourceThumb}>
        {item.imageCandidateUrl ? (
          <BackofficeImage previewWidth={320}
            src={item.imageCandidateUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span>Sem imagem</span>
        )}
      </div>
      <article className={styles.sourceBody}>
        <div className={styles.sourceMeta}>
          <span className={styles.lifecycleBadge} data-lifecycle={item.lifecycle}>
            {themeId ? (item.lifecycle === "published" ? "COM PUBLICAÇÃO" : "POR PRODUZIR") : item.lifecycle === "published" ? "PUBLICADA" : "NOVA"}
          </span>
          {formattedDate ? <time dateTime={dateValue}>{formattedDate}</time> : null}
          <span>{formatSourceLabel(item)}</span>
          {item.sourceUpdated && !item.comparisonSnapshotId ? (
            <span className={styles.updatedNotice}>Fonte atualizada</span>
          ) : null}
          <MesaClassificationBadge
            newsroomArticleId={item.newsroomArticleId}
            currentClassificationKey={classificationKey}
            classificationSource={item.classification.classificationSource}
          />
        </div>
        <h2>{item.title}</h2>
        <MesaSelectedVersionNotice material={material} />
        {item.sourceUpdated && item.comparisonSnapshotId && item.snapshot && !fixtureMode ? (
          <MesaSourceChanges sourceId={item.newsroomArticleId} beforeId={item.comparisonSnapshotId}
            afterId={item.snapshot.id} title={item.title} themeId={themeId} detectedAt={item.sourceUpdatedAt} />
        ) : null}
        {item.subtitle ? <p>{item.subtitle}</p> : null}
        {item.publishedContributions.length > 0 ? (
          <div className={styles.sourceContributions}>
            {item.publishedContributions.map((contribution) => (
              <div className={styles.sourceContribution} key={contribution.editorialArticleId}>
                {allowSelection ? <MesaPublishedArticleSelection material={material}
                  articleId={contribution.editorialArticleId} title={contribution.title} /> : null}
              <Link
                href={`/admin/editorial/artigos/${contribution.editorialArticleId}/editar`}
              >
                {contribution.title}
                <small>
                  Artigo publicado
                </small>
              </Link>
              </div>
            ))}
          </div>
        ) : null}
        <div className={styles.sourceTools}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">Abrir fonte</a>
          ) : <span>URL indisponível</span>}
          <MesaClassificationEditor
            newsroomArticleId={item.newsroomArticleId}
            lifecycle={item.lifecycle}
            currentClassificationKey={classificationKey}
            fixtureMode={fixtureMode}
          />
          <MesaSourceThemeMenu
            newsroomArticleId={item.newsroomArticleId}
            lifecycle={item.lifecycle}
            classificationKey={classificationKey}
            themeIds={item.themeMembership.themeIds}
          />
          {themeId && allowRemove ? <MesaRemoveThemeSource themeId={themeId} sourceId={item.newsroomArticleId} /> : null}
        </div>
      </article>
    </MesaOperationalSourceRow>
  );
}
