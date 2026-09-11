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

export type {
  OperationalDeskAutomaticClassificationAttempt,
  OperationalDeskAutomaticClassificationInput,
} from "@/lib/redacao-automatica/newsroom-operational-desk-classification-internal";

const attempt = createOperationalDeskAutomaticClassification({
  classify: classifyNewsroomArticleWithDeterministicEvidence,
});

export function attemptOperationalDeskAutomaticClassification(
  input: Readonly<{
    newsroomArticleId: string;
    articleAction: "created" | "reused" | "updated";
  }>,
) {
  if (input.articleAction !== "created") {
    return attempt({
      ...input,
      firstDetectedAt: MESA_OPERATIONAL_CYCLE_STARTED_AT,
    });
  }
  return validateOperationalDeskCycleSourceIds([input.newsroomArticleId])
    .then((cycle) => cycle.ok
      ? attempt({
          ...input,
          firstDetectedAt: MESA_OPERATIONAL_CYCLE_STARTED_AT,
        })
      : cycle.code === "input_invalid"
        ? { status: "outside_cycle" } as const
        : {
            status: "failed",
            seasonId: MESA_OPERATIONAL_CLASSIFICATION_CONTEXT.seasonId,
          } as const);
}
