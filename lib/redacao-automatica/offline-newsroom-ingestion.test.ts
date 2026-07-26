import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import type { SourceAdapter } from "@/lib/redacao-automatica/adapters/source-adapter";
import { createAvailableAdapterRegistry } from "@/lib/redacao-automatica/available-adapter-registry";
import { normalizeUrl } from "@/lib/redacao-automatica/normalization";
import {
  canonicalizeJson,
  createOfflineNewsroomIngestion,
  sha256CanonicalJson,
  type IngestOfflineNewsroomArticleInput,
  type IngestOfflineNewsroomArticleResult,
  type OfflineNewsroomIngestionErrorCode,
} from "@/lib/redacao-automatica/offline-newsroom-ingestion-internal";
import type {
  NewsroomPersistenceError,
  NewsroomPersistenceErrorCode,
  PersistNewsroomArticleInput,
  PersistNewsroomArticleResult,
} from "@/lib/redacao-automatica/newsroom-article-persistence";
import { registeredSourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import type {
  AdapterResult,
  CollectionError,
  NormalizedDetectedArticle,
  OperationResult,
  SourceConfiguration,
} from "@/lib/redacao-automatica/types";

const DETECTED_AT = "2026-07-25T10:00:00.000Z";
const EXTRACTED_AT = "2026-07-25T10:01:00.000Z";
const ARTICLE_URL = "https://fixture.invalid/noticias/artigo-local";
const ARTICLE_ID = "11111111-1111-4111-8111-111111111111";
const SNAPSHOT_ID = "22222222-2222-4222-8222-222222222222";
const RECORD_URL =
  "https://www.record.pt/futebol/futebol-nacional/liga-betclic/porto/detalhe/artigo-minimo";
const ABOLA_URL =
  "https://www.abola.pt/noticias/artigo-minimo-9876543210987654321";

function source(
  overrides: Partial<SourceConfiguration> = {},
): SourceConfiguration {
  return {
    code: "fixture",
    name: "Fixture",
    domain: "fixture.invalid",
    homepage: "https://fixture.invalid/",
    adapterKey: "fixture",
    operationalStatus: "paused",
    monitoringEnabled: false,
    manualCollectionEnabled: false,
    inactiveReason: "Operação externa inativa.",
    legalNote: null,
    editorialNote: "Fonte sintética para testes locais.",
    displayOrder: 1,
    ...overrides,
  };
}

function validArticle(
  overrides: Partial<NormalizedDetectedArticle> = {},
): NormalizedDetectedArticle {
  return {
    sourceCode: "fixture",
    originalUrl: ARTICLE_URL,
    normalizedUrl: ARTICLE_URL,
    externalId: "fixture-001",
    title: "Título sintético",
    subtitle: "Subtítulo sintético",
    summary: "Resumo sintético",
    author: "Autor Sintético",
    publishedAt: "2026-07-25T08:00:00.000Z",
    modifiedAt: "2026-07-25T09:00:00.000Z",
    detectedAt: DETECTED_AT,
    imageUrl: "https://assets.example.invalid/image.jpg",
    excerpt: null,
    body: [
      {
        type: "paragraph",
        text: "Corpo editorial exclusivamente sintético para o teste local.",
      },
    ],
    processingStatus: "detected",
    sourceMetadata: {
      parser: "fixture-article-v1",
      fixture: true,
    },
    ...overrides,
  };
}

function validInput(
  overrides: Partial<IngestOfflineNewsroomArticleInput> = {},
): IngestOfflineNewsroomArticleInput {
  return {
    sourceCode: "fixture",
    originalUrl: ARTICLE_URL,
    html: "<html><body><article>Fixture sintética</article></body></html>",
    detectedAt: DETECTED_AT,
    extractedAt: EXTRACTED_AT,
    ...overrides,
  };
}

function persistenceSuccess(
  articleAction: "created" | "reused" | "updated" = "created",
  snapshotAction: "created" | "reused" = "created",
): PersistNewsroomArticleResult {
  return {
    ok: true,
    value: {
      complete: true,
      article: {
        id: ARTICLE_ID,
        action: articleAction,
      },
      snapshot: {
        id: SNAPSHOT_ID,
        action: snapshotAction,
      },
    },
  };
}

function persistenceFailure(
  code: NewsroomPersistenceErrorCode = "persistence_unavailable",
): PersistNewsroomArticleResult {
  const error: NewsroomPersistenceError = {
    code,
    stage: "article",
    message: "Mensagem controlada.",
    article: null,
    operationIncomplete: false,
  };
  return { ok: false, error };
}

function collectionError(
  code: CollectionError["code"],
  sourceCode: string | null = "fixture",
): CollectionError {
  return {
    code,
    stage: "configuration",
    sourceCode,
    url: null,
    recoverable: false,
    detail: "Detalhe sintético.",
  };
}

type HarnessOptions = Readonly<{
  sourceResult?: OperationResult<SourceConfiguration, CollectionError>;
  adapterResult?: OperationResult<SourceAdapter, CollectionError>;
  parse?: (
    input: Parameters<NonNullable<SourceAdapter["extractArticle"]>>[0],
  ) => AdapterResult<NormalizedDetectedArticle>;
  persistence?: (
    input: PersistNewsroomArticleInput,
  ) => Promise<PersistNewsroomArticleResult>;
}>;

function createHarness(options: HarnessOptions = {}) {
  let sourceProviderCalls = 0;
  let adapterRegistryCalls = 0;
  let parserCalls = 0;
  let persistenceCalls = 0;
  const persistenceInputs: PersistNewsroomArticleInput[] = [];

  const adapter: SourceAdapter = {
    key: "fixture",
    sourceCode: "fixture",
    getListingUrls(configuration) {
      return { ok: true, value: [configuration.homepage] };
    },
    discoverArticleLinks() {
      return { ok: true, value: [] };
    },
    normalizeArticleUrl({ source: configuration, url }) {
      return normalizeUrl({
        url,
        allowedDomain: configuration.domain,
        sourceCode: configuration.code,
      });
    },
    extractArticle(input) {
      parserCalls += 1;
      return options.parse
        ? options.parse(input)
        : { ok: true, value: validArticle() };
    },
  };

  const sourceResult = options.sourceResult ?? {
    ok: true as const,
    value: source(),
  };
  const adapterResult = options.adapterResult ?? {
    ok: true as const,
    value: adapter,
  };

  const ingest = createOfflineNewsroomIngestion({
    sourceProvider: {
      async findByCode() {
        sourceProviderCalls += 1;
        return sourceResult;
      },
    },
    adapterRegistry: {
      resolve() {
        adapterRegistryCalls += 1;
        return adapterResult;
      },
      keys() {
        return adapterResult.ok ? [adapterResult.value.key] : [];
      },
    },
    async persistArticle(input) {
      persistenceCalls += 1;
      persistenceInputs.push(input);
      return options.persistence
        ? options.persistence(input)
        : persistenceSuccess();
    },
  });

  return {
    ingest,
    calls() {
      return {
        sourceProvider: sourceProviderCalls,
        adapterRegistry: adapterRegistryCalls,
        parser: parserCalls,
        persistence: persistenceCalls,
      };
    },
    persistenceInputs,
  };
}

function expectFailure(
  result: IngestOfflineNewsroomArticleResult,
  code: OfflineNewsroomIngestionErrorCode,
) {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error(`Era esperado o erro controlado "${code}".`);
  }

  assert.equal(result.error.code, code);
  assert.equal(result.error.operationIncomplete, false);
  assert.doesNotMatch(result.error.message, /<html|postgres|stack|sql/i);
  return result.error;
}

