import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import type { SourceAdapter } from "@/lib/redacao-automatica/adapters/source-adapter";
import { collectSource } from "@/lib/redacao-automatica/collection-service";
import type { PageLoader } from "@/lib/redacao-automatica/page-loader";
import { registeredSourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import {
  evaluateSourceExecution,
  findRegisteredSource,
} from "@/lib/redacao-automatica/source-registry";
import type {
  CollectionError,
  CollectionErrorCode,
  OperationResult,
  SourceConfiguration,
  SourceExecutionMode,
} from "@/lib/redacao-automatica/types";

const DETECTED_AT = "2026-07-26T12:00:00.000Z";

function registeredSource(
  sourceCode: "record" | "abola" | "maisfutebol" | "ojogo",
): SourceConfiguration {
  const source = findRegisteredSource(sourceCode);
  assert.ok(source);
  return source;
}

function expectError<T>(
  result: OperationResult<T, CollectionError>,
  expectedCode: CollectionErrorCode,
): CollectionError {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error(`Era esperado o erro "${expectedCode}".`);
  }

  assert.equal(result.error.code, expectedCode);
  return result.error;
}

function createForbiddenPathDoubles(): Readonly<{
  adapterRegistry: AdapterRegistry;
  pageLoader: PageLoader;
  counts(): Readonly<{ adapterRegistry: number; pageLoader: number }>;
}> {
  let adapterRegistryCalls = 0;
  let pageLoaderCalls = 0;

  return {
    adapterRegistry: {
      resolve() {
        adapterRegistryCalls += 1;
        throw new Error("O adapter registry nao pode ser consultado.");
      },
      keys() {
        adapterRegistryCalls += 1;
        throw new Error("O adapter registry nao pode ser consultado.");
      },
    },
    pageLoader: {
      async load() {
        pageLoaderCalls += 1;
        throw new Error("O PageLoader nao pode ser chamado.");
      },
    },
    counts() {
      return {
        adapterRegistry: adapterRegistryCalls,
        pageLoader: pageLoaderCalls,
      };
    },
  };
}

async function collectBlockedSource(
  sourceCode: string,
  executionMode?: SourceExecutionMode,
): Promise<Readonly<{
  result: Awaited<ReturnType<typeof collectSource>>;
  counts: Readonly<{ adapterRegistry: number; pageLoader: number }>;
}>> {
  const doubles = createForbiddenPathDoubles();
  const result = await collectSource(
    {
      sourceCode,
      detectedAt: DETECTED_AT,
      ...(executionMode === undefined ? {} : { executionMode }),
    },
    {
      sourceProvider: registeredSourceConfigurationProvider,
      adapterRegistry: doubles.adapterRegistry,
      pageLoader: doubles.pageLoader,
      now: () => DETECTED_AT,
    },
  );

  return {
    result,
    counts: doubles.counts(),
  };
}

test("registry explicita a matriz automatica e manual sem ativar monitorizacao", () => {
  const record = registeredSource("record");
  const abola = registeredSource("abola");
  const maisfutebol = registeredSource("maisfutebol");
  const ojogo = registeredSource("ojogo");

  assert.deepEqual(
    {
      record: {
        status: record.operationalStatus,
        monitoring: record.monitoringEnabled,
        manual: record.manualCollectionEnabled,
      },
      abola: {
        status: abola.operationalStatus,
        monitoring: abola.monitoringEnabled,
        manual: abola.manualCollectionEnabled,
      },
      maisfutebol: {
        status: maisfutebol.operationalStatus,
        monitoring: maisfutebol.monitoringEnabled,
        manual: maisfutebol.manualCollectionEnabled,
      },
      ojogo: {
        status: ojogo.operationalStatus,
        monitoring: ojogo.monitoringEnabled,
        manual: ojogo.manualCollectionEnabled,
      },
    },
    {
      record: { status: "paused", monitoring: false, manual: true },
      abola: { status: "paused", monitoring: false, manual: true },
      maisfutebol: { status: "paused", monitoring: false, manual: false },
      ojogo: { status: "legal_hold", monitoring: false, manual: false },
    },
  );
});

