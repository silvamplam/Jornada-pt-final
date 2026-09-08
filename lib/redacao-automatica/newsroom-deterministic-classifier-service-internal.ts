import {
  classifyNewsroomArticlesDeterministically,
  type NewsroomArticleClassificationEvidence,
  type NewsroomArticleDeterministicClassification,
  type NewsroomClassificationSeasonContext,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier";
import type {
  NewsroomDeterministicClassifierLoadErrorCode,
  NewsroomDeterministicClassifierLoadResult,
} from "@/lib/redacao-automatica/newsroom-deterministic-classifier-loaders";
import type {
  NewsroomArticleClassificationMutation,
  NewsroomArticleClassificationServiceResult,
  SetNewsroomArticleClassificationInput,
} from "@/lib/redacao-automatica/newsroom-article-classification-service-internal";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PREPARATION_BATCH_SIZE = 100;

export type PrepareNewsroomDeterministicClassificationsInput = Readonly<{
  seasonId: string;
  newsroomArticleIds: readonly string[];
}>;

export type ClassifyNewsroomArticleDeterministicallyInput = Readonly<{
  seasonId: string;
  newsroomArticleId: string;
}>;

export type PreparedNewsroomDeterministicClassifications = Readonly<{
  seasonId: string;
  classifications: readonly NewsroomArticleDeterministicClassification[];
}>;

export type NewsroomDeterministicClassificationPersistence =
  | Readonly<{
      status: "applied";
      mutation: NewsroomArticleClassificationMutation;
    }>
  | Readonly<{
      status: "manual_override_preserved";
      mutation: NewsroomArticleClassificationMutation;
    }>
  | Readonly<{
      status: "no_confident_replacement";
      mutation: null;
    }>;

export type NewsroomDeterministicClassificationExecution = Readonly<{
  seasonId: string;
  classification: NewsroomArticleDeterministicClassification;
  persistence: NewsroomDeterministicClassificationPersistence;
}>;

export type NewsroomDeterministicClassifierErrorCode =
  | NewsroomDeterministicClassifierLoadErrorCode
  | "relation_invalid"
  | "persistence_failed";

export type NewsroomDeterministicClassifierServiceResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: NewsroomDeterministicClassifierErrorCode;
        message: string;
      }>;
    }>;

export interface NewsroomDeterministicClassifierDependencies {
  isConfigured(): boolean;
  loadSeasonContext(
    seasonId: string,
  ): Promise<
    NewsroomDeterministicClassifierLoadResult<
      NewsroomClassificationSeasonContext
    >
  >;
  loadArticleEvidence(
    newsroomArticleIds: readonly string[],
  ): Promise<
    NewsroomDeterministicClassifierLoadResult<
      readonly NewsroomArticleClassificationEvidence[]
    >
  >;
  applyAutomatic(
    input: SetNewsroomArticleClassificationInput,
  ): Promise<
    NewsroomArticleClassificationServiceResult<
      NewsroomArticleClassificationMutation
    >
  >;
}

const ERROR_MESSAGES: Readonly<
  Record<NewsroomDeterministicClassifierErrorCode, string>
> = {
  invalid_request: "O pedido de classificação editorial é inválido.",
  not_configured: "O acesso administrativo à base de dados não está configurado.",
  season_not_found: "A época pedida não existe.",
  source_not_found: "A fonte da Redação não existe.",
  context_invalid: "O universo de clubes da época é inconsistente.",
  read_unavailable: "Não foi possível preparar o classificador editorial.",
  relation_invalid: "O classificador devolveu uma relação inválida.",
  persistence_failed: "Não foi possível guardar a classificação automática.",
};

function failure<T>(
  code: NewsroomDeterministicClassifierErrorCode,
): NewsroomDeterministicClassifierServiceResult<T> {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}

