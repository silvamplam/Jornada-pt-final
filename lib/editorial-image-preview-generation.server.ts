import { EDITORIAL_PREVIEW_WIDTHS, editorialPreviewPath, isEditorialPreviewOriginalPath } from "./editorial-image-preview";
import { generateEditorialImagePreviews } from "./editorial-image-preview-generator.server";
import type { EditorialPreviewStorage } from "./editorial-image-preview-storage.server";

export type PreviewGenerationResult = {
  ok: boolean; created: number; existing: number; originalBytes: number; previewBytes: number; error?: string;
};
export async function ensureEditorialImagePreviews(
  path: string,
  storage: EditorialPreviewStorage,
  originalBytes?: Uint8Array,
): Promise<PreviewGenerationResult> {
  const result: PreviewGenerationResult = { ok: false, created: 0, existing: 0, originalBytes: 0, previewBytes: 0 };
  try {
    if (!isEditorialPreviewOriginalPath(path)) throw new Error("preview-invalid-original");
    const missing: (320 | 640)[] = [];
    for (const width of EDITORIAL_PREVIEW_WIDTHS) {
      if (await storage.exists(editorialPreviewPath(path, width)!)) result.existing++;
      else missing.push(width);
    }
    if (missing.length) {
      const bytes = originalBytes ?? await storage.readOriginal(path);
      result.originalBytes = bytes.byteLength;
      const previews = await generateEditorialImagePreviews(bytes, missing);
      for (const preview of previews) {
        const outcome = await storage.writePreview(editorialPreviewPath(path, preview.width)!, preview.bytes);
        result[outcome === "created" ? "created" : "existing"]++;
        result.previewBytes += preview.bytes.byteLength;
      }
    }
    result.ok = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "preview-generation-failed";
    console.warn("[editorial-preview]", { path, ...result });
  }
  return result; // Best effort: the original upload and editorial URL are never changed.
}
