import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { after, before, test } from "node:test";

import {
  createNewsroomArticlePersistence,
  NEWSROOM_PERSISTENCE_RPC_NAME,
  type NewsroomPersistenceRpcArguments,
  type NewsroomPersistenceTransport,
  type PersistNewsroomArticleInput,
  type PersistNewsroomArticleResult,
} from "@/lib/redacao-automatica/newsroom-article-persistence-internal";

type RpcCall = Readonly<{
  functionName: string;
  argumentsValue: NewsroomPersistenceRpcArguments;
}>;

const ARTICLE_ID = "00000000-0000-4000-8000-000000000101";
const SNAPSHOT_ID = "00000000-0000-4000-9000-000000000102";
const originalFetch = globalThis.fetch;
let networkCallCount = 0;

before(() => {
  globalThis.fetch = (async () => {
    networkCallCount += 1;
    throw new Error("Os testes de persistência não permitem pedidos de rede.");
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(networkCallCount, 0);
});

class FakeNewsroomTransport implements NewsroomPersistenceTransport {
  readonly calls: RpcCall[] = [];
  configured = true;
  response: unknown = rpcResponse("created", "created");
  error: unknown = null;

  isConfigured(): boolean {
    return this.configured;
  }

  async executeRpc(
    functionName: string,
    argumentsValue: NewsroomPersistenceRpcArguments,
  ): Promise<unknown> {
    this.calls.push({ functionName, argumentsValue });
    if (this.error !== null) {
      throw this.error;
    }
    return this.response;
  }
}

function rpcResponse(
  articleAction: "created" | "reused" | "updated",
  snapshotAction: "created" | "reused",
): unknown {
  return [{
    article_id: ARTICLE_ID,
    snapshot_id: SNAPSHOT_ID,
    article_action: articleAction,
    snapshot_action: snapshotAction,
  }];
}

function rpcError(
  message: "source_not_found" | "persistence_conflict" | "input_invalid",
  details: "article" | "snapshot" | "validation",
): Error {
  return new Error(JSON.stringify({
    code: "P0001",
    details,
    hint: null,
    message,
  }));
}

function validInput(): PersistNewsroomArticleInput {
  return {
    article: {
      sourceCode: "record",
      originalUrl: "https://www.record.pt/futebol/noticia-controlada",
      normalizedUrl: "https://www.record.pt/futebol/noticia-controlada",
      externalId: "record-123",
      title: "Título normalizado",
      subtitle: "Subtítulo normalizado",
      summary: "Resumo normalizado",
      author: "Autor",
      publishedAt: "2026-07-24T10:00:00.000Z",
      modifiedAt: null,
      detectedAt: "2026-07-24T10:05:00.000Z",
      imageUrl: "https://www.record.pt/imagem.jpg",
      processingStatus: "ready_for_review",
    },
    snapshot: {
      contentHash: "hash-controlado-001",
      body: [
        { type: "heading", text: "Título normalizado" },
        { type: "paragraph", text: "Corpo normalizado." },
      ],
      sourceMetadata: {
        sourcePageUrl: "https://www.record.pt/futebol",
        fixture: "local",
      },
      extractedAt: "2026-07-24T10:06:00.000Z",
    },
  };
}

function assertCompleteFailure(result: PersistNewsroomArticleResult): void {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Era esperado um erro de persistência.");
  }
  assert.equal(result.error.article, null);
  assert.equal(result.error.operationIncomplete, false);
}

test("rejeita input inválido antes da RPC e faz zero chamadas", async () => {
  const transport = new FakeNewsroomTransport();
  const input = validInput();
  const invalidInput = {
    ...input,
    article: {
      ...input.article,
      title: "",
      unexpected: "não permitido",
    },
  } as unknown as PersistNewsroomArticleInput;

  const result = await createNewsroomArticlePersistence(transport)(invalidInput);

  assertCompleteFailure(result);
  if (!result.ok) {
    assert.equal(result.error.code, "input_invalid");
    assert.equal(result.error.stage, "validation");
  }
  assert.equal(transport.calls.length, 0);
});

test("rejeita fonte não registada localmente antes da RPC", async () => {
  const transport = new FakeNewsroomTransport();
  const input = validInput();
  const result = await createNewsroomArticlePersistence(transport)({
    ...input,
    article: {
      ...input.article,
      sourceCode: "fonte-desconhecida",
    },
  });

  assertCompleteFailure(result);
  if (!result.ok) {
    assert.equal(result.error.code, "source_not_found");
    assert.equal(result.error.stage, "validation");
  }
  assert.equal(transport.calls.length, 0);
});

test("mapeia created/created com exatamente uma chamada RPC", async () => {
  const transport = new FakeNewsroomTransport();
  transport.response = rpcResponse("created", "created");

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Era esperado sucesso.");
  }
  assert.deepEqual(result.value, {
    complete: true,
    article: { id: ARTICLE_ID, action: "created" },
    snapshot: { id: SNAPSHOT_ID, action: "created" },
  });
  assert.equal(transport.calls.length, 1);
});

