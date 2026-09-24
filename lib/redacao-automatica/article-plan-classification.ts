import type { ArticleClassificationKey } from "@/lib/editorial-classifications";

export type ArticlePlanClassificationSource = Readonly<{
  classificationKey: ArticleClassificationKey | null;
}>;

export function articlePlanClassificationDefault(
  sources: readonly ArticlePlanClassificationSource[],
): ArticleClassificationKey | null {
  if (
    sources.length === 0
    || sources.some((source) => source.classificationKey === null)
  ) {
    return null;
  }
  const [first] = sources;
  return sources.every(
    (source) => source.classificationKey === first.classificationKey,
  )
    ? first.classificationKey
    : null;
}