test("rejeita inputs inválidos antes de fonte, parser e persistência", async () => {
  const invalidInputs: readonly IngestOfflineNewsroomArticleInput[] = [
    validInput({ html: "   " }),
    validInput({ sourceCode: "   " }),
    validInput({ originalUrl: "url-inválida" }),
    validInput({ detectedAt: "data-inválida" }),
    validInput({ extractedAt: "data-inválida" }),
    {
      ...validInput(),
      campoDesconhecido: true,
    } as unknown as IngestOfflineNewsroomArticleInput,
  ];

  for (const input of invalidInputs) {
    const harness = createHarness();
    expectFailure(await harness.ingest(input), "input_invalid");
    assert.deepEqual(harness.calls(), {
      sourceProvider: 0,
      adapterRegistry: 0,
      parser: 0,
      persistence: 0,
    });
  }
});

test("usa detectedAt como extractedAt quando o instante distinto não é fornecido", async () => {
  const harness = createHarness();
  const input = {
    sourceCode: "fixture",
    originalUrl: ARTICLE_URL,
    html: "<article>Fixture sintética</article>",
    detectedAt: DETECTED_AT,
  } satisfies IngestOfflineNewsroomArticleInput;

  const result = await harness.ingest(input);
  assert.equal(result.ok, true);
  assert.equal(harness.persistenceInputs[0]?.snapshot.extractedAt, DETECTED_AT);
});

