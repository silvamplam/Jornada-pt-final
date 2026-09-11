import "server-only";

import {
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  createNewsroomArticlePersistence,
  type PersistNewsroomArticleInput,
  type PersistNewsroomArticleResult,
} from "@/lib/redacao-automatica/newsroom-article-persistence-internal";
import {
  attemptOperationalDeskAutomaticClassification,
} from "@/lib/redacao-automatica/newsroom-operational-desk-classification";

export type {
  NewsroomArticleWriteOutcome,
  NewsroomPersistenceError,
  NewsroomPersistenceErrorCode,
  NewsroomPersistenceSuccess,
  NewsroomSnapshotWriteOutcome,
  PersistNewsroomArticleInput,
  PersistNewsroomArticleResult,
} from "@/lib/redacao-automatica/newsroom-article-persistence-internal";

const persistWithSupabaseServiceRole = createNewsroomArticlePersistence({
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },
  executeRpc(functionName, argumentsValue) {
    return writeSupabaseAdminReturning<unknown>(
      `rpc/${functionName}`,
      {
        method: "POST",
        body: JSON.stringify(argumentsValue),
      },
    );
  },
});

export async function persistNewsroomArticle(
  input: PersistNewsroomArticleInput,
): Promise<PersistNewsroomArticleResult> {
  const result = await persistWithSupabaseServiceRole(input);
  if (result.ok) {
    await attemptOperationalDeskAutomaticClassification({
      newsroomArticleId: result.value.article.id,
      articleAction: result.value.article.action,
    });
  }
  return result;
}
