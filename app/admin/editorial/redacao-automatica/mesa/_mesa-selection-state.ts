import { isMesaMaterialRef, mesaSelectedSources, type MesaMaterialRef } from "@/lib/redacao-automatica/newsroom-mesa-editorial-groups";
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
export type MesaDossierSelection = MesaMaterialRef & Readonly<{ title: string; classificationKey: ArticleClassificationKey | null }>;
export type MesaThemeSelection = Readonly<{
  kind: "theme";
  themeId: string;
  title: string;
  classificationKey: ArticleClassificationKey;
  sources: readonly Readonly<{
    newsroomArticleId: string;
    newsroomSnapshotId: string;
  }>[];
}>;

export type MesaPreparationBuffer = Readonly<{
  version: 3;
  preparationKey: string | null;
  title: string;
  sources: readonly MesaSourceSelection[];
  themes?: readonly MesaThemeSelection[];
  dossiers?: readonly MesaDossierSelection[];
  themeId?: string | null;
  themeTitle?: string;

}>;

export type MesaPreparationPayload = Readonly<{
  materials?: readonly MesaMaterialRef[];
  preparationKey: string;
  title: string;
  sources: readonly Readonly<{
    newsroomArticleId: string;
    newsroomSnapshotId: string;
  }>[];
  publishedContextArticleIds: readonly string[];
  themeId?: string;
}>;

export type MesaContextPreparationPayload = Readonly<{
  preparationKey: string;
  title: string;
  contexts: readonly (
    | Readonly<{
        kind: "source";
        sourceId: string;
        sources: readonly Readonly<{
          newsroomArticleId: string;
          newsroomSnapshotId: string;
        }>[];
      }>
    | Readonly<{
        kind: "theme";
        themeId: string;
        sources: readonly Readonly<{
          newsroomArticleId: string;
          newsroomSnapshotId: string;
        }>[];
      }>
  )[];
  incorporateThemeId: string | null;
  incorporateSourceIds: readonly string[];
}>;

