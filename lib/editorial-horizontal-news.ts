export type EditorialHorizontalNewsItem = {
  id: string;
  label: string | null;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  sortOrder: number;
};

export type EditorialHorizontalNewsSource = {
  id: string;
  label?: string | null;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  sortOrder: number;
};

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function buildEditorialHorizontalNewsItems(
  sources: EditorialHorizontalNewsSource[],
  limit = Number.POSITIVE_INFINITY
): EditorialHorizontalNewsItem[] {
  return [...sources]
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((source) => ({
      id: source.id,
      label: cleanText(source.label),
      title: cleanText(source.title) ?? "",
      subtitle: cleanText(source.subtitle),
      imageUrl: cleanText(source.imageUrl),
      linkUrl: cleanText(source.linkUrl),
      sortOrder: source.sortOrder
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, limit);
}

export function resolveMatchdayHorizontalNewsItems({
  hasPublishedReferenceComposition,
  referenceItems,
  liveItems
}: {
  hasPublishedReferenceComposition: boolean;
  referenceItems: EditorialHorizontalNewsSource[];
  liveItems: EditorialHorizontalNewsSource[];
}) {
  return buildEditorialHorizontalNewsItems(
    hasPublishedReferenceComposition ? referenceItems : liveItems
  );
}
