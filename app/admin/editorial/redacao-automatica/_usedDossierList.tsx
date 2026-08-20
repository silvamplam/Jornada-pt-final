import {
  formatNewsroomPublishedAt,
} from "@/lib/redacao-automatica/editorial-workflow-ux";
import type {
  NewsroomEditorialInboxItem,
} from "@/lib/redacao-automatica/newsroom-editorial-inbox-internal";

import UsedDossierBulkActions from "./_usedDossierBulkActions";
import styles from "./redacao-automatica.module.css";

type UsedDossierListProps = Readonly<{
  articles: readonly NewsroomEditorialInboxItem[];
  sourceNames: ReadonlyMap<string, string>;
}>;

type UsedDossierGroup = {
  key: string;
  title: string;
  publishedSlug: string | null;
  reuseHref: string | null;
  selectionValue: string | null;
  latestUsedAt: string | null;
  updateAvailableCount: number;
  articles: NewsroomEditorialInboxItem[];
};

function usedTimestamp(value: string | null): number {
  if (!value) return 0;

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatUsedAt(value: string | null): string | null {
  if (!value) return null;

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) return null;

  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(new Date(timestamp));
}

function reuseDossierHref(
  article: NewsroomEditorialInboxItem,
): string | null {
  const dossier = article.usedDossier;

  if (
    !dossier?.year
    || !dossier.month
    || !dossier.packageId
    || !Number.isInteger(dossier.articlePosition)
    || dossier.articlePosition < 1
  ) {
    return null;
  }

  const params = new URLSearchParams({
    view: "working",
    reuse_year: dossier.year,
    reuse_month: dossier.month,
    reuse_package: dossier.packageId,
    reuse_article: String(dossier.articlePosition),
  });

  return `/admin/editorial/redacao-automatica?${params.toString()}`;
}

function dossierSelectionValue(
  article: NewsroomEditorialInboxItem,
): string | null {
  const dossier = article.usedDossier;

  if (
    !dossier?.year
    || !dossier.month
    || !dossier.packageId
    || !Number.isInteger(dossier.articlePosition)
    || dossier.articlePosition < 1
    || !dossier.publishedArticleId
    || !dossier.publishedSlug
  ) {
    return null;
  }

  return JSON.stringify({
    year: dossier.year,
    month: dossier.month,
    packageId: dossier.packageId,
    articlePosition: dossier.articlePosition,
    publishedArticleId: dossier.publishedArticleId,
    publishedSlug: dossier.publishedSlug,
  });
}

function dossierGroups(
  articles: readonly NewsroomEditorialInboxItem[],
): readonly UsedDossierGroup[] {
  const groups = new Map<string, UsedDossierGroup>();

  for (const article of articles) {
    const dossier = article.usedDossier;
    const key = dossier?.key ?? `legacy:${article.id}`;
    const current = groups.get(key);

    if (current) {
      current.articles.push(article);

      if (
        usedTimestamp(article.usedAt)
        > usedTimestamp(current.latestUsedAt)
      ) {
        current.latestUsedAt = article.usedAt;
      }

      continue;
    }

    groups.set(key, {
      key,
      title:
        dossier?.publishedArticleTitle?.trim()
        || article.title,
      publishedSlug:
        dossier?.publishedSlug?.trim()
        || null,
      reuseHref: reuseDossierHref(article),
      selectionValue: dossierSelectionValue(article),
      latestUsedAt: article.usedAt,
      updateAvailableCount: 0,
      articles: [article],
    });
  }

  return [...groups.values()]
    .map((group) => {
      const usageBySource = new Map<string, boolean[]>();

      for (const article of group.articles) {
        const updates = usageBySource.get(article.id) ?? [];
        updates.push(article.usedUpdateAvailable);
        usageBySource.set(article.id, updates);
      }

      return {
        ...group,
        updateAvailableCount: [...usageBySource.values()].filter(
          (updates) => updates.every(Boolean),
        ).length,
        articles: [...group.articles].sort((left, right) => (
          (left.usedDossier?.sourcePosition ?? 0)
          - (right.usedDossier?.sourcePosition ?? 0)
          || left.id.localeCompare(right.id)
        )),
      };
    })
    .sort((left, right) => (
      usedTimestamp(right.latestUsedAt)
      - usedTimestamp(left.latestUsedAt)
      || left.key.localeCompare(right.key)
    ));
}

