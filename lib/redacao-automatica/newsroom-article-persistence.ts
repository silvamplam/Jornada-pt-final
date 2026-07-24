import "server-only";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  createNewsroomArticlePersistence,
  type PersistNewsroomArticleInput,
  type PersistNewsroomArticleResult,
} from "@/lib/redacao-automatica/newsroom-article-persistence-internal";

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
  readRows<T>(path: string) {
    return fetchSupabaseAdminTable<T>(path);
  },
  writeRows<T>(path: string, init: RequestInit) {
    return writeSupabaseAdminReturning<T>(path, init);
  },
  isUnavailableError(error: unknown) {
    return error instanceof TypeError;
  },
});

export async function persistNewsroomArticle(
  input: PersistNewsroomArticleInput,
): Promise<PersistNewsroomArticleResult> {
  return persistWithSupabaseServiceRole(input);
}