test("mapeia reused/reused com exatamente uma chamada RPC", async () => {
  const transport = new FakeNewsroomTransport();
  transport.response = rpcResponse("reused", "reused");

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Era esperado sucesso.");
  }
  assert.equal(result.value.article.action, "reused");
  assert.equal(result.value.snapshot.action, "reused");
  assert.equal(transport.calls.length, 1);
});

test("mapeia updated/created com exatamente uma chamada RPC", async () => {
  const transport = new FakeNewsroomTransport();
  transport.response = rpcResponse("updated", "created");

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Era esperado sucesso.");
  }
  assert.equal(result.value.article.action, "updated");
  assert.equal(result.value.snapshot.action, "created");
  assert.equal(transport.calls.length, 1);
});

test("usa o nome exato da RPC e mapeia todos os parâmetros tipados", async () => {
  const transport = new FakeNewsroomTransport();
  const input = validInput();

  await createNewsroomArticlePersistence(transport)(input);

  assert.equal(transport.calls.length, 1);
  assert.equal(
    transport.calls[0]?.functionName,
    "newsroom_persist_article_snapshot",
  );
  assert.equal(
    transport.calls[0]?.functionName,
    NEWSROOM_PERSISTENCE_RPC_NAME,
  );
  assert.deepEqual(transport.calls[0]?.argumentsValue, {
    p_source_code: input.article.sourceCode,
    p_original_url: input.article.originalUrl,
    p_normalized_url: input.article.normalizedUrl,
    p_external_id: input.article.externalId,
    p_title: input.article.title,
    p_subtitle: input.article.subtitle,
    p_summary: input.article.summary,
    p_author: input.article.author,
    p_published_at: input.article.publishedAt,
    p_modified_at: input.article.modifiedAt,
    p_detected_at: input.article.detectedAt,
    p_image_url: input.article.imageUrl,
    p_processing_status: input.article.processingStatus,
    p_content_hash: input.snapshot.contentHash,
    p_body: input.snapshot.body,
    p_source_metadata: input.snapshot.sourceMetadata,
    p_extracted_at: input.snapshot.extractedAt,
  });
});

test("mapeia source_not_found deliberado devolvido pela RPC", async () => {
  const transport = new FakeNewsroomTransport();
  transport.error = rpcError("source_not_found", "validation");

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assertCompleteFailure(result);
  if (!result.ok) {
    assert.equal(result.error.code, "source_not_found");
    assert.equal(result.error.stage, "validation");
  }
  assert.equal(transport.calls.length, 1);
});

