import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test, after, before } from "node:test";

import {
  createNewsroomArticlePersistence,
  type NewsroomPersistenceTransport,
  type PersistNewsroomArticleInput,
} from "@/lib/redacao-automatica/newsroom-article-persistence-internal";

type FakeArticleRow = {
  id: string;
  source_code: string;
  original_url: string;
  normalized_url: string;
  external_id: string | null;
  title: string;
  subtitle: string | null;
  summary: string | null;
  author: string | null;
  published_at: string | null;
  modified_at: string | null;
  detected_at: string;
  image_url: string | null;
  processing_status: string;
  first_detected_at: string;
  last_detected_at: string;
  created_at: string;
  updated_at: string;
};

type FakeSnapshotRow = {
  id: string;
  article_id: string;
  content_hash: string;
  body: unknown;
  source_metadata: unknown;
  extracted_at: string;
  created_at: string;
};

type FakeWriteCall = Readonly<{
  path: string;
  method: string;
  body: Record<string, unknown>;
}>;

const CREATED_AT = "2026-07-24T12:00:00.000Z";
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

function articleKey(sourceCode: string, normalizedUrl: string): string {
  return `${sourceCode}\u0000${normalizedUrl}`;
}

function snapshotKey(articleId: string, contentHash: string): string {
  return `${articleId}\u0000${contentHash}`;
}

function requestBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string") {
    throw new Error("O fake esperava um body JSON serializado.");
  }

  return JSON.parse(init.body) as Record<string, unknown>;
}

function filterValue(path: string, name: string): string | null {
  const url = new URL(path, "https://persistence.test.invalid/");
  const value = url.searchParams.get(name);
  return value?.startsWith("eq.") ? value.slice(3) : value;
}

class FakeNewsroomTransport implements NewsroomPersistenceTransport {
  readonly articles = new Map<string, FakeArticleRow>();
  readonly snapshots = new Map<string, FakeSnapshotRow>();
  readonly reads: string[] = [];
  readonly writes: FakeWriteCall[] = [];
  configured = true;
  failArticleWrite = false;
  failSnapshotWrite = false;
  articleInsertConflictCount = 0;
  private articleSequence = 0;
  private snapshotSequence = 0;

  isConfigured(): boolean {
    return this.configured;
  }

  isUnavailableError(error: unknown): boolean {
    return error instanceof TypeError;
  }

  async readRows<T>(path: string): Promise<T[]> {
    this.reads.push(path);

    if (path.startsWith("newsroom_articles?")) {
      const sourceCode = filterValue(path, "source_code");
      const normalizedUrl = filterValue(path, "normalized_url");
      if (!sourceCode || !normalizedUrl) {
        return [];
      }

      const row = this.articles.get(articleKey(sourceCode, normalizedUrl));
      return (row ? [row] : []) as unknown as T[];
    }

    if (path.startsWith("newsroom_article_snapshots?")) {
      const articleId = filterValue(path, "article_id");
      const contentHash = filterValue(path, "content_hash");
      if (!articleId || !contentHash) {
        return [];
      }

      const row = this.snapshots.get(snapshotKey(articleId, contentHash));
      return (row ? [row] : []) as unknown as T[];
    }

    throw new Error(`Leitura inesperada no fake: ${path}`);
  }

  async writeRows<T>(path: string, init: RequestInit): Promise<T[]> {
    const method = init.method ?? "GET";
    const body = requestBody(init);
    this.writes.push({ path, method, body });

    if (path.startsWith("newsroom_articles?") && method === "POST") {
      if (this.failArticleWrite) {
        throw new Error("Falha sintética de artigo.");
      }

      const sourceCode = body.source_code as string;
      const normalizedUrl = body.normalized_url as string;
      const key = articleKey(sourceCode, normalizedUrl);
      if (this.articles.has(key)) {
        this.articleInsertConflictCount += 1;
        return [];
      }

      const row = this.createArticleRow(body);
      this.articles.set(key, row);
      return [row] as unknown as T[];
    }

    if (path.startsWith("newsroom_articles?") && method === "PATCH") {
      if (this.failArticleWrite) {
        throw new Error("Falha sintética de atualização de artigo.");
      }

      const sourceCode = filterValue(path, "source_code");
      const normalizedUrl = filterValue(path, "normalized_url");
      const id = filterValue(path, "id");
      if (!sourceCode || !normalizedUrl || !id) {
        return [];
      }

      const key = articleKey(sourceCode, normalizedUrl);
      const current = this.articles.get(key);
      if (!current || current.id !== id) {
        return [];
      }

      const updated = {
        ...current,
        ...body,
        updated_at: CREATED_AT,
      } as FakeArticleRow;
      this.articles.set(key, updated);
      return [updated] as unknown as T[];
    }

    if (
      path.startsWith("newsroom_article_snapshots?")
      && method === "POST"
    ) {
      if (this.failSnapshotWrite) {
        throw new Error("Falha sintética de snapshot.");
      }

      const articleId = body.article_id as string;
      const contentHash = body.content_hash as string;
      const key = snapshotKey(articleId, contentHash);
      if (this.snapshots.has(key)) {
        return [];
      }

      const row = this.createSnapshotRow(body);
      this.snapshots.set(key, row);
      return [row] as unknown as T[];
    }

    throw new Error(`Escrita inesperada no fake: ${method} ${path}`);
  }