test("devolve source_not_found sem resolver adaptador ou persistir", async () => {
  const harness = createHarness({
    sourceResult: {
      ok: false,
      error: collectionError("source_not_found", "inexistente"),
    },
  });

  expectFailure(
    await harness.ingest(validInput({ sourceCode: "inexistente" })),
    "source_not_found",
  );
  assert.deepEqual(harness.calls(), {
    sourceProvider: 1,
    adapterRegistry: 0,
    parser: 0,
    persistence: 0,
  });
});

for (const blockedSource of [
  {
    status: "legal_hold",
    expected: "legal_hold",
  },
  {
    status: "disabled",
    expected: "source_forbidden",
  },
] as const) {
  test(`bloqueia genericamente uma fonte ${blockedSource.status} antes do adaptador`, async () => {
    const harness = createHarness({
      sourceResult: {
        ok: true,
        value: source({ operationalStatus: blockedSource.status }),
      },
    });

    expectFailure(await harness.ingest(validInput()), blockedSource.expected);
    assert.deepEqual(harness.calls(), {
      sourceProvider: 1,
      adapterRegistry: 0,
      parser: 0,
      persistence: 0,
    });
  });
}

test("rejeita fonte sem capacidade offline antes do registry de adaptadores", async () => {
  const harness = createHarness({
    sourceResult: {
      ok: true,
      value: source({ adapterKey: null }),
    },
  });

  expectFailure(await harness.ingest(validInput()), "offline_not_supported");
  assert.deepEqual(harness.calls(), {
    sourceProvider: 1,
    adapterRegistry: 0,
    parser: 0,
    persistence: 0,
  });
});

test("devolve adapter_unavailable quando a chave configurada não resolve", async () => {
  const harness = createHarness({
    adapterResult: {
      ok: false,
      error: collectionError("adapter_missing"),
    },
  });

  expectFailure(await harness.ingest(validInput()), "adapter_unavailable");
  assert.deepEqual(harness.calls(), {
    sourceProvider: 1,
    adapterRegistry: 1,
    parser: 0,
    persistence: 0,
  });
});

test("rejeita adaptador sem extractArticle como capacidade offline ausente", async () => {
  const adapterWithoutExtraction: SourceAdapter = {
    key: "fixture",
    sourceCode: "fixture",
    getListingUrls() {
      return { ok: true, value: [] };
    },
    discoverArticleLinks() {
      return { ok: true, value: [] };
    },
    normalizeArticleUrl() {
      return { ok: true, value: ARTICLE_URL };
    },
  };
  const harness = createHarness({
    adapterResult: {
      ok: true,
      value: adapterWithoutExtraction,
    },
  });

  expectFailure(await harness.ingest(validInput()), "offline_not_supported");
  assert.equal(harness.calls().persistence, 0);
});

