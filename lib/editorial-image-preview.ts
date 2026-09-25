// Presentation only. Never persist the returned URL in editorial data.
export const EDITORIAL_PREVIEW_BUCKET = "editorial-images";
export const EDITORIAL_PREVIEW_RECIPE = "v1";
export const EDITORIAL_PREVIEW_WIDTHS = [320, 640] as const;
export type EditorialPreviewWidth = typeof EDITORIAL_PREVIEW_WIDTHS[number];

// These are immutable paths issued by the existing upload/import routes:
// timestamp + UUID, never a title alone. Unknown/legacy naming stays original.
const originalPattern = /^editorial\/20\d{2}\/(?:0[1-9]|1[0-2])\/\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}-[a-z0-9-]{1,120}\.(?:jpe?g|png|webp|avif)$/;

export function isEditorialPreviewOriginalPath(path: unknown): path is string {
  return typeof path === "string" && path.length <= 240 && originalPattern.test(path);
}

export function editorialPreviewPath(path: string, width: EditorialPreviewWidth): string | null {
  if (!isEditorialPreviewOriginalPath(path) || !EDITORIAL_PREVIEW_WIDTHS.includes(width)) return null;
  // Injective mapping of the complete, versioned object key: no hash library or DB.
  return `previews/${EDITORIAL_PREVIEW_RECIPE}/${path}/w${width}.webp`;
}

export function editorialStorageOrigin(configuredUrl: string | undefined): string | null {
  try {
    const url = new URL(configuredUrl ?? "");
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}

export function editorialImagePreviewUrl(
  original: string,
  width: EditorialPreviewWidth,
  configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  const origin = editorialStorageOrigin(configuredUrl);
  if (!origin || /[\\\s]/.test(original)) return original;
  try {
    const url = new URL(original);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash) return original;
    const prefix = `/storage/v1/object/public/${EDITORIAL_PREVIEW_BUCKET}/`;
    // Reject encoded paths and normalization tricks, including dot segments.
    if (original !== origin + url.pathname || !url.pathname.startsWith(prefix)) return original;
    const path = url.pathname.slice(prefix.length);
    const preview = editorialPreviewPath(path, width);
    return preview ? origin + prefix + preview : original;
  } catch { return original; }
}