  seedArticle(
    input: PersistNewsroomArticleInput,
    overrides: Partial<FakeArticleRow> = {},
  ): FakeArticleRow {
    const article = input.article;
    const row: FakeArticleRow = {
      id: this.nextArticleId(),
      source_code: article.sourceCode,
      original_url: article.originalUrl,
      normalized_url: article.normalizedUrl,
      external_id: article.externalId,
      title: article.title,
      subtitle: article.subtitle,
      summary: article.summary,
      author: article.author,
      published_at: article.publishedAt,
      modified_at: article.modifiedAt,
      detected_at: article.detectedAt,
      image_url: article.imageUrl,
      processing_status: article.processingStatus,
      first_detected_at: article.detectedAt,
      last_detected_at: article.detectedAt,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
      ...overrides,
    };
    this.articles.set(
      articleKey(row.source_code, row.normalized_url),
      row,
    );
    return row;
  }

  seedSnapshot(
    articleId: string,
    input: PersistNewsroomArticleInput,
  ): FakeSnapshotRow {
    const row: FakeSnapshotRow = {
      id: this.nextSnapshotId(),
      article_id: articleId,
      content_hash: input.snapshot.contentHash,
      body: input.snapshot.body,
      source_metadata: input.snapshot.sourceMetadata,
      extracted_at: input.snapshot.extractedAt,
      created_at: CREATED_AT,
    };
    this.snapshots.set(
      snapshotKey(row.article_id, row.content_hash),
      row,
    );
    return row;
  }

  private createArticleRow(body: Record<string, unknown>): FakeArticleRow {
    return {
      id: this.nextArticleId(),
      source_code: body.source_code as string,
      original_url: body.original_url as string,
      normalized_url: body.normalized_url as string,
      external_id: body.external_id as string | null,
      title: body.title as string,
      subtitle: body.subtitle as string | null,
      summary: body.summary as string | null,
      author: body.author as string | null,
      published_at: body.published_at as string | null,
      modified_at: body.modified_at as string | null,
      detected_at: body.detected_at as string,
      image_url: body.image_url as string | null,
      processing_status: body.processing_status as string,
      first_detected_at: body.first_detected_at as string,
      last_detected_at: body.last_detected_at as string,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    };
  }

  private createSnapshotRow(body: Record<string, unknown>): FakeSnapshotRow {
    return {
      id: this.nextSnapshotId(),
      article_id: body.article_id as string,
      content_hash: body.content_hash as string,
      body: body.body,
      source_metadata: body.source_metadata,
      extracted_at: body.extracted_at as string,
      created_at: CREATED_AT,
    };
  }

  private nextArticleId(): string {
    this.articleSequence += 1;
    return `00000000-0000-4000-8000-${String(this.articleSequence).padStart(12, "0")}`;
  }

  private nextSnapshotId(): string {
    this.snapshotSequence += 1;
    return `00000000-0000-4000-9000-${String(this.snapshotSequence).padStart(12, "0")}`;
  }
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

test("rejeita input inválido e propriedades arbitrárias antes da base de dados", async () => {
  const transport = new FakeNewsroomTransport();
  const persist = createNewsroomArticlePersistence(transport);
  const input = validInput();
  const invalidInput = {
    ...input,
    article: {
      ...input.article,
      title: "",
      unexpected: "não permitido",
    },
  } as unknown as PersistNewsroomArticleInput;

  const result = await persist(invalidInput);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "input_invalid");
    assert.equal(result.error.article, null);
  }
  assert.equal(transport.reads.length, 0);
  assert.equal(transport.writes.length, 0);
});

test("devolve source_not_found sem tocar na base de dados", async () => {
  const transport = new FakeNewsroomTransport();
  const persist = createNewsroomArticlePersistence(transport);
  const input = validInput();
  const result = await persist({
    ...input,
    article: {
      ...input.article,
      sourceCode: "fonte-desconhecida",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "source_not_found");
  }
  assert.equal(transport.reads.length, 0);
  assert.equal(transport.writes.length, 0);
});

test("cria um artigo inexistente e o respetivo snapshot", async () => {
  const transport = new FakeNewsroomTransport();
  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Era esperado sucesso.");
  }

  assert.equal(result.value.complete, true);
  assert.equal(result.value.article.action, "created");
  assert.equal(result.value.snapshot.action, "created");
  assert.equal(transport.articles.size, 1);
  assert.equal(transport.snapshots.size, 1);
});

