import { editorialImagePreviewUrl, PUBLIC_EDITORIAL_PREVIEW_WIDTHS, type EditorialPreviewWidth } from "./editorial-image-preview";

// Presentation hints only; no persistence, Storage requests or image generation.
// Existing CSS remains the authority for rendered geometry. Lazy images can use
// native sizes=auto; these expressions are the fallback for older browsers.
export const PUBLIC_EDITORIAL_IMAGE_SIZES = {
  thumbnail: { max: 320, sizes: "86px" },
  latest: { max: 1280, sizes: "(max-width: 840px) calc(100vw - 32px), (max-width: 1180px) 320px, 235px" },
  card: { max: 960, sizes: "(max-width: 720px) calc(100vw - 32px), (max-width: 1232px) 32vw, 388px" },
  half: { max: 1280, sizes: "(max-width: 680px) calc(100vw - 32px), (max-width: 1232px) 48vw, 591px" },
  headline: { max: 1280, sizes: "(max-width: 980px) calc(100vw - 32px), (max-width: 1232px) 50vw, 600px" },
  article: { max: 1280, sizes: "(max-width: 900px) calc(100vw - 60px), (max-width: 1212px) calc(100vw - 394px), 780px" },
  content: { max: 1280, sizes: "(max-width: 720px) calc(100vw - 28px), (max-width: 952px) calc(100vw - 32px), 920px" },
} as const satisfies Record<string, { max: EditorialPreviewWidth; sizes: string }>;
export type PublicEditorialImageSize = keyof typeof PUBLIC_EDITORIAL_IMAGE_SIZES;

export function publicEditorialImageSources(
  original: string,
  imageSize: PublicEditorialImageSize,
  lazy = false,
  configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
) {
  const profile = PUBLIC_EDITORIAL_IMAGE_SIZES[imageSize];
  const src = editorialImagePreviewUrl(original, profile.max, configuredUrl);
  if (src === original) return { src: original, srcSet: undefined, sizes: undefined };
  return {
    src,
    srcSet: PUBLIC_EDITORIAL_PREVIEW_WIDTHS.filter((width) => width <= profile.max)
      .map((width) => `${editorialImagePreviewUrl(original, width, configuredUrl)} ${width}w`).join(", "),
    sizes: (lazy ? "auto, " : "") + profile.sizes,
  };
}
