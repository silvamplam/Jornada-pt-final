import type {
  ArticleBodyBlock,
  JsonObject,
  JsonValue,
  PublishedAtPrecision,
} from "@/lib/redacao-automatica/types";

export const EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES = 20;
export const EDITORIAL_SOURCE_PACKAGE_MANIFEST_FILE_NAME = "pacote-fontes.json";
export const EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH = 240;
export const EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH = 4000;
export const EDITORIAL_SOURCE_PACKAGE_MAX_OUTPUTS = 30;
export const EDITORIAL_SOURCE_PACKAGE_MAX_DOSSIER_OUTPUTS = 5;
export const EDITORIAL_SOURCE_PACKAGE_OUTPUT_FOCUS_MAX_LENGTH = 240;

export const EDITORIAL_SOURCE_PACKAGE_GENRES = [
  { value: "news", label: "Notícia", fileSlug: "noticia" },
  { value: "brief", label: "Breve", fileSlug: "breve" },
  { value: "analysis", label: "Análise", fileSlug: "analise" },
  { value: "editorial", label: "Editorial", fileSlug: "editorial" },
] as const;

export type EditorialSourcePackageGenre =
  typeof EDITORIAL_SOURCE_PACKAGE_GENRES[number]["value"];

export type EditorialSourcePackageEditorialInput = Readonly<{
  genre: EditorialSourcePackageGenre;
  genreLabel: string;
  suggestedTitle: string | null;
  additionalInstructions: string | null;
}>;

export type EditorialSourcePackageOutputInput = Readonly<{
  position: number;
  sourceArticlePosition: number;
  focus: string;
  imageNewsroomArticleId: string | null;
  externalImage?: EditorialSourcePackageExternalImage | null;
}>;

export type EditorialSourcePackageExternalImage = Readonly<{
  url: string;
  fileName: string;
}>;

export type EditorialSourcePackageOutputCreationInput =
  EditorialSourcePackageOutputInput & Readonly<{
    publishedArticleId?: string | null;
    publishedSlug?: string | null;
  }>;

export type EditorialSourcePackageOutput =
  EditorialSourcePackageOutputInput & Readonly<{
    usedAt?: string | null;
    publishedArticleId?: string | null;
    publishedSlug?: string | null;
  }>;

export type EditorialSourcePackagePublishedArticleSnapshot = Readonly<{
  position: number;
  publishedArticleId: string;
  publishedSlug: string;
  anteTitle: string;
  title: string;
  postTitle: string;
  body: string;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;
const EXTERNAL_IMAGE_FILE_NAME_MAX_LENGTH = 240;
const EXTERNAL_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp)$/i;
const EDITORIAL_IMAGE_STORAGE_PATH = "/storage/v1/object/public/editorial-images/";

export type EditorialSourcePackageSelection = Readonly<{
  newsroomArticleId: string;
  newsroomSnapshotId: string;
  articleGroup?: number;
  imagePreferred?: boolean;
}>;

export type EditorialSourcePackagePreparedEntry = Readonly<{
  position: number;
  articlePosition: number;
  newsroomArticleId?: string;
  newsroomSnapshotId?: string;
  imagePreferred?: boolean;
  status: "prepared";
  sourceCode: string;
  sourceName: string;
  sourceUrl: string | null;
  author: string | null;
  publishedAt: string | null;
  publishedAtPrecision?: PublishedAtPrecision | null;
  anteTitle: string | null;
  title: string;
  postTitle: string | null;
  body: readonly ArticleBodyBlock[];
  imageUrl: string | null;
}>;

export type EditorialSourcePackageFailedEntry = Readonly<{
  position: number;
  articlePosition: number;
  newsroomArticleId?: string;
  newsroomSnapshotId?: string;
  imagePreferred?: boolean;
  status: "failed";
  sourceCode: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  title: string | null;
  errorCode:
    | "source_not_found"
    | "snapshot_not_found"
    | "snapshot_mismatch"
    | "source_body_unavailable";
  errorMessage: string;
}>;

export type EditorialSourcePackageEntry =
  | EditorialSourcePackagePreparedEntry
  | EditorialSourcePackageFailedEntry;

export type EditorialSourcePackageManifestEntry = Readonly<{
  position: number;
  articlePosition: number;
  newsroomArticleId?: string | null;
  newsroomSnapshotId?: string | null;
  imagePreferred?: boolean;
  usedAt?: string | null;
  publishedArticleId?: string | null;
  publishedSlug?: string | null;
  status: "prepared" | "failed";
  sourceCode: string | null;
  sourceName: string | null;
  title: string | null;
  errorCode: string | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  publishedAtPrecision?: PublishedAtPrecision | null;
}>;

export type EditorialSourcePackageManifest = Readonly<{
  version: 2 | 3 | 4;
  packageId: string;
  createdAt: string;
  year: string;
  month: string;
  markdownFileName: string;
  genre: EditorialSourcePackageGenre;
  genreLabel: string;
  suggestedTitle: string | null;
  additionalInstructions: string | null;
  selectedCount: number;
  articleCount: number;
  preparedCount: number;
  failedCount: number;
  imageCount: number;
  localDirectory: string | null;
  outputs: readonly EditorialSourcePackageOutput[];
  entries: readonly EditorialSourcePackageManifestEntry[];
}>;

function cleanId(value: string): string {
  return value.trim().toLowerCase();
}

