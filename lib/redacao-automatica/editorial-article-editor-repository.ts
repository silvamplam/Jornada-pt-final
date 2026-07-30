import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import type { EditorialArticle } from "@/app/admin/editorial/artigos/_articleForm";

export type EditorialArticleByIdResult =
  | Readonly<{ ok: true; value: EditorialArticle | null }>
  | Readonly<{ ok: false; error: "read_unavailable" }>;

export async function getEditorialArticleById(
  articleId: string,
): Promise<EditorialArticleByIdResult> {
  try {
    const rows = await fetchSupabaseAdminTable<EditorialArticle>(
      "editorial_articles?select=*"
      + `&id=eq.${encodeURIComponent(articleId)}&limit=1`,
    );

    return { ok: true, value: rows[0] ?? null };
  } catch {
    return { ok: false, error: "read_unavailable" };
  }
}
