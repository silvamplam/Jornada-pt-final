import "server-only";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
} from "@/lib/supabase";
import {
  deterministicClassifierLoadFailure,
  loadNewsroomArticleClassificationEvidenceWithReader,
  loadNewsroomClassificationSeasonContextWithReader,
  type NewsroomDeterministicClassifierLoadResult,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier-loaders";
import type {
  NewsroomArticleClassificationEvidence,
  NewsroomClassificationSeasonContext,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier";

const reader = {
  read<T>(path: string) {
    return fetchSupabaseAdminTable<T>(path);
  },
};

export function loadNewsroomClassificationSeasonContext(
  seasonId: string,
): Promise<
  NewsroomDeterministicClassifierLoadResult<
    NewsroomClassificationSeasonContext
  >
> {
  if (!getSupabaseServiceConfig()) {
    return Promise.resolve(deterministicClassifierLoadFailure("not_configured"));
  }
  return loadNewsroomClassificationSeasonContextWithReader(reader, seasonId);
}

export function loadNewsroomArticleClassificationEvidence(
  articleIds: readonly string[],
): Promise<
  NewsroomDeterministicClassifierLoadResult<
    readonly NewsroomArticleClassificationEvidence[]
  >
> {
  if (!getSupabaseServiceConfig()) {
    return Promise.resolve(deterministicClassifierLoadFailure("not_configured"));
  }
  return loadNewsroomArticleClassificationEvidenceWithReader(
    reader,
    articleIds,
  );
}
