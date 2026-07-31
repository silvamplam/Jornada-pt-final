import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpenAiEditorialGenerationProvider,
  type OpenAiEditorialGenerationConfig,
} from "@/lib/redacao-automatica/openai-editorial-generation-provider-internal";

function config(
  overrides: Partial<OpenAiEditorialGenerationConfig> = {},
): OpenAiEditorialGenerationConfig {
  return {
    apiKey: "sk-test-abcdefghijklmnopqrstuvwxyz",
    model: "gpt-5-mini",
    timeoutMs: 5_000,
    ...overrides,
  };
}

test("fica indisponível sem chave ou modelo válidos", () => {
  const missing = createOpenAiEditorialGenerationProvider(() => null);
  const shortKey = createOpenAiEditorialGenerationProvider(() => config({ apiKey: "curta" }));
  const missingModel = createOpenAiEditorialGenerationProvider(() => config({ model: "" }));

  assert.equal(missing.isConfigured(), false);
  assert.equal(shortKey.isConfigured(), false);
  assert.equal(missingModel.isConfigured(), false);
});

test("usa Responses API, store false, reasoning low e não expõe a chave", async () => {
  let capturedInput: string | URL | Request | null = null;
  let capturedInit: RequestInit | undefined;

  const provider = createOpenAiEditorialGenerationProvider(
    () => config(),
    async (input, init) => {
      capturedInput = input;
      capturedInit = init;

      return new Response(JSON.stringify({
        id: "resp_123",
        status: "completed",
        model: "gpt-5-mini-2025-08-07",
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: '{"title":"FC Porto prepara nova época com vitória","post_title":"Dragões venceram o S. João de Ver num encontro de preparação marcado por jovens em destaque.","body":"Primeiro parágrafo factual com informação suficiente para formar um corpo editorial válido.\\n\\nSegundo parágrafo factual e separado."}',
          }],
        }],
        usage: {
          input_tokens: 120,
          output_tokens: 80,
          total_tokens: 200,
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );

  const result = await provider.generate({
    instructions: "Instruções editoriais.",
    input: "{\"fontes\":[]}",
    maxOutputTokens: 3_000,
    promptVersion: "dossier-article-plan-body-v1",
  });

  assert.equal(capturedInput, "https://api.openai.com/v1/responses");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(
    (capturedInit?.headers as Record<string, string>).Authorization,
    "Bearer sk-test-abcdefghijklmnopqrstuvwxyz",
  );

  const body = JSON.parse(String(capturedInit?.body)) as {
    model: string;
    store: boolean;
    reasoning: { effort: string };
    instructions: string;
    input: string;
    max_output_tokens: number;
    text: {
      format: {
        type: string;
        name: string;
        strict: boolean;
        schema: {
          required: string[];
          additionalProperties: boolean;
        };
      };
    };
    metadata: Record<string, string>;
  };
  assert.equal(body.model, "gpt-5-mini");
  assert.equal(body.store, false);
  assert.equal(body.reasoning.effort, "low");
  assert.equal(body.instructions, "Instruções editoriais.");
  assert.equal(body.input, "{\"fontes\":[]}");
  assert.equal(body.max_output_tokens, 3_000);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.name, "jornada_editorial_article");
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(body.text.format.schema.required, ["title", "post_title", "body"]);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.equal(body.metadata.prompt_version, "dossier-article-plan-body-v1");

  assert.deepEqual(result, {
    provider: "openai",
    model: "gpt-5-mini-2025-08-07",
    responseId: "resp_123",
    text: '{"title":"FC Porto prepara nova época com vitória","post_title":"Dragões venceram o S. João de Ver num encontro de preparação marcado por jovens em destaque.","body":"Primeiro parágrafo factual com informação suficiente para formar um corpo editorial válido.\\n\\nSegundo parágrafo factual e separado."}',
    inputTokens: 120,
    outputTokens: 80,
    totalTokens: 200,
  });
  assert.doesNotMatch(JSON.stringify(result), /sk-test/);
});

test("reúne apenas conteúdo output_text e rejeita respostas incompletas", async () => {
  const complete = createOpenAiEditorialGenerationProvider(
    () => config(),
    async () => new Response(JSON.stringify({
      id: "resp_456",
      status: "completed",
      model: "gpt-5-mini",
      output: [
        {
          type: "reasoning",
          content: [{ type: "summary_text", text: "Não deve sair." }],
        },
        {
          type: "message",
          content: [
            { type: "output_text", text: "Parágrafo editorial um suficientemente desenvolvido para passar a validação posterior." },
            { type: "refusal", refusal: "Ignorado." },
            { type: "output_text", text: "Parágrafo editorial dois." },
          ],
        },
      ],
      usage: {},
    }), { status: 200 }),
  );

  const result = await complete.generate({
    instructions: "Instruções.",
    input: "Entrada.",
    maxOutputTokens: 1_800,
    promptVersion: "v1",
  });
  assert.equal(
    result.text,
    "Parágrafo editorial um suficientemente desenvolvido para passar a validação posterior.\n\nParágrafo editorial dois.",
  );

  const incomplete = createOpenAiEditorialGenerationProvider(
    () => config(),
    async () => new Response(JSON.stringify({
      id: "resp_incomplete",
      status: "incomplete",
      model: "gpt-5-mini",
      output: [],
    }), { status: 200 }),
  );

  await assert.rejects(
    () => incomplete.generate({
      instructions: "Instruções.",
      input: "Entrada.",
      maxOutputTokens: 1_800,
      promptVersion: "v1",
    }),
    /openai-editorial-generation-incomplete/,
  );
});

test("transforma erros HTTP e JSON inválido em falhas controladas sem detalhe remoto", async () => {
  const httpError = createOpenAiEditorialGenerationProvider(
    () => config(),
    async () => new Response(JSON.stringify({
      error: { message: "segredo remoto que não deve ser propagado" },
    }), { status: 429 }),
  );

  await assert.rejects(
    () => httpError.generate({
      instructions: "Instruções.",
      input: "Entrada.",
      maxOutputTokens: 1_800,
      promptVersion: "v1",
    }),
    /^Error: openai-editorial-generation-http-429$/,
  );

  const invalidJson = createOpenAiEditorialGenerationProvider(
    () => config(),
    async () => new Response("não é json", { status: 200 }),
  );

  await assert.rejects(
    () => invalidJson.generate({
      instructions: "Instruções.",
      input: "Entrada.",
      maxOutputTokens: 1_800,
      promptVersion: "v1",
    }),
    /openai-editorial-generation-invalid-json/,
  );
});
