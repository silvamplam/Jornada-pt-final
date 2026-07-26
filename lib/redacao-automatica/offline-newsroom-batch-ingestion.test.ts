import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  createOfflineNewsroomBatchIngestion,
  OFFLINE_NEWSROOM_BATCH_MAX_ITEMS,
  type IngestOfflineNewsroomBatchResult,
  type OfflineNewsroomBatchInput,
  type OfflineNewsroomBatchItem,
} from "@/lib/redacao-automatica/offline-newsroom-batch-ingestion-internal";
import type {
  IngestOfflineNewsroomArticleInput,
  IngestOfflineNewsroomArticleResult,
  OfflineNewsroomIngestionErrorCode,
} from "@/lib/redacao-automatica/offline-newsroom-ingestion-internal";

const DETECTED_AT = "2026-07-26T10:00:00.000Z";
const EXTRACTED_AT = "2026-07-26T10:01:00.000Z";
const LOCAL_HTML = "<html><body><article>Conteudo sintetico</article></body></html>";

function batchItem(
  itemId: string,
  overrides: Partial<IngestOfflineNewsroomArticleInput> = {},
): OfflineNewsroomBatchItem {
  return {
    itemId,
    sourceCode: "fixture",
    originalUrl: `https://fixture.invalid/articles/${itemId}`,
    html: LOCAL_HTML,
    detectedAt: DETECTED_AT,
    extractedAt: EXTRACTED_AT,
    ...overrides,
  };
}

function ingestionSuccess(
  articleAction: "created" | "reused" | "updated" = "created",
  snapshotAction: "created" | "reused" = "created",
  suffix = "1",
): IngestOfflineNewsroomArticleResult {
  return {
    ok: true,
    value: {
      complete: true,
      sourceCode: "fixture",
      normalizedUrl: `https://fixture.invalid/articles/${suffix}`,
      contentHash: suffix.padStart(64, "0"),
      article: {
        id: `article-${suffix}`,
        action: articleAction,
      },
      snapshot: {
        id: `snapshot-${suffix}`,
        action: snapshotAction,
      },
    },
  };
}

function ingestionFailure(
  code: OfflineNewsroomIngestionErrorCode = "input_invalid",
): IngestOfflineNewsroomArticleResult {
  return {
    ok: false,
    error: {
      code,
      stage: "validation",
      message: "Falha sintetica controlada.",
      sourceCode: "fixture",
      persistenceCode: null,
      operationIncomplete: false,
    },
  };
}

type IngestionBehavior = (
  input: IngestOfflineNewsroomArticleInput,
  index: number,
) => IngestOfflineNewsroomArticleResult
  | Promise<IngestOfflineNewsroomArticleResult>;

function createHarness(
  behavior: IngestionBehavior = (_input, index) =>
    ingestionSuccess("created", "created", String(index + 1)),
) {
  const calls: IngestOfflineNewsroomArticleInput[] = [];
  const ingest = createOfflineNewsroomBatchIngestion({
    async ingestArticle(input) {
      const index = calls.length;
      calls.push({ ...input });
      return behavior(input, index);
    },
  });

  return { calls, ingest };
}

function successfulValue(result: IngestOfflineNewsroomBatchResult) {
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Resultado de lote inesperadamente invalido.");
  }
  return result.value;
}

function assertGlobalError(
  result: IngestOfflineNewsroomBatchResult,
  code: "batch_input_invalid" | "batch_too_large",
): void {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("O lote devia ter falhado globalmente.");
  }
  assert.equal(result.error.code, code);
  assert.equal(result.error.operationIncomplete, false);
}

test("processa um lote valido com um item bem-sucedido", async () => {
  const harness = createHarness();
  const value = successfulValue(await harness.ingest({
    items: [batchItem("item-1")],
  }));

  assert.equal(harness.calls.length, 1);
  assert.equal(value.total, 1);
  assert.equal(value.succeeded, 1);
  assert.equal(value.failed, 0);
  assert.equal(value.items[0]?.itemId, "item-1");
  assert.equal(value.items[0]?.index, 0);
  assert.equal(value.items[0]?.ingestion.ok, true);
});

