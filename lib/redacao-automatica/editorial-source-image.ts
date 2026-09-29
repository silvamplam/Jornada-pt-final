import "server-only";

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { downloadFrozenEditorialImage, safeEditorialSourceUrl } from "../editorial-image-download.server";

export type EditorialSourceDownloadedImage = Readonly<{
  sourceUrl: string;
  bytes: Uint8Array;
  extension: string;
}>;

type DownloadedImage = Omit<EditorialSourceDownloadedImage, "sourceUrl">;

export type EditorialSourceImageArchiveInput = Readonly<{
  articleId: string;
  sources: readonly Readonly<{
    sourceCode: string;
    articleTitle: string;
    imageUrl: string;
  }>[];
  now?: Date;
}>;

export type EditorialSourceImageArchive = Readonly<{
  sourceCode: string;
  articleTitle: string;
  sourceUrl: string;
  localPath: string;
}>;

function validHttpImageUrl(value: string | null | undefined): URL | null {
  try { return value ? safeEditorialSourceUrl(value) : null; } catch { return null; }
}
async function downloadImage(url: URL): Promise<DownloadedImage | null> {
  try { return await downloadFrozenEditorialImage(url.href); } catch { return null; }
}

export async function downloadEditorialSourceImage(
  imageUrl: string,
): Promise<EditorialSourceDownloadedImage | null> {
  const url = validHttpImageUrl(imageUrl);
  if (!url) {
    return null;
  }

  const downloaded = await downloadImage(url);
  return downloaded
    ? {
        sourceUrl: url.toString(),
        bytes: downloaded.bytes,
        extension: downloaded.extension,
      }
    : null;
}

export function editorialLocalArchiveRoot(): string | null {
  const configured = process.env.JORNADA_EDITORIAL_LOCAL_IMAGE_DIR?.trim();
  if (configured) {
    return configured;
  }

  return process.platform === "win32"
    ? path.join(homedir(), "Pictures", "Jornada.pt", "Editorial")
    : null;
}

export function editorialLocalArchiveDirectory(
  archiveId: string,
  now: Date = new Date(),
): string | null {
  const normalizedArchiveId = archiveId.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(normalizedArchiveId)) {
    return null;
  }

  const root = editorialLocalArchiveRoot();
  if (!root) {
    return null;
  }

  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return path.join(root, year, month, normalizedArchiveId);
}

function safeFilePart(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return normalized || "fonte";
}

export function editorialSourceImageFileName(input: Readonly<{
  position: number;
  sourceCode: string;
  articleTitle: string;
  bytes: Uint8Array;
  extension: string;
}>): string {
  const digest = createHash("sha256")
    .update(input.bytes)
    .digest("hex")
    .slice(0, 10);
  const position = String(input.position).padStart(2, "0");

  return [
    position,
    safeFilePart(input.sourceCode),
    safeFilePart(input.articleTitle),
    digest,
  ].join("-") + `.${input.extension}`;
}

async function saveImage(input: Readonly<{
  articleId: string;
  sourceCode: string;
  articleTitle: string;
  sourceUrl: string;
  downloaded: DownloadedImage;
  position: number;
  now: Date;
}>): Promise<string | null> {
  const directory = editorialLocalArchiveDirectory(input.articleId, input.now);
  if (!directory) {
    return null;
  }
  const fileName = editorialSourceImageFileName({
    position: input.position,
    sourceCode: input.sourceCode,
    articleTitle: input.articleTitle,
    bytes: input.downloaded.bytes,
    extension: input.downloaded.extension,
  });
  const filePath = path.join(directory, fileName);

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, input.downloaded.bytes, { flag: "wx" }).catch((error: unknown) => {
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
      if (code !== "EEXIST") {
        throw error;
      }
    });
    return filePath;
  } catch {
    return null;
  }
}

export async function archiveEditorialSourceImagesLocally(
  input: EditorialSourceImageArchiveInput,
): Promise<readonly EditorialSourceImageArchive[]> {
  const now = input.now ?? new Date();
  const unique = new Map<string, {
    sourceCode: string;
    articleTitle: string;
    url: URL;
  }>();

  for (const source of input.sources) {
    const url = validHttpImageUrl(source.imageUrl);
    if (url && !unique.has(url.toString())) {
      unique.set(url.toString(), {
        sourceCode: source.sourceCode.trim(),
        articleTitle: source.articleTitle.trim(),
        url,
      });
    }
  }

  const archived: EditorialSourceImageArchive[] = [];
  let position = 0;

  for (const source of unique.values()) {
    position += 1;
    const downloaded = await downloadImage(source.url);
    if (!downloaded) {
      continue;
    }

    const localPath = await saveImage({
      articleId: input.articleId,
      sourceCode: source.sourceCode,
      articleTitle: source.articleTitle,
      sourceUrl: source.url.toString(),
      downloaded,
      position,
      now,
    });

    if (localPath) {
      archived.push({
        sourceCode: source.sourceCode,
        articleTitle: source.articleTitle,
        sourceUrl: source.url.toString(),
        localPath,
      });
    }
  }

  return archived;
}
