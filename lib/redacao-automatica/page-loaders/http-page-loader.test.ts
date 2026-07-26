import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import { createAdapterRegistry } from "@/lib/redacao-automatica/adapter-registry";
import type { SourceAdapter } from "@/lib/redacao-automatica/adapters/source-adapter";
import { collectSource } from "@/lib/redacao-automatica/collection-service";
import type {
  PageLoadRequest,
  PageLoader,
} from "@/lib/redacao-automatica/page-loader";
import { createHttpPageLoader } from "@/lib/redacao-automatica/page-loaders/http-page-loader";
import {
  isHttpSourceForbidden,
  resolveHttpPageLoaderPolicy,
  type HttpPageLoaderPolicy,
} from "@/lib/redacao-automatica/page-loaders/http-page-loader-policy";
import type { SourceConfigurationProvider } from "@/lib/redacao-automatica/source-configuration-provider";
import type {
  CollectionError,
  CollectionErrorCode,
  LoadedPage,
  OperationResult,
  SourceConfiguration,
} from "@/lib/redacao-automatica/types";

const SOURCE_CODE = "fixture";
const ALLOWED_HOSTNAME = "allowed.example";
const ALLOWED_URL = `https://${ALLOWED_HOSTNAME}/listing`;
const LOCAL_HTML = "<!doctype html><html><body>Fixture local</body></html>";
const LOADED_AT = "2026-07-26T12:00:00.000Z";
const PUBLIC_ADDRESS = Object.freeze([
  Object.freeze({ address: "93.184.216.34", family: 4 }),
]);

type FetchCall = Readonly<{
  url: string;
  init: RequestInit | undefined;
}>;

function testPolicy(
  overrides: Partial<HttpPageLoaderPolicy> = {},
): HttpPageLoaderPolicy {
  return {
    sourceCode: SOURCE_CODE,
    allowedHostnames: [ALLOWED_HOSTNAME],
    allowedProtocols: ["https:"],
    allowedPurposes: ["listing", "article"],
    timeoutMs: 1_000,
    maxBytes: 1_024,
    maxRedirects: 3,
    allowedContentTypes: ["text/html"],
    acceptedStatusCodes: [200],
    userAgent: "Jornada.pt-Test/1.0",
    acceptLanguage: "pt-PT",
    ...overrides,
  };
}

function htmlResponse(
  body = LOCAL_HTML,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/html; charset=utf-8");
  }

  return new Response(body, {
    ...init,
    headers,
  });
}

function redirectResponse(location?: string, status = 302): Response {
  const headers = new Headers();
  if (location !== undefined) {
    headers.set("location", location);
  }
  return new Response(null, { status, headers });
}

function request(
  overrides: Partial<PageLoadRequest> = {},
): PageLoadRequest {
  return {
    sourceCode: SOURCE_CODE,
    url: ALLOWED_URL,
    purpose: "listing",
    ...overrides,
  };
}

function expectError<T>(
  result: OperationResult<T, CollectionError>,
  code: CollectionErrorCode,
): CollectionError {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error(`Era esperado o erro ${code}.`);
  }
  assert.equal(result.error.code, code);
  return result.error;
}

function createHarness(
  options: Readonly<{
    policy?: HttpPageLoaderPolicy | null;
    responses?: readonly Response[];
    fetchImpl?: typeof globalThis.fetch;
    resolveHostname?: (
      hostname: string,
    ) => Promise<readonly { address: string; family: number }[]>;
  }> = {},
): Readonly<{
  loader: PageLoader;
  fetchCalls: FetchCall[];
  resolvedHostnames: string[];
}> {
  const fetchCalls: FetchCall[] = [];
  const resolvedHostnames: string[] = [];
  const responses = [...(options.responses ?? [htmlResponse()])];
  const fetchImpl = options.fetchImpl ?? (async (input, init) => {
    fetchCalls.push({
      url: String(input),
      init,
    });
    const response = responses.shift();
    if (!response) {
      throw new Error("Resposta de teste em falta.");
    }
    return response;
  }) as typeof globalThis.fetch;
  const resolveHostname = options.resolveHostname ?? (async (hostname: string) => {
    resolvedHostnames.push(hostname);
    return PUBLIC_ADDRESS;
  });
  const policy = options.policy === undefined
    ? testPolicy()
    : options.policy;

  return {
    fetchCalls,
    resolvedHostnames,
    loader: createHttpPageLoader({
      fetchImpl,
      resolveHostname,
      resolvePolicy() {
        return policy;
      },
      clock() {
        return new Date(LOADED_AT);
      },
    }),
  };
}