function cleanEditorialText(value: string, maxLength: number): string | null {
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.length <= maxLength ? cleaned : null;
}

function normalizeEditorialSourcePackageExternalImage(
  value: EditorialSourcePackageExternalImage | null | undefined,
): EditorialSourcePackageExternalImage | null {
  if (!value) {
    return null;
  }

  const url = typeof value.url === "string" ? value.url.trim() : "";
  const fileName = cleanEditorialText(
    typeof value.fileName === "string" ? value.fileName : "",
    EXTERNAL_IMAGE_FILE_NAME_MAX_LENGTH,
  );

  if (!url || !fileName || !EXTERNAL_IMAGE_EXTENSION_PATTERN.test(fileName)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const decodedPath = decodeURIComponent(parsed.pathname);

    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || !decodedPath.includes(EDITORIAL_IMAGE_STORAGE_PATH)
      || !EXTERNAL_IMAGE_EXTENSION_PATTERN.test(decodedPath)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return { url, fileName };
}

export function editorialSourcePackageGenreDefinition(
  genre: EditorialSourcePackageGenre,
) {
  return EDITORIAL_SOURCE_PACKAGE_GENRES.find((candidate) => candidate.value === genre)
    ?? EDITORIAL_SOURCE_PACKAGE_GENRES[0];
}

function editorialSourcePackageTopicSlug(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");

  return slug || null;
}

export function editorialSourcePackageFileName(
  genre: EditorialSourcePackageGenre,
  suggestedTitle: string | null = null,
): string {
  const topicSlug = editorialSourcePackageTopicSlug(suggestedTitle);
  return topicSlug
    ? `fontes-${topicSlug}.md`
    : `fontes-selecionadas-${editorialSourcePackageGenreDefinition(genre).fileSlug}.md`;
}

export function editorialSourcePackageImagesFileName(
  genre: EditorialSourcePackageGenre,
  suggestedTitle: string | null = null,
): string {
  const topicSlug = editorialSourcePackageTopicSlug(suggestedTitle);
  return topicSlug
    ? `imagens-${topicSlug}.zip`
    : `imagens-fontes-${editorialSourcePackageGenreDefinition(genre).fileSlug}.zip`;
}

export function normalizeEditorialSourcePackageEditorialInput(input: Readonly<{
  genre: string;
  suggestedTitle: string;
  additionalInstructions: string;
}>): EditorialSourcePackageEditorialInput | null {
  const genreDefinition = EDITORIAL_SOURCE_PACKAGE_GENRES.find(
    (candidate) => candidate.value === input.genre.trim(),
  );
  if (!genreDefinition) {
    return null;
  }

  const suggestedTitle = cleanEditorialText(
    input.suggestedTitle,
    EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH,
  );
  if (input.suggestedTitle.trim() && !suggestedTitle) {
    return null;
  }

  const additionalInstructions = cleanEditorialText(
    input.additionalInstructions,
    EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH,
  );
  if (input.additionalInstructions.trim() && !additionalInstructions) {
    return null;
  }

  return {
    genre: genreDefinition.value,
    genreLabel: genreDefinition.label,
    suggestedTitle,
    additionalInstructions,
  };
}

export function normalizeEditorialSourcePackageSelections(
  selections: readonly EditorialSourcePackageSelection[],
  options: Readonly<{
    allowMultipleSnapshotsPerArticle?: boolean;
  }> = {},
): readonly EditorialSourcePackageSelection[] | null {
  if (
    selections.length < 1
    || selections.length > EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES
  ) {
    return null;
  }

  const articleIds = new Set<string>();
  const snapshotIds = new Set<string>();
  const sourceSnapshotIdentities = new Set<string>();
  const groupPositions = new Map<number, number>();
  const preferredImageGroups = new Set<number>();
  const normalized: EditorialSourcePackageSelection[] = [];
  let nextArticlePosition = 1;

  for (const [index, selection] of selections.entries()) {
    const newsroomArticleId = cleanId(selection.newsroomArticleId);
    const newsroomSnapshotId = cleanId(selection.newsroomSnapshotId);
    const sourceSnapshotIdentity =
      `${newsroomArticleId}\u0000${newsroomSnapshotId}`;
    const rawArticleGroup = selection.articleGroup ?? index + 1;

    if (
      !UUID_PATTERN.test(newsroomArticleId)
      || !UUID_PATTERN.test(newsroomSnapshotId)
      || (
        !options.allowMultipleSnapshotsPerArticle
        && articleIds.has(newsroomArticleId)
      )
      || snapshotIds.has(newsroomSnapshotId)
      || sourceSnapshotIdentities.has(sourceSnapshotIdentity)
      || !Number.isInteger(rawArticleGroup)
      || rawArticleGroup < 1
      || rawArticleGroup > EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES
    ) {
      return null;
    }

    let articleGroup = groupPositions.get(rawArticleGroup);
    if (!articleGroup) {
      articleGroup = nextArticlePosition;
      groupPositions.set(rawArticleGroup, articleGroup);
      nextArticlePosition += 1;
    }

    if (selection.imagePreferred && preferredImageGroups.has(articleGroup)) {
      return null;
    }
    if (selection.imagePreferred) {
      preferredImageGroups.add(articleGroup);
    }

    articleIds.add(newsroomArticleId);
    snapshotIds.add(newsroomSnapshotId);
    sourceSnapshotIdentities.add(sourceSnapshotIdentity);
    normalized.push({
      newsroomArticleId,
      newsroomSnapshotId,
      articleGroup,
      ...(selection.imagePreferred ? { imagePreferred: true } : {}),
    });
  }

  return normalized;
}


export type EditorialSourcePackageOutputSourceEntry = Readonly<{
  position: number;
  articlePosition: number;
  newsroomArticleId?: string | null;
  status: "prepared" | "failed";
  imageUrl?: string | null;
  imagePreferred?: boolean;
}>;

export function defaultEditorialSourcePackageOutputs(
  entries: readonly EditorialSourcePackageOutputSourceEntry[],
  suggestedTitle: string | null = null,
): readonly EditorialSourcePackageOutputInput[] {
  const groups = [...new Set(entries.map((entry) => entry.articlePosition))]
    .filter((position) => Number.isInteger(position) && position > 0)
    .sort((left, right) => left - right);

  return groups.map((sourceArticlePosition, index) => {
    const groupEntries = entries.filter(
      (entry) => entry.articlePosition === sourceArticlePosition,
    );
    const preferred = groupEntries.find((entry) => (
      entry.status === "prepared"
      && entry.imagePreferred
      && typeof entry.newsroomArticleId === "string"
      && Boolean(entry.newsroomArticleId.trim())
      && typeof entry.imageUrl === "string"
      && Boolean(entry.imageUrl.trim())
    ));
    const firstImage = groupEntries.find((entry) => (
      entry.status === "prepared"
      && typeof entry.newsroomArticleId === "string"
      && Boolean(entry.newsroomArticleId.trim())
      && typeof entry.imageUrl === "string"
      && Boolean(entry.imageUrl.trim())
    ));
    const imageEntry = preferred ?? firstImage ?? null;
    const position = index + 1;

    return {
      position,
      sourceArticlePosition,
      focus: groups.length === 1 && suggestedTitle?.trim()
        ? suggestedTitle.trim()
        : `Artigo ${String(position).padStart(2, "0")}`,
      imageNewsroomArticleId: imageEntry?.newsroomArticleId
        ? cleanId(imageEntry.newsroomArticleId)
        : null,
    };
  });
}

export function normalizeEditorialSourcePackageOutputs(
  outputs: readonly EditorialSourcePackageOutputInput[],
  entries: readonly EditorialSourcePackageOutputSourceEntry[],
): readonly EditorialSourcePackageOutputInput[] | null {
  if (
    outputs.length < 1
    || outputs.length > EDITORIAL_SOURCE_PACKAGE_MAX_OUTPUTS
  ) {
    return null;
  }

  const sourceGroups = new Set(
    entries.map((entry) => entry.articlePosition),
  );
  const normalized: EditorialSourcePackageOutputInput[] = [];

  for (const [index, output] of outputs.entries()) {
    const position = Number(output.position);
    const sourceArticlePosition = Number(output.sourceArticlePosition);
    const focus = cleanEditorialText(
      typeof output.focus === "string" ? output.focus : "",
      EDITORIAL_SOURCE_PACKAGE_OUTPUT_FOCUS_MAX_LENGTH,
    );
    const imageNewsroomArticleId =
      typeof output.imageNewsroomArticleId === "string"
      && output.imageNewsroomArticleId.trim()
        ? cleanId(output.imageNewsroomArticleId)
        : null;
    const externalImage = normalizeEditorialSourcePackageExternalImage(
      output.externalImage,
    );

    if (output.externalImage && !externalImage) {
      return null;
    }

    if (
      position !== index + 1
      || !Number.isInteger(sourceArticlePosition)
      || sourceArticlePosition < 1
      || !sourceGroups.has(sourceArticlePosition)
      || !focus
    ) {
      return null;
    }

    if (imageNewsroomArticleId && externalImage) {
      return null;
    }

    if (imageNewsroomArticleId) {
      const imageEntry = entries.find((entry) => (
        entry.articlePosition === sourceArticlePosition
        && entry.status === "prepared"
        && typeof entry.newsroomArticleId === "string"
        && cleanId(entry.newsroomArticleId) === imageNewsroomArticleId
        && typeof entry.imageUrl === "string"
        && Boolean(entry.imageUrl.trim())
      ));

      if (!imageEntry) {
        return null;
      }
    }

    normalized.push({
      position,
      sourceArticlePosition,
      focus,
      imageNewsroomArticleId,
      ...(externalImage ? { externalImage } : {}),
    });
  }

  return normalized;
}

export function normalizeEditorialSourcePackageCreationOutputs(
  outputs: readonly EditorialSourcePackageOutputCreationInput[],
  entries: readonly EditorialSourcePackageOutputSourceEntry[],
): readonly EditorialSourcePackageOutput[] | null {
  const normalized = normalizeEditorialSourcePackageOutputs(
    outputs,
    entries,
  );

  if (!normalized) {
    return null;
  }

  const creationOutputs: EditorialSourcePackageOutput[] = [];
  const publishedArticleIds = new Set<string>();

  for (const [index, output] of normalized.entries()) {
    const input = outputs[index];
    const publishedArticleId = typeof input.publishedArticleId === "string"
      ? cleanId(input.publishedArticleId)
      : "";
    const publishedSlug = typeof input.publishedSlug === "string"
      ? input.publishedSlug.trim()
      : "";

    if (
      (publishedArticleId && !UUID_PATTERN.test(publishedArticleId))
      || Boolean(publishedArticleId) !== Boolean(publishedSlug)
      || (
        publishedArticleId
        && publishedArticleIds.has(publishedArticleId)
      )
      || (
        "usedAt" in input
        && typeof (input as { usedAt?: unknown }).usedAt === "string"
        && Boolean((input as { usedAt: string }).usedAt.trim())
      )
    ) {
      return null;
    }

    if (publishedArticleId) {
      publishedArticleIds.add(publishedArticleId);
    }

    creationOutputs.push({
      ...output,
      ...(publishedArticleId
        ? { publishedArticleId, publishedSlug }
        : {}),
    });
  }

  return creationOutputs;
}

export type EditorialSourcePackageArticleImageSource = Readonly<{
  position: number;
  sourceCode: string;
  articleTitle: string;
  imageUrl: string;
  fileName?: string;
}>;

export function editorialSourcePackageArticleImageSources(
  entries: readonly Readonly<{
    position: number;
    articlePosition: number;
    newsroomArticleId?: string | null;
    status: "prepared" | "failed";
    sourceCode: string | null;
    title: string | null;
    imageUrl?: string | null;
    imagePreferred?: boolean;
  }>[],
  outputs?: readonly EditorialSourcePackageOutputInput[],
): readonly EditorialSourcePackageArticleImageSource[] {
  if (outputs?.length) {
    return outputs.flatMap(
      (output): EditorialSourcePackageArticleImageSource[] => {
        if (output.externalImage) {
          return [{
            position: output.position,
            sourceCode: "imagem-externa",
            articleTitle: output.focus || output.externalImage.fileName,
            imageUrl: output.externalImage.url,
            fileName: output.externalImage.fileName,
          }];
        }

        if (!output.imageNewsroomArticleId) {
          return [];
        }

        const selected = entries.find((entry) => (
          entry.articlePosition === output.sourceArticlePosition
          && entry.status === "prepared"
          && typeof entry.newsroomArticleId === "string"
          && cleanId(entry.newsroomArticleId)
            === cleanId(output.imageNewsroomArticleId!)
          && typeof entry.imageUrl === "string"
          && Boolean(entry.imageUrl.trim())
        ));

        return selected && selected.imageUrl
          ? [{
              position: output.position,
              sourceCode:
                selected.sourceCode?.trim() || "fonte",
              articleTitle:
                output.focus
                || selected.title?.trim()
                || "Notícia",
              imageUrl: selected.imageUrl.trim(),
            }]
          : [];
      },
    );
  }

  const candidatesByArticle =
    new Map<number, EditorialSourcePackageArticleImageSource[]>();
  const preferredByArticle =
    new Map<number, EditorialSourcePackageArticleImageSource>();

  for (const entry of entries) {
    const imageUrl =
      entry.status === "prepared"
      && typeof entry.imageUrl === "string"
        ? entry.imageUrl.trim()
        : "";

    if (!imageUrl) {
      continue;
    }

    const candidate = {
      position: entry.articlePosition,
      sourceCode: entry.sourceCode?.trim() || "fonte",
      articleTitle: entry.title?.trim() || "Notícia",
      imageUrl,
    };
    const candidates =
      candidatesByArticle.get(entry.articlePosition) ?? [];

    candidates.push(candidate);
    candidatesByArticle.set(entry.articlePosition, candidates);

    if (
      entry.imagePreferred
      && !preferredByArticle.has(entry.articlePosition)
    ) {
      preferredByArticle.set(
        entry.articlePosition,
        candidate,
      );
    }
  }

  return [...candidatesByArticle.entries()]
    .map(([articlePosition, candidates]) => (
      preferredByArticle.get(articlePosition)
      ?? candidates[0]
    ))
    .filter(
      (candidate): candidate is EditorialSourcePackageArticleImageSource =>
        Boolean(candidate),
    )
    .sort((left, right) => left.position - right.position);
}

export type EditorialSourcePackageUsedSourceRef = Readonly<{
  newsroomArticleId: string;
  newsroomSnapshotId: string;
  usedAt: string;
}>;

export function editorialSourcePackageUsedSourceRefs(
  value: unknown,
): readonly EditorialSourcePackageUsedSourceRef[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const entries = (value as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry): EditorialSourcePackageUsedSourceRef[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const candidate = entry as Record<string, unknown>;
    const newsroomArticleId = typeof candidate.newsroomArticleId === "string"
      ? cleanId(candidate.newsroomArticleId)
      : "";
    const newsroomSnapshotId = typeof candidate.newsroomSnapshotId === "string"
      ? cleanId(candidate.newsroomSnapshotId)
      : "";
    const usedAt = typeof candidate.usedAt === "string" ? candidate.usedAt.trim() : "";

    return UUID_PATTERN.test(newsroomArticleId)
      && UUID_PATTERN.test(newsroomSnapshotId)
      && usedAt
      && !Number.isNaN(Date.parse(usedAt))
      ? [{ newsroomArticleId, newsroomSnapshotId, usedAt }]
      : [];
  });
}

