import type { ArticleClassificationKey } from "@/lib/editorial-classifications";

export type ArticlePlanClassificationSource = Readonly<{
  sourceId: string;
  classificationKey: ArticleClassificationKey | null;
  classificationSource: "automatic" | "manual" | null;
}>;

export function articleOutputClassificationDefault(
  usedSourceIds: readonly string[],
  sources: readonly ArticlePlanClassificationSource[],
): ArticleClassificationKey | null {
  if (usedSourceIds.length === 0) return null;

  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const usedSources: ArticlePlanClassificationSource[] = [];
  for (const sourceId of usedSourceIds) {
    const source = sourceById.get(sourceId);
    if (
      !source
      || source.classificationSource !== "manual"
      || source.classificationKey === null
    ) return null;
    usedSources.push(source);
  }

  const [first] = usedSources;
  return usedSources.every(
    (source) => source.classificationKey === first.classificationKey,
  )
    ? first.classificationKey
    : null;
}

export function articleOutputClassificationsComplete(
  requiredArticleKeys: readonly string[],
  choices: Readonly<Record<string, ArticleClassificationKey>>,
): boolean {
  return requiredArticleKeys.every((key) => Boolean(choices[key]));
}
