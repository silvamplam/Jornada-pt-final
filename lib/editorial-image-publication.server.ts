import "server-only";
import { fetchSupabaseAdminTable, getSupabaseServiceConfig } from "./supabase";
import { assertEditorialImageAuthority, preservesPublishedImage } from "./editorial-image-authority";
import { createImageFreezeStorage } from "./editorial-image-freeze-storage.server";

export async function requirePublishableEditorialImage(imageUrl: string | null, currentId?: string) {
  const current = currentId ? (await fetchSupabaseAdminTable<{ status: string; image_url: string | null }>(
    `editorial_articles?select=status,image_url&id=eq.${encodeURIComponent(currentId)}&limit=1`,
  ))[0] : null;
  // Null in a Mesa UPDATE means preserve, and is resolved by the SQL writer.
  const effective = imageUrl ?? (current?.status === "published" ? current.image_url : null);
  assertEditorialImageAuthority(effective, current);
  if (preservesPublishedImage(effective, current)) return;
  const config = getSupabaseServiceConfig();
  if (!config) throw new Error("image-missing-config");
  await createImageFreezeStorage(config).registerLocal(effective!);
}