export type EditorialSourcePackageUsedDossierRef = Readonly<{
  newsroomArticleId: string;
  newsroomSnapshotId: string;
  usedAt: string;
  dossierKey: string;
  packageId: string;
  year: string;
  month: string;
  articlePosition: number;
  sourcePosition: number;
  publishedArticleId: string | null;
  publishedSlug: string | null;
}>;

export function editorialSourcePackageUsedDossierRefs(
  value: unknown,
): readonly EditorialSourcePackageUsedDossierRef[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const manifest = value as Record<string, unknown>;
  const packageId = typeof manifest.packageId === "string"
    ? cleanId(manifest.packageId)
    : "";
  const year = typeof manifest.year === "string"
    ? manifest.year.trim()
    : "";
  const month = typeof manifest.month === "string"
    ? manifest.month.trim()
    : "";
  const entries = manifest.entries;

  if (
    !UUID_PATTERN.test(packageId)
    || !YEAR_PATTERN.test(year)
    || !MONTH_PATTERN.test(month)
    || !Array.isArray(entries)
  ) {
    return [];
  }

  return entries.flatMap((entry, index): EditorialSourcePackageUsedDossierRef[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const candidate = entry as Record<string, unknown>;
    const newsroomArticleId = typeof candidate.newsroomArticleId === "string"
      ? cleanId(candidate.newsroomArticleId)
      : "";
    const newsroomSnapshotId = typeof candidate.newsroomSnapshotId === "string"
      ? cleanId(candidate.newsroomSnapshotId)
      : "";
    const usedAt = typeof candidate.usedAt === "string"
      ? candidate.usedAt.trim()
      : "";
    const articlePosition = Number(candidate.articlePosition);
    const storedSourcePosition = Number(candidate.position);
    const sourcePosition = Number.isInteger(storedSourcePosition) && storedSourcePosition > 0
      ? storedSourcePosition
      : index + 1;
    const rawPublishedArticleId = typeof candidate.publishedArticleId === "string"
      ? cleanId(candidate.publishedArticleId)
      : "";
    const publishedArticleId = UUID_PATTERN.test(rawPublishedArticleId)
      ? rawPublishedArticleId
      : null;
    const publishedSlug = typeof candidate.publishedSlug === "string"
      ? candidate.publishedSlug.trim() || null
      : null;

    if (
      !UUID_PATTERN.test(newsroomArticleId)
      || !UUID_PATTERN.test(newsroomSnapshotId)
      || !usedAt
      || Number.isNaN(Date.parse(usedAt))
      || !Number.isInteger(articlePosition)
      || articlePosition < 1
    ) {
      return [];
    }

    return [{
      newsroomArticleId,
      newsroomSnapshotId,
      usedAt,
      dossierKey: publishedArticleId
        ? `article:${publishedArticleId}`
        : `package:${packageId}:${articlePosition}`,
      packageId,
      year,
      month,
      articlePosition,
      sourcePosition,
      publishedArticleId,
      publishedSlug,
    }];
  });
}

