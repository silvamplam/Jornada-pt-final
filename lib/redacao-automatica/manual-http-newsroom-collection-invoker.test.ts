import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import type { CollectSourceInput } from "@/lib/redacao-automatica/collection-service";
import {
  createManualHttpNewsroomCollectionInvoker,
  runManualHttpNewsroomCollectionCommand,
} from "@/lib/redacao-automatica/manual-http-newsroom-collection-invoker-internal";
import type {
  ArticleLinkCandidate,
  CollectionError,
  OperationResult,
  SourceCollectionSummary,
} from "@/lib/redacao-automatica/types";

const DETECTED_AT = "2026-07-26T14:30:00.000Z";
const candidates: readonly ArticleLinkCandidate[] = Object.freeze([
  Object.freeze({
    sourceCode: "record",
    originalUrl: "/noticia-primeira",
    normalizedUrl: "https://www.record.pt/noticia-primeira",
    sourcePageUrl: "https://www.record.pt/",
    detectedAt: DETECTED_AT,
    sourceMetadata: Object.freeze({
      discoveryMethod: "anchor",
      listingPath: "/",
    }),
  }),
  Object.freeze({
    sourceCode: "record",
    originalUrl: "/noticia-segunda",
    normalizedUrl: "https://www.record.pt/noticia-segunda",
    sourcePageUrl: "https://www.record.pt/",
    detectedAt: DETECTED_AT,
    sourceMetadata: Object.freeze({
      discoveryMethod: "anchor",
      listingPath: "/",
    }),
  }),
]);

function completedSummary(
  overrides: Partial<SourceCollectionSummary> = {},
): SourceCollectionSummary {
  return {
    sourceCode: "record",
    startedAt: DETECTED_AT,
    finishedAt: DETECTED_AT,
    listingUrls: ["https://www.record.pt/"],
    loadedListingCount: 1,
    discoveredCount: 2,
    acceptedCount: 2,
    duplicateCount: 0,
    rejectedCount: 0,
    candidates,
    errors: [],
    ...overrides,
  };
}

function collectionFailure(
  code: CollectionError["code"],
  sourceCode: string,
): OperationResult<SourceCollectionSummary, CollectionError> {
  return {
    ok: false,
    error: {
      code,
      stage: "configuration",
      sourceCode,
      url: "https://internal.invalid/secret",
      recoverable: false,
      detail:
        "fetch ECONNREFUSED 10.0.0.5 token=SECRET <html>raw</html>",
    },
  };
}

test("invocador chama collectSource uma vez com sourceCode intacto, ISO e modo manual", async () => {
  const calls: CollectSourceInput[] = [];
  const summary = completedSummary();
  const invoke = createManualHttpNewsroomCollectionInvoker({
    clock: () => new Date(DETECTED_AT),
    async collectSource(input) {
      calls.push(input);
      return { ok: true, value: summary };
    },
  });

  const result = await invoke("record");

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    {
      sourceCode: "record",
      detectedAt: DETECTED_AT,
      executionMode: "manual",
    },
  ]);
  assert.equal(Number.isNaN(Date.parse(calls[0].detectedAt)), false);
  if (!result.ok) {
    throw new Error("A invocacao devia ter sucesso.");
  }
  assert.equal(result.report.executionMode, "manual");
  assert.equal(result.report.detectedAt, DETECTED_AT);
  assert.equal(result.report.status, "completed");
  assert.equal(result.report.totalCandidates, 2);
});

test("relatorio preserva candidatos, ordem e objetos sem nova transformacao", async () => {
  const summary = completedSummary();
  const invoke = createManualHttpNewsroomCollectionInvoker({
    clock: () => new Date(DETECTED_AT),
    async collectSource() {
      return { ok: true, value: summary };
    },
  });

  const result = await invoke("record");

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("A invocacao devia ter sucesso.");
  }
  assert.equal(result.report.candidates, summary.candidates);
  assert.equal(result.report.candidates[0], candidates[0]);
  assert.equal(result.report.candidates[1], candidates[1]);
  assert.deepEqual(
    result.report.candidates.map((candidate) => candidate.normalizedUrl),
    [
      "https://www.record.pt/noticia-primeira",
      "https://www.record.pt/noticia-segunda",
    ],
  );
  assert.deepEqual(JSON.parse(result.output), result.report);
});

