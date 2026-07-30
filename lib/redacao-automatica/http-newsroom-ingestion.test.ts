import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import type { SourceAdapter } from "@/lib/redacao-automatica/adapters/source-adapter";
import { createAvailableAdapterRegistry } from "@/lib/redacao-automatica/available-adapter-registry";
import {
  createHttpNewsroomIngestion,
  type IngestHttpNewsroomArticleInput,
  type IngestHttpNewsroomArticleResult,
} from "@/lib/redacao-automatica/http-newsroom-ingestion-internal";
import { normalizeUrl } from "@/lib/redacao-automatica/normalization";
import type {
  PersistNewsroomArticleInput,
  PersistNewsroomArticleResult,
} from "@/lib/redacao-automatica/newsroom-article-persistence";
import { resolveHttpPageLoaderPolicy } from "@/lib/redacao-automatica/page-loaders/http-page-loader-policy";
import { registeredSourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import { evaluateSourceExecution } from "@/lib/redacao-automatica/source-registry";
import type {
  CollectionError,
  LoadedPage,
  NormalizedDetectedArticle,
  SourceConfiguration,
  SourceExecutionMode,
} from "@/lib/redacao-automatica/types";

const DETECTED_AT = "2026-07-26T15:00:00.000Z";
const EXTRACTED_AT = "2026-07-26T15:01:00.000Z";
const LOADED_AT = "2026-07-26T15:00:30.000Z";
const RECORD_URL =
  "https://www.record.pt/futebol/futebol-nacional/liga-betclic/detalhe/teste-controlado";
const ABOLA_URL =
  "https://www.abola.pt/noticias/teste-controlado-1234567890123456789";
const ARTICLE_ID = "11111111-1111-4111-8111-111111111111";
const SNAPSHOT_ID = "22222222-2222-4222-8222-222222222222";

function input(
  overrides: Partial<IngestHttpNewsroomArticleInput> = {},
): IngestHttpNewsroomArticleInput {
  return {
    sourceCode: "record",
    articleUrl: RECORD_URL,
    detectedAt: DETECTED_AT,
    extractedAt: EXTRACTED_AT,
    ...overrides,
  };
}

function page(
  requestUrl = RECORD_URL,
  overrides: Partial<LoadedPage> = {},
): LoadedPage {
  return {
    requestedUrl: requestUrl,
    finalUrl: requestUrl,
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: "<html><body><article>HTML estritamente sintetico</article></body></html>",
    loadedAt: LOADED_AT,
    redirectCount: 0,
    byteLength: 72,
    ...overrides,
  };
}

function article(
  source: SourceConfiguration,
  loadedPage: LoadedPage,
  detectedAt: string,
  overrides: Partial<NormalizedDetectedArticle> = {},
): NormalizedDetectedArticle {
  return {
    sourceCode: source.code,
    originalUrl: loadedPage.requestedUrl,
    normalizedUrl: loadedPage.finalUrl,
    externalId: `${source.code}-fixture-1`,
    title: `Titulo sintetico ${source.name}`,
    subtitle: null,
    summary: "Resumo sintetico.",
    author: "Autor Sintetico",
    publishedAt: "2026-07-26T14:00:00.000Z",
    modifiedAt: null,
    detectedAt,
    imageUrl: null,
    excerpt: null,
    body: [
      {
        type: "paragraph",
        text: "Corpo editorial sintetico para validar a ingestao.",
      },
    ],
    processingStatus: "detected",
    sourceMetadata: {
      parser: `${source.code}-article-test`,
      finalUrl: loadedPage.finalUrl,
      loadedAt: loadedPage.loadedAt,
      statusCode: loadedPage.statusCode,
      redirectCount: loadedPage.redirectCount,
      byteLength: loadedPage.byteLength,
    },
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
      article: { id: ARTICLE_ID, action: articleAction },
      snapshot: { id: SNAPSHOT_ID, action: snapshotAction },
    },
  };
}

