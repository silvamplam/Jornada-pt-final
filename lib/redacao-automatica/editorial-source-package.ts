import "server-only";

import { rm } from "node:fs/promises";

import {
  fetchSupabaseAdminTable,
  writeSupabaseAdmin,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  buildEditorialSourcePackageMarkdown,
  editorialSourceAnteTitle,
  editorialSourcePackageArticleImageSources,
  editorialSourcePackageFileName,
  isEditorialSourcePackageLocation,
  normalizeEditorialSourcePackageEditorialInput,
  normalizeEditorialSourcePackageSelections,
  updateEditorialSourcePackageMarkdown,
  type EditorialSourcePackageEditorialInput,
  type EditorialSourcePackageEntry,
  type EditorialSourcePackageManifest,
  type EditorialSourcePackagePreparedEntry,
  type EditorialSourcePackageSelection,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import {
  archiveEditorialSourceImagesLocally,
  editorialLocalArchiveDirectory,
} from "@/lib/redacao-automatica/editorial-source-image";
import {
  MANUAL_NEWSROOM_SOURCE_CODE,
  MANUAL_NEWSROOM_SOURCE_LABEL,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";
import { findRegisteredSource } from "@/lib/redacao-automatica/source-registry";
import {
  publishedAtPrecisionFromSourceMetadata,
  type ArticleBodyBlock,
  type JsonObject,
} from "@/lib/redacao-automatica/types";

type NewsroomArticleRow = {
  id: string;
  source_code: string;
  original_url: string | null;
  normalized_url: string | null;
  title: string;
  subtitle: string | null;
  author: string | null;
  published_at: string | null;
  image_url: string | null;
};

type NewsroomSnapshotRow = {
  id: string;
  article_id: string;
  body: unknown;
  source_metadata: unknown;
};

type EditorialSourcePackageRow = {
  id: string;
  package_year: string;
  package_month: string;
  manifest: unknown;
  markdown: string;
};

type EditorialSourcePackageUpdateRow = {
  id: string;
};

export type CreateEditorialSourcePackageInput = Readonly<{
  packageId: string;
  selections: readonly EditorialSourcePackageSelection[];
  editorial: EditorialSourcePackageEditorialInput;
  now?: Date;
}>;

export type CreateEditorialSourcePackageResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        manifest: EditorialSourcePackageManifest;
        markdown: string;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code:
          | "input_invalid"
          | "source_read_failed"
          | "package_write_failed";
      }>;
    }>;

export type ReadEditorialSourcePackageResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        manifest: EditorialSourcePackageManifest;
        markdown: string;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "location_invalid" | "package_not_found" | "package_read_failed";
      }>;
    }>;

export type UpdateEditorialSourcePackageEditorialResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        manifest: EditorialSourcePackageManifest;
        markdown: string;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code:
          | "input_invalid"
          | "location_invalid"
          | "package_not_found"
          | "package_read_failed"
          | "package_write_failed";
      }>;
    }>;

export type MarkEditorialSourcePackageArticleUsedResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code:
          | "input_invalid"
          | "location_invalid"
          | "package_not_found"
          | "package_read_failed"
          | "package_write_failed"
          | "article_group_not_found"
          | "usage_conflict";
      }>;
    }>;

function uuidList(values: readonly string[]): string {
  return values.map((value) => encodeURIComponent(value)).join(",");
}

function articleBody(value: unknown): readonly ArticleBodyBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate): ArticleBodyBlock[] => {
    if (!candidate || typeof candidate !== "object") {
      return [];
    }

    const block = candidate as { type?: unknown; text?: unknown };
    if (
      (block.type !== "paragraph" && block.type !== "heading")
      || typeof block.text !== "string"
      || !block.text.trim()
    ) {
      return [];
    }

    return [{
      type: block.type,
      text: block.text,
    }];
  });
}

function jsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function sourceName(sourceCode: string): string {
  if (sourceCode === MANUAL_NEWSROOM_SOURCE_CODE) {
    return MANUAL_NEWSROOM_SOURCE_LABEL;
  }

  return findRegisteredSource(sourceCode)?.name ?? sourceCode;
}

function yearAndMonth(now: Date): Readonly<{ year: string; month: string }> {
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, "0"),
  };
}

