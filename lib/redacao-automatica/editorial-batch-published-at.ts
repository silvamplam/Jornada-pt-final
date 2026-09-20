export type EditorialBatchPublishedAtInput = Readonly<{
  mode: "new" | "update";
  receiptPublishedAt?: unknown;
  targetPublishedAt?: unknown;
  persistedPublishedAt?: unknown;
  sourcePublishedAt?: unknown;
  plannedPublishedAt?: unknown;
  fallbackPublishedAt: unknown;
}>;

export function normalizeEditorialBatchPublishedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function resolveEditorialBatchPublishedAt(
  input: EditorialBatchPublishedAtInput,
): string | null {
  const receipt = normalizeEditorialBatchPublishedAt(input.receiptPublishedAt);
  if (receipt) return receipt;

  if (input.mode === "update") {
    return normalizeEditorialBatchPublishedAt(input.targetPublishedAt);
  }

  return normalizeEditorialBatchPublishedAt(input.persistedPublishedAt)
    ?? normalizeEditorialBatchPublishedAt(input.sourcePublishedAt)
    ?? normalizeEditorialBatchPublishedAt(input.plannedPublishedAt)
    ?? normalizeEditorialBatchPublishedAt(input.fallbackPublishedAt);
}

export function editorialBatchPublishedAtByOutputId(
  items: readonly Readonly<{ outputId: string | null; publishedAt: string }>[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(items.flatMap((item) => (
    item.outputId && normalizeEditorialBatchPublishedAt(item.publishedAt)
      ? [[item.outputId, normalizeEditorialBatchPublishedAt(item.publishedAt) as string]]
      : []
  )));
}
