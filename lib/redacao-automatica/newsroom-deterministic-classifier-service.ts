import "server-only";

import {
  getSupabaseServiceConfig,
} from "@/lib/supabase";
import {
  applyAutomaticNewsroomArticleClassification,
} from "@/lib/redacao-automatica/newsroom-article-classification-service";
import {
  loadNewsroomArticleClassificationEvidence,
  loadNewsroomClassificationSeasonContext,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier-repository";
import {
  classifyNewsroomArticleDeterministicallyService,
  prepareNewsroomDeterministicClassificationsService,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier-service-internal";

export type {
  ClassifyNewsroomArticleDeterministicallyInput,
  NewsroomDeterministicClassificationExecution,
  NewsroomDeterministicClassificationPersistence,
  NewsroomDeterministicClassifierErrorCode,
  NewsroomDeterministicClassifierServiceResult,
  PreparedNewsroomDeterministicClassifications,
  PrepareNewsroomDeterministicClassificationsInput,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier-service-internal";

const dependencies = {
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },
  loadSeasonContext: loadNewsroomClassificationSeasonContext,
  loadArticleEvidence: loadNewsroomArticleClassificationEvidence,
  applyAutomatic: applyAutomaticNewsroomArticleClassification,
};

const prepare = prepareNewsroomDeterministicClassificationsService(
  dependencies,
);
const classify = classifyNewsroomArticleDeterministicallyService(dependencies);

export function prepareNewsroomDeterministicClassifications(
  input: Parameters<typeof prepare>[0],
) {
  return prepare(input);
}

export function classifyNewsroomArticleWithDeterministicEvidence(
  input: Parameters<typeof classify>[0],
) {
  return classify(input);
}