test("reutiliza artigo existente e cria apenas um snapshot novo", async () => {
  const transport = new FakeNewsroomTransport();
  const input = validInput();
  const existing = transport.seedArticle(input);

  const result = await createNewsroomArticlePersistence(transport)(input);

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Era esperado sucesso.");
  }

  assert.deepEqual(result.value.article, {
    id: existing.id,
    action: "reused",
  });
  assert.equal(result.value.snapshot.action, "created");
  assert.equal(transport.articles.size, 1);
  assert.equal(transport.snapshots.size, 1);
});

test("atualiza apenas metadados mutáveis sem alterar a identidade canónica", async () => {
  const transport = new FakeNewsroomTransport();
  const input = validInput();
  const existing = transport.seedArticle(input);
  const newerInput: PersistNewsroomArticleInput = {
    ...input,
    article: {
      ...input.article,
      originalUrl: "https://www.record.pt/futebol/noticia-controlada?origem=capa",
      title: "Título normalizado atualizado",
      detectedAt: "2026-07-24T11:05:00.000Z",
    },
    snapshot: {
      ...input.snapshot,
      contentHash: "hash-controlado-002",
      extractedAt: "2026-07-24T11:06:00.000Z",
    },
  };

  const result = await createNewsroomArticlePersistence(transport)(newerInput);
  const persisted = transport.articles.get(
    articleKey(input.article.sourceCode, input.article.normalizedUrl),
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Era esperado sucesso.");
  }

  assert.equal(result.value.article.action, "updated");
  assert.equal(persisted?.id, existing.id);
  assert.equal(persisted?.source_code, input.article.sourceCode);
  assert.equal(persisted?.normalized_url, input.article.normalizedUrl);
  assert.equal(persisted?.original_url, input.article.originalUrl);
  assert.equal(persisted?.first_detected_at, input.article.detectedAt);
  assert.equal(persisted?.title, newerInput.article.title);
  assert.equal(persisted?.last_detected_at, newerInput.article.detectedAt);
});

test("reutiliza snapshot repetido sem o atualizar nem duplicar", async () => {
  const transport = new FakeNewsroomTransport();
  const input = validInput();
  const article = transport.seedArticle(input);
  const snapshot = transport.seedSnapshot(article.id, input);

  const result = await createNewsroomArticlePersistence(transport)(input);

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Era esperado sucesso.");
  }

  assert.deepEqual(result.value.snapshot, {
    id: snapshot.id,
    action: "reused",
  });
  assert.equal(transport.snapshots.size, 1);
  assert.equal(
    transport.writes.filter(
      (call) =>
        call.path.startsWith("newsroom_article_snapshots?")
        && call.method !== "POST",
    ).length,
    0,
  );
});

test("converte o conflito da constraint de artigo em reutilização idempotente", async () => {
  const transport = new FakeNewsroomTransport();
  const input = validInput();
  const existing = transport.seedArticle(input);

  const result = await createNewsroomArticlePersistence(transport)(input);

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Era esperado sucesso.");
  }

  assert.equal(transport.articleInsertConflictCount, 1);
  assert.equal(result.value.article.id, existing.id);
  assert.equal(result.value.article.action, "reused");
  assert.equal(
    transport.reads.filter((path) => path.startsWith("newsroom_articles?")).length,
    1,
  );
});

test("uma falha de artigo não tenta criar o snapshot e devolve erro controlado", async () => {
  const transport = new FakeNewsroomTransport();
  transport.failArticleWrite = true;

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "article_write_failed");
    assert.equal(result.error.article, null);
    assert.equal(result.error.operationIncomplete, false);
  }
  assert.equal(
    transport.writes.some((call) =>
      call.path.startsWith("newsroom_article_snapshots?")),
    false,
  );
});

test("uma falha de snapshot expõe que o artigo já foi persistido", async () => {
  const transport = new FakeNewsroomTransport();
  transport.failSnapshotWrite = true;

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "snapshot_write_failed");
    assert.equal(result.error.article?.action, "created");
    assert.equal(result.error.operationIncomplete, true);
  }
  assert.equal(transport.articles.size, 1);
  assert.equal(transport.snapshots.size, 0);
});

test("distingue persistência indisponível sem iniciar uma escrita", async () => {
  const transport = new FakeNewsroomTransport();
  transport.configured = false;

  const result = await createNewsroomArticlePersistence(transport)(validInput());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "persistence_unavailable");
  }
  assert.equal(transport.reads.length, 0);
  assert.equal(transport.writes.length, 0);
});

async function listSourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: URL[] = [];

  for (const entry of entries) {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(child));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(child);
    }
  }

  return files;
}

test("a fronteira pública é server-only e nenhum módulo client a importa", async () => {
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