test("analisa HTML local e chama a persistência exatamente uma vez", async () => {
  const harness = createHarness();
  const result = await harness.ingest(validInput());

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Era esperado sucesso.");
  }

  assert.deepEqual(harness.calls(), {
    sourceProvider: 1,
    adapterRegistry: 1,
    parser: 1,
    persistence: 1,
  });
  assert.equal(result.value.article.action, "created");
  assert.equal(result.value.snapshot.action, "created");
  assert.match(result.value.contentHash, /^[0-9a-f]{64}$/);
});

test("transforma falha e exceção do parser em erro controlado", async () => {
  const failedHarness = createHarness({
    parse() {
      return {
        ok: false,
        error: {
          ...collectionError("parse_failed"),
          stage: "article",
        },
      };
    },
  });
  expectFailure(
    await failedHarness.ingest(validInput()),
    "parsing_failed",
  );
  assert.equal(failedHarness.calls().persistence, 0);

  const thrownHarness = createHarness({
    parse() {
      throw new Error("stack e HTML completo não podem escapar");
    },
  });
  const thrownError = expectFailure(
    await thrownHarness.ingest(validInput()),
    "parsing_failed",
  );
  assert.doesNotMatch(thrownError.message, /stack|html completo/i);
  assert.equal(thrownHarness.calls().persistence, 0);
});

test("rejeita artigo incompleto antes da persistência", async () => {
  const harness = createHarness({
    parse() {
      return {
        ok: true,
        value: validArticle({ title: " " }),
      };
    },
  });

  expectFailure(
    await harness.ingest(validInput()),
    "normalized_article_invalid",
  );
  assert.equal(harness.calls().persistence, 0);
});

test("mapeia o contrato de persistência e acrescenta proveniência offline", async () => {
  const harness = createHarness({
    parse() {
      return {
        ok: true,
        value: validArticle({
          externalId: " external-002 ",
          subtitle: " Subtítulo com espaços ",
          summary: null,
          author: " Autor Local ",
          body: [
            {
              type: "heading",
              text: " Secção sintética ",
            },
            {
              type: "paragraph",
              text: " Texto   local com espaços normalizados. ",
            },
          ],
          sourceMetadata: {
            zeta: true,
            parser: "fixture-article-v2",
            loadedAt: EXTRACTED_AT,
            nested: {
              loadedAt: "valor-aninhado-preservado",
            },
          },
        }),
      };
    },
  });

  const result = await harness.ingest(validInput());
  assert.equal(result.ok, true);
  const persisted = harness.persistenceInputs[0];
  assert.ok(persisted);
  assert.deepEqual(persisted.article, {
    sourceCode: "fixture",
    originalUrl: ARTICLE_URL,
    normalizedUrl: ARTICLE_URL,
    externalId: "external-002",
    title: "Título sintético",
    subtitle: "Subtítulo com espaços",
    summary: null,
    author: "Autor Local",
    publishedAt: "2026-07-25T08:00:00.000Z",
    modifiedAt: "2026-07-25T09:00:00.000Z",
    detectedAt: DETECTED_AT,
    imageUrl: "https://assets.example.invalid/image.jpg",
    processingStatus: "detected",
  });
  assert.deepEqual(persisted.snapshot.body, [
    { type: "heading", text: "Secção sintética" },
    {
      type: "paragraph",
      text: "Texto local com espaços normalizados.",
    },
  ]);
  assert.equal(persisted.snapshot.extractedAt, EXTRACTED_AT);
  assert.equal(
    persisted.snapshot.sourceMetadata.ingestionMode,
    "offline_local_html",
  );
  assert.equal(persisted.snapshot.sourceMetadata.networkRequest, false);
  assert.equal(persisted.snapshot.sourceMetadata.sourceCode, "fixture");
  assert.equal(persisted.snapshot.sourceMetadata.adapterKey, "fixture");
  assert.equal(
    persisted.snapshot.sourceMetadata.originalUrl,
    ARTICLE_URL,
  );
  assert.equal(
    persisted.snapshot.sourceMetadata.normalizedUrl,
    ARTICLE_URL,
  );
  assert.equal(
    Object.hasOwn(persisted.snapshot.sourceMetadata, "loadedAt"),
    false,
  );
  assert.deepEqual(persisted.snapshot.sourceMetadata.nested, {
    loadedAt: "valor-aninhado-preservado",
  });
  assert.equal(
    JSON.stringify(persisted.snapshot.sourceMetadata).includes("<html"),
    false,
  );
});

