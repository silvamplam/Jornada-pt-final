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

export type ArticleClassificationBadgeTone =
  | ArticleClassificationKey
  | "unclassified";

export type ArticleClassificationBadgeColors = Readonly<{
  backgroundColor: string;
  color: string;
}>;

export const ARTICLE_CLASSIFICATION_BADGE_COLORS: Readonly<
  Record<ArticleClassificationBadgeTone, ArticleClassificationBadgeColors>
> = Object.freeze({
  benfica: { backgroundColor: "#EF4444", color: "#000000" },
  sporting: { backgroundColor: "#15803D", color: "#FFFFFF" },
  fc_porto: { backgroundColor: "#1D4ED8", color: "#FFFFFF" },
  other_liga_clubs: { backgroundColor: "#000000", color: "#FFFFFF" },
  outside_liga_other: { backgroundColor: "#FFD400", color: "#000000" },
  unclassified: { backgroundColor: "#E2E8F0", color: "#000000" },
});

export const HEADLINE_TITLE_COLOR_BY_CLASSIFICATION: Readonly<
  Record<ArticleClassificationKey, string>
> = Object.freeze({
  benfica: "#B4232C",
  sporting: "#146B3A",
  fc_porto: "#1E4F91",
  other_liga_clubs: "#10151B",
  outside_liga_other: "#10151B",
});

export const HEADLINE_TITLE_COLOR_FALLBACK = "#10151B";

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

export function articleClassificationBadgeColors(
  tone: ArticleClassificationBadgeTone,
): ArticleClassificationBadgeColors {
  return ARTICLE_CLASSIFICATION_BADGE_COLORS[tone];
}

export function headlineTitleColorForClassification(
  classificationKey: ArticleClassificationKey | null,
): string {
  return classificationKey === null
    ? HEADLINE_TITLE_COLOR_FALLBACK
    : HEADLINE_TITLE_COLOR_BY_CLASSIFICATION[classificationKey];
}