test("zero candidatos produz relatorio valido e exit code zero", async () => {
  const invoke = createManualHttpNewsroomCollectionInvoker({
    clock: () => new Date(DETECTED_AT),
    async collectSource() {
      return {
        ok: true,
        value: completedSummary({
          discoveredCount: 0,
          acceptedCount: 0,
          candidates: [],
        }),
      };
    },
  });
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runManualHttpNewsroomCollectionCommand(
    ["record"],
    {
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
  assert.deepEqual(errors, []);
  assert.equal(JSON.parse(output[0]).totalCandidates, 0);
  assert.equal(JSON.parse(output[0]).status, "completed");
});

test("comando aceita exatamente um sourceCode e rejeita opcoes, purpose e URL", async () => {
  let invokeCalls = 0;
  const invalidArguments = [
    [],
    ["record", "abola"],
    [""],
    [" record"],
    ["--automatic"],
    ["record", "automatic"],
    ["record", "listing"],
    ["https://www.record.pt/"],
  ] as const;

  for (const args of invalidArguments) {
    const output: string[] = [];
    const errors: string[] = [];
    const exitCode = await runManualHttpNewsroomCollectionCommand(
      args,
      {
        async invoke() {
          invokeCalls += 1;
          throw new Error("Nao devia invocar.");
        },
        writeOutput(value) {
          output.push(value);
        },
        writeError(value) {
          errors.push(value);
        },
      },
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(output, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^Uso:/);
  }

  assert.equal(invokeCalls, 0);
});

test("nucleo rejeita sourceCode invalido antes de collectSource", async () => {
  let collectionCalls = 0;
  const invoke = createManualHttpNewsroomCollectionInvoker({
    clock: () => new Date(DETECTED_AT),
    async collectSource() {
      collectionCalls += 1;
      throw new Error("Nao devia recolher.");
    },
  });

  for (const sourceCode of [
    "",
    " record",
    "record ",
    "--manual",
    "https://www.record.pt/",
  ]) {
    const result = await invoke(sourceCode);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "invalid_invocation");
      assert.equal(result.error.code, "invalid_invocation");
    }
  }

  assert.equal(collectionCalls, 0);
});

test("erros publicos preservam o codigo sem expor detalhes internos", async () => {
  for (const [sourceCode, errorCode] of [
    ["desconhecida", "source_not_found"],
    ["maisfutebol", "source_inactive"],
    ["ojogo", "legal_hold"],
  ] as const) {
    let collectionCalls = 0;
    const invoke = createManualHttpNewsroomCollectionInvoker({
      clock: () => new Date(DETECTED_AT),
      async collectSource(input) {
        collectionCalls += 1;
        assert.deepEqual(input, {
          sourceCode,
          detectedAt: DETECTED_AT,
          executionMode: "manual",
        });
        return collectionFailure(errorCode, sourceCode);
      },
    });

    const result = await invoke(sourceCode);

    assert.equal(result.ok, false);
    assert.equal(collectionCalls, 1);
    if (result.ok) {
      throw new Error("A invocacao devia falhar.");
    }
    assert.equal(result.kind, "collection_failure");
    assert.equal(result.error.code, errorCode);
    assert.equal(result.report?.error.code, errorCode);
    assert.doesNotMatch(
      result.output,
      /ECONNREFUSED|10\.0\.0\.5|SECRET|<html>|internal\.invalid|stack/i,
    );
  }
});

test("bloqueios de Maisfutebol e O Jogo nao provocam segunda tentativa", async () => {
  for (const [sourceCode, errorCode] of [
    ["maisfutebol", "source_inactive"],
    ["ojogo", "legal_hold"],
  ] as const) {
    let collectionCalls = 0;
    const invoke = createManualHttpNewsroomCollectionInvoker({
      clock: () => new Date(DETECTED_AT),
      async collectSource() {
        collectionCalls += 1;
        return collectionFailure(errorCode, sourceCode);
      },
    });
    const errors: string[] = [];
    const exitCode = await runManualHttpNewsroomCollectionCommand(
      [sourceCode],
      {
        invoke,
        writeOutput() {
          throw new Error("Nao devia imprimir sucesso.");
        },
        writeError(value) {
          errors.push(value);
        },
      },
    );

    assert.equal(exitCode, 1);
    assert.equal(collectionCalls, 1);
    assert.equal(errors.length, 1);
    assert.equal(JSON.parse(errors[0]).error.code, errorCode);
  }
});

test("erro estrutural e sanitizado, nao repete recolha e produz exit code diferente de zero", async () => {
  let collectionCalls = 0;
  const invoke = createManualHttpNewsroomCollectionInvoker({
    clock: () => new Date(DETECTED_AT),
    async collectSource() {
      collectionCalls += 1;
      throw new Error(
        "postgres service_role=SECRET C:\\infra\\internal stack",
      );
    },
  });
  const errors: string[] = [];
  const exitCode = await runManualHttpNewsroomCollectionCommand(
    ["record"],
    {
      invoke,
      writeOutput() {
        throw new Error("Nao devia imprimir sucesso.");
      },
      writeError(value) {
        errors.push(value);
      },
    },
  );

  assert.equal(exitCode, 1);
  assert.equal(collectionCalls, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /invoker_structural_failure/);
  assert.doesNotMatch(
    errors[0],
    /postgres|service_role|SECRET|infra|stack/i,
  );
});

test("sucesso imprime uma vez e termina com exit code zero", async () => {
  let invocationCalls = 0;
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runManualHttpNewsroomCollectionCommand(
    ["abola"],
    {
      async invoke(sourceCode) {
        invocationCalls += 1;
        assert.equal(sourceCode, "abola");
        return {
          ok: true,
          report: {
            sourceCode: "abola",
            executionMode: "manual",
            detectedAt: DETECTED_AT,
            status: "completed",
            listingUrls: ["https://www.abola.pt/ultimas-noticias"],
            loadedListingCount: 1,
            discoveredCount: 0,
            totalCandidates: 0,
            duplicateCount: 0,
            rejectedCount: 0,
            candidates: [],
            errors: [],
          },
          output: '{"status":"completed"}',
        };
      },
      writeOutput(value) {
        output.push(value);
      },
      writeError(value) {
        errors.push(value);
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(invocationCalls, 1);
  assert.deepEqual(output, ['{"status":"completed"}']);
  assert.deepEqual(errors, []);
});

test("simples importacao do script nao executa recolha nem rede", () => {
  const repositoryRoot = resolve(".");
  const scriptUrl = pathToFileURL(
    resolve(
      repositoryRoot,
      "scripts/redacao-automatica/run-http-newsroom-collection.ts",
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
      [
        "let calls = 0;",
        "globalThis.fetch = () => { calls += 1; throw new Error('network'); };",
        `await import(${JSON.stringify(scriptUrl)});`,
        "console.log(String(calls));",
      ].join(" "),
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
  assert.equal(child.stdout.trim(), "0");
  assert.equal(child.stderr, "");
});

test("invocador permanece sem fetch, PageLoader direto, artigos ou persistencia", async () => {
  const [internalSource, scriptSource, collectionSource] = await Promise.all([
    readFile(
      new URL(
        "./manual-http-newsroom-collection-invoker-internal.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../scripts/redacao-automatica/run-http-newsroom-collection.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("./collection-service.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(
    internalSource,
    /\bfetch\s*\(|PageLoader|source-registry|adapter-registry|adapters\/|parser|normaliz|offline-newsroom|persist|supabase|rpc/i,
  );
  assert.equal(
    internalSource.match(/dependencies\.collectSource\(\{/g)?.length,
    1,
  );
  assert.match(
    internalSource,
    /executionMode:\s*"manual"/,
  );
  assert.doesNotMatch(
    `${internalSource}\n${scriptSource}`,
    /purpose:\s*"article"|extractArticle|ingestOffline|persist|newsroom-article|createDraft|publish/i,
  );
  assert.doesNotMatch(scriptSource, /\.load\(|discoverArticleLinks|normalizeArticleUrl/);
  assert.doesNotMatch(scriptSource, /\bfetch\s*\(/);
  assert.match(scriptSource, /import "server-only"/);
  assert.match(scriptSource, /collectSource\(\s*input,/);
  assert.match(
    scriptSource,
    /isDirectManualHttpCollectionExecution\(import\.meta\.url, process\.argv\[1\]\)/,
  );
  assert.doesNotMatch(
    scriptSource,
    /app\/api|route\.ts|Server Action|use server|cron|worker|webhook|setInterval/,
  );
  assert.match(
    collectionSource,
    /pageLoader\.load\(\{[\s\S]*?purpose:\s*"listing"/,
  );
});
