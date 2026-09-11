import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";
import type {
  OperationalDeskSourceLifecycle,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";

export const MESA_PREPARATION_STORAGE_KEY = "jornada.mesa.preparation.v2";
export const MESA_MAX_NEWSROOM_SOURCES = 20;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MesaSourceSelection = Readonly<{
  kind: "source";
  lifecycle: OperationalDeskSourceLifecycle;
  newsroomArticleId: string;
  newsroomSnapshotId: string | null;
  classificationKey: ArticleClassificationKey | null;
  title: string;
  sourceLabel: string;
  imageUrl: string | null;
}>;

export type MesaMaterialSelection = MesaSourceSelection;

export type MesaPreparationBuffer = Readonly<{
  version: 2;
  preparationKey: string | null;
  title: string;
  sources: readonly MesaSourceSelection[];
  themeId?: string | null;
  themeTitle?: string;

}>;

export type MesaPreparationPayload = Readonly<{
  preparationKey: string;
  title: string;
  sources: readonly Readonly<{
    newsroomArticleId: string;
    newsroomSnapshotId: string;
  }>[];
  publishedContextArticleIds: readonly string[];
  themeId?: string;
}>;

export const EMPTY_MESA_PREPARATION_BUFFER: MesaPreparationBuffer = {
  version: 2,
  preparationKey: null,
  title: "",
  sources: [],
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isOptionalText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSourceSelection(value: unknown): value is MesaSourceSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Partial<MesaSourceSelection>;
  return selection.kind === "source"
    && (selection.lifecycle === "new" || selection.lifecycle === "published")
    && isUuid(selection.newsroomArticleId)
    && (selection.newsroomSnapshotId === null || isUuid(selection.newsroomSnapshotId))
    && (selection.classificationKey === null
      || isArticleClassificationKey(selection.classificationKey))
    && typeof selection.title === "string"
    && selection.title.trim().length > 0
    && typeof selection.sourceLabel === "string"
    && selection.sourceLabel.trim().length > 0
    && isOptionalText(selection.imageUrl);
}

export function readMesaPreparationBuffer(value: string | null): MesaPreparationBuffer {
  if (!value) return EMPTY_MESA_PREPARATION_BUFFER;

  try {
    const parsed = JSON.parse(value) as Partial<MesaPreparationBuffer>;
    const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
    if (
      parsed.version !== 2
      || (parsed.themeId != null && !isUuid(parsed.themeId))
      || (parsed.themeTitle !== undefined && typeof parsed.themeTitle !== "string")
      || typeof parsed.title !== "string"
      || sources.length > MESA_MAX_NEWSROOM_SOURCES
      || !sources.every(isSourceSelection)
      || new Set(sources.map((selection) => selection.newsroomArticleId)).size !== sources.length
      || (sources.length > 0 && !isUuid(parsed.preparationKey))
      || (sources.length === 0 && parsed.preparationKey !== null)
    ) return EMPTY_MESA_PREPARATION_BUFFER;

    return {
      version: 2,
      preparationKey: parsed.preparationKey ?? null,
      title: parsed.title,
      sources,
      ...(parsed.themeId ? { themeId: parsed.themeId, themeTitle: parsed.themeTitle ?? "Tema" } : {}),
    };
  } catch {
    return EMPTY_MESA_PREPARATION_BUFFER;
  }
}

export function writeMesaPreparationBuffer(buffer: MesaPreparationBuffer): string {
  return JSON.stringify(buffer);
}

function nextPreparationKey(createPreparationKey: () => string): string {
  const key = createPreparationKey().trim().toLowerCase();
  if (!isUuid(key)) throw new Error("mesa_preparation_key_invalid");
  return key;
}

export function selectMesaMaterial(
  buffer: MesaPreparationBuffer,
  material: MesaMaterialSelection,
  createPreparationKey: () => string,
): MesaPreparationBuffer {
  const index = buffer.sources.findIndex(
    (selection) => selection.newsroomArticleId === material.newsroomArticleId,
  );
  if (index >= 0) {
    const current = buffer.sources[index];
    if (
      current.lifecycle === material.lifecycle
      && current.newsroomSnapshotId === material.newsroomSnapshotId
      && current.classificationKey === material.classificationKey
      && current.title === material.title
      && current.sourceLabel === material.sourceLabel
      && current.imageUrl === material.imageUrl
    ) return buffer;
    const sources = buffer.sources.slice();
    sources[index] = material;
    return {
      ...buffer,
      preparationKey: current.newsroomSnapshotId === material.newsroomSnapshotId
        ? buffer.preparationKey
        : nextPreparationKey(createPreparationKey),
      sources,
    };
  }
  if (buffer.sources.length >= MESA_MAX_NEWSROOM_SOURCES) return buffer;

  return {
    ...buffer,
    preparationKey: nextPreparationKey(createPreparationKey),
    title: buffer.sources.length > 0 ? buffer.title : material.title.slice(0, 180),
    sources: [...buffer.sources, material],
  };
}

export function removeMesaMaterial(
  buffer: MesaPreparationBuffer,
  newsroomArticleId: string,
  createPreparationKey: () => string,
): MesaPreparationBuffer {
  const sources = buffer.sources.filter(
    (selection) => selection.newsroomArticleId !== newsroomArticleId,
  );
  if (sources.length === buffer.sources.length) return buffer;
  return {
    ...buffer,
    preparationKey: sources.length > 0 ? nextPreparationKey(createPreparationKey) : null,
    sources,
  };
}

export function changeMesaPreparationTitle(
  buffer: MesaPreparationBuffer,
  title: string,
  createPreparationKey: () => string,
): MesaPreparationBuffer {
  if (title === buffer.title) return buffer;
  return {
    ...buffer,
    title,
    preparationKey: buffer.sources.length > 0
      ? nextPreparationKey(createPreparationKey)
      : null,
  };
}

export function clearMesaPreparationBuffer(): MesaPreparationBuffer {
  return EMPTY_MESA_PREPARATION_BUFFER;
}

export function mesaMaterialIsSelected(
  buffer: MesaPreparationBuffer,
  material: MesaMaterialSelection,
): boolean {
  return buffer.sources.some(
    (selection) => selection.newsroomArticleId === material.newsroomArticleId,
  );
}

export function mesaPreparationPayload(
  buffer: MesaPreparationBuffer,
): MesaPreparationPayload | null {
  const title = buffer.title.trim();
  if (
    !buffer.preparationKey
    || !isUuid(buffer.preparationKey)
    || title.length < 1
    || title.length > 180
    || buffer.sources.length < 1
    || buffer.sources.some((selection) => selection.classificationKey === null)
    || buffer.sources.some((selection) => selection.newsroomSnapshotId === null)
  ) return null;

  return {
    preparationKey: buffer.preparationKey,
    title,
    sources: buffer.sources.map((selection) => ({
      newsroomArticleId: selection.newsroomArticleId,
      newsroomSnapshotId: selection.newsroomSnapshotId!,
    })),
    publishedContextArticleIds: [],
    ...(buffer.themeId ? { themeId: buffer.themeId } : {}),
  };
}

/** Reading fresh props is NOT a new editorial choice of source version. */
export function observeMesaMaterial(
  buffer: MesaPreparationBuffer,
  material: MesaMaterialSelection,
): MesaPreparationBuffer {
  const index = buffer.sources.findIndex((source) => source.newsroomArticleId === material.newsroomArticleId);
  if (index < 0) return buffer;
  const saved = buffer.sources[index];
  if (saved.classificationKey === material.classificationKey && saved.lifecycle === material.lifecycle) return buffer;
  const sources = buffer.sources.slice();
  sources[index] = { ...saved, classificationKey: material.classificationKey, lifecycle: material.lifecycle };
  return { ...buffer, sources };
}

export function changeMesaPreparationTheme(
  buffer: MesaPreparationBuffer,
  themeId: string,
  themeTitle: string,
  createPreparationKey: () => string,
): MesaPreparationBuffer {
  if (!isUuid(themeId)) throw new Error("mesa_theme_invalid");
  if (buffer.themeId === themeId && buffer.themeTitle === themeTitle) return buffer;
  return { ...buffer, themeId, themeTitle,
    preparationKey: buffer.sources.length ? nextPreparationKey(createPreparationKey) : null };
}

export function mesaPreparationStorageKey(themeId?: string | null): string {
  return themeId ? `${MESA_PREPARATION_STORAGE_KEY}.theme.${themeId}` : MESA_PREPARATION_STORAGE_KEY;
}
