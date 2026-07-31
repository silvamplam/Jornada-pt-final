import type {
  EditorialGenerationProvider,
  EditorialGenerationProviderRequest,
  EditorialGenerationProviderResult,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-generation-service-internal";

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_TIMEOUT_MS = 90_000;

export type OpenAiEditorialGenerationConfig = Readonly<{
  apiKey: string;
  model: string;
  endpoint?: string;
  timeoutMs?: number;
}>;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type OpenAiResponseContent = Readonly<{
  type?: unknown;
  text?: unknown;
}>;

type OpenAiResponseOutput = Readonly<{
  type?: unknown;
  content?: unknown;
}>;

type OpenAiResponsesPayload = Readonly<{
  id?: unknown;
  status?: unknown;
  model?: unknown;
  output?: unknown;
  error?: unknown;
  incomplete_details?: unknown;
  usage?: unknown;
}>;

function incompleteReason(payload: OpenAiResponsesPayload): string | null {
  if (
    !payload.incomplete_details
    || typeof payload.incomplete_details !== "object"
    || Array.isArray(payload.incomplete_details)
  ) {
    return null;
  }

  return requiredText(
    (payload.incomplete_details as Record<string, unknown>).reason,
  );
}

function requiredText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function outputText(payload: OpenAiResponsesPayload): string | null {
  if (!Array.isArray(payload.output)) {
    return null;
  }

  const pieces: string[] = [];

  for (const outputItem of payload.output as OpenAiResponseOutput[]) {
    if (outputItem?.type !== "message" || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content as OpenAiResponseContent[]) {
      if (contentItem?.type !== "output_text") {
        continue;
      }

      const text = requiredText(contentItem.text);
      if (text) {
        pieces.push(text);
      }
    }
  }

  return pieces.length > 0 ? pieces.join("\n\n") : null;
}

function usage(payload: OpenAiResponsesPayload): Readonly<{
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}> {
  if (!payload.usage || typeof payload.usage !== "object" || Array.isArray(payload.usage)) {
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    };
  }

  const value = payload.usage as Record<string, unknown>;
  return {
    inputTokens: nonNegativeInteger(value.input_tokens),
    outputTokens: nonNegativeInteger(value.output_tokens),
    totalTokens: nonNegativeInteger(value.total_tokens),
  };
}

function validConfig(
  value: OpenAiEditorialGenerationConfig | null,
): value is OpenAiEditorialGenerationConfig {
  if (!value) {
    return false;
  }

  const apiKey = value.apiKey.trim();
  const model = value.model.trim();
  const timeoutMs = value.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return (
    apiKey.length >= 20
    && model.length > 0
    && model.length <= 120
    && Number.isInteger(timeoutMs)
    && timeoutMs >= 1_000
    && timeoutMs <= 120_000
  );
}

export function createOpenAiEditorialGenerationProvider(
  configProvider: () => OpenAiEditorialGenerationConfig | null,
  fetchImpl: FetchLike = fetch,
): EditorialGenerationProvider {
  return {
    isConfigured() {
      return validConfig(configProvider());
    },

    async generate(
      request: EditorialGenerationProviderRequest,
    ): Promise<EditorialGenerationProviderResult> {
      const config = configProvider();
      if (!validConfig(config)) {
        throw new Error("openai-editorial-generation-not-configured");
      }

      const endpoint = config.endpoint?.trim() || DEFAULT_ENDPOINT;
      const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      let outputTokenLimit = request.maxOutputTokens;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetchImpl(endpoint, {
            method: "POST",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${config.apiKey.trim()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: config.model.trim(),
              store: false,
              reasoning: {
                effort: "low",
              },
              instructions: request.instructions,
              input: request.input,
              max_output_tokens: outputTokenLimit,
              text: {
                format: {
                  type: "json_schema",
                  name: "jornada_editorial_article",
                  strict: true,
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "post_title", "body"],
                    properties: {
                      title: { type: "string" },
                      post_title: { type: "string" },
                      body: { type: "string" },
                    },
                  },
                },
              },
              metadata: {
                feature: "jornada_editorial_generation",
                prompt_version: request.promptVersion,
              },
            }),
          });

          const requestId = response.headers.get("x-request-id")?.trim() || null;
          const rawText = await response.text();
          let payload: OpenAiResponsesPayload;
          try {
            payload = rawText ? JSON.parse(rawText) as OpenAiResponsesPayload : {};
          } catch {
            throw new Error("openai-editorial-generation-invalid-json");
          }

          if (!response.ok) {
            const requestSuffix = requestId ? `-${requestId}` : "";
            throw new Error(
              `openai-editorial-generation-http-${response.status}${requestSuffix}`,
            );
          }

          if (payload.status !== "completed") {
            const reason = incompleteReason(payload) ?? "unknown";
            const mayRetry = (
              attempt === 1
              && ["max_tokens", "max_output_tokens"].includes(reason)
            );

            if (mayRetry) {
              outputTokenLimit = Math.min(
                Math.max(outputTokenLimit * 2, outputTokenLimit + 1_500),
                12_000,
              );
              continue;
            }

            throw new Error(
              `openai-editorial-generation-incomplete-${reason}`,
            );
          }

          const text = outputText(payload);
          const model = requiredText(payload.model) ?? config.model.trim();
          if (!text || !model) {
            throw new Error("openai-editorial-generation-empty-output");
          }

          const tokenUsage = usage(payload);

          return {
            provider: "openai",
            model,
            responseId: requiredText(payload.id),
            text,
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            totalTokens: tokenUsage.totalTokens,
          };
        } finally {
          clearTimeout(timeout);
        }
      }

      throw new Error("openai-editorial-generation-incomplete");
    },
  };
}