test("mapeia persistence_conflict e preserva o estágio do snapshot", async () => {
  const transport = new FakeNewsroomTransport();
  transport.error = rpcError("persistence_conflict", "snapshot");

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assertCompleteFailure(result);
  if (!result.ok) {
    assert.equal(result.error.code, "persistence_conflict");
    assert.equal(result.error.stage, "snapshot");
  }
  assert.equal(transport.calls.length, 1);
});

test("mapeia input_invalid deliberado devolvido pela RPC", async () => {
  const transport = new FakeNewsroomTransport();
  transport.error = rpcError("input_invalid", "validation");

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assertCompleteFailure(result);
  if (!result.ok) {
    assert.equal(result.error.code, "input_invalid");
    assert.equal(result.error.stage, "validation");
  }
  assert.equal(transport.calls.length, 1);
});

test("converte erro inesperado em persistence_unavailable sem expor detalhes", async () => {
  const transport = new FakeNewsroomTransport();
  transport.error = new Error("segredo interno sintético");

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assertCompleteFailure(result);
  if (!result.ok) {
    assert.equal(result.error.code, "persistence_unavailable");
    assert.equal(result.error.stage, "article");
    assert.doesNotMatch(result.error.message, /segredo interno sintético/);
  }
  assert.equal(transport.calls.length, 1);
});

test("recusa persistência não configurada sem chamar a RPC", async () => {
  const transport = new FakeNewsroomTransport();
  transport.configured = false;

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assertCompleteFailure(result);
  if (!result.ok) {
    assert.equal(result.error.code, "persistence_unavailable");
  }
  assert.equal(transport.calls.length, 0);
});

test("recusa retorno RPC fora do contrato como persistence_unavailable", async () => {
  const transport = new FakeNewsroomTransport();
  transport.response = [{
    article_id: ARTICLE_ID,
    snapshot_id: SNAPSHOT_ID,
    article_action: "created",
    snapshot_action: "created",
    unexpected: true,
  }];

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assertCompleteFailure(result);
  if (!result.ok) {
    assert.equal(result.error.code, "persistence_unavailable");
  }
  assert.equal(transport.calls.length, 1);
});

test("a implementação não contém operações diretas nas tabelas newsroom", async () => {
  const internalSource = await readFile(
    new URL("./newsroom-article-persistence-internal.ts", import.meta.url),
    "utf8",
  );
  const publicSource = await readFile(
    new URL("./newsroom-article-persistence.ts", import.meta.url),
    "utf8",
  );
  const implementationSource = `${internalSource}\n${publicSource}`;

  assert.doesNotMatch(
    implementationSource,
    /newsroom_articles\?|newsroom_article_snapshots\?/,
  );
  assert.doesNotMatch(implementationSource, /method:\s*["'](?:PATCH|DELETE)["']/);
  assert.match(publicSource, /`rpc\/\$\{functionName\}`/);
  assert.match(publicSource, /method:\s*"POST"/);
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

test("a fronteira pública continua server-only e sem dependências client", async () => {
  const persistenceModuleUrl = new URL(
    "./newsroom-article-persistence.ts",
    import.meta.url,
  );
  const persistenceSource = await readFile(persistenceModuleUrl, "utf8");
  assert.match(persistenceSource, /^import "server-only";/);
  assert.doesNotMatch(persistenceSource, /^\s*["']use client["'];/m);
  assert.doesNotMatch(persistenceSource, /@\/(?:app|components)\//);

  const rootUrl = new URL("../../", import.meta.url);
  const sourceFiles = (
    await Promise.all([
      listSourceFiles(new URL("app/", rootUrl)),
      listSourceFiles(new URL("components/", rootUrl)),
      listSourceFiles(new URL("lib/", rootUrl)),
    ])
  ).flat();

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");
    if (/^\s*["']use client["'];/m.test(source)) {
      assert.doesNotMatch(
        source,
        /newsroom-article-persistence(?:-internal)?/,
        `Um módulo client importa a persistência: ${sourceFile.pathname}`,
      );
    }
  }
});