test("preserva ordem e processa varios itens sequencialmente uma unica vez", async () => {
  let activeCalls = 0;
  let maximumActiveCalls = 0;
  const startedItemIds: string[] = [];
  const harness = createHarness(async (input, index) => {
    activeCalls += 1;
    maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
    startedItemIds.push(input.originalUrl.split("/").at(-1) ?? "");
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    activeCalls -= 1;
    return ingestionSuccess("created", "created", String(index + 1));
  });

  const value = successfulValue(await harness.ingest({
    items: [
      batchItem("item-1"),
      batchItem("item-2"),
      batchItem("item-3"),
    ],
  }));

  assert.deepEqual(startedItemIds, ["item-1", "item-2", "item-3"]);
  assert.deepEqual(
    value.items.map((item) => item.itemId),
    ["item-1", "item-2", "item-3"],
  );
  assert.deepEqual(
    value.items.map((item) => item.index),
    [0, 1, 2],
  );
  assert.equal(harness.calls.length, 3);
  assert.equal(maximumActiveCalls, 1);
});

test("isola uma falha controlada e continua os itens posteriores", async () => {
  const harness = createHarness((_input, index) =>
    index === 1
      ? ingestionFailure("parsing_failed")
      : ingestionSuccess("created", "created", String(index + 1)));

  const value = successfulValue(await harness.ingest({
    items: [
      batchItem("item-1"),
      batchItem("item-2"),
      batchItem("item-3"),
    ],
  }));

  assert.equal(harness.calls.length, 3);
  assert.equal(value.succeeded, 2);
  assert.equal(value.failed, 1);
  assert.equal(value.items[1]?.ingestion.ok, false);
  assert.equal(value.items[2]?.ingestion.ok, true);
});

test("continua quando o primeiro item falha", async () => {
  const harness = createHarness((_input, index) =>
    index === 0
      ? ingestionFailure()
      : ingestionSuccess("created", "created", String(index + 1)));

  const value = successfulValue(await harness.ingest({
    items: [
      batchItem("item-1"),
      batchItem("item-2"),
      batchItem("item-3"),
    ],
  }));

  assert.equal(harness.calls.length, 3);
  assert.equal(value.items[0]?.ingestion.ok, false);
  assert.equal(value.items[1]?.ingestion.ok, true);
  assert.equal(value.items[2]?.ingestion.ok, true);
});

test("preserva os resultados anteriores quando o ultimo item falha", async () => {
  const harness = createHarness((_input, index) =>
    index === 2
      ? ingestionFailure()
      : ingestionSuccess("created", "created", String(index + 1)));

  const value = successfulValue(await harness.ingest({
    items: [
      batchItem("item-1"),
      batchItem("item-2"),
      batchItem("item-3"),
    ],
  }));

  assert.equal(harness.calls.length, 3);
  assert.equal(value.items[0]?.ingestion.ok, true);
  assert.equal(value.items[1]?.ingestion.ok, true);
  assert.equal(value.items[2]?.ingestion.ok, false);
});

test("converte uma excecao inesperada em erro controlado e continua", async () => {
  const harness = createHarness((_input, index) => {
    if (index === 1) {
      throw new Error(`Erro interno com HTML: ${LOCAL_HTML}`);
    }
    return ingestionSuccess("created", "created", String(index + 1));
  });

  const value = successfulValue(await harness.ingest({
    items: [
      batchItem("item-1"),
      batchItem("item-2"),
      batchItem("item-3"),
    ],
  }));
  const unexpected = value.items[1]?.ingestion;

  assert.equal(harness.calls.length, 3);
  assert.equal(unexpected?.ok, false);
  if (!unexpected?.ok) {
    assert.equal(unexpected.error.code, "unexpected_item_failure");
    assert.equal(unexpected.error.operationIncomplete, false);
    assert.doesNotMatch(unexpected.error.message, /HTML|article/i);
  }
  assert.equal(value.items[2]?.ingestion.ok, true);
  assert.doesNotMatch(JSON.stringify(value), /Conteudo sintetico/);
});

