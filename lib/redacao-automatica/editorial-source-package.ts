import "server-only";

import { rm } from "node:fs/promises";

import {
  fetchSupabaseAdminTable,
  writeSupabaseAdmin,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  buildEditorialSourcePackageMarkdown,
  defaultEditorialSourcePackageOutputs,
  editorialSourceAnteTitle,
  editorialSourcePackageArticleImageSources,
  editorialSourcePackageFileName,
  isEditorialSourcePackageLocation,
  normalizeEditorialSourcePackageEditorialInput,
  normalizeEditorialSourcePackageCreationOutputs,
  normalizeEditorialSourcePackageOutputs,
  normalizeEditorialSourcePackageSelections,
  updateEditorialSourcePackageMarkdown,
  type EditorialSourcePackageEditorialInput,
  type EditorialSourcePackageEntry,
  type EditorialSourcePackageManifest,
  type EditorialSourcePackageOutput,
  type EditorialSourcePackageOutputCreationInput,
  type EditorialSourcePackageOutputInput,
  type EditorialSourcePackagePreparedEntry,
  type EditorialSourcePackagePublishedArticleSnapshot,
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

type PublishedEditorialArticleRow = {
  id: string;
  slug: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  status: string | null;
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateEditorialSourcePackageInput = Readonly<{
  packageId: string;
  selections: readonly EditorialSourcePackageSelection[];
  editorial: EditorialSourcePackageEditorialInput;
  outputs?: readonly EditorialSourcePackageOutputCreationInput[];
  allowMultipleSnapshotsPerArticle?: boolean;
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
          | "update_target_read_failed"
          | "update_target_invalid"
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

export type UpdateEditorialSourcePackageOutputsResult =
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
          | "outputs_locked"
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


function persistedOutputs(
  value: unknown,
  entries: EditorialSourcePackageManifest["entries"],
  suggestedTitle: string | null,
): readonly EditorialSourcePackageOutput[] | null {
  const rawOutputs =
    Array.isArray(value) && value.length > 0
      ? value
      : defaultEditorialSourcePackageOutputs(
          entries,
          suggestedTitle,
        );

  const inputs: EditorialSourcePackageOutputInput[] = [];

  for (const [index, rawOutput] of rawOutputs.entries()) {
    if (
      !rawOutput
      || typeof rawOutput !== "object"
      || Array.isArray(rawOutput)
    ) {
      return null;
    }

    const candidate =
      rawOutput as Record<string, unknown>;

    inputs.push({
      position:
        Number(candidate.position ?? index + 1),
      sourceArticlePosition:
        Number(
          candidate.sourceArticlePosition
          ?? candidate.position
          ?? index + 1,
        ),
      focus:
        typeof candidate.focus === "string"
          ? candidate.focus
          : `Artigo ${String(index + 1).padStart(2, "0")}`,
      imageNewsroomArticleId:
        typeof candidate.imageNewsroomArticleId === "string"
          ? candidate.imageNewsroomArticleId
          : null,
      externalImage:
        candidate.externalImage
        && typeof candidate.externalImage === "object"
        && !Array.isArray(candidate.externalImage)
          ? {
              url:
                typeof (candidate.externalImage as Record<string, unknown>).url === "string"
                  ? (candidate.externalImage as Record<string, unknown>).url as string
                  : "",
              fileName:
                typeof (candidate.externalImage as Record<string, unknown>).fileName === "string"
                  ? (candidate.externalImage as Record<string, unknown>).fileName as string
                  : "",
            }
          : null,
    });
  }

  const normalized =
    normalizeEditorialSourcePackageOutputs(
      inputs,
      entries,
    );

  if (!normalized) {
    return null;
  }

  const outputs: EditorialSourcePackageOutput[] = [];

  for (const [index, output] of normalized.entries()) {
    const raw =
      rawOutputs[index] as Record<string, unknown>;

    const rawArticleId =
      typeof raw.publishedArticleId === "string"
        ? raw.publishedArticleId.trim().toLowerCase()
        : "";

    const publishedSlug =
      typeof raw.publishedSlug === "string"
        ? raw.publishedSlug.trim()
        : "";

    const rawUsedAt =
      typeof raw.usedAt === "string"
        ? raw.usedAt.trim()
        : "";

    if (
      rawArticleId
      && !UUID_PATTERN.test(rawArticleId)
    ) {
      return null;
    }

    if (
      (rawArticleId && !publishedSlug)
      || (!rawArticleId && publishedSlug)
    ) {
      return null;
    }

    if (
      rawUsedAt
      && Number.isNaN(Date.parse(rawUsedAt))
    ) {
      return null;
    }

    outputs.push({
      ...output,
      ...(rawArticleId
        ? {
            publishedArticleId: rawArticleId,
            publishedSlug,
          }
        : {}),
      ...(rawUsedAt
        ? {
            usedAt:
              new Date(rawUsedAt).toISOString(),
          }
        : {}),
    });
  }

  return outputs;
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
    (manifest.version !== 2 && manifest.version !== 3 && manifest.version !== 4)
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

  const normalizedEntries =
    entries as EditorialSourcePackageManifest["entries"];

  const outputs = persistedOutputs(
    (manifest as { outputs?: unknown }).outputs,
    normalizedEntries,
    editorial.suggestedTitle,
  );

  if (!outputs) {
    return null;
  }

  return {
    ...(manifest as EditorialSourcePackageManifest),
    articleCount: outputs.length,
    outputs,
    entries: normalizedEntries,
  };
}

export async function createEditorialSourcePackage(
  input: CreateEditorialSourcePackageInput,
): Promise<CreateEditorialSourcePackageResult> {
  const selections = normalizeEditorialSourcePackageSelections(
    input.selections,
    {
      allowMultipleSnapshotsPerArticle:
        input.allowMultipleSnapshotsPerArticle,
    },
  );
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
    (entry): entry is EditorialSourcePackagePreparedEntry =>
      entry.status === "prepared",
  );

  const sourceGroupCount =
    new Set(
      entries.map(
        (entry) => entry.articlePosition,
      ),
    ).size;

  const effectiveEditorial:
    EditorialSourcePackageEditorialInput =
      sourceGroupCount > 1
        ? {
            ...editorial,
            suggestedTitle: null,
          }
        : editorial;

  const requestedOutputs =
    input.outputs
      ? normalizeEditorialSourcePackageCreationOutputs(
          input.outputs,
          entries,
        )
      : null;

  if (input.outputs && !requestedOutputs) {
    return {
      ok: false,
      error: { code: "input_invalid" },
    };
  }

  const outputs: readonly EditorialSourcePackageOutput[] =
    requestedOutputs
    ?? defaultEditorialSourcePackageOutputs(
      entries,
      effectiveEditorial.suggestedTitle,
    );

  const updateTargetIds =
    [...new Set(
      outputs.flatMap(
        (output) =>
          output.publishedArticleId
            ? [output.publishedArticleId]
            : [],
      ),
    )];

  const publishedArticles:
    EditorialSourcePackagePublishedArticleSnapshot[] = [];

  if (updateTargetIds.length > 0) {
    let publishedRows:
      PublishedEditorialArticleRow[];

    try {
      publishedRows =
        await fetchSupabaseAdminTable<
          PublishedEditorialArticleRow
        >(
          "editorial_articles"
          + "?select=id,slug,label,title,subtitle,body,status"
          + `&id=in.(${uuidList(updateTargetIds)})`
          + `&limit=${updateTargetIds.length}`,
        );
    } catch {
      return {
        ok: false,
        error: {
          code: "update_target_read_failed",
        },
      };
    }

    const publishedById =
      new Map(
        publishedRows.map(
          (article) => [
            article.id.trim().toLowerCase(),
            article,
          ],
        ),
      );

    for (const output of outputs) {
      if (
        !output.publishedArticleId
        || !output.publishedSlug
      ) {
        continue;
      }

      const article =
        publishedById.get(
          output.publishedArticleId,
        );

      const slug =
        article?.slug?.trim() ?? "";
      const anteTitle =
        article?.label?.trim() ?? "";
      const title =
        article?.title?.trim() ?? "";
      const postTitle =
        article?.subtitle?.trim() ?? "";
      const body =
        article?.body
          ?.replace(/\r\n?/g, "\n")
          .trim()
        ?? "";

      if (
        !article
        || article.status !== "published"
        || slug !== output.publishedSlug
        || !anteTitle
        || !title
        || !postTitle
        || !body
      ) {
        return {
          ok: false,
          error: {
            code: "update_target_invalid",
          },
        };
      }

      publishedArticles.push({
        position: output.position,
        publishedArticleId:
          output.publishedArticleId,
        publishedSlug:
          output.publishedSlug,
        anteTitle,
        title,
        postTitle,
        body,
      });
    }
  }

  const articleCount = outputs.length;
  const createdAt = now.toISOString();

  const markdownFileName =
    editorialSourcePackageFileName(
      effectiveEditorial.genre,
      effectiveEditorial.suggestedTitle,
    );

  const markdown =
    buildEditorialSourcePackageMarkdown({
      createdAt,
      editorial: effectiveEditorial,
      entries,
      outputs,
      publishedArticles,
    });

  const articleImageSources =
    editorialSourcePackageArticleImageSources(
      entries,
      outputs,
    );

  const archivedImages = localDirectory
    ? await archiveEditorialSourceImagesLocally({
        articleId: input.packageId,
        sources: articleImageSources,
        now,
      })
    : [];

  const manifest: EditorialSourcePackageManifest = {
    version: 4,
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
    outputs,
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

  const output =
    current.value.manifest.outputs.find(
      (candidate) =>
        candidate.position === input.articlePosition,
    );

  if (!output) {
    return {
      ok: false,
      error: { code: "article_group_not_found" },
    };
  }

  const groupEntries =
    current.value.manifest.entries.filter(
      (entry) =>
        entry.articlePosition
        === output.sourceArticlePosition,
    );

  if (groupEntries.length === 0) {
    return {
      ok: false,
      error: { code: "article_group_not_found" },
    };
  }

  const normalizedArticleId =
    input.publishedArticleId
      .trim()
      .toLowerCase();

  const normalizedSlug =
    input.publishedSlug.trim();

  const conflict =
    (
      output.publishedArticleId
      && output.publishedArticleId
        !== normalizedArticleId
    )
    || (
      output.publishedSlug
      && output.publishedSlug
        !== normalizedSlug
    );

  if (conflict) {
    return {
      ok: false,
      error: { code: "usage_conflict" },
    };
  }

  const usedAt =
    input.usedAt
    && !Number.isNaN(Date.parse(input.usedAt))
      ? new Date(input.usedAt).toISOString()
      : new Date().toISOString();

  const needsCompatibilityAlias =
    groupEntries.every(
      (entry) => !entry.publishedArticleId,
    );

  const manifest: EditorialSourcePackageManifest = {
    ...current.value.manifest,
    version: 4,

    outputs:
      current.value.manifest.outputs.map(
        (candidate) => (
          candidate.position
          === input.articlePosition
            ? {
                ...candidate,
                usedAt:
                  candidate.usedAt ?? usedAt,
                publishedArticleId:
                  normalizedArticleId,
                publishedSlug:
                  normalizedSlug,
              }
            : candidate
        ),
      ),

    entries:
      current.value.manifest.entries.map(
        (entry) => (
          entry.articlePosition
          === output.sourceArticlePosition
            ? {
                ...entry,
                usedAt:
                  entry.usedAt ?? usedAt,
                ...(needsCompatibilityAlias
                  ? {
                      publishedArticleId:
                        normalizedArticleId,
                      publishedSlug:
                        normalizedSlug,
                    }
                  : {}),
              }
            : entry
        ),
      ),
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


export async function updateEditorialSourcePackageOutputs(
  input: Readonly<{
    year: string;
    month: string;
    packageId: string;
    outputs: readonly EditorialSourcePackageOutputInput[];
  }>,
): Promise<UpdateEditorialSourcePackageOutputsResult> {
  const current =
    await readEditorialSourcePackage({
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

  if (
    current.value.manifest.outputs.some(
      (output) => output.usedAt,
    )
  ) {
    return {
      ok: false,
      error: { code: "outputs_locked" },
    };
  }

  const normalizedOutputs =
    normalizeEditorialSourcePackageOutputs(
      input.outputs,
      current.value.manifest.entries,
    );

  if (!normalizedOutputs) {
    return {
      ok: false,
      error: { code: "input_invalid" },
    };
  }

  const updateTargetByPosition = new Map(
    current.value.manifest.outputs.flatMap((output) => (
      output.publishedArticleId && output.publishedSlug
        ? [[output.position, {
            publishedArticleId: output.publishedArticleId,
            publishedSlug: output.publishedSlug,
          }] as const]
        : []
    )),
  );

  if (
    [...updateTargetByPosition.keys()].some(
      (position) => !normalizedOutputs.some((output) => output.position === position),
    )
  ) {
    return {
      ok: false,
      error: { code: "outputs_locked" },
    };
  }

  const outputs: readonly EditorialSourcePackageOutput[] =
    normalizedOutputs.map((output) => ({
      ...output,
      ...(updateTargetByPosition.get(output.position) ?? {}),
    }));

  const editorial:
    EditorialSourcePackageEditorialInput = {
      genre:
        current.value.manifest.genre,
      genreLabel:
        current.value.manifest.genreLabel,
      suggestedTitle:
        current.value.manifest.suggestedTitle,
      additionalInstructions:
        current.value.manifest.additionalInstructions,
    };

  const markdown =
    updateEditorialSourcePackageMarkdown({
      markdown:
        current.value.markdown,
      editorial,
      outputs,
    });

  if (!markdown) {
    return {
      ok: false,
      error: { code: "package_read_failed" },
    };
  }

  const manifest:
    EditorialSourcePackageManifest = {
      ...current.value.manifest,
      version: 4,
      articleCount: outputs.length,
      outputs,
    };

  try {
    const rows =
      await writeSupabaseAdminReturning<
        EditorialSourcePackageUpdateRow
      >(
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
            updated_at:
              new Date().toISOString(),
          }),
        },
      );

    if (
      rows.length !== 1
      || rows[0].id !== input.packageId
    ) {
      return {
        ok: false,
        error: {
          code: "package_write_failed",
        },
      };
    }
  } catch {
    return {
      ok: false,
      error: {
        code: "package_write_failed",
      },
    };
  }

  return {
    ok: true,
    value: {
      manifest,
      markdown,
    },
  };
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
    suggestedTitle:
      new Set(
        current.value.manifest.entries.map(
          (entry) => entry.articlePosition,
        ),
      ).size > 1
        ? ""
        : input.suggestedTitle,
    additionalInstructions: input.additionalInstructions,
  });
  if (!editorial) {
    return { ok: false, error: { code: "input_invalid" } };
  }

  const markdown = updateEditorialSourcePackageMarkdown({
    markdown: current.value.markdown,
    editorial,
    outputs: current.value.manifest.outputs,
  });
  if (!markdown) {
    return { ok: false, error: { code: "package_read_failed" } };
  }

  const manifest: EditorialSourcePackageManifest = {
    ...current.value.manifest,
    version: 4,
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