function collectionFailure(
  code: CollectionError["code"],
  sourceCode = "record",
  statusCode?: number,
): CollectionError {
  return {
    code,
    stage: "article",
    sourceCode,
    url: "https://internal.invalid/raw-secret",
    recoverable: false,
    ...(statusCode === undefined ? {} : { statusCode }),
    detail: "fetch SECRET 10.0.0.1 <html>raw</html> stack postgres",
  };
}

type HarnessOptions = Readonly<{
  loadedPage?: LoadedPage;
  loadPage?: (requestUrl: string, invocation: number) => LoadedPage;
  loadFailure?: CollectionError;
  loadThrows?: boolean;
  parse?: (
    source: SourceConfiguration,
    loadedPage: LoadedPage,
    detectedAt: string,
  ) => ReturnType<NonNullable<SourceAdapter["extractArticle"]>>;
  persistence?: (
    persistenceInput: PersistNewsroomArticleInput,
  ) => Promise<PersistNewsroomArticleResult>;
  policyWithoutArticle?: boolean;
  adapterUnavailable?: boolean;
}>;

function createHarness(options: HarnessOptions = {}) {
  const calls = {
    source: 0,
    gate: [] as SourceExecutionMode[],
    policy: 0,
    adapter: 0,
    load: [] as Array<{
      sourceCode: string;
      url: string;
      purpose: "listing" | "article";
    }>,
    extract: 0,
    persist: 0,
  };
  const persistenceInputs: PersistNewsroomArticleInput[] = [];

  const adapterRegistry = {
    resolve(adapterKey: string | null, sourceCode: string) {
      calls.adapter += 1;
      if (options.adapterUnavailable || !adapterKey) {
        return {
          ok: false as const,
          error: collectionFailure("adapter_missing", sourceCode),
        };
      }

      const adapter: SourceAdapter = {
        key: adapterKey,
        sourceCode,
        getListingUrls(source) {
          return { ok: true, value: [source.homepage] };
        },
        discoverArticleLinks() {
          return { ok: true, value: [] };
        },
        normalizeArticleUrl({ source, url, baseUrl }) {
          return normalizeUrl({
            url,
            baseUrl,
            allowedDomain: source.domain,
            sourceCode: source.code,
          });
        },
        extractArticle(extractionInput) {
          calls.extract += 1;
          return options.parse
            ? options.parse(
              extractionInput.source,
              extractionInput.page,
              extractionInput.detectedAt,
            )
            : {
                ok: true,
                value: article(
                  extractionInput.source,
                  extractionInput.page,
                  extractionInput.detectedAt,
                ),
              };
        },
      };
      return { ok: true as const, value: adapter };
    },
    keys() {
      return ["record", "abola"];
    },
  };

  const ingest = createHttpNewsroomIngestion({
    sourceProvider: {
      async findByCode(code) {
        calls.source += 1;
        return registeredSourceConfigurationProvider.findByCode(code);
      },
    },
    evaluateExecution(source, mode) {
      calls.gate.push(mode);
      return evaluateSourceExecution(source, mode);
    },
    resolvePolicy(sourceCode) {
      calls.policy += 1;
      const policy = resolveHttpPageLoaderPolicy(sourceCode);
      if (!policy || !options.policyWithoutArticle) {
        return policy;
      }
      return { ...policy, allowedPurposes: ["listing"] };
    },
    adapterRegistry,
    pageLoader: {
      async load(request) {
        calls.load.push(request);
        if (options.loadThrows) {
          throw new Error("fetch SECRET stack");
        }
        if (options.loadFailure) {
          return { ok: false, error: options.loadFailure };
        }
        return {
          ok: true,
          value: options.loadPage?.(request.url, calls.load.length)
            ?? options.loadedPage
            ?? page(request.url),
        };
      },
    },
    async persistArticle(persistenceInput) {
      calls.persist += 1;
      persistenceInputs.push(persistenceInput);
      return options.persistence
        ? options.persistence(persistenceInput)
        : persistenceSuccess();
    },
  });

  return { ingest, calls, persistenceInputs };
}