export function isEditorialSourcePackageLocation(input: Readonly<{
  year: string;
  month: string;
  packageId: string;
}>): boolean {
  return (
    YEAR_PATTERN.test(input.year)
    && MONTH_PATTERN.test(input.month)
    && UUID_PATTERN.test(input.packageId.trim())
  );
}

function directMetadataText(
  metadata: JsonObject,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value: JsonValue | undefined = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function editorialSourceAnteTitle(metadata: JsonObject): string | null {
  return directMetadataText(metadata, [
    "anteTitle",
    "ante_title",
    "antetitulo",
    "kicker",
  ]);
}

function markdownText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

function markdownMetadata(label: string, value: string | null): string[] {
  return value
    ? [`- **${label}:** ${markdownText(value)}`]
    : [];
}

function markdownEditorValue(value: string | null, emptyText: string): string[] {
  const text = value ? markdownText(value) : "";
  return (text || emptyText)
    .split("\n")
    .map((line) => `> ${line}`);
}

function markdownBody(blocks: readonly ArticleBodyBlock[]): string[] {
  return blocks.flatMap((block): string[] => {
    const text = markdownText(block.text);
    if (!text) {
      return [];
    }

    return block.type === "heading"
      ? [`### ${text}`, ""]
      : [text, ""];
  });
}

function formatPreparedEntry(
  entry: EditorialSourcePackagePreparedEntry,
  sourcePosition: number,
  sourceTotal: number,
): string {
  const lines = [
    `## FONTE ${String(sourcePosition).padStart(2, "0")} DE ${String(sourceTotal).padStart(2, "0")}`,
    "",
    ...markdownMetadata("FONTE", entry.sourceName),
    ...markdownMetadata("URL", entry.sourceUrl),
    ...markdownMetadata("PUBLICADA EM", entry.publishedAt),
    ...markdownMetadata("AUTOR", entry.author),
    "",
  ];

  if (entry.anteTitle) {
    lines.push("### ANTETÍTULO", "", markdownText(entry.anteTitle), "");
  }

  lines.push("### TÍTULO", "", markdownText(entry.title), "");

  if (entry.postTitle) {
    lines.push("### PÓS-TÍTULO", "", markdownText(entry.postTitle), "");
  }

  lines.push("### CORPO", "", ...markdownBody(entry.body), "");

  return lines.join("\n").trimEnd();
}

function formatFailedEntry(
  entry: EditorialSourcePackageFailedEntry,
  sourcePosition: number,
  sourceTotal: number,
): string {
  return [
    `## FONTE ${String(sourcePosition).padStart(2, "0")} DE ${String(sourceTotal).padStart(2, "0")}`,
    "",
    ...markdownMetadata("FONTE", entry.sourceName),
    ...markdownMetadata("URL", entry.sourceUrl),
    ...markdownMetadata("TÍTULO IDENTIFICADO", entry.title),
    "",
    "### ESTADO",
    "",
    "Não foi possível preparar integralmente esta fonte.",
    "",
    "### ERRO",
    "",
    `${entry.errorCode}: ${entry.errorMessage}`,
  ].join("\n").trimEnd();
}

function formatArticleGroup(
  articlePosition: number,
  articleTotal: number,
  entries: readonly EditorialSourcePackageEntry[],
  dossierMode = false,
): string {
  const sourceSections = entries.map((entry, index) => (
    entry.status === "prepared"
      ? formatPreparedEntry(entry, index + 1, entries.length)
      : formatFailedEntry(entry, index + 1, entries.length)
  ));
  const groupLabel =
    dossierMode ? "DOSSIÊ DE FONTES" : "ARTIGO";
  const sourcesLabel =
    dossierMode ? "DOSSIÊ" : "ARTIGO";

  return [
    `# ${groupLabel} ${String(articlePosition).padStart(2, "0")} DE ${String(articleTotal).padStart(2, "0")}`,
    "",
    `**FONTES NESTE ${sourcesLabel}:** ${entries.length}`,
    "",
    ...sourceSections.flatMap((section, index) => (
      index === 0
        ? [section]
        : ["---", "", section]
    )),
  ].join("\n").trimEnd();
}

const EXTERNAL_ARTICLE_IMPORT_RULES = [
  "Cada artigo final deve ser devolvido dentro de um bloco que começa exatamente com [JORNADA_ARTIGO_V1] e termina exatamente com [/JORNADA_ARTIGO_V1].",
  "Devolva exatamente um bloco [JORNADA_ARTIGO_V1] por saída editorial definida em ARTIGOS A PRODUZIR, pela mesma ordem, sem fundir saídas nem criar artigos adicionais.",
  "Dentro de cada bloco, use exatamente esta ordem: ANTETÍTULO, TÍTULO, PÓS-TÍTULO e CORPO. Cada rótulo deve ocupar uma linha isolada.",
  "Preencha sempre ANTETÍTULO, TÍTULO, PÓS-TÍTULO e CORPO com conteúdo utilizável. Os quatro campos são obrigatórios neste fluxo de publicação.",
  "Não use JSON, tabelas, blocos de código ou comentários fora dos marcadores. Estes marcadores permitem levar a resposta diretamente para a Publicação em lote da Jornada.pt.",
];

const COMMON_PROMPT_RULES = [
  "Produza o texto em português europeu, com linguagem jornalística eloquente, fluida, natural e rigorosa.",
  "Leia integralmente e considere todas as fontes do grupo indicado em cada saída editorial. Várias saídas podem partilhar o mesmo grupo de fontes e, nesse caso, podem utilizar as mesmas fontes; grupos diferentes não devem ser misturados.",
  "Quando existir a secção “ARTIGOS PUBLICADOS A ATUALIZAR”, cada saída editorial corresponde obrigatoriamente ao artigo publicado da mesma posição. Atualize esse artigo à luz das fontes antigas e novas, preservando o que continua válido; não o substitua por um foco editorial diferente.",
  "Além das fontes fornecidas, pesquise sempre fontes externas atuais e credíveis sobre o mesmo tema para complementar, contextualizar e atualizar a informação, salvo instrução expressa do editor para não fazer pesquisa externa.",
  "A pesquisa complementar deve acrescentar contexto e atualidade sem inventar factos nem apagar divergências relevantes. Quando existirem versões divergentes, apresente e atribua claramente cada uma, sem escolher arbitrariamente uma como verdadeira.",
  "O título sugerido pelo editor é uma orientação inicial. Melhore-o ou substitua-o quando existir uma formulação mais rigorosa, informativa e adequada ao conteúdo efetivamente sustentado pelas fontes.",
  "Respeite as instruções adicionais do editor, desde que não contrariem os factos disponíveis.",
  "Não invente factos, citações, números, datas, intenções, relações causais ou conclusões não sustentadas. Preserve sempre a atribuição de declarações e interpretações.",
  "Não explique o processo de redação. Não mencione “as fontes abaixo”. Não apresente notas técnicas nem exponha o raciocínio usado para construir o texto.",
];

const GENRE_PROMPTS: Record<EditorialSourcePackageGenre, readonly string[]> = {
  news: [
    "Crie uma notícia jornalística desenvolvida.",
    "Identifique o tema jornalisticamente mais relevante e organize a informação numa narrativa coerente, em vez de resumir cada fonte separadamente.",
    "Estruture o resultado com ANTETÍTULO, TÍTULO, PÓS-TÍTULO e CORPO.",
    "O título deve ser informativo, claro e coerente com o tema principal. O pós-título deve acrescentar informação relevante sem repetir o título.",
    "Comece o corpo com um lead que apresente o essencial. Desenvolva depois os factos por ordem de relevância, integrando contexto, declarações e consequências em parágrafos jornalísticos naturais.",
    "Não use listas nem secções chamadas “Factos”, “Interpretação” ou “Conclusão”, salvo indicação expressa do editor.",
  ],
  brief: [
    "Crie uma breve jornalística.",
    "Identifique o facto mais relevante e concentre o texto nesse acontecimento, usando apenas o contexto indispensável à sua compreensão.",
    "O resultado deve ser curto, direto e informativo, normalmente entre 100 e 180 palavras.",
    "Estruture o resultado com ANTETÍTULO, TÍTULO, PÓS-TÍTULO e CORPO, mantendo a concisão própria de uma breve.",
    "O corpo deve ter entre dois e quatro parágrafos. Não tente incluir todos os detalhes, antecedentes secundários ou declarações que não acrescentem informação essencial.",
  ],
  analysis: [
    "Crie uma análise jornalística.",
    "Identifique o problema, tendência ou questão central e construa uma interpretação sustentada nos factos disponíveis.",
    "Vá além da enumeração de acontecimentos, explicando relações, consequências, contradições e elementos de contexto.",
    "Distinga naturalmente factos, declarações, inferências e interpretação jornalística, sem usar essas categorias como títulos de secções.",
    "Estruture o resultado com ANTETÍTULO, TÍTULO, PÓS-TÍTULO e CORPO.",
    "Abra o corpo com a questão central, desenvolva a análise através dos factos e termine com a consequência, dúvida ou cenário mais relevante, sem fabricar previsões.",
    "Não transforme a interpretação em opinião sem fundamento.",
  ],
  editorial: [
    "Crie um editorial.",
    "Leia todas as fontes antes de definir a tese. Identifique o problema central e assuma uma posição clara, institucional e argumentada.",
    "A posição deve resultar da apreciação crítica dos factos, sem informação inventada, ataques pessoais ou afirmações que as fontes não sustentem.",
    "Não esconda factos relevantes que contrariem a tese. Reconheça limitações e incertezas materialmente importantes sem abandonar a posição editorial.",
    "Estruture o resultado com ANTETÍTULO, TÍTULO, PÓS-TÍTULO e CORPO.",
    "Introduza o tema e a posição, desenvolva os argumentos com base nos factos e termine com uma conclusão editorial clara.",
    "Não use a primeira pessoa do singular e não apresente opinião como facto.",
  ],
};

export function editorialSourcePackagePrompt(
  genre: EditorialSourcePackageGenre,
): string {
  return [
    ...GENRE_PROMPTS[genre],
    "",
    ...COMMON_PROMPT_RULES,
    "",
    ...EXTERNAL_ARTICLE_IMPORT_RULES,
  ].join("\n\n");
}

function formatPublishedArticleSnapshot(
  snapshot: EditorialSourcePackagePublishedArticleSnapshot,
  total: number,
): string {
  return [
    `## SAÍDA ${String(snapshot.position).padStart(2, "0")} DE ${String(total).padStart(2, "0")}`,
    "",
    ...markdownMetadata("ARTICLE_ID", snapshot.publishedArticleId),
    ...markdownMetadata("SLUG", snapshot.publishedSlug),
    "",
    "### ANTETÍTULO",
    "",
    markdownText(snapshot.anteTitle),
    "",
    "### TÍTULO",
    "",
    markdownText(snapshot.title),
    "",
    "### PÓS-TÍTULO",
    "",
    markdownText(snapshot.postTitle),
    "",
    "### CORPO",
    "",
    markdownText(snapshot.body),
  ].join("\n").trimEnd();
}

function formatPublishedArticleSnapshots(
  snapshots:
    readonly EditorialSourcePackagePublishedArticleSnapshot[]
    | undefined,
): string[] {
  if (!snapshots?.length) {
    return [];
  }

  const ordered =
    [...snapshots].sort(
      (left, right) =>
        left.position - right.position,
    );

  return [
    "# ARTIGOS PUBLICADOS A ATUALIZAR",
    "",
    "> Cada saída abaixo identifica o artigo atualmente publicado que deve ser atualizado. A posição é vinculativa: SAÍDA 01 atualiza o artigo 01, SAÍDA 02 atualiza o artigo 02, e assim sucessivamente.",
    "",
    ...ordered.flatMap(
      (snapshot, index) => {
        const section =
          formatPublishedArticleSnapshot(
            snapshot,
            ordered.length,
          );

        return index === 0
          ? [section]
          : ["---", "", section];
      },
    ),
    "",
  ];
}

function formatEditorialOutputPlan(
  outputs: readonly EditorialSourcePackageOutputInput[] | undefined,
): string[] {
  if (!outputs?.length) {
    return [];
  }

  return [
    "## ARTIGOS A PRODUZIR",
    "",
    `**TOTAL:** ${outputs.length}`,
    "",
    ...outputs.map((output) => (
      `${String(output.position).padStart(2, "0")} — ${markdownText(output.focus)} — grupo de fontes ${String(output.sourceArticlePosition).padStart(2, "0")}`
    )),
    "",
    "> Todos os artigos são saídas editoriais do Dossiê. Quando várias saídas apontam para o mesmo grupo de fontes, podem recorrer ao mesmo conjunto documental, respeitando o foco definido para cada artigo.",
    "",
  ];
}

function buildEditorialSourcePackageTaskMarkdown(
  editorial: EditorialSourcePackageEditorialInput,
  outputs?: readonly EditorialSourcePackageOutputInput[],
): string {
  return [
    "# TAREFA EDITORIAL",
    "",
    "## GÉNERO JORNALÍSTICO",
    "",
    editorial.genreLabel,
    "",
    "## TÍTULO SUGERIDO PELO EDITOR",
    "",
    ...markdownEditorValue(
      editorial.suggestedTitle,
      "Não indicado.",
    ),
    "",
    "## INSTRUÇÕES ADICIONAIS DO EDITOR",
    "",
    ...markdownEditorValue(
      editorial.additionalInstructions,
      "Sem instruções adicionais.",
    ),
    "",
    ...formatEditorialOutputPlan(outputs),
    "## INSTRUÇÃO DE REDAÇÃO",
    "",
    editorialSourcePackagePrompt(editorial.genre),
  ].join("\n");
}

export function updateEditorialSourcePackageMarkdown(
  input: Readonly<{
    markdown: string;
    editorial: EditorialSourcePackageEditorialInput;
    outputs?: readonly EditorialSourcePackageOutputInput[];
  }>,
): string | null {
  const normalizedMarkdown =
    input.markdown.replace(/\r\n?/g, "\n");
  const publishedArticlesMarker =
    "# ARTIGOS PUBLICADOS A ATUALIZAR";
  const sourcesMarker = "# FONTES INTEGRAIS";

  const publishedArticlesIndex =
    normalizedMarkdown.indexOf(
      publishedArticlesMarker,
    );
  const sourcesIndex =
    normalizedMarkdown.indexOf(sourcesMarker);

  if (sourcesIndex < 0) {
    return null;
  }

  const preservedIndex =
    publishedArticlesIndex >= 0
    && publishedArticlesIndex < sourcesIndex
      ? publishedArticlesIndex
      : sourcesIndex;

  let sources =
    normalizedMarkdown.slice(preservedIndex);

  if (input.outputs?.length) {
    sources = sources.replace(
      /\*\*ARTIGOS FINAIS:\*\* \d+/,
      `**ARTIGOS FINAIS:** ${input.outputs.length}`,
    );

    const sharedSourceGroups =
      input.outputs.length
      > new Set(
          input.outputs.map(
            (output) => output.sourceArticlePosition,
          ),
        ).size;

    if (sharedSourceGroups) {
      sources = sources
        .replace(
          /^# ARTIGO (\d{2}) DE (\d{2})$/gm,
          "# DOSSIÊ DE FONTES $1 DE $2",
        )
        .replace(
          /\*\*FONTES NESTE ARTIGO:\*\*/g,
          "**FONTES NESTE DOSSIÊ:**",
        );
    }
  }

  return [
    buildEditorialSourcePackageTaskMarkdown(
      input.editorial,
      input.outputs,
    ),
    "",
    "---",
    "",
    sources,
  ].join("\n");
}

export function buildEditorialSourcePackageMarkdown(
  input: Readonly<{
    createdAt: string;
    editorial: EditorialSourcePackageEditorialInput;
    entries: readonly EditorialSourcePackageEntry[];
    outputs?: readonly EditorialSourcePackageOutputInput[];
    publishedArticles?:
      readonly EditorialSourcePackagePublishedArticleSnapshot[];
  }>,
): string {
  const selectedCount = input.entries.length;
  const preparedCount =
    input.entries.filter(
      (entry) => entry.status === "prepared",
    ).length;
  const failedCount =
    selectedCount - preparedCount;
  const groupedEntries =
    new Map<number, EditorialSourcePackageEntry[]>();

  for (const entry of input.entries) {
    const current =
      groupedEntries.get(entry.articlePosition) ?? [];

    current.push(entry);
    groupedEntries.set(
      entry.articlePosition,
      current,
    );
  }

  const articleGroups =
    [...groupedEntries.entries()]
      .sort(([left], [right]) => left - right);

  const defaultOutputs =
    defaultEditorialSourcePackageOutputs(
      input.entries,
      input.editorial.suggestedTitle,
    );

  const outputs = input.outputs
    ? normalizeEditorialSourcePackageOutputs(
        input.outputs,
        input.entries,
      ) ?? defaultOutputs
    : defaultOutputs;

  const articleCount = outputs.length;
  const sharedSourceGroups =
    outputs.length
    > new Set(
        outputs.map(
          (output) => output.sourceArticlePosition,
        ),
      ).size;

  const articleSections =
    articleGroups.map(
      ([articlePosition, entries]) => (
        formatArticleGroup(
          articlePosition,
          articleGroups.length,
          entries,
          sharedSourceGroups,
        )
      ),
    );

  return [
    buildEditorialSourcePackageTaskMarkdown(
      input.editorial,
      outputs,
    ),
    "",
    "---",
    "",
    ...formatPublishedArticleSnapshots(
      input.publishedArticles,
    ),
    ...(input.publishedArticles?.length
      ? ["---", ""]
      : []),
    "# FONTES INTEGRAIS",
    "",
    `**FONTES SELECIONADAS:** ${selectedCount}`,
    `**ARTIGOS FINAIS:** ${articleCount}`,
    `**FONTES PREPARADAS INTEGRALMENTE:** ${preparedCount}`,
    `**COM FALHA:** ${failedCount}`,
    `**CRIADO EM:** ${input.createdAt}`,
    "",
    "> Os textos abaixo correspondem aos snapshots editoriais selecionados. Não foram resumidos nem reescritos por IA.",
    "",
    ...articleSections.flatMap(
      (section, index) => (
        index === 0
          ? [section]
          : ["---", "", section]
      ),
    ),
    "",
  ].join("\n");
}
