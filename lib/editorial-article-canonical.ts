export const EDITORIAL_ARTICLE_CANONICAL_FIELDS = [
  "label",
  "title",
  "subtitle",
  "body",
  "image_url",
  "author",
  "published_at",
] as const;

export type EditorialArticleCanonicalField =
  typeof EDITORIAL_ARTICLE_CANONICAL_FIELDS[number];

export type EditorialArticleCanonicalSource = Readonly<{
  label?: string | null;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  image_url?: string | null;
  author?: string | null;
  published_at?: string | null;
}>;

const fieldLabels: Readonly<Record<EditorialArticleCanonicalField, string>> = {
  label: "antetítulo",
  title: "título",
  subtitle: "pós-título / resumo",
  body: "corpo",
  image_url: "imagem",
  author: "autor",
  published_at: "data/hora",
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function hasValidPublishedAt(value: string | null | undefined): boolean {
  if (!hasText(value)) return false;
  const date = new Date(value!);
  return !Number.isNaN(date.getTime());
}

export function missingEditorialArticleCanonicalFields(
  article: EditorialArticleCanonicalSource,
): readonly EditorialArticleCanonicalField[] {
  return EDITORIAL_ARTICLE_CANONICAL_FIELDS.filter((field) => (
    field === "published_at"
      ? !hasValidPublishedAt(article.published_at)
      : !hasText(article[field])
  ));
}

export function editorialArticleCanonicalMissingLabel(
  fields: readonly EditorialArticleCanonicalField[],
): string {
  return fields.map((field) => fieldLabels[field]).join(", ");
}