test("policies HTTP sao explicitas para Record, A Bola e Maisfutebol", () => {
  const record = resolveHttpPageLoaderPolicy("record");
  const abola = resolveHttpPageLoaderPolicy("abola");
  const maisfutebol = resolveHttpPageLoaderPolicy("maisfutebol");

  for (const policy of [record, abola, maisfutebol]) {
    assert.ok(policy);
    assert.deepEqual(policy.allowedProtocols, ["https:"]);
    assert.deepEqual(policy.allowedContentTypes, ["text/html"]);
    assert.deepEqual(policy.acceptedStatusCodes, [200]);
    assert.equal(policy.timeoutMs, 10_000);
    assert.equal(policy.maxRedirects, 3);
    assert.equal(policy.maxBytes, 5 * 1024 * 1024);
    assert.match(policy.userAgent, /^Jornada\.pt-Newsroom\//);
    assert.equal(policy.acceptLanguage, "pt-PT,pt;q=0.9,en;q=0.5");
  }

  assert.deepEqual(record?.allowedHostnames, ["www.record.pt"]);
  assert.deepEqual(record?.allowedPurposes, ["listing", "article"]);
  assert.deepEqual(abola?.allowedHostnames, ["www.abola.pt"]);
  assert.deepEqual(abola?.allowedPurposes, ["listing", "article"]);
  assert.deepEqual(
    maisfutebol?.allowedHostnames,
    ["maisfutebol.iol.pt"],
  );
  assert.deepEqual(maisfutebol?.allowedPurposes, ["listing"]);
  assert.equal(resolveHttpPageLoaderPolicy("ojogo"), null);
  assert.equal(isHttpSourceForbidden("ojogo"), true);
  assert.equal(isHttpSourceForbidden("maisfutebol"), false);
});

test("carrega HTTPS autorizado e preenche o contrato completo de LoadedPage", async () => {
  const harness = createHarness();
  const result = await harness.loader.load(request());

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("O carregamento devia ter sucesso.");
  }

  assert.deepEqual(result.value, {
    requestedUrl: ALLOWED_URL,
    finalUrl: ALLOWED_URL,
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: LOCAL_HTML,
    loadedAt: LOADED_AT,
    redirectCount: 0,
    byteLength: Buffer.byteLength(LOCAL_HTML),
  });
  assert.deepEqual(harness.resolvedHostnames, [ALLOWED_HOSTNAME]);
  assert.equal(harness.fetchCalls.length, 1);
  const fetchCall = harness.fetchCalls[0];
  const headers = new Headers(fetchCall.init?.headers);
  assert.equal(fetchCall.url, ALLOWED_URL);
  assert.equal(fetchCall.init?.redirect, "manual");
  assert.equal(fetchCall.init?.credentials, "omit");
  assert.equal(headers.get("user-agent"), "Jornada.pt-Test/1.0");
  assert.equal(headers.get("accept"), "text/html");
  assert.equal(headers.get("accept-language"), "pt-PT");
  assert.equal(headers.get("accept-encoding"), "identity");
});

test("purpose article e suportado contratualmente sem composicao de recolha real", async () => {
  const harness = createHarness();
  const result = await harness.loader.load(request({
    purpose: "article",
    url: `https://${ALLOWED_HOSTNAME}/article`,
  }));

  assert.equal(result.ok, true);
  assert.equal(harness.fetchCalls.length, 1);
});

