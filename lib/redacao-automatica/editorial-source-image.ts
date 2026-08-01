import "server-only";

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { isIP } from "node:net";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

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
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || url.username
      || url.password
      || url.hash
      || url.port
      || hostname === "localhost"
      || !hostname.includes(".")
      || isIP(hostname) !== 0
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function blockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224
  );
}

function blockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb")
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("2001:db8:")
  );
}

async function isPublicHostname(hostname: string): Promise<boolean> {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address, family }) => {
      if (family === 4) {
        return !blockedIpv4(address);
      }
      if (family === 6) {
        return !blockedIpv6(address);
      }
      return false;
    });
  } catch {
    return false;
  }
}

function normalizedContentType(value: string | null): string {
  return (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

async function downloadImage(url: URL): Promise<DownloadedImage | null> {
  if (!(await isPublicHostname(url.hostname))) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1",
        "User-Agent": "Jornada.pt editorial image archive",
      },
    });

    if (!response.ok) {
      return null;
    }

    const extension = IMAGE_TYPES.get(
      normalizedContentType(response.headers.get("content-type")),
    );
    if (!extension) {
      return null;
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 1 || bytes.length > MAX_IMAGE_BYTES) {
      return null;
    }

    return { bytes, extension };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
