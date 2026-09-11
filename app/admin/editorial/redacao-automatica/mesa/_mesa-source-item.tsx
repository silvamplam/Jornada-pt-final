import Link from "next/link";
import type { OperationalDeskSourceItem } from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";
import { classificationLabel } from "./_mesa-query";
import { MesaClassificationEditor, MesaOperationalSourceRow, MesaSelectionToggle, MesaSelectedVersionNotice } from "./_mesa-selection-client";
import { MesaSourceChanges, MesaRemoveThemeSource } from "./_mesa-source-changes";
import styles from "./mesa.module.css";
const classificationSourceLabels = { automatic: "Automática", manual: "Manual" } as const;
function formatSourceLabel(item: OperationalDeskSourceItem): string { return item.sourceName ?? item.sourceCode; }
function formatDate(value: string | null): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));
}

function ClassificationBadge({ item }: Readonly<{ item: OperationalDeskSourceItem }>) {
  if (item.classification.status === "unclassified") {
    return (
      <span className={styles.classificationBadge} data-tone="unclassified">
        Por classificar
      </span>
    );
  }
  return (
    <span className={styles.classificationBadge} data-tone={item.classification.classificationKey}>
      {classificationLabel(item.classification.classificationKey)}
      <small>{classificationSourceLabels[item.classification.classificationSource]}</small>
    </span>
  );
}

export function MesaSourceItem({
  item,
  fixtureMode = false,
  themeId,
  allowDiscard = true,
  allowRemove = false,
}: Readonly<{
  item: OperationalDeskSourceItem;
  fixtureMode?: boolean;
  themeId?: string;
  allowDiscard?: boolean;
  allowRemove?: boolean;
}>) {
  const dateValue = item.publishedAt ?? item.lastDetectedAt;
  const formattedDate = formatDate(dateValue);
  const usableSnapshot = item.snapshot && (item.snapshot.hasUsableBody ?? item.snapshot.body.some(
    (block) => block.text.trim().length > 0,
  )) ? item.snapshot : null;
  const classificationKey = item.classification.status === "classified"
    ? item.classification.classificationKey
    : null;

  return (
    <MesaOperationalSourceRow allowDiscard={allowDiscard} source={{
      newsroomArticleId: item.newsroomArticleId,
      newsroomSnapshotId: usableSnapshot?.id ?? null,
      lifecycle: item.lifecycle,
      classificationKey,
    }}>
      <div className={styles.sourceSelection}>
        <MesaSelectionToggle material={{
          kind: "source",
          lifecycle: item.lifecycle,
          newsroomArticleId: item.newsroomArticleId,
          newsroomSnapshotId: usableSnapshot?.id ?? null,
          classificationKey,
          title: item.title,
          sourceLabel: item.sourceName ?? item.sourceCode,
          imageUrl: item.imageCandidateUrl,
        }} />
      </div>
      <div className={styles.sourceThumb}>
        {item.imageCandidateUrl ? (
          <img
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
          <ClassificationBadge item={item} />
        </div>
        <h2>{item.title}</h2>
        <MesaSelectedVersionNotice material={{ kind: "source", lifecycle: item.lifecycle,
          newsroomArticleId: item.newsroomArticleId, newsroomSnapshotId: usableSnapshot?.id ?? null,
          classificationKey, title: item.title, sourceLabel: formatSourceLabel(item), imageUrl: item.imageCandidateUrl }} />
        {item.sourceUpdated && item.comparisonSnapshotId && item.snapshot && !fixtureMode ? (
          <MesaSourceChanges sourceId={item.newsroomArticleId} beforeId={item.comparisonSnapshotId}
            afterId={item.snapshot.id} title={item.title} themeId={themeId} detectedAt={item.sourceUpdatedAt} />
        ) : null}
        {item.subtitle ? <p>{item.subtitle}</p> : null}
        {item.publishedContributions.length > 0 ? (
          <div className={styles.sourceContributions}>
            {item.publishedContributions.map((contribution) => (
              <Link
                key={contribution.editorialArticleId}
                href={`/admin/editorial/artigos/${contribution.editorialArticleId}/editar`}
              >
                {contribution.title}
                <small>
                  Artigo publicado
                </small>
              </Link>
            ))}
          </div>
        ) : null}
        <div className={styles.sourceTools}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">Abrir fonte</a>
          ) : <span>URL indisponível</span>}
          <MesaClassificationEditor
            newsroomArticleId={item.newsroomArticleId}
            currentClassificationKey={classificationKey}
            fixtureMode={fixtureMode}
          />
          {themeId && allowRemove ? <MesaRemoveThemeSource themeId={themeId} sourceId={item.newsroomArticleId} /> : null}
        </div>
      </article>
    </MesaOperationalSourceRow>
  );
}
