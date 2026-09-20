import "server-only";

import {
  classifyNewsroomArticleWithDeterministicEvidence,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier-service";
import {
  createOperationalDeskAutomaticClassification,
} from "@/lib/redacao-automatica/newsroom-operational-desk-classification-internal";
import {
  MESA_OPERATIONAL_CLASSIFICATION_CONTEXT,
  MESA_OPERATIONAL_CYCLE_STARTED_AT,
} from "@/lib/redacao-automatica/newsroom-operational-desk-contract";
import {
  validateOperationalDeskCycleSourceIds,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";
import {
  getNewsroomArticleClassification,
} from "@/lib/redacao-automatica/newsroom-article-classification-repository";

export type {
  OperationalDeskAutomaticClassificationAttempt,
  OperationalDeskAutomaticClassificationInput,
} from "@/lib/redacao-automatica/newsroom-operational-desk-classification-internal";

const attempt = createOperationalDeskAutomaticClassification({
  classify: classifyNewsroomArticleWithDeterministicEvidence,
});

export async function attemptOperationalDeskAutomaticClassification(
  input: Readonly<{
    newsroomArticleId: string;
    articleAction: "created" | "reused" | "updated";
  }>,
) {
  const cycle = await validateOperationalDeskCycleSourceIds([
    input.newsroomArticleId,
  ]);
  if (!cycle.ok) {
    return cycle.code === "input_invalid"
      ? { status: "outside_cycle" } as const
      : {
          status: "failed",
          seasonId: MESA_OPERATIONAL_CLASSIFICATION_CONTEXT.seasonId,
        } as const;
  }

  if (input.articleAction !== "created") {
    const current = await getNewsroomArticleClassification(
      input.newsroomArticleId,
    );
    if (!current.ok) {
      return {
        status: "failed",
        seasonId: MESA_OPERATIONAL_CLASSIFICATION_CONTEXT.seasonId,
      } as const;
    }
    if (current.value.status === "classified") {
      return current.value.classification.classificationSource === "manual"
        ? {
            status: "manual_preserved",
            seasonId: MESA_OPERATIONAL_CLASSIFICATION_CONTEXT.seasonId,
          } as const
        : { status: "not_new" } as const;
    }
  }

  return attempt({
    ...input,
    firstDetectedAt: MESA_OPERATIONAL_CYCLE_STARTED_AT,
  });
}