test("canonicalização ordena objetos e SHA-256 é determinístico", () => {
  const first = {
    title: "Fixture",
    metadata: {
      zeta: true,
      alpha: 1,
    },
    body: [{ type: "paragraph", text: "Texto" }],
  } as const;
  const second = {
    body: [{ text: "Texto", type: "paragraph" }],
    metadata: {
      alpha: 1,
      zeta: true,
    },
    title: "Fixture",
  } as const;

  assert.equal(canonicalizeJson(first), canonicalizeJson(second));
  assert.equal(sha256CanonicalJson(first), sha256CanonicalJson(second));
  assert.notEqual(
    sha256CanonicalJson(first),
    sha256CanonicalJson({
      ...first,
      body: [{ type: "paragraph", text: "Texto alterado" }],
    }),
  );
  assert.match(sha256CanonicalJson(first), /^[0-9a-f]{64}$/);
});

test("o hash ignora instantes voláteis e muda com conteúdo editorial", async () => {
  const firstHarness = createHarness({
    parse() {
      return {
        ok: true,
        value: validArticle({
          sourceMetadata: {
            alpha: 1,
            zeta: true,
          },
        }),
      };
    },
  });
  const secondHarness = createHarness({
    parse() {
      return {
        ok: true,
        value: validArticle({
          sourceMetadata: {
            zeta: true,
            alpha: 1,
          },
        }),
      };
    },
  });
  const changedHarness = createHarness({
    parse() {
      return {
        ok: true,
        value: validArticle({
          body: [
            {
              type: "paragraph",
              text: "Conteúdo editorial diferente.",
            },
          ],
        }),
      };
    },
  });

  await firstHarness.ingest(validInput());
  await secondHarness.ingest(
    validInput({ extractedAt: "2026-07-25T11:00:00.000Z" }),
  );
  await changedHarness.ingest(validInput());

  const firstHash = firstHarness.persistenceInputs[0]?.snapshot.contentHash;
  const secondHash = secondHarness.persistenceInputs[0]?.snapshot.contentHash;
  const changedHash = changedHarness.persistenceInputs[0]?.snapshot.contentHash;
  assert.equal(firstHash, secondHash);
  assert.notEqual(firstHash, changedHash);
});

for (const outcome of [
  {
    article: "created",
    snapshot: "created",
  },
  {
    article: "reused",
    snapshot: "reused",
  },
  {
    article: "updated",
    snapshot: "created",
  },
] as const) {
  test(`propaga o resultado transacional ${outcome.article}/${outcome.snapshot}`, async () => {
    const harness = createHarness({
      async persistence() {
        return persistenceSuccess(outcome.article, outcome.snapshot);
      },
    });

    const result = await harness.ingest(validInput());
    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error("Era esperado sucesso.");
    }

    assert.equal(result.value.complete, true);
    assert.equal(result.value.article.action, outcome.article);
    assert.equal(result.value.snapshot.action, outcome.snapshot);
    assert.equal(harness.calls().persistence, 1);
  });
}

test("converte falha de persistência sem expor detalhes internos", async () => {
  const harness = createHarness({
    async persistence() {
      return persistenceFailure("persistence_unavailable");
    },
  });

  const error = expectFailure(
    await harness.ingest(validInput()),
    "persistence_failed",
  );
  assert.equal(error.persistenceCode, "persistence_unavailable");
  assert.equal(error.operationIncomplete, false);
  assert.equal(harness.calls().persistence, 1);
});