function manifestEntries(entries: readonly EditorialSourcePackageEntry[]) {
  return entries.map((entry) => ({
    position: entry.position,
    articlePosition: entry.articlePosition,
    newsroomArticleId: entry.newsroomArticleId,
    newsroomSnapshotId: entry.newsroomSnapshotId,
    imagePreferred: entry.imagePreferred,
    status: entry.status,
    sourceCode: entry.sourceCode,
    sourceName: entry.sourceName,
    title: entry.title,
    errorCode: entry.status === "failed" ? entry.errorCode : null,
    imageUrl: entry.status === "prepared" ? entry.imageUrl : null,
    publishedAt: entry.status === "prepared" ? entry.publishedAt : null,
    publishedAtPrecision: entry.status === "prepared"
      ? entry.publishedAtPrecision ?? null
      : null,
  }));
}

function persistedManifest(
  value: unknown,
  location: Readonly<{ year: string; month: string; packageId: string }>,
): EditorialSourcePackageManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const manifest = value as Partial<EditorialSourcePackageManifest>;
  const editorial = normalizeEditorialSourcePackageEditorialInput({
    genre: typeof manifest.genre === "string" ? manifest.genre : "",
    suggestedTitle: typeof manifest.suggestedTitle === "string"
      ? manifest.suggestedTitle
      : "",
    additionalInstructions: typeof manifest.additionalInstructions === "string"
      ? manifest.additionalInstructions
      : "",
  });

  if (!editorial) {
    return null;
  }

  const validMarkdownFileNames = new Set([
    editorialSourcePackageFileName(editorial.genre),
    editorialSourcePackageFileName(editorial.genre, editorial.suggestedTitle),
  ]);

  if (
    (manifest.version !== 2 && manifest.version !== 3)
    || manifest.genreLabel !== editorial.genreLabel
    || typeof manifest.markdownFileName !== "string"
    || !validMarkdownFileNames.has(manifest.markdownFileName)
    || manifest.packageId !== location.packageId
    || manifest.year !== location.year
    || manifest.month !== location.month
    || (manifest.localDirectory !== null && typeof manifest.localDirectory !== "string")
    || !Array.isArray(manifest.entries)
    || !Number.isInteger(manifest.selectedCount)
    || !Number.isInteger(manifest.preparedCount)
    || !Number.isInteger(manifest.failedCount)
    || !Number.isInteger(manifest.imageCount)
  ) {
    return null;
  }

  const entries = manifest.entries.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const candidate = entry as EditorialSourcePackageManifest["entries"][number];
    const articlePosition = Number.isInteger(candidate.articlePosition)
      && candidate.articlePosition > 0
      ? candidate.articlePosition
      : index + 1;

    return {
      ...candidate,
      articlePosition,
    };
  });

  if (entries.some((entry) => !entry)) {
    return null;
  }

  const normalizedEntries = entries as EditorialSourcePackageManifest["entries"];
  const articleCount = Number.isInteger(manifest.articleCount)
    && Number(manifest.articleCount) > 0
    ? Number(manifest.articleCount)
    : new Set(normalizedEntries.map((entry) => entry.articlePosition)).size;

  return {
    ...(manifest as EditorialSourcePackageManifest),
    articleCount,
    entries: normalizedEntries,
  };
}