export const EMPTY_MESA_PREPARATION_BUFFER: MesaPreparationBuffer = {
  version: 3,
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

function isDossierSelection(value: unknown): value is MesaDossierSelection {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<MesaDossierSelection>;
  return isMesaMaterialRef(value) && typeof row.title === "string" && Boolean(row.title.trim())
    && (row.classificationKey === null || isArticleClassificationKey(row.classificationKey));
}

function isThemeSelection(value: unknown): value is MesaThemeSelection {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<MesaThemeSelection>;
  return row.kind === "theme"
    && isUuid(row.themeId)
    && typeof row.title === "string"
    && Boolean(row.title.trim())
    && isArticleClassificationKey(row.classificationKey)
    && Array.isArray(row.sources)
    && row.sources.length > 0
    && row.sources.length <= MESA_MAX_NEWSROOM_SOURCES
    && row.sources.every((source) => (
      Boolean(source)
      && typeof source === "object"
      && isUuid(source.newsroomArticleId)
      && isUuid(source.newsroomSnapshotId)
    ))
    && new Set(row.sources.map((source) => source.newsroomArticleId)).size === row.sources.length;
}

function selectionCount(buffer: MesaPreparationBuffer): number {
  return buffer.sources.length + (buffer.themes?.length ?? 0) + (buffer.dossiers?.length ?? 0);
}

export function readMesaPreparationBuffer(value: string | null): MesaPreparationBuffer {
  if (!value) return EMPTY_MESA_PREPARATION_BUFFER;

  try {
    const parsed = JSON.parse(value) as Partial<MesaPreparationBuffer> & { version?: number };
    const storedVersion = (parsed as unknown as { version?: number }).version;
    const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
    const themes = parsed.themes ?? [];
    const dossiers = parsed.dossiers ?? [];
    const count = sources.length
      + (Array.isArray(themes) ? themes.length : 0)
      + (Array.isArray(dossiers) ? dossiers.length : 0);
    if (
      (storedVersion !== 2 && storedVersion !== 3)
      || !Array.isArray(themes) || themes.length > 20
      || !themes.every(isThemeSelection)
      || new Set(themes.map((row) => row.themeId)).size !== themes.length
      || !Array.isArray(dossiers) || dossiers.length > 50
      || !dossiers.every(isDossierSelection)
      || new Set(dossiers.map((row) => row.key)).size !== dossiers.length
      || (parsed.themeId != null && !isUuid(parsed.themeId))
      || (parsed.themeTitle !== undefined && typeof parsed.themeTitle !== "string")
      || typeof parsed.title !== "string"
      || sources.length > MESA_MAX_NEWSROOM_SOURCES
      || !sources.every(isSourceSelection)
      || new Set(sources.map((selection) => selection.newsroomArticleId)).size !== sources.length
      || (count > 0 && !isUuid(parsed.preparationKey))
      || (count === 0 && parsed.preparationKey !== null)
    ) return EMPTY_MESA_PREPARATION_BUFFER;

    return {
      version: 3,
      preparationKey: parsed.preparationKey ?? null,
      title: parsed.title,
      sources,
      ...(themes.length ? { themes } : {}),
      ...(parsed.dossiers !== undefined ? { dossiers } : {}),
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
    title: selectionCount(buffer) > 0 ? buffer.title : material.title.slice(0, 180),
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
    preparationKey: sources.length + (buffer.themes?.length ?? 0) + (buffer.dossiers?.length ?? 0) > 0
      ? nextPreparationKey(createPreparationKey)
      : null,
    sources,
  };
}

export function removeMesaMaterials(
  buffer: MesaPreparationBuffer,
  newsroomArticleIds: readonly string[],
  createPreparationKey: () => string,
): MesaPreparationBuffer {
  const requested = new Set(newsroomArticleIds);
  const sources = buffer.sources.filter(
    (selection) => !requested.has(selection.newsroomArticleId),
  );
  if (sources.length === buffer.sources.length) return buffer;
  if (sources.length + (buffer.themes?.length ?? 0) + (buffer.dossiers?.length ?? 0) === 0) {
    return clearMesaPreparationBuffer();
  }
  return {
    ...buffer,
    preparationKey: nextPreparationKey(createPreparationKey),
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
    preparationKey: selectionCount(buffer) > 0
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
    || buffer.sources.length + (buffer.dossiers?.length ?? 0) < 1
    || buffer.sources.some((selection) => selection.classificationKey === null)
    || buffer.sources.some((selection) => selection.newsroomSnapshotId === null)
  ) return null;

  try {
    const refs = mesaSelectedSources(buffer.sources.map((source) => ({
      newsroomArticleId: source.newsroomArticleId, newsroomSnapshotId: source.newsroomSnapshotId!,
    })), buffer.dossiers ?? []);
    if (refs.length > MESA_MAX_NEWSROOM_SOURCES) return null;
  } catch { return null; }
  return {
    ...(buffer.dossiers?.length ? { materials: buffer.dossiers.map(({ key, versionId, sources }) => ({ key, versionId, sources })) } : {}),
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

export function selectMesaTheme(
  buffer: MesaPreparationBuffer,
  theme: MesaThemeSelection,
  createPreparationKey: () => string,
): MesaPreparationBuffer {
  if (!isThemeSelection(theme)) throw new Error("mesa_theme_selection_invalid");
  const themes = buffer.themes ?? [];
  const index = themes.findIndex((item) => item.themeId === theme.themeId);
  if (index >= 0) {
    if (JSON.stringify(themes[index]) === JSON.stringify(theme)) return buffer;
    const nextThemes = themes.slice();
    nextThemes[index] = theme;
    return { ...buffer, themes: nextThemes, preparationKey: nextPreparationKey(createPreparationKey) };
  }
  if (themes.length >= 20) return buffer;
  return {
    ...buffer,
    themes: [...themes, theme],
    preparationKey: nextPreparationKey(createPreparationKey),
    title: selectionCount(buffer) > 0 ? buffer.title : theme.title.slice(0, 180),
  };
}

export function removeMesaTheme(
  buffer: MesaPreparationBuffer,
  themeId: string,
  createPreparationKey: () => string,
): MesaPreparationBuffer {
  const themes = (buffer.themes ?? []).filter((theme) => theme.themeId !== themeId);
  if (themes.length === (buffer.themes?.length ?? 0)) return buffer;
  if (buffer.sources.length + themes.length + (buffer.dossiers?.length ?? 0) === 0) {
    return clearMesaPreparationBuffer();
  }
  return { ...buffer, themes, preparationKey: nextPreparationKey(createPreparationKey) };
}

export function mesaThemeIsSelected(buffer: MesaPreparationBuffer, themeId: string): boolean {
  return (buffer.themes ?? []).some((theme) => theme.themeId === themeId);
}

export function mesaContextPreparationPayload(
  buffer: MesaPreparationBuffer,
  incorporateSources: boolean,
): MesaContextPreparationPayload | null {
  const title = buffer.title.trim();
  const themes = buffer.themes ?? [];
  if (
    !buffer.preparationKey
    || !isUuid(buffer.preparationKey)
    || title.length < 1
    || title.length > 180
    || buffer.sources.some((source) => source.classificationKey === null || source.newsroomSnapshotId === null)
    || themes.some((theme) => !isThemeSelection(theme))
    || (buffer.dossiers?.length ?? 0) > 0
    || (buffer.sources.length === 0 && themes.length === 0)
    || incorporateSources && (themes.length !== 1 || buffer.sources.length < 1)
  ) return null;

  const looseContexts = buffer.sources.map((source) => ({
    kind: "source" as const,
    sourceId: source.newsroomArticleId,
    sources: [{
      newsroomArticleId: source.newsroomArticleId,
      newsroomSnapshotId: source.newsroomSnapshotId!,
    }],
  }));
  const themeContexts = themes.map((theme) => ({
    kind: "theme" as const,
    themeId: theme.themeId,
    sources: theme.sources,
  }));
  const contexts = incorporateSources
    ? [{
        ...themeContexts[0],
        sources: [
          ...themeContexts[0].sources,
          ...looseContexts.map((context) => context.sources[0]),
        ],
      }]
    : [...looseContexts, ...themeContexts];
  const identities = new Map<string, string>();
  for (const context of contexts) {
    for (const source of context.sources) {
      const snapshot = identities.get(source.newsroomArticleId);
      if (snapshot && snapshot !== source.newsroomSnapshotId) return null;
      identities.set(source.newsroomArticleId, source.newsroomSnapshotId);
    }
  }
  if (identities.size < 1 || identities.size > MESA_MAX_NEWSROOM_SOURCES || contexts.length > 20) return null;

  return {
    preparationKey: buffer.preparationKey,
    title,
    contexts,
    incorporateThemeId: incorporateSources ? themes[0].themeId : null,
    incorporateSourceIds: incorporateSources
      ? buffer.sources.map((source) => source.newsroomArticleId)
      : [],
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
    preparationKey: selectionCount(buffer) ? nextPreparationKey(createPreparationKey) : null };
}

export function mesaPreparationStorageKey(themeId?: string | null): string {
  return themeId ? `${MESA_PREPARATION_STORAGE_KEY}.theme.${themeId}` : MESA_PREPARATION_STORAGE_KEY;
}

export function selectMesaDossierMaterial(buffer: MesaPreparationBuffer, material: MesaDossierSelection,
  createPreparationKey: () => string): MesaPreparationBuffer {
  if (!isMesaMaterialRef(material)) throw new Error("mesa-material-selection-invalid");
  const dossiers = buffer.dossiers ?? [];
  if (dossiers.some((row) => row.key === material.key)) return buffer;
  if (dossiers.length >= 50) return buffer;
  return { ...buffer, dossiers: [...dossiers, material], preparationKey: nextPreparationKey(createPreparationKey),
    title: selectionCount(buffer) ? buffer.title : material.title.slice(0, 180) };
}

export function removeMesaDossierMaterial(buffer: MesaPreparationBuffer, key: string,
  createPreparationKey: () => string): MesaPreparationBuffer {
  const dossiers = (buffer.dossiers ?? []).filter((row) => row.key !== key);
  if (dossiers.length === (buffer.dossiers?.length ?? 0)) return buffer;
  return { ...buffer, dossiers, preparationKey: dossiers.length + buffer.sources.length + (buffer.themes?.length ?? 0)
    ? nextPreparationKey(createPreparationKey) : null };
}