async function readFixture(relativePath: string): Promise<string> {
  return readFile(
    new URL(`./__fixtures__/${relativePath}`, import.meta.url),
    "utf8",
  );
}

test("integra offline as fixtures sintéticas de Record e A Bola", async () => {
  const registryResult = createAvailableAdapterRegistry();
  assert.equal(registryResult.ok, true);
  if (!registryResult.ok) {
    throw new Error("O registry de adaptadores não ficou disponível.");
  }

  const persistenceInputs: PersistNewsroomArticleInput[] = [];
  const ingest = createOfflineNewsroomIngestion({
    sourceProvider: registeredSourceConfigurationProvider,
    adapterRegistry: registryResult.value,
    async persistArticle(input) {
      persistenceInputs.push(input);
      return persistenceSuccess();
    },
  });

  const cases = [
    {
      sourceCode: "record",
      originalUrl: RECORD_URL,
      fixture: "record/article-valid-minimal.html",
      parser: "record-article-v1",
    },
    {
      sourceCode: "abola",
      originalUrl: ABOLA_URL,
      fixture: "abola/article-valid-minimal.html",
      parser: "abola-article-v1",
    },
  ] as const;

  for (const fixtureCase of cases) {
    const html = await readFixture(fixtureCase.fixture);
    const firstInputIndex = persistenceInputs.length;
    const results = [];

    for (const extractedAt of [
      EXTRACTED_AT,
      "2026-07-25T11:01:00.000Z",
    ]) {
      const result = await ingest({
        sourceCode: fixtureCase.sourceCode,
        originalUrl: fixtureCase.originalUrl,
        html,
        detectedAt: DETECTED_AT,
        extractedAt,
      });

      if (!result.ok) {
        throw new Error(
          `A fixture ${fixtureCase.fixture} falhou com ${result.error.code}.`,
        );
      }
      results.push(result.value);
    }

    const firstInput = persistenceInputs[firstInputIndex];
    const secondInput = persistenceInputs[firstInputIndex + 1];
    assert.ok(firstInput);
    assert.ok(secondInput);
    assert.equal(results.length, 2);
    assert.equal(results[0]?.sourceCode, fixtureCase.sourceCode);
    assert.match(results[0]?.contentHash ?? "", /^[0-9a-f]{64}$/);
    assert.equal(results[0]?.contentHash, results[1]?.contentHash);
    assert.deepEqual(
      firstInput.snapshot.sourceMetadata,
      secondInput.snapshot.sourceMetadata,
    );
    assert.equal(
      Object.hasOwn(firstInput.snapshot.sourceMetadata, "loadedAt"),
      false,
    );
    assert.equal(firstInput.snapshot.extractedAt, EXTRACTED_AT);
    assert.equal(
      secondInput.snapshot.extractedAt,
      "2026-07-25T11:01:00.000Z",
    );

    const metadata = firstInput.snapshot.sourceMetadata;
    assert.equal(metadata.ingestionMode, "offline_local_html");
    assert.equal(metadata.networkRequest, false);
    assert.equal(metadata.sourceCode, fixtureCase.sourceCode);
    assert.equal(metadata.adapterKey, fixtureCase.sourceCode);
    assert.equal(metadata.originalUrl, fixtureCase.originalUrl);
    assert.equal(metadata.normalizedUrl, fixtureCase.originalUrl);
    assert.equal(metadata.parser, fixtureCase.parser);
    assert.equal(metadata.statusCode, 200);
    assert.equal(metadata.redirectCount, 0);
    assert.equal(metadata.byteLength, Buffer.byteLength(html, "utf8"));
    assert.equal(JSON.stringify(metadata).includes("<html"), false);
  }

  assert.equal(persistenceInputs.length, cases.length * 2);
});

