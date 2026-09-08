import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const NEWSROOM_ARTICLE_CLASSIFICATION_SOURCES = [
  "automatic",
  "manual",
] as const;

export type NewsroomArticleClassificationSource =
  (typeof NEWSROOM_ARTICLE_CLASSIFICATION_SOURCES)[number];

export type NewsroomArticleClassification = Readonly<{
  newsroomArticleId: string;
  classificationKey: ArticleClassificationKey;
  classificationSource: NewsroomArticleClassificationSource;
  classifiedAt: string;
  updatedAt: string;
}>;

export type NewsroomArticleClassificationState =
  | Readonly<{
      status: "classified";
      classification: NewsroomArticleClassification;
    }>
  | Readonly<{
      status: "unclassified";
      classification: null;
    }>;

export type NewsroomArticleClassificationMutation = Readonly<{
  newsroomArticleId: string;
  state: NewsroomArticleClassificationState;
  applied: boolean;
  changed: boolean;
}>;

export type SetNewsroomArticleClassificationInput = Readonly<{
  newsroomArticleId: string;
  classificationKey: string;
}>;

export type ClearNewsroomArticleClassificationInput = Readonly<{
  newsroomArticleId: string;
}>;

export type NewsroomArticleClassificationErrorCode =
  | "invalid_request"
  | "not_configured"
  | "source_not_found"
  | "relation_invalid"
  | "persistence_failed";

export type NewsroomArticleClassificationServiceResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: NewsroomArticleClassificationErrorCode;
        message: string;
      }>;
    }>;

export interface NewsroomArticleClassificationTransport {
  isConfigured(): boolean;
  applyAutomatic(
    newsroomArticleId: string,
    classificationKey: ArticleClassificationKey,
  ): Promise<NewsroomArticleClassificationMutation>;
  setManual(
    newsroomArticleId: string,
    classificationKey: ArticleClassificationKey,
  ): Promise<NewsroomArticleClassificationMutation>;
  clear(
    newsroomArticleId: string,
  ): Promise<NewsroomArticleClassificationMutation>;
  classifyError(error: unknown): NewsroomArticleClassificationErrorCode;
}

const ERROR_MESSAGES: Readonly<
  Record<NewsroomArticleClassificationErrorCode, string>
> = {
  invalid_request: "A classificação editorial da fonte é inválida.",
  not_configured: "O acesso administrativo à base de dados não está configurado.",
  source_not_found: "A fonte da Redação não existe.",
  relation_invalid: "A classificação devolvida para a fonte é inválida.",
  persistence_failed: "Não foi possível guardar a classificação editorial da fonte.",
};

function failure<T>(
  code: NewsroomArticleClassificationErrorCode,
): NewsroomArticleClassificationServiceResult<T> {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}

export function isNewsroomArticleClassificationUuid(
  value: unknown,
): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function isNewsroomArticleClassificationSource(
  value: unknown,
): value is NewsroomArticleClassificationSource {
  return typeof value === "string"
    && NEWSROOM_ARTICLE_CLASSIFICATION_SOURCES.includes(
      value as NewsroomArticleClassificationSource,
    );
}

function normalizedArticleId(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function persistenceFailure<T>(
  transport: NewsroomArticleClassificationTransport,
  error: unknown,
): NewsroomArticleClassificationServiceResult<T> {
  return failure(transport.classifyError(error));
}

function setClassificationService(
  transport: NewsroomArticleClassificationTransport,
  operation: "automatic" | "manual",
) {
  return async function setClassification(
    input: SetNewsroomArticleClassificationInput,
  ): Promise<
    NewsroomArticleClassificationServiceResult<
      NewsroomArticleClassificationMutation
    >
  > {
    const newsroomArticleId = normalizedArticleId(input.newsroomArticleId);
    if (
      !newsroomArticleId
      || !isArticleClassificationKey(input.classificationKey)
    ) {
      return failure("invalid_request");
    }
    if (!transport.isConfigured()) {
      return failure("not_configured");
    }

    try {
      const value = operation === "automatic"
        ? await transport.applyAutomatic(
            newsroomArticleId,
            input.classificationKey,
          )
        : await transport.setManual(
            newsroomArticleId,
            input.classificationKey,
          );
      return { ok: true, value };
    } catch (error) {
      return persistenceFailure(transport, error);
    }
  };
}

export function applyAutomaticNewsroomArticleClassificationService(
  transport: NewsroomArticleClassificationTransport,
) {
  return setClassificationService(transport, "automatic");
}

export function setManualNewsroomArticleClassificationService(
  transport: NewsroomArticleClassificationTransport,
) {
  return setClassificationService(transport, "manual");
}

export function clearNewsroomArticleClassificationService(
  transport: NewsroomArticleClassificationTransport,
) {
  return async function clearClassification(
    input: ClearNewsroomArticleClassificationInput,
  ): Promise<
    NewsroomArticleClassificationServiceResult<
      NewsroomArticleClassificationMutation
    >
  > {
    const newsroomArticleId = normalizedArticleId(input.newsroomArticleId);
    if (!newsroomArticleId) {
      return failure("invalid_request");
    }
    if (!transport.isConfigured()) {
      return failure("not_configured");
    }

    try {
      return {
        ok: true,
        value: await transport.clear(newsroomArticleId),
      };
    } catch (error) {
      return persistenceFailure(transport, error);
    }
  };
}
