import "server-only";

import {
  getNewsroomArticleClassificationsByIds,
} from "@/lib/redacao-automatica/newsroom-article-classification-repository";
import {
  applyAutomaticNewsroomArticleClassification,
} from "@/lib/redacao-automatica/newsroom-article-classification-service";
import {
  createCurrentFeedBatchClassifier,
  type CurrentFeedPersistedArticle,
} from "@/lib/redacao-automatica/newsroom-current-feed-classification-internal";
import {
  prepareNewsroomDeterministicClassifications,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier-service";
import {
  MESA_OPERATIONAL_CLASSIFICATION_CONTEXT,
} from "@/lib/redacao-automatica/newsroom-operational-desk-contract";
import {
  partitionOperationalDeskCycleSourceIds,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";

const classifyBatch = createCurrentFeedBatchClassifier({
  async readCycleMembership(articleIds) {
    const result = await partitionOperationalDeskCycleSourceIds(articleIds);
    return result.ok
      ? {
          ok: true,
          value: {
            eligibleIds: result.eligibleIds,
            outsideCycleIds: result.outsideCycleIds,
          },
        } as const
      : { ok: false } as const;
  },
  async readClassificationStates(articleIds) {
    const result = await getNewsroomArticleClassificationsByIds(articleIds);
    return result.ok
      ? { ok: true, value: result.value } as const
      : { ok: false } as const;
  },
  async prepareClassifications(articleIds) {
    const result = await prepareNewsroomDeterministicClassifications({
      seasonId: MESA_OPERATIONAL_CLASSIFICATION_CONTEXT.seasonId,
      newsroomArticleIds: articleIds,
    });
    return result.ok
      ? { ok: true, value: result.value.classifications } as const
      : { ok: false } as const;
  },
  async applyAutomatic(input) {
    const result = await applyAutomaticNewsroomArticleClassification(input);
    return result.ok
      ? { ok: true, value: result.value } as const
      : { ok: false } as const;
  },
});

export function classifyNewsroomCurrentFeedArticles(
  articles: readonly CurrentFeedPersistedArticle[],
) {
  return classifyBatch(articles);
}
