import "server-only";

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import {
  EDITORIAL_SOURCE_PACKAGE_MANIFEST_FILE_NAME,
  buildEditorialSourcePackageMarkdown,
  editorialSourceAnteTitle,
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
import type {
  ArticleBodyBlock,
  JsonObject,
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
          | "local_archive_unavailable"
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

async function writeAtomically(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, content, {
    encoding: "utf8",
    flag: "wx",
  });

  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function replacePackageFilesAtomically(
  files: readonly Readonly<{ filePath: string; content: string }>[],
): Promise<void> {
  const token = crypto.randomUUID();
  const staged = files.map((file) => ({
    ...file,
    temporaryPath: `${file.filePath}.${token}.tmp`,
    backupPath: `${file.filePath}.${token}.bak`,
    originalMoved: false,
    replacementMoved: false,
  }));

  try {
    for (const file of staged) {
      await writeFile(file.temporaryPath, file.content, {
        encoding: "utf8",
        flag: "wx",
      });
    }

    for (const file of staged) {
      await rename(file.filePath, file.backupPath);
      file.originalMoved = true;
    }

    for (const file of staged) {
      await rename(file.temporaryPath, file.filePath);
      file.replacementMoved = true;
    }
  } catch (error) {
    for (const file of [...staged].reverse()) {
      if (file.replacementMoved) {
        await rm(file.filePath, { force: true }).catch(() => undefined);
      }

      if (file.originalMoved) {
        await rename(file.backupPath, file.filePath).catch(() => undefined);
      }

      await rm(file.temporaryPath, { force: true }).catch(() => undefined);
      await rm(file.backupPath, { force: true }).catch(() => undefined);
    }

    throw error;
  }

  await Promise.all(
    staged.map((file) => rm(file.backupPath, { force: true }).catch(() => undefined)),
  );
}

function manifestEntries(entries: readonly EditorialSourcePackageEntry[]) {
  return entries.map((entry) => ({
    position: entry.position,
    status: entry.status,
    sourceCode: entry.sourceCode,
    sourceName: entry.sourceName,
    title: entry.title,
    errorCode: entry.status === "failed" ? entry.errorCode : null,
  }));
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
  if (!localDirectory) {
    return { ok: false, error: { code: "local_archive_unavailable" } };
  }

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
    const article = articlesById.get(selection.newsroomArticleId);
    const snapshot = snapshotsById.get(selection.newsroomSnapshotId);

    if (!article) {
      return {
        position,
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
      status: "prepared",
      sourceCode: article.source_code,
      sourceName: articleSourceName,
      sourceUrl,
      author: article.author,
      publishedAt: article.published_at,
      anteTitle: editorialSourceAnteTitle(jsonObject(snapshot.source_metadata)),
      title: article.title,
      postTitle: article.subtitle,
      body,
      imageUrl: article.image_url,
    };
  });

  const createdAt = now.toISOString();
  const markdownFileName = editorialSourcePackageFileName(editorial.genre);
  const markdown = buildEditorialSourcePackageMarkdown({
    createdAt,
    editorial,
    entries,
  });
  const preparedEntries = entries.filter(
    (entry): entry is EditorialSourcePackagePreparedEntry => entry.status === "prepared",
  );

  try {
    await mkdir(localDirectory, { recursive: true });

    const archivedImages = await archiveEditorialSourceImagesLocally({
      articleId: input.packageId,
      sources: preparedEntries.flatMap((entry) => (
        entry.imageUrl
          ? [{
              sourceCode: entry.sourceCode,
              articleTitle: entry.title,
              imageUrl: entry.imageUrl,
            }]
          : []
      )),
      now,
    });

    const manifest: EditorialSourcePackageManifest = {
      version: 2,
      packageId: input.packageId,
      createdAt,
      year: location.year,
      month: location.month,
      markdownFileName,
      genre: editorial.genre,
      genreLabel: editorial.genreLabel,
      suggestedTitle: editorial.suggestedTitle,
      additionalInstructions: editorial.additionalInstructions,
      selectedCount: entries.length,
      preparedCount: preparedEntries.length,
      failedCount: entries.length - preparedEntries.length,
      imageCount: archivedImages.length,
      localDirectory,
      entries: manifestEntries(entries),
    };

    await writeAtomically(
      path.join(localDirectory, markdownFileName),
      markdown,
    );
    await writeAtomically(
      path.join(localDirectory, EDITORIAL_SOURCE_PACKAGE_MANIFEST_FILE_NAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    return {
      ok: true,
      value: {
        manifest,
        markdown,
      },
    };
  } catch {
    await rm(localDirectory, { recursive: true, force: true }).catch(() => undefined);
    return { ok: false, error: { code: "package_write_failed" } };
  }
}

export async function readEditorialSourcePackage(input: Readonly<{
  year: string;
  month: string;
  packageId: string;
}>): Promise<ReadEditorialSourcePackageResult> {
  if (!isEditorialSourcePackageLocation(input)) {
    return { ok: false, error: { code: "location_invalid" } };
  }

  const localDirectory = editorialLocalArchiveDirectory(
    input.packageId,
    new Date(`${input.year}-${input.month}-01T12:00:00`),
  );
  if (!localDirectory) {
    return { ok: false, error: { code: "package_not_found" } };
  }

  try {
    const manifestText = await readFile(
      path.join(localDirectory, EDITORIAL_SOURCE_PACKAGE_MANIFEST_FILE_NAME),
      "utf8",
    );
    const manifest = JSON.parse(manifestText) as EditorialSourcePackageManifest;
    const normalizedEditorial = normalizeEditorialSourcePackageEditorialInput({
      genre: manifest.genre,
      suggestedTitle: manifest.suggestedTitle ?? "",
      additionalInstructions: manifest.additionalInstructions ?? "",
    });

    if (
      manifest.version !== 2
      || !normalizedEditorial
      || manifest.genreLabel !== normalizedEditorial.genreLabel
      || manifest.markdownFileName !== editorialSourcePackageFileName(normalizedEditorial.genre)
      || manifest.packageId !== input.packageId
      || manifest.year !== input.year
      || manifest.month !== input.month
      || manifest.localDirectory !== localDirectory
    ) {
      return { ok: false, error: { code: "package_read_failed" } };
    }

    const markdown = await readFile(
      path.join(localDirectory, manifest.markdownFileName),
      "utf8",
    );

    return {
      ok: true,
      value: {
        manifest,
        markdown,
      },
    };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

    return {
      ok: false,
      error: {
        code: code === "ENOENT" ? "package_not_found" : "package_read_failed",
      },
    };
  }
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
    suggestedTitle: input.suggestedTitle,
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
    genreLabel: editorial.genreLabel,
    suggestedTitle: editorial.suggestedTitle,
    additionalInstructions: editorial.additionalInstructions,
  };

  const markdownPath = path.join(
    manifest.localDirectory,
    manifest.markdownFileName,
  );
  const manifestPath = path.join(
    manifest.localDirectory,
    EDITORIAL_SOURCE_PACKAGE_MANIFEST_FILE_NAME,
  );

  try {
    await replacePackageFilesAtomically([
      {
        filePath: markdownPath,
        content: markdown,
      },
      {
        filePath: manifestPath,
        content: `${JSON.stringify(manifest, null, 2)}\n`,
      },
    ]);
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