export async function createEditorialSourcePackage(
  input: CreateEditorialSourcePackageInput,
): Promise<CreateEditorialSourcePackageResult> {
  const selections = normalizeEditorialSourcePackageSelections(input.selections);
  const editorial = normalizeEditorialSourcePackageEditorialInput({
    genre: input.editorial.genre,
    suggestedTitle: input.editorial.suggestedTitle ?? "",
    additionalInstructions: input.editorial.additionalInstructions ?? "",
  });
  if (!selections || !editorial) {
    return { ok: false, error: { code: "input_invalid" } };
  }

  const now = input.now ?? new Date();
  const location = yearAndMonth(now);
  const localDirectory = editorialLocalArchiveDirectory(input.packageId, now);

  const articleIds = selections.map((selection) => selection.newsroomArticleId);
  const snapshotIds = selections.map((selection) => selection.newsroomSnapshotId);

  let articles: NewsroomArticleRow[];
  let snapshots: NewsroomSnapshotRow[];

  try {
    [articles, snapshots] = await Promise.all([
      fetchSupabaseAdminTable<NewsroomArticleRow>(
        "newsroom_articles"
        + "?select=id,source_code,original_url,normalized_url,title,subtitle,author,published_at,image_url"
        + `&id=in.(${uuidList(articleIds)})`
        + `&limit=${articleIds.length}`,
      ),
      fetchSupabaseAdminTable<NewsroomSnapshotRow>(
        "newsroom_article_snapshots"
        + "?select=id,article_id,body,source_metadata"
        + `&id=in.(${uuidList(snapshotIds)})`
        + `&limit=${snapshotIds.length}`,
      ),
    ]);
  } catch {
    return { ok: false, error: { code: "source_read_failed" } };
  }

  const articlesById = new Map(articles.map((article) => [article.id, article]));
  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const entries = selections.map((selection, index): EditorialSourcePackageEntry => {
    const position = index + 1;
    const articlePosition = selection.articleGroup ?? position;
    const article = articlesById.get(selection.newsroomArticleId);
    const snapshot = snapshotsById.get(selection.newsroomSnapshotId);

    if (!article) {
      return {
        position,
        articlePosition,
        newsroomArticleId: selection.newsroomArticleId,
        newsroomSnapshotId: selection.newsroomSnapshotId,
        imagePreferred: Boolean(selection.imagePreferred),
        status: "failed",
        sourceCode: null,
        sourceName: null,
        sourceUrl: null,
        title: null,
        errorCode: "source_not_found",
        errorMessage: "A notícia selecionada já não está disponível.",
      };
    }

    const articleSourceName = sourceName(article.source_code);
    const sourceUrl = article.normalized_url || article.original_url;

    if (!snapshot) {
      return {
        position,
        articlePosition,
        newsroomArticleId: selection.newsroomArticleId,
        newsroomSnapshotId: selection.newsroomSnapshotId,
        imagePreferred: Boolean(selection.imagePreferred),
        status: "failed",
        sourceCode: article.source_code,
        sourceName: articleSourceName,
        sourceUrl,
        title: article.title,
        errorCode: "snapshot_not_found",
        errorMessage: "O snapshot selecionado já não está disponível.",
      };
    }

    if (snapshot.article_id !== article.id) {
      return {
        position,
        articlePosition,
        newsroomArticleId: selection.newsroomArticleId,
        newsroomSnapshotId: selection.newsroomSnapshotId,
        imagePreferred: Boolean(selection.imagePreferred),
        status: "failed",
        sourceCode: article.source_code,
        sourceName: articleSourceName,
        sourceUrl,
        title: article.title,
        errorCode: "snapshot_mismatch",
        errorMessage: "O snapshot não pertence à notícia selecionada.",
      };
    }

    const body = articleBody(snapshot.body);
    if (body.length === 0) {
      return {
        position,
        articlePosition,
        newsroomArticleId: selection.newsroomArticleId,
        newsroomSnapshotId: selection.newsroomSnapshotId,
        imagePreferred: Boolean(selection.imagePreferred),
        status: "failed",
        sourceCode: article.source_code,
        sourceName: articleSourceName,
        sourceUrl,
        title: article.title,
        errorCode: "source_body_unavailable",
        errorMessage: "O snapshot não contém corpo editorial utilizável.",
      };
    }

    return {
      position,
      articlePosition,
      newsroomArticleId: selection.newsroomArticleId,
      newsroomSnapshotId: selection.newsroomSnapshotId,
      imagePreferred: Boolean(selection.imagePreferred),
      status: "prepared",
      sourceCode: article.source_code,
      sourceName: articleSourceName,
      sourceUrl,
      author: article.author,
      publishedAt: article.published_at,
      publishedAtPrecision: publishedAtPrecisionFromSourceMetadata(snapshot.source_metadata),
      anteTitle: editorialSourceAnteTitle(jsonObject(snapshot.source_metadata)),
      title: article.title,
      postTitle: article.subtitle,
      body,
      imageUrl: article.image_url,
    };
  });

  const preparedEntries = entries.filter(
    (entry): entry is EditorialSourcePackagePreparedEntry => entry.status === "prepared",
  );
  const articleCount = new Set(entries.map((entry) => entry.articlePosition)).size;
  const effectiveEditorial: EditorialSourcePackageEditorialInput = articleCount > 1
    ? { ...editorial, suggestedTitle: null }
    : editorial;
  const createdAt = now.toISOString();
  const markdownFileName = editorialSourcePackageFileName(
    effectiveEditorial.genre,
    effectiveEditorial.suggestedTitle,
  );
  const markdown = buildEditorialSourcePackageMarkdown({
    createdAt,
    editorial: effectiveEditorial,
    entries,
  });
  const articleImageSources = editorialSourcePackageArticleImageSources(entries);

  const archivedImages = localDirectory
    ? await archiveEditorialSourceImagesLocally({
        articleId: input.packageId,
        sources: articleImageSources,
        now,
      })
    : [];

  const manifest: EditorialSourcePackageManifest = {
    version: 2,
    packageId: input.packageId,
    createdAt,
    year: location.year,
    month: location.month,
    markdownFileName,
    genre: effectiveEditorial.genre,
    genreLabel: effectiveEditorial.genreLabel,
    suggestedTitle: effectiveEditorial.suggestedTitle,
    additionalInstructions: effectiveEditorial.additionalInstructions,
    selectedCount: entries.length,
    articleCount,
    preparedCount: preparedEntries.length,
    failedCount: entries.length - preparedEntries.length,
    imageCount: archivedImages.length,
    localDirectory,
    entries: manifestEntries(entries),
  };

  try {
    await writeSupabaseAdmin("newsroom_editorial_source_packages", {
      method: "POST",
      body: JSON.stringify({
        id: input.packageId,
        created_at: createdAt,
        updated_at: createdAt,
        package_year: location.year,
        package_month: location.month,
        manifest,
        markdown,
      }),
    });
  } catch {
    if (localDirectory) {
      await rm(localDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
    return { ok: false, error: { code: "package_write_failed" } };
  }

  return {
    ok: true,
    value: {
      manifest,
      markdown,
    },
  };
}

export async function readEditorialSourcePackage(input: Readonly<{
  year: string;
  month: string;
  packageId: string;
}>): Promise<ReadEditorialSourcePackageResult> {
  if (!isEditorialSourcePackageLocation(input)) {
    return { ok: false, error: { code: "location_invalid" } };
  }

  let rows: EditorialSourcePackageRow[];
  try {
    rows = await fetchSupabaseAdminTable<EditorialSourcePackageRow>(
      "newsroom_editorial_source_packages"
      + "?select=id,package_year,package_month,manifest,markdown"
      + `&id=eq.${encodeURIComponent(input.packageId)}`
      + `&package_year=eq.${encodeURIComponent(input.year)}`
      + `&package_month=eq.${encodeURIComponent(input.month)}`
      + "&limit=2",
    );
  } catch {
    return { ok: false, error: { code: "package_read_failed" } };
  }

  if (rows.length === 0) {
    return { ok: false, error: { code: "package_not_found" } };
  }
  if (rows.length !== 1 || typeof rows[0].markdown !== "string") {
    return { ok: false, error: { code: "package_read_failed" } };
  }

  const manifest = persistedManifest(rows[0].manifest, input);
  if (!manifest) {
    return { ok: false, error: { code: "package_read_failed" } };
  }

  return {
    ok: true,
    value: {
      manifest,
      markdown: rows[0].markdown,
    },
  };
}

export async function markEditorialSourcePackageArticleUsed(input: Readonly<{
  year: string;
  month: string;
  packageId: string;
  articlePosition: number;
  publishedArticleId: string;
  publishedSlug: string;
  usedAt?: string;
}>): Promise<MarkEditorialSourcePackageArticleUsedResult> {
  if (
    !isEditorialSourcePackageLocation(input)
    || !Number.isInteger(input.articlePosition)
    || input.articlePosition < 1
    || input.articlePosition > 30
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.publishedArticleId.trim())
    || !input.publishedSlug.trim()
  ) {
    return { ok: false, error: { code: "input_invalid" } };
  }

  const current = await readEditorialSourcePackage(input);
  if (!current.ok) {
    return { ok: false, error: { code: current.error.code } };
  }

  const groupEntries = current.value.manifest.entries.filter(
    (entry) => entry.articlePosition === input.articlePosition,
  );
  if (groupEntries.length === 0) {
    return { ok: false, error: { code: "article_group_not_found" } };
  }

  const normalizedArticleId = input.publishedArticleId.trim().toLowerCase();
  const normalizedSlug = input.publishedSlug.trim();
  const conflict = groupEntries.some((entry) => (
    (entry.publishedArticleId && entry.publishedArticleId !== normalizedArticleId)
    || (entry.publishedSlug && entry.publishedSlug !== normalizedSlug)
  ));
  if (conflict) {
    return { ok: false, error: { code: "usage_conflict" } };
  }

  const usedAt = input.usedAt && !Number.isNaN(Date.parse(input.usedAt))
    ? new Date(input.usedAt).toISOString()
    : new Date().toISOString();
  const manifest: EditorialSourcePackageManifest = {
    ...current.value.manifest,
    entries: current.value.manifest.entries.map((entry) => (
      entry.articlePosition === input.articlePosition
        ? {
            ...entry,
            usedAt: entry.usedAt ?? usedAt,
            publishedArticleId: normalizedArticleId,
            publishedSlug: normalizedSlug,
          }
        : entry
    )),
  };

  try {
    const rows = await writeSupabaseAdminReturning<EditorialSourcePackageUpdateRow>(
      "newsroom_editorial_source_packages"
      + `?id=eq.${encodeURIComponent(input.packageId)}`
      + `&package_year=eq.${encodeURIComponent(input.year)}`
      + `&package_month=eq.${encodeURIComponent(input.month)}`
      + "&select=id",
      {
        method: "PATCH",
        body: JSON.stringify({
          manifest,
          updated_at: new Date().toISOString(),
        }),
      },
    );

    if (rows.length !== 1 || rows[0].id !== input.packageId) {
      return { ok: false, error: { code: "package_write_failed" } };
    }
  } catch {
    return { ok: false, error: { code: "package_write_failed" } };
  }

  return { ok: true };
}

export async function updateEditorialSourcePackageEditorial(input: Readonly<{
  year: string;
  month: string;
  packageId: string;
  suggestedTitle: string;
  additionalInstructions: string;
}>): Promise<UpdateEditorialSourcePackageEditorialResult> {
  const current = await readEditorialSourcePackage({
    year: input.year,
    month: input.month,
    packageId: input.packageId,
  });

  if (!current.ok) {
    return {
      ok: false,
      error: { code: current.error.code },
    };
  }

  const editorial = normalizeEditorialSourcePackageEditorialInput({
    genre: current.value.manifest.genre,
    suggestedTitle: current.value.manifest.articleCount > 1 ? "" : input.suggestedTitle,
    additionalInstructions: input.additionalInstructions,
  });
  if (!editorial) {
    return { ok: false, error: { code: "input_invalid" } };
  }

  const markdown = updateEditorialSourcePackageMarkdown({
    markdown: current.value.markdown,
    editorial,
  });
  if (!markdown) {
    return { ok: false, error: { code: "package_read_failed" } };
  }

  const manifest: EditorialSourcePackageManifest = {
    ...current.value.manifest,
    markdownFileName: editorialSourcePackageFileName(
      editorial.genre,
      editorial.suggestedTitle,
    ),
    genreLabel: editorial.genreLabel,
    suggestedTitle: editorial.suggestedTitle,
    additionalInstructions: editorial.additionalInstructions,
  };

  try {
    const rows = await writeSupabaseAdminReturning<EditorialSourcePackageUpdateRow>(
      "newsroom_editorial_source_packages"
      + `?id=eq.${encodeURIComponent(input.packageId)}`
      + `&package_year=eq.${encodeURIComponent(input.year)}`
      + `&package_month=eq.${encodeURIComponent(input.month)}`
      + "&select=id",
      {
        method: "PATCH",
        body: JSON.stringify({
          manifest,
          markdown,
          updated_at: new Date().toISOString(),
        }),
      },
    );

    if (rows.length !== 1 || rows[0].id !== input.packageId) {
      return { ok: false, error: { code: "package_write_failed" } };
    }
  } catch {
    return { ok: false, error: { code: "package_write_failed" } };
  }

  return {
    ok: true,
    value: {
      manifest,
      markdown,
    },
  };
}
