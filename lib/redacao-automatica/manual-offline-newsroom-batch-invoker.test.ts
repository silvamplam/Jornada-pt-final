import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import {
  createOfflineNewsroomBatchIngestion,
  type IngestOfflineNewsroomBatchResult,
  type OfflineNewsroomBatchInput,
} from "@/lib/redacao-automatica/offline-newsroom-batch-ingestion-internal";
import {
  createOfflineNewsroomIngestion,
  type IngestOfflineNewsroomArticleResult,
} from "@/lib/redacao-automatica/offline-newsroom-ingestion-internal";
import {
  createManualOfflineNewsroomBatchInvoker,
  runManualOfflineNewsroomBatchCommand,
} from "@/lib/redacao-automatica/manual-offline-newsroom-batch-invoker-internal";
import { registeredSourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";

const DETECTED_AT = "2026-07-26T10:00:00.000Z";
const LOCAL_HTML =
  "<html><body><article>Conteudo exclusivamente sintetico.</article></body></html>";

function batchInput(): OfflineNewsroomBatchInput {
  return {
    items: [
      {
        itemId: "synthetic-1",
        sourceCode: "fixture",
        originalUrl: "https://fixture.invalid/articles/synthetic-1",
        html: LOCAL_HTML,
        detectedAt: DETECTED_AT,
      },
    ],
  };
}

function ingestionSuccess(): IngestOfflineNewsroomArticleResult {
  return {
    ok: true,
    value: {
      complete: true,
      sourceCode: "fixture",
      normalizedUrl: "https://fixture.invalid/articles/synthetic-1",
      contentHash: "1".padStart(64, "0"),
      article: {
        id: "article-synthetic-1",
        action: "created",
      },
      snapshot: {
        id: "snapshot-synthetic-1",
        action: "created",
      },
    },
  };
}

function ingestionFailure(): IngestOfflineNewsroomArticleResult {
  return {
    ok: false,
    error: {
      code: "parsing_failed",
      stage: "parsing",
      message: "Mensagem sintetica controlada.",
      sourceCode: "fixture",
      persistenceCode: null,
      operationIncomplete: false,
    },
  };
}

function batchReport(
  ingestion: IngestOfflineNewsroomArticleResult = ingestionSuccess(),
): IngestOfflineNewsroomBatchResult {
  return {
    ok: true,
    value: {
      complete: true,
      total: 1,
      succeeded: ingestion.ok ? 1 : 0,
      failed: ingestion.ok ? 0 : 1,
      createdArticles: ingestion.ok ? 1 : 0,
      reusedArticles: 0,
      updatedArticles: 0,
      createdSnapshots: ingestion.ok ? 1 : 0,
      reusedSnapshots: 0,
      items: [
        {
          itemId: "synthetic-1",
          index: 0,
          sourceCode: "fixture",
          originalUrl: "https://fixture.invalid/articles/synthetic-1",
          operationIncomplete: false,
          ingestion,
        },
      ],
    },
  };
}

test("invocador chama o orquestrador uma vez e transmite o lote sem o transformar", async () => {
  const input = batchInput();
  const report = batchReport();
  const calls: OfflineNewsroomBatchInput[] = [];
  const invoke = createManualOfflineNewsroomBatchInvoker({
    async ingestBatch(receivedInput) {
      calls.push(receivedInput);
      return report;
    },
  });

  const result = await invoke(input);

  assert.equal(calls.length, 1);
  assert.equal(calls[0], input);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("O invocador devia devolver o relatorio.");
  }
  assert.equal(result.report, report);
  assert.match(result.output, /Relatorio agregado da ingestao offline/);
  assert.match(result.output, /Total: 1/);
  assert.match(result.output, /synthetic-1: sucesso/);
});

test("falha isolada permanece no relatorio sem nova tentativa", async () => {
  const report = batchReport(ingestionFailure());
  let calls = 0;
  const invoke = createManualOfflineNewsroomBatchInvoker({
    async ingestBatch() {
      calls += 1;
      return report;
    },
  });

  const result = await invoke(batchInput());

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("A falha isolada nao devia falhar o invocador.");
  }
  assert.equal(result.report, report);
  assert.match(result.output, /Falhas: 1/);
  assert.match(result.output, /synthetic-1: falha \(parsing_failed\)/);
});

test("excecao estrutural inesperada e tratada sem stack trace nem detalhe interno", async () => {
  let calls = 0;
  const invoke = createManualOfflineNewsroomBatchInvoker({
    async ingestBatch() {
      calls += 1;
      throw new Error("postgresql-secret-detail");
    },
  });

  const result = await invoke(batchInput());

  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("A excecao devia ser estrutural.");
  }
  assert.equal(result.error.code, "invoker_structural_failure");
  assert.doesNotMatch(result.error.message, /postgres|secret|stack/i);
});