test("modo omitido equivale a automatico e bloqueia Record e A Bola", async () => {
  for (const sourceCode of ["record", "abola"] as const) {
    const omitted = await collectBlockedSource(sourceCode);
    const explicit = await collectBlockedSource(sourceCode, "automatic");

    expectError(omitted.result, "source_inactive");
    expectError(explicit.result, "source_inactive");
    assert.deepEqual(omitted.counts, {
      adapterRegistry: 0,
      pageLoader: 0,
    });
    assert.deepEqual(explicit.counts, {
      adapterRegistry: 0,
      pageLoader: 0,
    });
  }
});

test("gate autoriza manualmente Record e A Bola sem mutar a configuracao", () => {
  for (const sourceCode of ["record", "abola"] as const) {
    const source = registeredSource(sourceCode);
    const snapshot = structuredClone(source);

    assert.equal(evaluateSourceExecution(source).ok, false);
    assert.equal(evaluateSourceExecution(source, "automatic").ok, false);

    const manualResult = evaluateSourceExecution(source, "manual");
    assert.equal(manualResult.ok, true);
    if (manualResult.ok) {
      assert.equal(manualResult.value, source);
    }
    assert.deepEqual(source, snapshot);
  }
});

test("Maisfutebol fica bloqueado no modo manual antes de adapter e PageLoader", async () => {
  const gateResult = evaluateSourceExecution(
    registeredSource("maisfutebol"),
    "manual",
  );
  expectError(gateResult, "source_inactive");

  const collection = await collectBlockedSource("maisfutebol", "manual");
  expectError(collection.result, "source_inactive");
  assert.deepEqual(collection.counts, {
    adapterRegistry: 0,
    pageLoader: 0,
  });
});

test("legal_hold de O Jogo prevalece em ambos os modos e sobre configuracao incoerente", async () => {
  const ojogo = registeredSource("ojogo");

  expectError(evaluateSourceExecution(ojogo, "automatic"), "legal_hold");
  expectError(evaluateSourceExecution(ojogo, "manual"), "legal_hold");
  expectError(
    evaluateSourceExecution(
      {
        ...ojogo,
        adapterKey: "ojogo",
        manualCollectionEnabled: true,
      },
      "manual",
    ),
    "legal_hold",
  );

  for (const executionMode of ["automatic", "manual"] as const) {
    const collection = await collectBlockedSource("ojogo", executionMode);
    expectError(collection.result, "legal_hold");
    assert.deepEqual(collection.counts, {
      adapterRegistry: 0,
      pageLoader: 0,
    });
  }
});

test("fonte desconhecida continua bloqueada antes do percurso normal", async () => {
  const collection = await collectBlockedSource("desconhecida", "manual");

  expectError(collection.result, "source_not_found");
  assert.deepEqual(collection.counts, {
    adapterRegistry: 0,
    pageLoader: 0,
  });
});

test("gate manual nao tem fallback permissivo para campo ausente ou invalido", () => {
  const record = registeredSource("record");
  const {
    manualCollectionEnabled: _manualCollectionEnabled,
    ...withoutManualCollection
  } = record;
  const missingField = withoutManualCollection as SourceConfiguration;
  const invalidField = {
    ...record,
    manualCollectionEnabled: "true",
  } as unknown as SourceConfiguration;
  const disabled = {
    ...record,
    operationalStatus: "disabled",
    manualCollectionEnabled: true,
  } as const;

  expectError(
    evaluateSourceExecution(missingField, "manual"),
    "source_inactive",
  );
  expectError(
    evaluateSourceExecution(invalidField, "manual"),
    "source_inactive",
  );
  expectError(
    evaluateSourceExecution(disabled, "manual"),
    "source_inactive",
  );
});

