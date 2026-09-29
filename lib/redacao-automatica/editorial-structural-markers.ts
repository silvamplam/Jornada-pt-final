const MARKER_CANDIDATE = /\[[^\[\]]+\]/gu;
const INVISIBLE_SPACING = /[\p{White_Space}\p{Cf}]/gu;
const JORNADA_MARKER = /^\[\/?JORNADA_[A-Z0-9_]+_V[1-9][0-9]*\]$/iu;

export function normalizeJornadaStructuralLine(value: string): string {
  return value.replace(INVISIBLE_SPACING, "");
}

export function findJornadaStructuralMarker(value: unknown): string | null {
  if (typeof value !== "string") return null;
  for (const candidate of value.matchAll(MARKER_CANDIDATE)) {
    const marker = normalizeJornadaStructuralLine(candidate[0]);
    if (JORNADA_MARKER.test(marker)) return marker;
  }
  return null;
}

const PUBLIC_ARTICLE_FIELDS = [
  "label", "title", "subtitle", "body", "author", "slug",
  "image_caption", "imageCaption", "image_url", "imageUrl",
] as const;

export function findJornadaStructuralMarkerInArticle(value: unknown): Readonly<{
  field: typeof PUBLIC_ARTICLE_FIELDS[number];
  marker: string;
}> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const article = value as Record<string, unknown>;
  for (const field of PUBLIC_ARTICLE_FIELDS) {
    const marker = findJornadaStructuralMarker(article[field]);
    if (marker) return { field, marker };
  }
  return null;
}

export function findJornadaStructuralMarkerInPublicationBatch(
  author: unknown,
  articles: readonly unknown[],
): Readonly<{ articleIndex: number | null; field: string; marker: string }> | null {
  const authorMarker = findJornadaStructuralMarker(author);
  if (authorMarker) return { articleIndex: null, field: "author", marker: authorMarker };
  for (const [index, article] of articles.entries()) {
    const marker = findJornadaStructuralMarkerInArticle(article);
    if (marker) return { articleIndex: index + 1, ...marker };
  }
  return null;
}
