const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ThemeContinuitySourceChange =
  | "NEW_SOURCE"
  | "UPDATED_SOURCE"
  | "UNCHANGED_SOURCE";

export type ThemeContinuitySource = Readonly<{
  newsroomArticleId: string;
  latestSnapshotId: string;
  sourceCode: string;
  title: string;
  publishedAt: string | null;
  lastDetectedAt: string;
  addedAt: string;
  change: ThemeContinuitySourceChange;
}>;

export type ThemeContinuityPublishedArticle = Readonly<{
  editorialArticleId: string;
  slug: string;
  title: string;
  label: string;
  subtitle: string;
  imageUrl: string | null;
  publishedAt: string | null;
  matchdayId: string;
  addedAt: string;
}>;

export type ThemeContinuitySlot = Readonly<{
  slot: string;
  kind: "existing" | "new";
  outputId: string;
  productionContextId: string;
  targetEditorialArticleId: string | null;
  targetSlug?: string;
  targetTitle?: string;
  targetMatchdayId?: string;
}>;

export type ThemeContinuityFrozenContract = Readonly<{
  contractVersion: 1;
  themeId: string;
  authorityFingerprint: string;
  baselineDossierId: string | null;
  baselineConsolidatedAt: string | null;
  sourceDiff: readonly Readonly<{
    newsroomArticleId: string;
    newsroomSnapshotId: string;
    change: ThemeContinuitySourceChange;
  }>[];
  publishedArticleCount: number;
  newArticleCount: number;
  slots: readonly ThemeContinuitySlot[];
}>;

export type ThemeContinuityReadModel = Readonly<{
  theme: Readonly<{
    id: string;
    title: string;
    classificationKey: string;
    status: "open" | "archived";
    contextText: string | null;
  }>;
  sources: readonly ThemeContinuitySource[];
  baseline: Readonly<{
    dossierId: string;
    consolidatedAt: string;
  }> | null;
  publishedArticles: readonly ThemeContinuityPublishedArticle[];
  sourceCount: number;
  publishedArticleCount: number;
  authorityFingerprint: string;
}>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function nullableUuid(value: unknown): string | null | undefined {
  if (value === null) return null;
  return uuid(value) ?? undefined;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function sourceChange(value: unknown): ThemeContinuitySourceChange | null {
  return ["NEW_SOURCE", "UPDATED_SOURCE", "UNCHANGED_SOURCE"].includes(String(value))
    ? value as ThemeContinuitySourceChange
    : null;
}

export function parseThemeContinuityFrozenContract(
  selectionPayload: unknown,
): ThemeContinuityFrozenContract | null {
  const payload = record(selectionPayload);
  const raw = record(payload?.themeContinuity);
  const themeId = uuid(raw?.themeId);
  const authorityFingerprint = text(raw?.authorityFingerprint);
  const baselineDossierId = nullableUuid(raw?.baselineDossierId);
  const baselineConsolidatedAt = raw?.baselineConsolidatedAt === null
    ? null
    : timestamp(raw?.baselineConsolidatedAt);
  if (
    raw?.contractVersion !== 1
    || !themeId
    || !authorityFingerprint || !/^[0-9a-f]{32}$/.test(authorityFingerprint)
    || baselineDossierId === undefined
    || baselineConsolidatedAt === null && raw?.baselineConsolidatedAt !== null
    || !Number.isSafeInteger(raw?.publishedArticleCount)
    || !Number.isSafeInteger(raw?.newArticleCount)
    || Number(raw?.publishedArticleCount) < 0
    || Number(raw?.newArticleCount) < 0
    || !Array.isArray(raw?.sourceDiff)
    || !Array.isArray(raw?.slots)
  ) return null;

  const sourceDiff = raw.sourceDiff.map((candidate) => {
    const item = record(candidate);
    const newsroomArticleId = uuid(item?.newsroomArticleId);
    const newsroomSnapshotId = uuid(item?.newsroomSnapshotId);
    const change = sourceChange(item?.change);
    return newsroomArticleId && newsroomSnapshotId && change
      ? { newsroomArticleId, newsroomSnapshotId, change }
      : null;
  });
  const slots = raw.slots.map((candidate) => {
    const item = record(candidate);
    const slot = text(item?.slot);
    const kind = item?.kind === "existing" || item?.kind === "new" ? item.kind : null;
    const outputId = uuid(item?.outputId);
    const productionContextId = uuid(item?.productionContextId);
    const targetEditorialArticleId = nullableUuid(item?.targetEditorialArticleId);
    const targetSlug = text(item?.targetSlug) ?? undefined;
    const targetTitle = text(item?.targetTitle) ?? undefined;
    const targetMatchdayId = uuid(item?.targetMatchdayId) ?? undefined;
    if (
      !slot || !/^(EXISTING|NEW)_\d{2}$/.test(slot)
      || !kind || !outputId || !productionContextId
      || targetEditorialArticleId === undefined
      || (kind === "existing" && (
        !slot.startsWith("EXISTING_") || !targetEditorialArticleId
        || !targetSlug || !targetTitle || !targetMatchdayId
      ))
      || (kind === "new" && (!slot.startsWith("NEW_") || targetEditorialArticleId !== null))
    ) return null;
    return {
      slot, kind, outputId, productionContextId, targetEditorialArticleId,
      ...(targetSlug ? { targetSlug } : {}),
      ...(targetTitle ? { targetTitle } : {}),
      ...(targetMatchdayId ? { targetMatchdayId } : {}),
    } satisfies ThemeContinuitySlot;
  });
  if (
    sourceDiff.some((item) => !item)
    || slots.some((item) => !item)
    || sourceDiff.length < 1 || sourceDiff.length > 20
    || slots.length < 1 || slots.length > 30
    || new Set(sourceDiff.map((item) => item!.newsroomArticleId)).size !== sourceDiff.length
    || new Set(slots.map((item) => item!.slot)).size !== slots.length
    || new Set(slots.map((item) => item!.outputId)).size !== slots.length
    || new Set(slots.map((item) => item!.productionContextId)).size !== 1
    || new Set(slots.flatMap((item) => (
      item!.targetEditorialArticleId ? [item!.targetEditorialArticleId] : []
    ))).size !== raw.publishedArticleCount
    || slots.filter((item) => item!.kind === "existing").length !== raw.publishedArticleCount
    || slots.filter((item) => item!.kind === "new").length !== raw.newArticleCount
    || slots.some((item, index) => {
      const existingCount = raw.publishedArticleCount as number;
      const expectedSlot = index < existingCount
        ? `EXISTING_${String(index + 1).padStart(2, "0")}`
        : `NEW_${String(index - existingCount + 1).padStart(2, "0")}`;
      return item!.slot !== expectedSlot;
    })
    || (baselineDossierId === null) !== (baselineConsolidatedAt === null)
  ) return null;

  return {
    contractVersion: 1,
    themeId,
    authorityFingerprint,
    baselineDossierId,
    baselineConsolidatedAt,
    sourceDiff: sourceDiff as ThemeContinuityFrozenContract["sourceDiff"],
    publishedArticleCount: raw.publishedArticleCount as number,
    newArticleCount: raw.newArticleCount as number,
    slots: slots as ThemeContinuityFrozenContract["slots"],
  };
}