test("modo manual chega ao gate e prossegue uma vez pelo percurso listing", async () => {
  const source = registeredSource("record");
  const calls = {
    adapterRegistry: 0,
    getListingUrls: 0,
    pageLoader: 0,
    discoverArticleLinks: 0,
    normalizeArticleUrl: 0,
  };
  const adapter: SourceAdapter = {
    key: "record",
    sourceCode: "record",
    getListingUrls(resolvedSource) {
      calls.getListingUrls += 1;
      assert.equal(resolvedSource, source);
      return { ok: true, value: [resolvedSource.homepage] };
    },
    discoverArticleLinks({ source: resolvedSource, page }) {
      calls.discoverArticleLinks += 1;
      assert.equal(resolvedSource, source);
      assert.equal(page.finalUrl, source.homepage);
      return {
        ok: true,
        value: [
          {
            originalUrl: "/noticia-primeira",
            sourceMetadata: { title: "Primeira" },
          },
          {
            originalUrl: "/noticia-segunda",
            sourceMetadata: { title: "Segunda" },
          },
        ],
      };
    },
    normalizeArticleUrl({ url, baseUrl }) {
      calls.normalizeArticleUrl += 1;
      return { ok: true, value: new URL(url, baseUrl).toString() };
    },
  };
  const adapterRegistry: AdapterRegistry = {
    resolve(adapterKey, sourceCode) {
      calls.adapterRegistry += 1;
      assert.equal(adapterKey, "record");
      assert.equal(sourceCode, "record");
      return { ok: true, value: adapter };
    },
    keys() {
      return ["record"];
    },
  };
  const pageLoader: PageLoader = {
    async load(request) {
      calls.pageLoader += 1;
      assert.deepEqual(request, {
        sourceCode: "record",
        url: source.homepage,
        purpose: "listing",
      });
      return {
        ok: true,
        value: {
          requestedUrl: source.homepage,
          finalUrl: source.homepage,
          statusCode: 200,
          contentType: "text/html",
          body: "<html><body>Fixture local</body></html>",
          loadedAt: DETECTED_AT,
          redirectCount: 0,
          byteLength: 39,
        },
      };
    },
  };

  const result = await collectSource(
    {
      sourceCode: "record",
      detectedAt: DETECTED_AT,
      executionMode: "manual",
    },
    {
      sourceProvider: registeredSourceConfigurationProvider,
      adapterRegistry,
      pageLoader,
      now: () => DETECTED_AT,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("A recolha manual autorizada devia prosseguir.");
  }
  assert.deepEqual(calls, {
    adapterRegistry: 1,
    getListingUrls: 1,
    pageLoader: 1,
    discoverArticleLinks: 1,
    normalizeArticleUrl: 2,
  });
  assert.deepEqual(
    result.value.candidates.map((candidate) => ({
      originalUrl: candidate.originalUrl,
      normalizedUrl: candidate.normalizedUrl,
      sourceMetadata: candidate.sourceMetadata,
    })),
    [
      {
        originalUrl: "/noticia-primeira",
        normalizedUrl: "https://www.record.pt/noticia-primeira",
        sourceMetadata: { title: "Primeira" },
      },
      {
        originalUrl: "/noticia-segunda",
        normalizedUrl: "https://www.record.pt/noticia-segunda",
        sourceMetadata: { title: "Segunda" },
      },
    ],
  );
});

test("simples importacao do gate e collection service nao inicia recolha nem rede", () => {
  const modules = [
    pathToFileURL(
      resolve("lib/redacao-automatica/source-registry.ts"),
    ).href,
    pathToFileURL(
      resolve("lib/redacao-automatica/collection-service.ts"),
    ).href,
  ];
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      [
        "let calls = 0;",
        "globalThis.fetch = () => { calls += 1; throw new Error('network'); };",
        ...modules.map((moduleUrl) => `await import(${JSON.stringify(moduleUrl)});`),
        "console.log(String(calls));",
      ].join(" "),
    ],
    {
      cwd: resolve("."),
      encoding: "utf8",
    },
  );

  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "0");
  assert.equal(child.stderr, "");
});
