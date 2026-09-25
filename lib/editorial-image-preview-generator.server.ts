import sharp from "sharp";
import { EDITORIAL_PREVIEW_WIDTHS, PUBLIC_EDITORIAL_PREVIEW_WIDTHS, type EditorialPreviewWidth } from "./editorial-image-preview";

export const EDITORIAL_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
export const EDITORIAL_PREVIEW_MAX_PIXELS = 40_000_000;
export const EDITORIAL_PREVIEW_QUALITY = 84;
export type GeneratedEditorialPreview = { width: EditorialPreviewWidth; bytes: Buffer };

export async function generateEditorialImagePreviews(
  input: Uint8Array,
  widths: readonly EditorialPreviewWidth[] = EDITORIAL_PREVIEW_WIDTHS,
): Promise<GeneratedEditorialPreview[]> {
  if (!input.byteLength || input.byteLength > EDITORIAL_PREVIEW_MAX_BYTES) throw new Error("preview-invalid-byte-size");
  const bytes = Buffer.from(input);
  const options = { limitInputPixels: EDITORIAL_PREVIEW_MAX_PIXELS, failOn: "warning" as const };
  const metadata = await sharp(bytes, options).metadata();
  const raster = ["jpeg", "png", "webp"].includes(metadata.format ?? "")
    || (metadata.format === "heif" && metadata.compression === "av1");
  if (!raster || (metadata.pages ?? 1) !== 1) throw new Error("preview-unsupported-format");
  if (!metadata.width || !metadata.height || metadata.width > 12000 || metadata.height > 12000) {
    throw new Error("preview-invalid-dimensions");
  }
  const result: GeneratedEditorialPreview[] = [];
  for (const width of widths) {
    if (!PUBLIC_EDITORIAL_PREVIEW_WIDTHS.includes(width)) throw new Error("preview-invalid-width");
    const output = await sharp(bytes, options)
      .rotate() // Apply EXIF orientation before resize; original bytes remain untouched.
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: EDITORIAL_PREVIEW_QUALITY, alphaQuality: 100, effort: 4 })
      .timeout({ seconds: 8 })
      .toBuffer();
    result.push({ width, bytes: output });
  }
  return result;
}
