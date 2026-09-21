import type { ArticleClassificationKey } from "@/lib/editorial-classifications";

export type CurrentFeedPersistedArticle = Readonly<{
  articleId: string;
  action: "created" | "updated" | "reused";
}>;

type ClassificationState =
  | Readonly<{ status: "unclassified"; classification: null }>
  | Readonly<{
      status: "classified";
      classification: Readonly<{
        classificationSource: "automatic" | "manual";
      }>;
    }>;

type PreparedClassification = Readonly<{
  newsroomArticleId: string;
  result: Readonly<{ classificationKey: ArticleClassificationKey | null }>;
}>;

type OperationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false }>;

export interface CurrentFeedBatchClassificationDependencies {
  validateCycle(
    articleIds: readonly string[],
  ): Promise<Readonly<{ ok: true } | { ok: false }>>;
  readClassificationStates(
    articleIds: readonly string[],
  ): Promise<OperationResult<readonly ClassificationState[]>>;
  prepareClassifications(
    articleIds: readonly string[],
  ): Promise<OperationResult<readonly PreparedClassification[]>>;
  applyAutomatic(input: Readonly<{
    newsroomArticleId: string;
    classificationKey: ArticleClassificationKey;
  }>): Promise<OperationResult<Readonly<{
    applied: boolean;
    state: ClassificationState;
  }>>>;
}

export type CurrentFeedBatchClassificationSummary = Readonly<{
  articleCount: number;
  classificationStateReadCount: number;
  preparedCount: number;
  classifiedCount: number;
  unclassifiedCount: number;
  automaticPreservedCount: number;
  manualPreservedCount: number;
  failedCount: number;
}>;

function emptySummary(
  articleCount: number,
): CurrentFeedBatchClassificationSummary {
  return {
    articleCount,
    classificationStateReadCount: 0,
    preparedCount: 0,
    classifiedCount: 0,
    unclassifiedCount: 0,
    automaticPreservedCount: 0,
    manualPreservedCount: 0,
    failedCount: 0,
  };
}

function uniqueArticles(
  articles: readonly CurrentFeedPersistedArticle[],
): readonly CurrentFeedPersistedArticle[] {
  const priority = { reused: 0, updated: 1, created: 2 } as const;
  const byId = new Map<string, CurrentFeedPersistedArticle>();
  for (const article of articles) {
    const existing = byId.get(article.articleId);
    if (!existing || priority[article.action] > priority[existing.action]) {
      byId.set(article.articleId, article);
    }
  }
  return [...byId.values()];
}

export function createCurrentFeedBatchClassifier(
  dependencies: CurrentFeedBatchClassificationDependencies,
) {
  return async function classifyCurrentFeedBatch(
    values: readonly CurrentFeedPersistedArticle[],
  ): Promise<CurrentFeedBatchClassificationSummary> {
    const articles = uniqueArticles(values);
    const summary = emptySummary(articles.length);
    if (articles.length === 0) return summary;

    try {
      const cycle = await dependencies.validateCycle(
        articles.map((article) => article.articleId),
      );
      if (!cycle.ok) {
        return { ...summary, failedCount: articles.length };
      }
    } catch {
      return { ...summary, failedCount: articles.length };
    }

    const created = articles.filter((article) => article.action === "created");
    const existing = articles.filter((article) => article.action !== "created");
    const eligible = [...created];
    let automaticPreservedCount = 0;
    let manualPreservedCount = 0;
    let stateReadFailureCount = 0;

    if (existing.length > 0) {
      let states: OperationResult<readonly ClassificationState[]>;
      try {
        states = await dependencies.readClassificationStates(
          existing.map((article) => article.articleId),
        );
      } catch {
        states = { ok: false };
      }
      if (!states.ok || states.value.length !== existing.length) {
        stateReadFailureCount = existing.length;
      } else {
        states.value.forEach((state, index) => {
          const article = existing[index];
          if (!article) return;
          if (state.status === "unclassified") {
            eligible.push(article);
          } else if (state.classification.classificationSource === "manual") {
            manualPreservedCount += 1;
          } else {
            automaticPreservedCount += 1;
          }
        });
      }
    }

    if (eligible.length === 0) {
      return {
        ...summary,
        classificationStateReadCount: existing.length,
        automaticPreservedCount,
        manualPreservedCount,
        failedCount: stateReadFailureCount,
      };
    }

    let prepared: OperationResult<readonly PreparedClassification[]>;
    try {
      prepared = await dependencies.prepareClassifications(
        eligible.map((article) => article.articleId),
      );
    } catch {
      prepared = { ok: false };
    }
    if (!prepared.ok || prepared.value.length !== eligible.length) {
      return {
        ...summary,
        classificationStateReadCount: existing.length,
        automaticPreservedCount,
        manualPreservedCount,
        failedCount: stateReadFailureCount + eligible.length,
      };
    }

    let classifiedCount = 0;
    let unclassifiedCount = 0;
    let failedCount = stateReadFailureCount;
    for (const [index, classification] of prepared.value.entries()) {
      const article = eligible[index];
      if (!article || classification.newsroomArticleId !== article.articleId) {
        failedCount += 1;
        continue;
      }
      const classificationKey = classification.result.classificationKey;
      if (!classificationKey) {
        unclassifiedCount += 1;
        continue;
      }

      let applied: Awaited<ReturnType<typeof dependencies.applyAutomatic>>;
      try {
        applied = await dependencies.applyAutomatic({
          newsroomArticleId: article.articleId,
          classificationKey,
        });
      } catch {
        applied = { ok: false };
      }
      if (!applied.ok) {
        failedCount += 1;
      } else if (applied.value.applied) {
        classifiedCount += 1;
      } else if (
        applied.value.state.status === "classified"
        && applied.value.state.classification.classificationSource === "manual"
      ) {
        manualPreservedCount += 1;
      } else {
        failedCount += 1;
      }
    }

    return {
      ...summary,
      classificationStateReadCount: existing.length,
      preparedCount: eligible.length,
      classifiedCount,
      unclassifiedCount,
      automaticPreservedCount,
      manualPreservedCount,
      failedCount,
    };
  };
}