export default function UsedDossierList({
  articles,
  sourceNames,
}: UsedDossierListProps) {
  const groups = dossierGroups(articles);

  return (
    <div className={styles.usedDossierWorkspace}>
      <UsedDossierBulkActions />

      <div
        className={styles.usedDossierList}
        data-used-dossier-list
      >
        {groups.map((group) => {
          const updatedAt = formatUsedAt(group.latestUsedAt);

          return (
            <section
              className={styles.usedDossierCard}
              key={group.key}
            >
              <header className={styles.usedDossierHeader}>
                <div className={styles.usedDossierHeading}>
                  <div className={styles.usedDossierTitleRow}>
                    <p>Dossiê</p>

                    {group.selectionValue ? (
                      <label className={styles.usedDossierSelect}>
                        <input
                          type="checkbox"
                          name="dossier_ref"
                          value={group.selectionValue}
                          data-used-dossier-select
                          data-used-dossier-title={group.title}
                        />
                        <span>Selecionar</span>
                      </label>
                    ) : null}
                  </div>

                  <h3>{group.title}</h3>

                  {group.updateAvailableCount > 0 ? (
                    <strong className={styles.usedDossierUpdateBadge}>
                      {group.updateAvailableCount === 1
                        ? "ATUALIZAÇÃO DISPONÍVEL"
                        : `${group.updateAvailableCount} ATUALIZAÇÕES DISPONÍVEIS`}
                    </strong>
                  ) : null}
                </div>

                <div className={styles.usedDossierHeaderMeta}>
                  <strong>
                    {group.articles.length}{" "}
                    {group.articles.length === 1
                      ? "fonte"
                      : "fontes"}
                  </strong>

                  {updatedAt ? (
                    <span>Utilizado em {updatedAt}</span>
                  ) : null}

                  <div className={styles.usedDossierHeaderActions}>
                    {group.publishedSlug ? (
                      <a
                        className={styles.usedDossierPublishedLink}
                        href={`/noticias/${group.publishedSlug}`}
                      >
                        Abrir artigo publicado
                      </a>
                    ) : null}

                    {group.reuseHref ? (
                      <a
                        className={styles.usedDossierReuseButton}
                        href={group.reuseHref}
                      >
                        Reutilizar Dossiê
                      </a>
                    ) : null}
                  </div>
                </div>
              </header>

              <details className={styles.usedDossierDetails}>
                <summary className={styles.usedDossierToggle}>
                  <span className={styles.usedDossierToggleClosed}>
                    Ver {group.articles.length}{" "}
                    {group.articles.length === 1 ? "fonte" : "fontes"}
                  </span>

                  <span className={styles.usedDossierToggleOpen}>
                    Fechar {group.articles.length}{" "}
                    {group.articles.length === 1 ? "fonte" : "fontes"}
                  </span>
                </summary>

                <ol className={styles.usedDossierSources}>
                  {group.articles.map((article, index) => (
                    <li key={[
                      article.usedDossier?.packageId,
                      article.usedDossier?.sourcePosition,
                      article.id,
                      article.usedAt,
                    ].join(":")}>
                      <span className={styles.usedDossierSourceNumber}>
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      {article.imageUrl ? (
                        <div className={styles.usedDossierSourceImage}>
                          <img
                            src={article.imageUrl}
                            alt=""
                            loading="lazy"
                          />
                        </div>
                      ) : null}

                      <div className={styles.usedDossierSourceContent}>
                        <div className={styles.simpleFeedMeta}>
                          <strong>
                            {sourceNames.get(article.sourceCode)
                              ?? article.sourceCode}
                          </strong>

                          {article.publishedAt ? (
                            <time dateTime={article.publishedAt}>
                              {formatNewsroomPublishedAt(
                                article.publishedAt,
                                article.publishedAtPrecision,
                              )}
                            </time>
                          ) : null}
                        </div>

                        <h4>{article.title}</h4>

                        {article.summary || article.subtitle ? (
                          <p>
                            {article.summary ?? article.subtitle}
                          </p>
                        ) : null}

                        {article.sourceUrl && !article.isManualEntry ? (
                          <a
                            className={styles.usedDossierSourceLink}
                            href={article.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Abrir fonte
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