test("policy pode limitar purpose sem iniciar DNS ou fetch", async () => {
  let dnsCalls = 0;
  let fetchCalls = 0;
  const loader = createHttpPageLoader({
    resolvePolicy: resolveHttpPageLoaderPolicy,
    async resolveHostname() {
      dnsCalls += 1;
      return PUBLIC_ADDRESS;
    },
    async fetchImpl() {
      fetchCalls += 1;
      return htmlResponse();
    },
  });

  const error = expectError(
    await loader.load({
      sourceCode: "maisfutebol",
      url: "https://maisfutebol.iol.pt/noticia-local",
      purpose: "article",
    }),
    "source_forbidden",
  );

  assert.equal(error.stage, "article");
  assert.equal(dnsCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("rejeita protocolo diferente de HTTPS antes da rede", async () => {
  const harness = createHarness();
  expectError(
    await harness.loader.load(request({
      url: `http://${ALLOWED_HOSTNAME}/listing`,
    })),
    "domain_not_allowed",
  );
  assert.deepEqual(harness.resolvedHostnames, []);
  assert.equal(harness.fetchCalls.length, 0);
});

test("rejeita host nao autorizado antes da rede", async () => {
  const harness = createHarness();
  expectError(
    await harness.loader.load(request({
      url: "https://not-allowed.example/listing",
    })),
    "domain_not_allowed",
  );
  assert.deepEqual(harness.resolvedHostnames, []);
  assert.equal(harness.fetchCalls.length, 0);
});

test("rejeita credenciais embebidas sem as expor no erro", async () => {
  const harness = createHarness();
  const error = expectError(
    await harness.loader.load(request({
      url: `https://user:password@${ALLOWED_HOSTNAME}/listing`,
    })),
    "invalid_url",
  );
  const serializedError = JSON.stringify(error);

  assert.doesNotMatch(serializedError, /user|password/i);
  assert.equal(harness.fetchCalls.length, 0);
});

test("rejeita fonte sem policy HTTP ativa", async () => {
  const harness = createHarness({ policy: null });
  expectError(
    await harness.loader.load(request({ sourceCode: "unknown" })),
    "domain_not_allowed",
  );
  assert.equal(harness.fetchCalls.length, 0);
});

test("O Jogo permanece bloqueado antes de policy, DNS e fetch", async () => {
  let policyCalls = 0;
  let dnsCalls = 0;
  let fetchCalls = 0;
  const loader = createHttpPageLoader({
    resolvePolicy() {
      policyCalls += 1;
      return testPolicy({ sourceCode: "ojogo" });
    },
    async resolveHostname() {
      dnsCalls += 1;
      return PUBLIC_ADDRESS;
    },
    async fetchImpl() {
      fetchCalls += 1;
      return htmlResponse();
    },
  });

  expectError(
    await loader.load({
      sourceCode: "ojogo",
      url: "https://www.ojogo.pt/noticia-local",
      purpose: "article",
    }),
    "source_forbidden",
  );
  assert.equal(policyCalls, 0);
  assert.equal(dnsCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("bloqueia localhost e IP literal privado sem expor o endereco", async () => {
  for (const url of [
    "https://localhost/listing",
    "https://127.0.0.1/listing",
    "https://169.254.169.254/latest/meta-data",
  ]) {
    const parsed = new URL(url);
    const harness = createHarness({
      policy: testPolicy({ allowedHostnames: [parsed.hostname] }),
    });
    const error = expectError(
      await harness.loader.load(request({ url })),
      parsed.hostname === "localhost"
        ? "invalid_url"
        : "private_network_blocked",
    );

    assert.equal(error.url, null);
    assert.equal(harness.fetchCalls.length, 0);
  }
});

test("bloqueia resolucao DNS para endereco privado ou link-local", async () => {
  for (const address of ["10.0.0.1", "169.254.169.254"]) {
    let fetchCalls = 0;
    const harness = createHarness({
      async resolveHostname() {
        return [{ address, family: 4 }];
      },
      fetchImpl: (async () => {
        fetchCalls += 1;
        return htmlResponse();
      }) as typeof globalThis.fetch,
    });

    expectError(
      await harness.loader.load(request()),
      "private_network_blocked",
    );
    assert.equal(fetchCalls, 0);
  }
});

test("converte timeout em erro publico controlado", async () => {
  const harness = createHarness({
    policy: testPolicy({ timeoutMs: 5 }),
    fetchImpl: (() => new Promise<Response>(() => {
      // Controlled pending request; AbortController wins the race.
    })) as typeof globalThis.fetch,
  });
  const error = expectError(
    await harness.loader.load(request()),
    "timeout",
  );

  assert.equal(error.recoverable, true);
  assert.match(error.detail ?? "", /timeout/i);
});

test("rejeita resposta HTTP incompatível com a policy", async () => {
  const harness = createHarness({
    responses: [htmlResponse("conteudo nao devolvido", { status: 503 })],
  });
  const error = expectError(
    await harness.loader.load(request()),
    "http_error",
  );

  assert.equal(error.recoverable, true);
  assert.doesNotMatch(JSON.stringify(error), /conteudo nao devolvido/);
});

test("rejeita Content-Type nao autorizado", async () => {
  const harness = createHarness({
    responses: [
      htmlResponse('{"fixture":true}', {
        headers: { "content-type": "application/json" },
      }),
    ],
  });
  expectError(
    await harness.loader.load(request()),
    "unsupported_content",
  );
});

test("rejeita Content-Length acima do limite antes de ler o body", async () => {
  const harness = createHarness({
    policy: testPolicy({ maxBytes: 10 }),
    responses: [
      htmlResponse("ok", {
        headers: {
          "content-type": "text/html",
          "content-length": "11",
        },
      }),
    ],
  });
  expectError(
    await harness.loader.load(request()),
    "response_too_large",
  );
});

test("interrompe body efetivo acima do limite sem depender de Content-Length", async () => {
  const harness = createHarness({
    policy: testPolicy({ maxBytes: 4 }),
    responses: [htmlResponse("<html>")],
  });
  expectError(
    await harness.loader.load(request()),
    "response_too_large",
  );
});

test("segue redirect absoluto autorizado e conta um salto", async () => {
  const finalUrl = `https://${ALLOWED_HOSTNAME}/final`;
  const harness = createHarness({
    responses: [
      redirectResponse(finalUrl),
      htmlResponse(),
    ],
  });
  const result = await harness.loader.load(request());

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("O redirect autorizado devia ter sucesso.");
  }
  assert.equal(result.value.finalUrl, finalUrl);
  assert.equal(result.value.redirectCount, 1);
  assert.equal(harness.fetchCalls.length, 2);
});

test("resolve redirect relativo autorizado", async () => {
  const harness = createHarness({
    responses: [
      redirectResponse("/relative-final"),
      htmlResponse(),
    ],
  });
  const result = await harness.loader.load(request());

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("O redirect relativo devia ter sucesso.");
  }
  assert.equal(
    result.value.finalUrl,
    `https://${ALLOWED_HOSTNAME}/relative-final`,
  );
  assert.equal(result.value.redirectCount, 1);
});

test("bloqueia redirect para host nao autorizado antes do segundo pedido", async () => {
  const harness = createHarness({
    responses: [redirectResponse("https://blocked.example/final")],
  });
  expectError(
    await harness.loader.load(request()),
    "redirect_blocked",
  );
  assert.equal(harness.fetchCalls.length, 1);
});

test("bloqueia redirect para protocolo nao autorizado", async () => {
  const harness = createHarness({
    responses: [
      redirectResponse(`http://${ALLOWED_HOSTNAME}/final`),
    ],
  });
  expectError(
    await harness.loader.load(request()),
    "redirect_blocked",
  );
  assert.equal(harness.fetchCalls.length, 1);
});

test("rejeita excesso de redirects no limite da policy", async () => {
  const harness = createHarness({
    policy: testPolicy({ maxRedirects: 1 }),
    responses: [
      redirectResponse("/redirect-1"),
      redirectResponse("/redirect-2"),
    ],
  });
  expectError(
    await harness.loader.load(request()),
    "redirect_blocked",
  );
  assert.equal(harness.fetchCalls.length, 2);
});

test("conta corretamente dois redirects autorizados", async () => {
  const harness = createHarness({
    responses: [
      redirectResponse("/redirect-1"),
      redirectResponse("/redirect-2"),
      htmlResponse(),
    ],
  });
  const result = await harness.loader.load(request());

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Os redirects autorizados deviam ter sucesso.");
  }
  assert.equal(result.value.redirectCount, 2);
  assert.equal(
    result.value.finalUrl,
    `https://${ALLOWED_HOSTNAME}/redirect-2`,
  );
  assert.equal(harness.fetchCalls.length, 3);
});

test("rejeita redirect sem Location", async () => {
  const harness = createHarness({
    responses: [redirectResponse()],
  });
  expectError(
    await harness.loader.load(request()),
    "redirect_blocked",
  );
});

test("simples importacao nao executa DNS nem fetch", () => {
  const moduleUrl = pathToFileURL(
    resolve(
      "lib/redacao-automatica/page-loaders/http-page-loader.ts",
    ),
  ).href;
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
        `await import(${JSON.stringify(moduleUrl)});`,
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

test("sanitiza erros brutos de fetch e nao devolve dados internos", async () => {
  const harness = createHarness({
    fetchImpl: (async () => {
      throw new Error(
        "connect ECONNREFUSED 10.0.0.5 token=SECRET <html>raw</html>",
      );
    }) as typeof globalThis.fetch,
  });
  const error = expectError(
    await harness.loader.load(request()),
    "load_failed",
  );
  const serializedError = JSON.stringify(error);

  assert.doesNotMatch(
    serializedError,
    /ECONNREFUSED|10\.0\.0\.5|SECRET|<html>|stack/i,
  );
  assert.equal(error.detail, "O pedido HTTP falhou.");
});

test("collection service passa purpose listing explicitamente", async () => {
  const source: SourceConfiguration = {
    code: SOURCE_CODE,
    name: "Fixture",
    domain: ALLOWED_HOSTNAME,
    homepage: `https://${ALLOWED_HOSTNAME}/`,
    adapterKey: SOURCE_CODE,
    operationalStatus: "active",
    monitoringEnabled: true,
    manualCollectionEnabled: false,
    inactiveReason: null,
    legalNote: null,
    editorialNote: "Fixture local.",
    displayOrder: 1,
  };
  const sourceProvider: SourceConfigurationProvider = {
    async findByCode() {
      return { ok: true, value: source };
    },
  };
  const adapter: SourceAdapter = {
    key: SOURCE_CODE,
    sourceCode: SOURCE_CODE,
    getListingUrls() {
      return { ok: true, value: [ALLOWED_URL] };
    },
    discoverArticleLinks() {
      return { ok: true, value: [] };
    },
    normalizeArticleUrl(input) {
      return { ok: true, value: input.url };
    },
  };
  const registryResult = createAdapterRegistry([adapter]);
  assert.equal(registryResult.ok, true);
  if (!registryResult.ok) {
    throw new Error("O registry de fixture devia ser valido.");
  }
  const requests: PageLoadRequest[] = [];
  const loadedPage: LoadedPage = {
    requestedUrl: ALLOWED_URL,
    finalUrl: ALLOWED_URL,
    statusCode: 200,
    contentType: "text/html",
    body: LOCAL_HTML,
    loadedAt: LOADED_AT,
    redirectCount: 0,
    byteLength: Buffer.byteLength(LOCAL_HTML),
  };

  const result = await collectSource(
    {
      sourceCode: SOURCE_CODE,
      detectedAt: LOADED_AT,
    },
    {
      sourceProvider,
      adapterRegistry: registryResult.value,
      pageLoader: {
        async load(loadRequest) {
          requests.push(loadRequest);
          return { ok: true, value: loadedPage };
        },
      },
      now() {
        return LOADED_AT;
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.purpose, "listing");
});

test("nucleo HTTP permanece generico e sem parsing, persistencia ou ativacao", async () => {
  const [loaderSource, collectionSource] = await Promise.all([
    readFile(new URL("./http-page-loader.ts", import.meta.url), "utf8"),
    readFile(new URL("../collection-service.ts", import.meta.url), "utf8"),
  ]);

  assert.match(loaderSource, /from "node:dns\/promises"/);
  assert.match(loaderSource, /from "node:net"/);
  assert.doesNotMatch(
    loaderSource,
    /record|abola|maisfutebol|ojogo/i,
  );
  assert.doesNotMatch(
    loaderSource,
    /cheerio|parseArticle|persist|newsroom-article|setInterval|cron|worker|webhook/i,
  );
  assert.doesNotMatch(loaderSource, /app\/api|route\.ts|use server/i);
  assert.match(
    collectionSource,
    /pageLoader\.load\(\{[\s\S]*?purpose:\s*"listing"/,
  );
});
