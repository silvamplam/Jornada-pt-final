export type EditorialHorizontalNewsItem = {
  id: string;
  label: string | null;
  labelColor: string | null;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  sortOrder: number;
};

export type EditorialHorizontalNewsSource = {
  id: string;
  label?: string | null;
  labelColor?: string | null;
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
  sources: EditorialHorizontalNewsSource[]
): EditorialHorizontalNewsItem[] {
  return [...sources]
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((source) => ({
      id: source.id,
      label: cleanText(source.label),
      labelColor: cleanText(source.labelColor),
      title: cleanText(source.title) ?? "",
      subtitle: cleanText(source.subtitle),
      imageUrl: cleanText(source.imageUrl),
      linkUrl: cleanText(source.linkUrl),
      sortOrder: source.sortOrder
    }))
    .filter((item) => item.title.length > 0);
}

export function buildEditorialHorizontalNewsEditorOrders(
  sources: Array<{ sortOrder: number }>
) {
  const existingOrders = Array.from(
    new Set(
      sources
        .map((source) => source.sortOrder)
        .filter((sortOrder) => Number.isInteger(sortOrder) && sortOrder > 0)
    )
  ).sort((first, second) => first - second);
  const nextOrder = (existingOrders.at(-1) ?? 0) + 1;

  return [...existingOrders, nextOrder];
}

export type EditorialHorizontalNewsMoveDirection = "up" | "down";

export function prioritizeEditorialHorizontalNewsItem<T extends { id: string }>(
  items: readonly T[],
  itemId: string,
): T[] {
  const index = items.findIndex((item) => item.id === itemId);
  if (index <= 0) {
    return [...items];
  }

  const item = items[index];
  return [item, ...items.slice(0, index), ...items.slice(index + 1)];
}

export function moveEditorialHorizontalNewsItem<T extends { id: string }>(
  items: readonly T[],
  itemId: string,
  direction: EditorialHorizontalNewsMoveDirection,
): T[] {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) {
    return [...items];
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return [...items];
  }

  const reordered = [...items];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
  return reordered;
}

export function buildEditorialHorizontalNewsRows<T>(
  items: T[],
  maxItemsPerRow = 5
): T[][] {
  if (items.length === 0) {
    return [];
  }

  const safeMaxItemsPerRow =
    Number.isInteger(maxItemsPerRow) && maxItemsPerRow > 0 ? maxItemsPerRow : 5;
  const rowCount = Math.ceil(items.length / safeMaxItemsPerRow);
  const baseRowSize = Math.floor(items.length / rowCount);
  const rowsWithExtraItem = items.length % rowCount;
  const firstRowWithExtraItem = rowCount - rowsWithExtraItem;
  const rows: T[][] = [];
  let offset = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowSize = baseRowSize + (rowIndex >= firstRowWithExtraItem ? 1 : 0);
    rows.push(items.slice(offset, offset + rowSize));
    offset += rowSize;
  }

  return rows;
}

export function resolveMatchdayHorizontalNewsItems({
  hasPublishedReferenceComposition,
  isManagedByDesk = false,
  faixaVisible = true,
  referenceItems,
  liveItems
}: {
  hasPublishedReferenceComposition: boolean;
  isManagedByDesk?: boolean;
  faixaVisible?: boolean;
  referenceItems: EditorialHorizontalNewsSource[];
  liveItems: EditorialHorizontalNewsSource[];
}) {
  if (isManagedByDesk && !faixaVisible) {
    return [];
  }

  return buildEditorialHorizontalNewsItems(
    hasPublishedReferenceComposition && !isManagedByDesk ? referenceItems : liveItems
  );
}