test("O Jogo permanece bloqueado e Maisfutebol não se torna operacional", async () => {
  const registryResult = createAvailableAdapterRegistry();
  assert.equal(registryResult.ok, true);
  if (!registryResult.ok) {
    throw new Error("O registry de adaptadores não ficou disponível.");
  }

  let persistenceCalls = 0;
  const ingest = createOfflineNewsroomIngestion({
    sourceProvider: registeredSourceConfigurationProvider,
    adapterRegistry: registryResult.value,
    async persistArticle() {
      persistenceCalls += 1;
      return persistenceSuccess();
    },
  });

  expectFailure(
    await ingest({
      sourceCode: "ojogo",
      originalUrl: "https://www.ojogo.pt/noticia-local",
      html: "<article>Conteúdo local não autorizado</article>",
      detectedAt: DETECTED_AT,
      extractedAt: EXTRACTED_AT,
    }),
    "legal_hold",
  );
  expectFailure(
    await ingest({
      sourceCode: "maisfutebol",
      originalUrl:
        "https://maisfutebol.iol.pt/futebol/liga/noticia-local",
      html: "<article>Conteúdo local sem parser de artigo</article>",
      detectedAt: DETECTED_AT,
      extractedAt: EXTRACTED_AT,
    }),
    "offline_not_supported",
  );
  assert.equal(persistenceCalls, 0);
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

test("a fronteira é server-only e o núcleo não contém rede nem fontes específicas", async () => {
  const publicSource = await readFile(
    new URL("./offline-newsroom-ingestion.ts", import.meta.url),
    "utf8",
  );
  const internalSource = await readFile(
    new URL("./offline-newsroom-ingestion-internal.ts", import.meta.url),
    "utf8",
  );
  const implementationSource = `${publicSource}\n${internalSource}`;

  assert.match(publicSource, /^import "server-only";/);
  assert.doesNotMatch(publicSource, /^\s*["']use client["'];/m);
  assert.doesNotMatch(implementationSource, /@\/(?:app|components)\//);
  assert.doesNotMatch(
    implementationSource,
    /\b(?:fetch|PageLoader|XMLHttpRequest|WebSocket)\b/,
  );
  assert.doesNotMatch(
    implementationSource,
    /node:(?:dns|http|https)|http-page-loader|page-loader/,
  );
  assert.doesNotMatch(
    implementationSource,
    /newsroom_articles|newsroom_article_snapshots|insert\s+into|delete\s+from/i,
  );
  assert.doesNotMatch(
    implementationSource,
    /["'](?:record|abola|maisfutebol|ojogo)["']/i,
  );
  assert.equal(
    internalSource.match(/await persistArticle\(persistenceInput\)/g)?.length,
    1,
  );
  assert.equal(
    internalSource.match(/dependencies\.persistArticle,/g)?.length,
    1,
  );

  const rootUrl = new URL("../../", import.meta.url);
  const sourceFiles = (
    await Promise.all([
      listSourceFiles(new URL("app/", rootUrl)),
      listSourceFiles(new URL("components/", rootUrl)),
      listSourceFiles(new URL("lib/", rootUrl)),
    ])
  ).flat();

  for (const sourceFile of sourceFiles) {
    const sourceText = await readFile(sourceFile, "utf8");
    if (/^\s*["']use client["'];/m.test(sourceText)) {
      assert.doesNotMatch(
        sourceText,
        /offline-newsroom-ingestion(?:-internal)?/,
        `Um módulo client importa o pipeline: ${sourceFile.pathname}`,
      );
    }
  }
});

test("as dependências injetadas não alargam o contrato público", async () => {
  const publicSource = await readFile(
    new URL("./offline-newsroom-ingestion.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    publicSource,
    /OfflineNewsroomIngestionDependencies/,
  );
  assert.doesNotMatch(publicSource, /\bany\b/);
  assert.match(
    publicSource,
    /export async function ingestOfflineNewsroomArticle\(/,
  );
});
