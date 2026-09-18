import "server-only";
import { fetchSupabaseAdminTable, writeSupabaseAdminReturning } from "@/lib/supabase";
import { mesaProductionIntentsService } from "./newsroom-mesa-production-intents-service-internal";
import { compareMesaArticleSourceCapture } from "./newsroom-mesa-production-intents";
import type { MesaIntentFrozenContext } from "./newsroom-mesa-production-intents-contract";

export const mesaIntentService = mesaProductionIntentsService({
  post: (name, args) => writeSupabaseAdminReturning<unknown>(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) }),
  get: (name, args) => fetchSupabaseAdminTable<unknown>(`rpc/${name}?${new URLSearchParams(args)}`),
});

/** Read the most recent receipts for each article. NEW never supplies a baseline
 * for its older siblings; missing or ambiguous history stays UNKNOWN. */
export async function readMesaIntentArticleContinuity(context: MesaIntentFrozenContext) {
  if (!context.themeId) return [];
  const receipts = await mesaIntentService.readReceipts(context.themeId);
  return context.publishedArticles.map((article) => ({
    articleId: article.editorialArticleId,
    sources: compareMesaArticleSourceCapture(context.themeId!, article.editorialArticleId, context.sources, receipts),
  }));
}
