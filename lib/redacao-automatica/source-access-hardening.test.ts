import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import { createAvailableAdapterRegistry } from "@/lib/redacao-automatica/available-adapter-registry";
import { extractArticleCandidate } from "@/lib/redacao-automatica/article-extraction-service";
import { collectSource } from "@/lib/redacao-automatica/collection-service";
import type { PageLoader } from "@/lib/redacao-automatica/page-loader";
import { createHttpPageLoader } from "@/lib/redacao-automatica/page-loaders/http-page-loader";
import {
  isHttpSourceForbidden,
  resolveHttpPageLoaderPolicy,
  type HttpPageLoaderPolicy,
} from "@/lib/redacao-automatica/page-loaders/http-page-loader-policy";
import { registeredSourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import { findRegisteredSource } from "@/lib/redacao-automatica/source-registry";
import type {
  ArticleLinkCandidate,
  CollectionError,
  CollectionErrorCode,
  OperationResult,
} from "@/lib/redacao-automatica/types";

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

function injectedPolicy(
  sourceCode: string,
  allowedHostname: string,
): HttpPageLoaderPolicy {
  return {
    sourceCode,
    allowedHostnames: [allowedHostname],
    allowedProtocols: ["https:"],
    timeoutMs: 1_000,
    maxBytes: 1_024,
    maxRedirects: 0,
    allowedContentTypes: ["text/html"],
  };
}

async function assertDirectLoaderBlocked({
  sourceCode,
  url,
  purpose,
}: Readonly<{
  sourceCode: "maisfutebol" | "ojogo";
  url: string;
  purpose: "listing" | "article";
}>): Promise<void> {
  let resolvePolicyCalls = 0;
  let resolveHostnameCalls = 0;
  let fetchCalls = 0;

  const loader = createHttpPageLoader({
    resolvePolicy(requestedSourceCode) {
      resolvePolicyCalls += 1;
      return injectedPolicy(requestedSourceCode, new URL(url).hostname);
    },
    async resolveHostname() {
      resolveHostnameCalls += 1;
      throw new Error("A resolução DNS não pode ser iniciada.");
    },
    async fetchImpl() {
      fetchCalls += 1;
      throw new Error("O fetch não pode ser iniciado.");
    },
  });

  const result = await loader.load({
    sourceCode: ` ${sourceCode} `,
    url,
    purpose,
  });
  const error = expectError(result, "source_forbidden");

  assert.equal(error.stage, purpose);
  assert.equal(error.sourceCode, sourceCode);
  assert.equal(error.recoverable, false);
  assert.match(
    error.detail ?? "",
    /não está autorizada para carregamento HTTP externo/i,
  );
  assert.equal(resolvePolicyCalls, 0);
  assert.equal(resolveHostnameCalls, 0);
  assert.equal(fetchCalls, 0);
}

function createForbiddenPathDoubles(): Readonly<{
  adapterRegistry: AdapterRegistry;
  pageLoader: PageLoader;
  callCounts: () => Readonly<{ adapterRegistry: number; pageLoader: number }>;
}> {
  let adapterRegistryCalls = 0;
  let pageLoaderCalls = 0;

  return {
    adapterRegistry: {
      resolve() {
        adapterRegistryCalls += 1;
        throw new Error("O registry de adapters não pode ser consultado.");
      },
      keys() {
        adapterRegistryCalls += 1;
        throw new Error("O registry de adapters não pode ser consultado.");
      },
    },
    pageLoader: {
      async load() {
        pageLoaderCalls += 1;
        throw new Error("O PageLoader não pode ser chamado.");
      },
    },
    callCounts() {
      return {
        adapterRegistry: adapterRegistryCalls,
        pageLoader: pageLoaderCalls,
      };
    },
  };
}

function articleCandidate(
  sourceCode: "maisfutebol" | "ojogo",
): ArticleLinkCandidate {
  const originalUrl =
    sourceCode === "maisfutebol"
      ? "https://maisfutebol.iol.pt/futebol/liga/noticia-local"
      : "https://www.ojogo.pt/noticia-local";

  return {
    sourceCode,
    originalUrl,
    normalizedUrl: originalUrl,
    sourcePageUrl: originalUrl,
    detectedAt: "2026-07-20T10:00:00.000Z",
    sourceMetadata: {},
  };
}

test("as policies e a proibição HTTP distinguem fontes permitidas e proibidas", () => {
  assert.ok(resolveHttpPageLoaderPolicy("record"));
  assert.ok(resolveHttpPageLoaderPolicy("abola"));
  assert.equal(resolveHttpPageLoaderPolicy("maisfutebol"), null);
  assert.equal(resolveHttpPageLoaderPolicy("ojogo"), null);

  assert.equal(isHttpSourceForbidden(" maisfutebol "), true);
  assert.equal(isHttpSourceForbidden("ojogo"), true);
  assert.equal(isHttpSourceForbidden("record"), false);
  assert.equal(isHttpSourceForbidden("abola"), false);
  assert.equal(isHttpSourceForbidden("Maisfutebol"), false);
});

test("o source registry preserva os estados e desassocia adapters proibidos", () => {
  const record = findRegisteredSource("record");
  const abola = findRegisteredSource("abola");
  const maisfutebol = findRegisteredSource("maisfutebol");
  const ojogo = findRegisteredSource("ojogo");

  assert.equal(record?.operationalStatus, "paused");
  assert.equal(record?.monitoringEnabled, false);
  assert.equal(abola?.operationalStatus, "paused");
  assert.equal(abola?.monitoringEnabled, false);
  assert.equal(maisfutebol?.operationalStatus, "paused");
  assert.equal(maisfutebol?.monitoringEnabled, false);
  assert.equal(maisfutebol?.adapterKey, null);
  assert.equal(ojogo?.operationalStatus, "legal_hold");
  assert.equal(ojogo?.monitoringEnabled, false);
  assert.equal(ojogo?.adapterKey, null);
});

test("o PageLoader bloqueia diretamente o Maisfutebol antes das injeções", async () => {
  await assertDirectLoaderBlocked({
    sourceCode: "maisfutebol",
    url: "https://maisfutebol.iol.pt/",
    purpose: "listing",
  });
});

test("o PageLoader bloqueia diretamente O Jogo antes das injeções", async () => {
  await assertDirectLoaderBlocked({
    sourceCode: "ojogo",
    url: "https://www.ojogo.pt/noticia-local",
    purpose: "article",
  });
});

test("o registry operacional contém apenas Record e A Bola", () => {
  const registryResult = createAvailableAdapterRegistry();
  assert.equal(registryResult.ok, true);
  if (!registryResult.ok) {
    throw new Error("Não foi possível criar o registry operacional.");
  }

  const registry = registryResult.value;
  assert.deepEqual(registry.keys(), ["record", "abola"]);
  assert.equal(registry.resolve("record", "record").ok, true);
  assert.equal(registry.resolve("abola", "abola").ok, true);

  expectError(
    registry.resolve("maisfutebol", "maisfutebol"),
    "adapter_missing",
  );
  expectError(registry.resolve(null, "ojogo"), "invalid_adapter_key");
});

for (const expected of [
  { sourceCode: "maisfutebol", errorCode: "source_inactive" },
  { sourceCode: "ojogo", errorCode: "legal_hold" },
] as const) {
  test(`a recolha bloqueia ${expected.sourceCode} antes de adapters e rede`, async () => {
    const doubles = createForbiddenPathDoubles();
    const result = await collectSource(
      {
        sourceCode: expected.sourceCode,
        detectedAt: "2026-07-20T10:00:00.000Z",
      },
      {
        sourceProvider: registeredSourceConfigurationProvider,
        adapterRegistry: doubles.adapterRegistry,
        pageLoader: doubles.pageLoader,
        now: () => "2026-07-20T10:00:00.000Z",
      },
    );

    expectError(result, expected.errorCode);
    assert.deepEqual(doubles.callCounts(), {
      adapterRegistry: 0,
      pageLoader: 0,
    });
  });

  test(`a extração bloqueia ${expected.sourceCode} antes de adapters e rede`, async () => {
    const doubles = createForbiddenPathDoubles();
    const result = await extractArticleCandidate(articleCandidate(expected.sourceCode), {
      sourceProvider: registeredSourceConfigurationProvider,
      adapterRegistry: doubles.adapterRegistry,
      pageLoader: doubles.pageLoader,
    });

    expectError(result, expected.errorCode);
    assert.deepEqual(doubles.callCounts(), {
      adapterRegistry: 0,
      pageLoader: 0,
    });
  });
}
