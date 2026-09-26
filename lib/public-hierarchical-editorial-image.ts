import type { PublicReferenceComposition } from "./public-matchday";
import { fetchSupabaseAdminTable } from "./supabase";

type EditorialImageSource = Pick<PublicReferenceComposition,
  "status" | "is_current" | "presentation_mode" |
  "hierarchical_editorial_source_type" | "hierarchical_editorial_source_id"
>;

type PublishedArticleImage = { id: string; status: string; image_url: string | null };

/** Recover only the image of the explicitly linked published article.
 * The historical title, excerpt, body and author remain the published snapshot.
 */
export async function readPublicHierarchicalEditorialImage(
  composition: EditorialImageSource | null | undefined,
): Promise<string | null> {
  if (composition?.status !== "published" || !composition.is_current ||
      composition.presentation_mode !== "hierarchical" ||
      composition.hierarchical_editorial_source_type !== "editorial_article") return null;

  const sourceId = composition.hierarchical_editorial_source_id?.trim();
  if (!sourceId) return null;

  try {
    const rows = await fetchSupabaseAdminTable<PublishedArticleImage>(
      `editorial_articles?select=id,status,image_url&id=eq.${encodeURIComponent(sourceId)}&status=eq.published&limit=1`,
    );
    const article = rows.find((row) => row.id === sourceId && row.status === "published");
    return article?.image_url?.trim() || null;
  } catch {
    // An unavailable image must not hide the historical editorial itself.
    return null;
  }
}
