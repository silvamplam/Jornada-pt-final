import {
  MESA_OPERATIONAL_CLASSIFICATION_CONTEXT,
  MESA_OPERATIONAL_CYCLE_STARTED_AT,
} from "@/lib/redacao-automatica/newsroom-operational-desk-contract";
import type {
  NewsroomDeterministicClassificationExecution,
  NewsroomDeterministicClassifierServiceResult,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier-service-internal";

export type OperationalDeskAutomaticClassificationInput = Readonly<{
  newsroomArticleId: string;
  articleAction: "created" | "reused" | "updated";
  firstDetectedAt: string;
}>;

export type OperationalDeskAutomaticClassificationAttempt =
  | Readonly<{ status: "outside_cycle" | "not_new" }>
  | Readonly<{
      status: "classified" | "unclassified" | "manual_preserved";
      seasonId: string;
    }>
  | Readonly<{ status: "failed"; seasonId: string }>;

export interface OperationalDeskAutomaticClassificationDependencies {
  classify(input: Readonly<{
    seasonId: string;
    newsroomArticleId: string;
  }>): Promise<
    NewsroomDeterministicClassifierServiceResult<
      NewsroomDeterministicClassificationExecution
    >
  >;
}

export function createOperationalDeskAutomaticClassification(
  dependencies: OperationalDeskAutomaticClassificationDependencies,
) {
  return async function attemptOperationalDeskAutomaticClassification(
    input: OperationalDeskAutomaticClassificationInput,
  ): Promise<OperationalDeskAutomaticClassificationAttempt> {
    const detectedAt = Date.parse(input.firstDetectedAt);
    if (
      !Number.isFinite(detectedAt)
      || detectedAt < Date.parse(MESA_OPERATIONAL_CYCLE_STARTED_AT)
    ) return { status: "outside_cycle" };
    if (input.articleAction !== "created") return { status: "not_new" };

    const seasonId = MESA_OPERATIONAL_CLASSIFICATION_CONTEXT.seasonId;
    try {
      const result = await dependencies.classify({
        seasonId,
        newsroomArticleId: input.newsroomArticleId,
      });
      if (!result.ok) return { status: "failed", seasonId };
      if (result.value.persistence.status === "manual_override_preserved") {
        return { status: "manual_preserved", seasonId };
      }
      return {
        status: result.value.persistence.status === "applied"
          ? "classified"
          : "unclassified",
        seasonId,
      };
    } catch {
      return { status: "failed", seasonId };
    }
  };
}