test("rejeita lote vazio antes de chamar a ingestao", async () => {
  const harness = createHarness();
  const result = await harness.ingest({ items: [] });

  assertGlobalError(result, "batch_input_invalid");
  assert.equal(harness.calls.length, 0);
});

test("rejeita lote acima do limite antes de chamar a ingestao", async () => {
  const harness = createHarness();
  const result = await harness.ingest({
    items: Array.from(
      { length: OFFLINE_NEWSROOM_BATCH_MAX_ITEMS + 1 },
      (_value, index) => batchItem(`item-${index + 1}`),
    ),
  });

  assertGlobalError(result, "batch_too_large");
  assert.equal(harness.calls.length, 0);
});

test("rejeita itemId vazio antes de chamar a ingestao", async () => {
  const harness = createHarness();
  const result = await harness.ingest({
    items: [batchItem("   ")],
  });

  assertGlobalError(result, "batch_input_invalid");
  assert.equal(harness.calls.length, 0);
});

test("rejeita itemId duplicado antes de chamar a ingestao", async () => {
  const harness = createHarness();
  const result = await harness.ingest({
    items: [batchItem("item-1"), batchItem("item-1")],
  });

  assertGlobalError(result, "batch_input_invalid");
  assert.equal(harness.calls.length, 0);
});

test("rejeita campo desconhecido no lote", async () => {
  const harness = createHarness();
  const invalidInput = {
    items: [batchItem("item-1")],
    unknownField: true,
  } as unknown as OfflineNewsroomBatchInput;

  assertGlobalError(
    await harness.ingest(invalidInput),
    "batch_input_invalid",
  );
  assert.equal(harness.calls.length, 0);
});

test("rejeita campo desconhecido num item", async () => {
  const harness = createHarness();
  const invalidItem = {
    ...batchItem("item-1"),
    unknownField: true,
  } as unknown as OfflineNewsroomBatchItem;

  assertGlobalError(
    await harness.ingest({ items: [invalidItem] }),
    "batch_input_invalid",
  );
  assert.equal(harness.calls.length, 0);
});

test("deriva todos os contadores apenas dos resultados individuais", async () => {
  const outcomes: readonly IngestOfflineNewsroomArticleResult[] = [
    ingestionSuccess("created", "created", "1"),
    ingestionSuccess("reused", "reused", "2"),
    ingestionSuccess("updated", "created", "3"),
    ingestionFailure("persistence_failed"),
  ];
  const harness = createHarness((_input, index) => outcomes[index]!);
  const value = successfulValue(await harness.ingest({
    items: [
      batchItem("item-1"),
      batchItem("item-2"),
      batchItem("item-3"),
      batchItem("item-4"),
    ],
  }));

  assert.deepEqual(
    {
      total: value.total,
      succeeded: value.succeeded,
      failed: value.failed,
      createdArticles: value.createdArticles,
      reusedArticles: value.reusedArticles,
      updatedArticles: value.updatedArticles,
      createdSnapshots: value.createdSnapshots,
      reusedSnapshots: value.reusedSnapshots,
    },
    {
      total: 4,
      succeeded: 3,
      failed: 1,
      createdArticles: 1,
      reusedArticles: 1,
      updatedArticles: 1,
      createdSnapshots: 2,
      reusedSnapshots: 1,
    },
  );
  assert.equal(value.total, value.succeeded + value.failed);
  assert.equal(
    value.createdArticles + value.reusedArticles + value.updatedArticles,
    value.succeeded,
  );
  assert.equal(
    value.createdSnapshots + value.reusedSnapshots,
    value.succeeded,
  );
});

