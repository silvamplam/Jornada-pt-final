export const NEWSROOM_ARTICLE_CLASSIFICATION_BATCH_SIZE = 100;

export type NewsroomArticleClassificationBatchFetcher =
  <T>(articleIds: readonly string[]) => Promise<T[]>;

export async function readNewsroomArticleClassificationRowsByIds<T>(
  fetchBatch: NewsroomArticleClassificationBatchFetcher,
  articleIds: readonly string[],
): Promise<T[]> {
  const rows: T[] = [];

  for (
    let start = 0;
    start < articleIds.length;
    start += NEWSROOM_ARTICLE_CLASSIFICATION_BATCH_SIZE
  ) {
    const chunk = articleIds.slice(
      start,
      start + NEWSROOM_ARTICLE_CLASSIFICATION_BATCH_SIZE,
    );
    const page = await fetchBatch<T>(chunk);

    if (page.length !== chunk.length) {
      throw new Error("newsroom_article_classification_relation_invalid");
    }
    rows.push(...page);
  }

  return rows;
}
