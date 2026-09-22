export const ARTICLE_CLASSIFICATIONS = [
  {
    key: "benfica",
    label: "Benfica",
  },
  {
    key: "sporting",
    label: "Sporting",
  },
  {
    key: "fc_porto",
    label: "FC Porto",
  },
  {
    key: "other_liga_clubs",
    label: "1.ª Liga",
  },
  {
    key: "outside_liga_other",
    label: "Outros assuntos",
  },
] as const;

export type ArticleClassificationKey =
  (typeof ARTICLE_CLASSIFICATIONS)[number]["key"];

export type ArticleClassificationDefinition = Readonly<{
  key: ArticleClassificationKey;
  label: string;
}>;

export const ARTICLE_CLASSIFICATION_KEYS:
  readonly ArticleClassificationKey[] = Object.freeze(
    ARTICLE_CLASSIFICATIONS.map(
      (classification) => classification.key,
    ),
  );

export function isArticleClassificationKey(
  value: unknown,
): value is ArticleClassificationKey {
  return (
    typeof value === "string"
    && ARTICLE_CLASSIFICATION_KEYS.includes(
      value as ArticleClassificationKey,
    )
  );
}

export function articleClassification(
  key: ArticleClassificationKey,
): ArticleClassificationDefinition {
  return ARTICLE_CLASSIFICATIONS.find(
    (classification) => classification.key === key,
  )!;
}

export function articleClassificationLabel(
  key: ArticleClassificationKey,
): string {
  return articleClassification(key).label;
}