test("operationIncomplete nunca e true nos resultados controlados", async () => {
  const harness = createHarness((_input, index) => {
    if (index === 0) {
      return ingestionFailure();
    }
    throw new Error("Falha inesperada sintetica.");
  });
  const result = await harness.ingest({
    items: [batchItem("item-1"), batchItem("item-2")],
  });
  const serialized = JSON.stringify(result);

  assert.doesNotMatch(serialized, /"operationIncomplete":true/);
  assert.match(serialized, /"operationIncomplete":false/);
});

async function listSourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: URL[] = [];

  for (const entry of entries) {
    const child = new URL(
      entry.name + (entry.isDirectory() ? "/" : ""),
      directory,
    );
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(child));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(child);
    }
  }

  return files;
}

test("mantem fronteira server-only sem rede, cliente ou fontes especificas", async () => {
  const publicSource = await readFile(
    new URL("./offline-newsroom-batch-ingestion.ts", import.meta.url),
    "utf8",
  );
  const internalSource = await readFile(
    new URL(
      "./offline-newsroom-batch-ingestion-internal.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const implementationSource = `${publicSource}\n${internalSource}`;

  assert.match(publicSource, /^import "server-only";/);
  assert.doesNotMatch(publicSource, /^\s*["']use client["'];/m);
  assert.doesNotMatch(implementationSource, /@\/(?:app|components)\//);
  assert.doesNotMatch(
    implementationSource,
    /\b(?:Promise\.all|Promise\.allSettled|fetch|PageLoader|XMLHttpRequest|WebSocket)\b/,
  );
  assert.doesNotMatch(
    implementationSource,
    /node:(?:dns|http|https)|http-page-loader|page-loader/i,
  );
  assert.doesNotMatch(
    implementationSource,
    /supabase|newsroom_articles|newsroom_article_snapshots|insert\s+into|delete\s+from/i,
  );
  assert.doesNotMatch(
    implementationSource,
    /["'](?:record|abola|maisfutebol|ojogo)["']/i,
  );
  assert.doesNotMatch(implementationSource, /\bany\b/);
  assert.equal(
    internalSource.match(/dependencies\.ingestArticle\(/g)?.length,
    1,
  );

  const rootUrl = new URL("../../", import.meta.url);
  for (const directory of ["app/", "components/", "lib/"]) {
    const sourceFiles = await listSourceFiles(new URL(directory, rootUrl));
    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, "utf8");
      if (/^\s*["']use client["'];/m.test(source)) {
        assert.doesNotMatch(
          source,
          /offline-newsroom-batch-ingestion(?:-internal)?/,
          `Um modulo client importa o lote: ${sourceFile.pathname}`,
        );
      }
    }
  }
});

test("nao expoe HTML nem muta os inputs originais", async () => {
  const item = Object.freeze(batchItem("item-1"));
  const input: OfflineNewsroomBatchInput = Object.freeze({
    items: Object.freeze([item]),
  });
  const before = structuredClone(input);
  const harness = createHarness(() => ingestionFailure("parsing_failed"));
  const result = await harness.ingest(input);

  assert.deepEqual(input, before);
  assert.doesNotMatch(JSON.stringify(result), /Conteudo sintetico|<html/i);
  assert.equal(harness.calls[0]?.html, LOCAL_HTML);
});

test("a fronteira publica nao expoe a injecao de dependencias", async () => {
  const publicSource = await readFile(
    new URL("./offline-newsroom-batch-ingestion.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    publicSource,
    /export async function ingestOfflineNewsroomBatch\(/,
  );
  assert.doesNotMatch(
    publicSource,
    /export\s+(?:type\s+)?\{[^}]*createOfflineNewsroomBatchIngestion/,
  );
});