function expectFailure(
  result: IngestHttpNewsroomArticleResult,
  code: string,
) {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error(`Era esperado o erro ${code}.`);
  }
  assert.equal(result.error.code, code);
  assert.equal(result.error.operationIncomplete, false);
  assert.doesNotMatch(
    JSON.stringify(result.error),
    /SECRET|10\.0\.0\.1|<html>|postgres|stack|internal\.invalid/i,
  );
  return result.error;
}

test("Record usa gate manual, PageLoader article, extracao e persistencia uma vez", async () => {
  const harness = createHarness();
  const result = await harness.ingest(input());

  assert.equal(result.ok, true);
  assert.deepEqual(harness.calls.gate, ["manual"]);
  assert.deepEqual(harness.calls.load, [
    { sourceCode: "record", url: RECORD_URL, purpose: "article" },
  ]);
  assert.equal(harness.calls.adapter, 1);
  assert.equal(harness.calls.extract, 1);
  assert.equal(harness.calls.persist, 1);
  if (!result.ok) {
    throw new Error("A ingestao devia concluir.");
  }
  assert.equal(result.value.executionMode, "manual");
  assert.equal(result.value.ingestionMode, "http_manual_article");
  assert.equal(result.value.originalUrl, RECORD_URL);
  assert.equal(result.value.statusCode, 200);
  assert.equal(result.value.article.action, "created");
  assert.equal(result.value.snapshot.action, "created");
});

