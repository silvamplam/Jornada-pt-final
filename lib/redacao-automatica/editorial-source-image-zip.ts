import "server-only";

import {
  downloadEditorialSourceImage,
  editorialSourceImageFileName,
} from "@/lib/redacao-automatica/editorial-source-image";
import { buildStoredZip } from "@/lib/redacao-automatica/zip-archive";

const MAX_ZIP_IMAGE_BYTES = 40 * 1024 * 1024;

export type EditorialSourceImageZipSource = Readonly<{
  position: number;
  sourceCode: string;
  articleTitle: string;
  imageUrl: string;
}>;

export type EditorialSourceImageZipResult =
  | Readonly<{
      ok: true;
      bytes: Uint8Array;
      downloadedCount: number;
      failedCount: number;
    }>
  | Readonly<{
      ok: false;
      error: "images_unavailable" | "images_download_failed";
    }>;

export async function buildEditorialSourceImagesZip(
  sources: readonly EditorialSourceImageZipSource[],
): Promise<EditorialSourceImageZipResult> {
  const unique = new Map<string, EditorialSourceImageZipSource>();
  for (const source of sources) {
    const imageUrl = source.imageUrl.trim();
    if (imageUrl && !unique.has(imageUrl)) {
      unique.set(imageUrl, { ...source, imageUrl });
    }
  }

  if (unique.size === 0) {
    return { ok: false, error: "images_unavailable" };
  }

  const files: Array<Readonly<{ fileName: string; bytes: Uint8Array }>> = [];
  const failures: string[] = [];
  let totalImageBytes = 0;

  for (const source of unique.values()) {
    const downloaded = await downloadEditorialSourceImage(source.imageUrl);
    if (!downloaded) {
      failures.push(`${source.position}. ${source.articleTitle}: download indisponível`);
      continue;
    }

    if (totalImageBytes + downloaded.bytes.length > MAX_ZIP_IMAGE_BYTES) {
      failures.push(`${source.position}. ${source.articleTitle}: limite total do ZIP atingido`);
      continue;
    }

    const fileName = editorialSourceImageFileName({
      position: source.position,
      sourceCode: source.sourceCode,
      articleTitle: source.articleTitle,
      bytes: downloaded.bytes,
      extension: downloaded.extension,
    });

    files.push({ fileName, bytes: downloaded.bytes });
    totalImageBytes += downloaded.bytes.length;
  }

  if (files.length === 0) {
    return { ok: false, error: "images_download_failed" };
  }

  const report = [
    "Jornada.pt — imagens das fontes editoriais",
    "",
    `Imagens descarregadas: ${files.length}`,
    `Imagens não descarregadas: ${failures.length}`,
    ...(failures.length > 0 ? ["", "Falhas:", ...failures] : []),
    "",
  ].join("\n");

  return {
    ok: true,
    bytes: buildStoredZip([
      ...files,
      {
        fileName: "LEIA-ME.txt",
        bytes: new TextEncoder().encode(report),
      },
    ]),
    downloadedCount: files.length,
    failedCount: failures.length,
  };
}
