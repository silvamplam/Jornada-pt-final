import { editorialStorageOrigin, isEditorialPreviewOriginalPath } from "./editorial-image-preview";

export function editorialImageOriginalPath(value: string | null | undefined, configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  const origin = editorialStorageOrigin(configuredUrl);
  const prefix = `${origin}/storage/v1/object/public/editorial-images/`;
  if (!origin || !value?.startsWith(prefix)) return null;
  const path = value.slice(prefix.length);
  return isEditorialPreviewOriginalPath(path) ? path : null;
}

/** The exception is identity-bound: an already published row may keep its exact
 * current reference. It cannot introduce that reference into another article. */
export function preservesPublishedImage(next: string | null, current?: { status: string | null; image_url?: string | null } | null): boolean {
  return current?.status === "published" && Boolean(next) && next === current.image_url;
}

export function assertEditorialImageAuthority(next: string | null, current?: { status: string | null; image_url?: string | null } | null, origin?: string): void {
  if (preservesPublishedImage(next, current)) return;
  if (!editorialImageOriginalPath(next, origin)) {
    throw new Error("image-materialization-required: Congele e reveja a imagem antes de publicar.");
  }
}