test("A Bola percorre o mesmo nucleo sem alterar a URL antes do PageLoader", async () => {
  const harness = createHarness({
    loadedPage: page(ABOLA_URL),
  });
  const result = await harness.ingest(input({
    sourceCode: "abola",
    articleUrl: ABOLA_URL,
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(harness.calls.load, [
    { sourceCode: "abola", url: ABOLA_URL, purpose: "article" },
  ]);
  assert.equal(harness.calls.extract, 1);
  assert.equal(harness.calls.persist, 1);
  if (result.ok) {
    assert.equal(result.value.sourceCode, "abola");
    assert.equal(result.value.normalizedUrl, ABOLA_URL);
  }
});

test("input estrito rejeita campos desconhecidos, datas, URLs e credenciais antes da rede", async () => {
  const invalidInputs = [
    null,
    {},
    input({ sourceCode: "" }),
    input({ articleUrl: "" }),
    input({ articleUrl: "url-invalida" }),
    input({ articleUrl: "https://user:secret@www.record.pt/artigo" }),
    input({ detectedAt: "hoje" }),
    input({ extractedAt: "amanha" }),
    { ...input(), purpose: "article" },
    { ...input(), executionMode: "manual" },
    { ...input(), html: "<html>raw</html>" },
  ] as unknown[];

  for (const invalidInput of invalidInputs) {
    const harness = createHarness();
    expectFailure(
      await harness.ingest(
        invalidInput as IngestHttpNewsroomArticleInput,
      ),
      "input_invalid",
    );
    assert.equal(harness.calls.source, 0);
    assert.equal(harness.calls.load.length, 0);
    assert.equal(harness.calls.extract, 0);
    assert.equal(harness.calls.persist, 0);
  }
});

test("extractedAt omisso reutiliza detectedAt", async () => {
  const harness = createHarness();
  const result = await harness.ingest({
    sourceCode: "record",
    articleUrl: RECORD_URL,
    detectedAt: DETECTED_AT,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.extractedAt, DETECTED_AT);
  }
  assert.equal(
    harness.persistenceInputs[0].snapshot.extractedAt,
    DETECTED_AT,
  );
});

test("fonte desconhecida e bloqueada antes do gate, adapter e rede", async () => {
  const harness = createHarness();
  expectFailure(
    await harness.ingest(input({ sourceCode: "desconhecida" })),
    "source_not_found",
  );
  assert.deepEqual(harness.calls.gate, []);
  assert.equal(harness.calls.policy, 0);
  assert.equal(harness.calls.adapter, 0);
  assert.equal(harness.calls.load.length, 0);
});

for (const [sourceCode, errorCode] of [
  ["maisfutebol", "source_inactive"],
  ["ojogo", "legal_hold"],
] as const) {
  test(`${sourceCode} e bloqueada pelo gate manual antes de policy, adapter e rede`, async () => {
    const harness = createHarness();
    expectFailure(
      await harness.ingest(input({ sourceCode })),
      errorCode,
    );
    assert.deepEqual(harness.calls.gate, ["manual"]);
    assert.equal(harness.calls.policy, 0);
    assert.equal(harness.calls.adapter, 0);
    assert.equal(harness.calls.load.length, 0);
    assert.equal(harness.calls.persist, 0);
  });
}

test("policy sem article bloqueia antes do adapter e PageLoader", async () => {
  const harness = createHarness({ policyWithoutArticle: true });
  expectFailure(await harness.ingest(input()), "source_forbidden");
  assert.equal(harness.calls.policy, 1);
  assert.equal(harness.calls.adapter, 0);
  assert.equal(harness.calls.load.length, 0);
});

test("adapter indisponivel bloqueia antes do PageLoader", async () => {
  const harness = createHarness({ adapterUnavailable: true });
  expectFailure(await harness.ingest(input()), "adapter_unavailable");
  assert.equal(harness.calls.adapter, 1);
  assert.equal(harness.calls.load.length, 0);
  assert.equal(harness.calls.persist, 0);
});

for (const errorCode of [
  "domain_not_allowed",
  "timeout",
  "http_error",
  "redirect_blocked",
  "unsupported_content",
  "response_too_large",
] as const) {
  test(`${errorCode} do PageLoader e sanitizado sem extrair ou persistir`, async () => {
    const harness = createHarness({
      loadFailure: collectionFailure(errorCode),
    });
    const error = expectFailure(await harness.ingest(input()), errorCode);
    assert.equal(error.stage, "loading");
    assert.equal(Object.hasOwn(error, "statusCode"), false);
    assert.equal(harness.calls.load.length, 1);
    assert.equal(harness.calls.extract, 0);
    assert.equal(harness.calls.persist, 0);
  });
}

for (const statusCode of [403, 404] as const) {
  test(`preserva HTTP ${statusCode} do PageLoader sem analisar mensagens`, async () => {
    const harness = createHarness({
      loadFailure: collectionFailure("http_error", "record", statusCode),
    });
    const error = expectFailure(await harness.ingest(input()), "http_error");

    assert.equal(error.stage, "loading");
    assert.equal(error.sourceCode, "record");
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.persistenceCode, null);
  });
}

test("excecao de carregamento nao provoca retry", async () => {
  const harness = createHarness({ loadThrows: true });
  expectFailure(await harness.ingest(input()), "load_failed");
  assert.equal(harness.calls.load.length, 1);
  assert.equal(harness.calls.extract, 0);
  assert.equal(harness.calls.persist, 0);
});

test("falha e excecao de extracao nao persistem nem repetem", async () => {
  const failureHarness = createHarness({
    parse() {
      return {
        ok: false,
        error: collectionFailure("parse_failed"),
      };
    },
  });
  expectFailure(
    await failureHarness.ingest(input()),
    "parsing_failed",
  );
  assert.equal(failureHarness.calls.extract, 1);
  assert.equal(failureHarness.calls.persist, 0);

  const throwHarness = createHarness({
    parse() {
      throw new Error("<html>raw</html> SECRET stack");
    },
  });
  expectFailure(await throwHarness.ingest(input()), "parsing_failed");
  assert.equal(throwHarness.calls.extract, 1);
  assert.equal(throwHarness.calls.persist, 0);
});

test("artigo estruturalmente incompleto nao chega a persistencia", async () => {
  const harness = createHarness({
    parse(source, loadedPage, detectedAt) {
      return {
        ok: true,
        value: article(source, loadedPage, detectedAt, { title: " " }),
      };
    },
  });
  expectFailure(
    await harness.ingest(input()),
    "normalized_article_invalid",
  );
  assert.equal(harness.calls.extract, 1);
  assert.equal(harness.calls.persist, 0);
});

test("falha de persistencia e excecao sao sanitizadas sem segunda chamada", async () => {
  const failureHarness = createHarness({
    async persistence() {
      return {
        ok: false,
        error: {
          code: "persistence_conflict",
          stage: "snapshot",
          message: "postgres SECRET stack",
          article: null,
          operationIncomplete: false,
        },
      };
    },
  });
  const failure = expectFailure(
    await failureHarness.ingest(input()),
    "persistence_failed",
  );
  assert.equal(failure.persistenceCode, "persistence_conflict");
  assert.equal(Object.hasOwn(failure, "statusCode"), false);
  assert.equal(failureHarness.calls.persist, 1);

  const throwHarness = createHarness({
    async persistence() {
      throw new Error("service_role=SECRET postgres stack");
    },
  });
  expectFailure(
    await throwHarness.ingest(input()),
    "persistence_failed",
  );
  assert.equal(throwHarness.calls.persist, 1);
});

test("HTML bruto nao chega a persistencia e proveniencia HTTP publica e preservada", async () => {
  const harness = createHarness({
    loadedPage: page(RECORD_URL, {
      finalUrl: `${RECORD_URL}?ref=redirect`,
      statusCode: 200,
      redirectCount: 1,
      byteLength: 9876,
    }),
  });
  const result = await harness.ingest(input());

  assert.equal(result.ok, true);
  const persisted = harness.persistenceInputs[0];
  assert.equal(JSON.stringify(persisted).includes("<html"), false);
  assert.equal(persisted.snapshot.sourceMetadata.ingestionMode, "http_manual_article");
  assert.equal(persisted.snapshot.sourceMetadata.networkRequest, true);
  assert.equal(persisted.snapshot.sourceMetadata.originalUrl, RECORD_URL);
  assert.equal(
    persisted.snapshot.sourceMetadata.finalUrl,
    `${RECORD_URL}?ref=redirect`,
  );
  assert.equal(persisted.snapshot.sourceMetadata.statusCode, 200);
  assert.equal(persisted.snapshot.sourceMetadata.redirectCount, 1);
  assert.equal(persisted.snapshot.sourceMetadata.byteLength, 9876);
  assert.equal(
    Object.hasOwn(persisted.snapshot.sourceMetadata, "loadedAt"),
    false,
  );
});

test("loadedAt volatil nao altera hash nem metadados imutaveis da reingestao", async () => {
  const persistenceInputs: PersistNewsroomArticleInput[] = [];
  let invocation = 0;
  const harness = createHarness({
    loadPage(requestUrl, loadInvocation) {
      return page(requestUrl, {
        loadedAt: loadInvocation === 1
          ? "2026-07-26T15:00:30.000Z"
          : "2026-07-26T15:00:45.000Z",
      });
    },
    async persistence(persistenceInput) {
      persistenceInputs.push(persistenceInput);
      invocation += 1;
      return persistenceSuccess(
        invocation === 1 ? "created" : "reused",
        invocation === 1 ? "created" : "reused",
      );
    },
  });

  const first = await harness.ingest(input());
  const second = await harness.ingest(input());
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(harness.calls.load.length, 2);
  assert.equal(harness.calls.extract, 2);
  assert.equal(harness.calls.persist, 2);
  if (first.ok && second.ok) {
    assert.equal(first.value.contentHash, second.value.contentHash);
    assert.notEqual(first.value.loadedAt, second.value.loadedAt);
    assert.equal(second.value.article.action, "reused");
    assert.equal(second.value.snapshot.action, "reused");
  }
  assert.deepEqual(
    persistenceInputs[0].snapshot.sourceMetadata,
    persistenceInputs[1].snapshot.sourceMetadata,
  );
  assert.equal(
    Object.hasOwn(persistenceInputs[0].snapshot.sourceMetadata, "loadedAt"),
    false,
  );
});

test("alteracao editorial real produz hash diferente", async () => {
  let parseInvocation = 0;
  const harness = createHarness({
    parse(source, loadedPage, detectedAt) {
      parseInvocation += 1;
      return {
        ok: true,
        value: article(
          source,
          loadedPage,
          detectedAt,
          parseInvocation === 1
            ? {}
            : {
                body: [
                  {
                    type: "paragraph",
                    text: "Conteudo editorial realmente alterado.",
                  },
                ],
              },
        ),
      };
    },
  });
  const first = await harness.ingest(input());
  const second = await harness.ingest(input());
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) {
    assert.notEqual(first.value.contentHash, second.value.contentHash);
  }
});

for (const [sourceCode, articleUrl, fixturePath] of [
  [
    "record",
    RECORD_URL,
    "./__fixtures__/record/article-valid-minimal.html",
  ],
  [
    "abola",
    ABOLA_URL,
    "./__fixtures__/abola/article-valid-minimal.html",
  ],
] as const) {
  test(`integra o percurso HTTP com o adapter e fixture minima de ${sourceCode}`, async () => {
    const registryResult = createAvailableAdapterRegistry();
    assert.equal(registryResult.ok, true);
    if (!registryResult.ok) {
      throw new Error("Registry indisponivel.");
    }
    const html = await readFile(new URL(fixturePath, import.meta.url), "utf8");
    let persistenceCalls = 0;
    const ingest = createHttpNewsroomIngestion({
      sourceProvider: registeredSourceConfigurationProvider,
      evaluateExecution: evaluateSourceExecution,
      resolvePolicy: resolveHttpPageLoaderPolicy,
      adapterRegistry: registryResult.value,
      pageLoader: {
        async load(request) {
          assert.deepEqual(request, {
            sourceCode,
            url: articleUrl,
            purpose: "article",
          });
          return {
            ok: true,
            value: page(articleUrl, {
              body: html,
              byteLength: Buffer.byteLength(html, "utf8"),
            }),
          };
        },
      },
      async persistArticle(persistenceInput) {
        persistenceCalls += 1;
        assert.equal(persistenceInput.article.sourceCode, sourceCode);
        assert.ok(persistenceInput.article.title);
        assert.ok(persistenceInput.snapshot.body.length > 0);
        return persistenceSuccess();
      },
    });

    const result = await ingest(input({ sourceCode, articleUrl }));
    assert.equal(result.ok, true);
    assert.equal(persistenceCalls, 1);
  });
}

test("fronteiras nao usam fetch direto, SQL, tabelas, publicacao ou execucao automatica", async () => {
  const [internalSource, publicSource] = await Promise.all([
    readFile(
      new URL("./http-newsroom-ingestion-internal.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("./http-newsroom-ingestion.ts", import.meta.url),
      "utf8",
    ),
  ]);
  const combined = `${internalSource}\n${publicSource}`;
  assert.doesNotMatch(combined, /\bfetch\s*\(/);
  assert.doesNotMatch(
    combined,
    /newsroom_articles|newsroom_article_snapshots|\.from\s*\(|\brpc\s*\(/,
  );
  assert.doesNotMatch(
    combined,
    /editorial_articles|\bpublish\s*\(|createDraft|competition|season|matchday|cron|worker|retry|setInterval/i,
  );
  assert.match(internalSource, /executionResult[\s\S]*"manual"/);
  assert.match(internalSource, /purpose:\s*"article"/);
  assert.equal(
    internalSource.match(/dependencies\.pageLoader\.load\(\{/g)?.length,
    1,
  );
  assert.equal(
    internalSource.match(/ingestLoadedNewsroomArticle\(/g)?.length,
    1,
  );
  assert.match(publicSource, /import "server-only"/);
});