test("comando imprime o relatorio e usa codigo zero mesmo com falha isolada", async () => {
  const input = batchInput();
  const report = batchReport(ingestionFailure());
  const invoke = createManualOfflineNewsroomBatchInvoker({
    async ingestBatch() {
      return report;
    },
  });
  const output: string[] = [];
  const errors: string[] = [];

  const exitCode = await runManualOfflineNewsroomBatchCommand(
    ["synthetic.json"],
    {
      async readBatch(path) {
        assert.equal(path, "synthetic.json");
        return input;
      },
      invoke,
      writeOutput(value) {
        output.push(value);
      },
      writeError(value) {
        errors.push(value);
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(output.length, 1);
  assert.match(output[0], /Falhas: 1/);
  assert.deepEqual(errors, []);
});

test("rejeicao global do lote permanece relatorio e nao vira falha do invocador", async () => {
  const report: IngestOfflineNewsroomBatchResult = {
    ok: false,
    error: {
      code: "batch_input_invalid",
      operationIncomplete: false,
    },
  };
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runManualOfflineNewsroomBatchCommand(
    ["synthetic.json"],
    {
      async readBatch() {
        return batchInput();
      },
      invoke: createManualOfflineNewsroomBatchInvoker({
        async ingestBatch() {
          return report;
        },
      }),
      writeOutput(value) {
        output.push(value);
      },
      writeError(value) {
        errors.push(value);
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(output.length, 1);
  assert.match(output[0], /Estado: rejeitado pelo orquestrador/);
  assert.match(output[0], /Codigo: batch_input_invalid/);
  assert.deepEqual(errors, []);
});

test("comando usa codigo nao zero apenas perante falha estrutural propria", async () => {
  const errors: string[] = [];
  const exitCode = await runManualOfflineNewsroomBatchCommand(
    ["missing.json"],
    {
      async readBatch() {
        throw new Error("C:\\segredo\\lote-inexistente.json");
      },
      async invoke() {
        throw new Error("nao deve executar");
      },
      writeOutput() {
        throw new Error("nao deve imprimir");
      },
      writeError(value) {
        errors.push(value);
      },
    },
  );

  assert.equal(exitCode, 1);
  assert.equal(errors.length, 1);
  assert.doesNotMatch(errors[0], /segredo|stack|postgres/i);
});

test("importar o script nao executa lote, nao imprime e nao falha", async () => {
  const repositoryRoot = resolve(".");
  const scriptUrl = pathToFileURL(
    resolve(
      repositoryRoot,
      "scripts/redacao-automatica/run-offline-newsroom-batch.ts",
    ),
  ).href;
  const child = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(scriptUrl)});`,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_PATH: resolve(
          repositoryRoot,
          "node_modules/next/dist/compiled",
        ),
      },
    },
  );

  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "");
  assert.equal(child.stderr, "");
});

test("invocador nao implementa rede nem chama a ingestao individual", async () => {
  const [internalSource, scriptSource] = await Promise.all([
    readFile(
      new URL(
        "./manual-offline-newsroom-batch-invoker-internal.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../scripts/redacao-automatica/run-offline-newsroom-batch.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const sources = `${internalSource}\n${scriptSource}`;

  assert.doesNotMatch(sources, /\bfetch\s*\(/);
  assert.doesNotMatch(sources, /PageLoader|http-page-loader/);
  assert.doesNotMatch(sources, /ingestOfflineNewsroomArticle/);
  assert.doesNotMatch(sources, /SUPABASE|SERVICE_ROLE|credential/i);
  assert.match(
    scriptSource,
    /ingestBatch:\s*ingestOfflineNewsroomBatch/,
  );
  assert.match(scriptSource, /import "server-only"/);
  assert.doesNotMatch(
    scriptSource,
    /app\/api|route\.ts|Server Action|use server/,
  );
});

test("O Jogo permanece legal_hold no pipeline existente sem logica no invocador", async () => {
  let adapterCalls = 0;
  let persistenceCalls = 0;
  const adapterRegistry: AdapterRegistry = {
    resolve() {
      adapterCalls += 1;
      throw new Error("O adaptador nao deve ser consultado.");
    },
    keys() {
      return [];
    },
  };
  const ingestArticle = createOfflineNewsroomIngestion({
    sourceProvider: registeredSourceConfigurationProvider,
    adapterRegistry,
    async persistArticle() {
      persistenceCalls += 1;
      throw new Error("A persistencia nao deve ser consultada.");
    },
  });
  const ingestBatch = createOfflineNewsroomBatchIngestion({
    ingestArticle,
  });
  const invoke = createManualOfflineNewsroomBatchInvoker({
    ingestBatch,
  });

  const result = await invoke({
    items: [
      {
        itemId: "synthetic-ojogo-legal-hold-1",
        sourceCode: "ojogo",
        originalUrl:
          "https://www.ojogo.pt/noticias/fixture-sintetica-local",
        html: LOCAL_HTML,
        detectedAt: DETECTED_AT,
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok || !result.report.ok) {
    throw new Error("O lote devia devolver a falha isolada de O Jogo.");
  }
  const item = result.report.value.items[0];
  assert.equal(item?.ingestion.ok, false);
  if (!item || item.ingestion.ok) {
    throw new Error("O item devia permanecer bloqueado.");
  }
  assert.equal(item.ingestion.error.code, "legal_hold");
  assert.equal(adapterCalls, 0);
  assert.equal(persistenceCalls, 0);
});
