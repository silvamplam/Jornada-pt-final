import "server-only";

import {
  createOpenAiEditorialGenerationProvider,
  type OpenAiEditorialGenerationConfig,
} from "@/lib/redacao-automatica/openai-editorial-generation-provider-internal";

function readConfig(): OpenAiEditorialGenerationConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const model = process.env.OPENAI_EDITORIAL_MODEL?.trim() || "gpt-5-mini";

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    model,
  };
}

export const openAiEditorialGenerationProvider =
  createOpenAiEditorialGenerationProvider(readConfig);