function normalizedUuid(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizedPreparationInput(
  input: PrepareNewsroomDeterministicClassificationsInput,
): Readonly<{ seasonId: string; newsroomArticleIds: readonly string[] }> | null {
  const seasonId = normalizedUuid(input.seasonId);
  if (
    !seasonId
    || !Array.isArray(input.newsroomArticleIds)
    || input.newsroomArticleIds.length < 1
    || input.newsroomArticleIds.length > MAX_PREPARATION_BATCH_SIZE
  ) {
    return null;
  }
  const newsroomArticleIds = input.newsroomArticleIds.map(normalizedUuid);
  if (
    newsroomArticleIds.some((id) => id === null)
    || new Set(newsroomArticleIds).size !== newsroomArticleIds.length
  ) {
    return null;
  }
  return {
    seasonId,
    newsroomArticleIds: newsroomArticleIds as readonly string[],
  };
}

export function prepareNewsroomDeterministicClassificationsService(
  dependencies: NewsroomDeterministicClassifierDependencies,
) {
  return async function prepare(
    input: PrepareNewsroomDeterministicClassificationsInput,
  ): Promise<
    NewsroomDeterministicClassifierServiceResult<
      PreparedNewsroomDeterministicClassifications
    >
  > {
    const normalized = normalizedPreparationInput(input);
    if (!normalized) return failure("invalid_request");
    if (!dependencies.isConfigured()) return failure("not_configured");

    const contextResult = await dependencies.loadSeasonContext(
      normalized.seasonId,
    );
    if (!contextResult.ok) return failure(contextResult.error.code);

    const evidenceResult = await dependencies.loadArticleEvidence(
      normalized.newsroomArticleIds,
    );
    if (!evidenceResult.ok) return failure(evidenceResult.error.code);
    if (
      contextResult.value.seasonId !== normalized.seasonId
      || evidenceResult.value.length !== normalized.newsroomArticleIds.length
      || evidenceResult.value.some(
        (evidence, index) => (
          evidence.newsroomArticleId !== normalized.newsroomArticleIds[index]
        ),
      )
    ) {
      return failure("relation_invalid");
    }

    return {
      ok: true,
      value: {
        seasonId: normalized.seasonId,
        classifications: classifyNewsroomArticlesDeterministically(
          evidenceResult.value,
          contextResult.value,
        ),
      },
    };
  };
}

function persistenceErrorCode(
  code: string,
): NewsroomDeterministicClassifierErrorCode {
  return code === "not_configured"
    ? "not_configured"
    : code === "source_not_found"
      ? "source_not_found"
      : code === "relation_invalid"
        ? "relation_invalid"
        : "persistence_failed";
}

export function classifyNewsroomArticleDeterministicallyService(
  dependencies: NewsroomDeterministicClassifierDependencies,
) {
  const prepare = prepareNewsroomDeterministicClassificationsService(
    dependencies,
  );

  return async function classify(
    input: ClassifyNewsroomArticleDeterministicallyInput,
  ): Promise<
    NewsroomDeterministicClassifierServiceResult<
      NewsroomDeterministicClassificationExecution
    >
  > {
    const prepared = await prepare({
      seasonId: input.seasonId,
      newsroomArticleIds: [input.newsroomArticleId],
    });
    if (!prepared.ok) return prepared;

    const classification = prepared.value.classifications[0];
    if (!classification) return failure("relation_invalid");
    const classificationKey = classification.result.classificationKey;
    if (!classificationKey) {
      return {
        ok: true,
        value: {
          seasonId: prepared.value.seasonId,
          classification,
          persistence: {
            status: "no_confident_replacement",
            mutation: null,
          },
        },
      };
    }

    const applied = await dependencies.applyAutomatic({
      newsroomArticleId: classification.newsroomArticleId,
      classificationKey,
    });
    if (!applied.ok) return failure(persistenceErrorCode(applied.error.code));

    if (applied.value.applied) {
      return {
        ok: true,
        value: {
          seasonId: prepared.value.seasonId,
          classification,
          persistence: { status: "applied", mutation: applied.value },
        },
      };
    }

    const persisted = applied.value.state.classification;
    if (
      applied.value.state.status === "classified"
      && persisted?.classificationSource === "manual"
    ) {
      return {
        ok: true,
        value: {
          seasonId: prepared.value.seasonId,
          classification,
          persistence: {
            status: "manual_override_preserved",
            mutation: applied.value,
          },
        },
      };
    }

    return failure("relation_invalid");
  };
}
