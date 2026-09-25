import { EDITORIAL_PREVIEW_WIDTHS, editorialPreviewPath, isEditorialPreviewOriginalPath, type EditorialPreviewWidth } from "./editorial-image-preview";
import { generateEditorialImagePreviews } from "./editorial-image-preview-generator.server";
import type { EditorialPreviewStorage } from "./editorial-image-preview-storage.server";

export type PreviewGenerationResult = {
  ok: boolean; created: number; existing: number; originalBytes: number; previewBytes: number; error?: string;
};
export async function ensureEditorialImagePreviews(
  path: string,
  storage: EditorialPreviewStorage,
  originalBytes?: Uint8Array,
  widths: readonly EditorialPreviewWidth[] = EDITORIAL_PREVIEW_WIDTHS,
): Promise<PreviewGenerationResult> {
  const result: PreviewGenerationResult = { ok: false, created: 0, existing: 0, originalBytes: 0, previewBytes: 0 };
  try {
    if (!isEditorialPreviewOriginalPath(path)) throw new Error("preview-invalid-original");
    const missing: EditorialPreviewWidth[] = [];
    for (const width of [...new Set(widths)]) {
      if (!editorialPreviewPath(path, width)) throw new Error("preview-invalid-width");
      if (await storage.exists(editorialPreviewPath(path, width)!)) result.existing++;
      else missing.push(width);
    }
    if (missing.length) {
      const bytes = originalBytes ?? await storage.readOriginal(path);
      result.originalBytes = bytes.byteLength;
      // Preserve completed small companions even if a later/larger encode fails.
      for (const width of missing) {
        const [preview] = await generateEditorialImagePreviews(bytes, [width]);
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
