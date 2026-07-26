import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import type {
  IngestHttpNewsroomArticleInput,
  IngestHttpNewsroomArticleResult,
} from "@/lib/redacao-automatica/http-newsroom-ingestion-internal";
import {
  createManualHttpNewsroomArticleInvoker,
  runManualHttpNewsroomArticleCommand,
} from "@/lib/redacao-automatica/manual-http-newsroom-article-invoker-internal";

const TIMESTAMP = "2026-07-26T16:00:00.000Z";
const ARTICLE_URL =
  "https://www.record.pt/futebol/futebol-nacional/detalhe/teste-controlado";

function ingestionSuccess(): IngestHttpNewsroomArticleResult {
  return {
    ok: true,
    value: {
      complete: true,
      sourceCode: "record",
      executionMode: "manual",
      ingestionMode: "http_manual_article",
      originalUrl: ARTICLE_URL,
      finalUrl: ARTICLE_URL,
      normalizedUrl: ARTICLE_URL,
      contentHash: "a".repeat(64),
      title: "Titulo sintetico",
      publishedAt: "2026-07-26T15:00:00.000Z",
      detectedAt: TIMESTAMP,
      extractedAt: TIMESTAMP,
      loadedAt: TIMESTAMP,
      statusCode: 200,
      redirectCount: 0,
      byteLength: 3210,
      article: {
        id: "11111111-1111-4111-8111-111111111111",
        action: "created",
      },
      snapshot: {
        id: "22222222-2222-4222-8222-222222222222",
        action: "created",
      },
    },
  };
}

function ingestionFailure(): IngestHttpNewsroomArticleResult {
  return {
    ok: false,
    error: {
      code: "timeout",
      stage: "loading",
      message:
        "fetch SECRET 10.0.0.1 <html>raw</html> stack service_role",
      sourceCode: "record",
      persistenceCode: null,
      operationIncomplete: false,
    },
  };
}

test("invocador gera um unico instante ISO e chama a ingestao exatamente uma vez", async () => {
  const calls: IngestHttpNewsroomArticleInput[] = [];
  const invoke = createManualHttpNewsroomArticleInvoker({
    clock: () => new Date(TIMESTAMP),
    async ingestArticle(value) {
      calls.push(value);
      return ingestionSuccess();
    },
  });
  const result = await invoke("record", ARTICLE_URL);

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    {
      sourceCode: "record",
      articleUrl: ARTICLE_URL,
      detectedAt: TIMESTAMP,
      extractedAt: TIMESTAMP,
    },
  ]);
  assert.equal(Number.isNaN(Date.parse(calls[0].detectedAt)), false);
});

test("relatorio de sucesso e JSON legivel, completo e sem corpo ou HTML", async () => {
  const invoke = createManualHttpNewsroomArticleInvoker({
    clock: () => new Date(TIMESTAMP),
    async ingestArticle() {
      return ingestionSuccess();
    },
  });
  const result = await invoke("record", ARTICLE_URL);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("A invocacao devia concluir.");
  }
  assert.deepEqual(JSON.parse(result.output), result.report);
  assert.equal(result.report.executionMode, "manual");
  assert.equal(result.report.ingestionMode, "http_manual_article");
  assert.equal(result.report.articleAction, "created");
  assert.equal(result.report.snapshotAction, "created");
  assert.doesNotMatch(result.output, /contentHash|body|sourceMetadata|<html/i);
});

test("comando aceita exatamente sourceCode e articleUrl e produz exit code zero", async () => {
  let invocationCalls = 0;
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runManualHttpNewsroomArticleCommand(
    ["record", ARTICLE_URL],
    {
      async invoke(sourceCode, articleUrl) {
        invocationCalls += 1;
        assert.equal(sourceCode, "record");
        assert.equal(articleUrl, ARTICLE_URL);
        const success = ingestionSuccess();
        if (!success.ok) {
          throw new Error("Fixture invalida.");
        }
        return {
          ok: true,
          report: {
            sourceCode: success.value.sourceCode,
            executionMode: "manual",
            ingestionMode: "http_manual_article",
            originalUrl: success.value.originalUrl,
            finalUrl: success.value.finalUrl,
            normalizedUrl: success.value.normalizedUrl,
            status: "completed",
            articleAction: success.value.article.action,
            snapshotAction: success.value.snapshot.action,
            articleId: success.value.article.id,
            snapshotId: success.value.snapshot.id,
            title: success.value.title,
            publishedAt: success.value.publishedAt,
            detectedAt: success.value.detectedAt,
            extractedAt: success.value.extractedAt,
            statusCode: success.value.statusCode,
            redirectCount: success.value.redirectCount,
            byteLength: success.value.byteLength,
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

test("rejeita argumentos insuficientes, adicionais, opcoes e URLs invalidas", async () => {
  let invocationCalls = 0;
  const invalidArguments = [
    [],
    ["record"],
    ["record", ARTICLE_URL, "extra"],
    ["", ARTICLE_URL],
    [" record", ARTICLE_URL],
    ["--manual", ARTICLE_URL],
    ["record", ""],
    ["record", "url-invalida"],
    ["record", "https://user:secret@www.record.pt/artigo"],
  ] as const;

  for (const args of invalidArguments) {
    const output: string[] = [];
    const errors: string[] = [];
    const exitCode = await runManualHttpNewsroomArticleCommand(args, {
      async invoke() {
        invocationCalls += 1;
        throw new Error("Nao devia invocar.");
      },
      writeOutput(value) {
        output.push(value);
      },
      writeError(value) {
        errors.push(value);
      },
    });
    assert.equal(exitCode, 1);
    assert.deepEqual(output, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^Uso:/);
  }
  assert.equal(invocationCalls, 0);
});

test("nucleo rejeita invocacao invalida antes da ingestao", async () => {
  let ingestionCalls = 0;
  const invoke = createManualHttpNewsroomArticleInvoker({
    clock: () => new Date(TIMESTAMP),
    async ingestArticle() {
      ingestionCalls += 1;
      return ingestionSuccess();
    },
  });
  for (const [sourceCode, articleUrl] of [
    ["", ARTICLE_URL],
    ["record ", ARTICLE_URL],
    ["--manual", ARTICLE_URL],
    ["record", "invalid"],
    ["record", "https://u:p@www.record.pt/artigo"],
  ]) {
    const result = await invoke(sourceCode, articleUrl);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "invalid_invocation");
    }
  }
  assert.equal(ingestionCalls, 0);
});

test("erro publico gera exit code diferente de zero sem expor detalhe interno", async () => {
  let ingestionCalls = 0;
  const invoke = createManualHttpNewsroomArticleInvoker({
    clock: () => new Date(TIMESTAMP),
    async ingestArticle() {
      ingestionCalls += 1;
      return ingestionFailure();
    },
  });
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runManualHttpNewsroomArticleCommand(
    ["record", ARTICLE_URL],
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
  assert.equal(exitCode, 1);
  assert.equal(ingestionCalls, 1);
  assert.deepEqual(output, []);
  assert.equal(errors.length, 1);
  assert.equal(JSON.parse(errors[0]).error.code, "timeout");
  assert.doesNotMatch(
    errors[0],
    /SECRET|10\.0\.0\.1|<html>|stack|service_role/i,
  );
});

test("falha estrutural e sanitizada e nao provoca retry", async () => {
  let ingestionCalls = 0;
  const invoke = createManualHttpNewsroomArticleInvoker({
    clock: () => new Date(TIMESTAMP),
    async ingestArticle() {
      ingestionCalls += 1;
      throw new Error("postgres service_role=SECRET stack C:\\internal");
    },
  });
  const result = await invoke("record", ARTICLE_URL);
  assert.equal(result.ok, false);
  assert.equal(ingestionCalls, 1);
  if (!result.ok) {
    assert.equal(result.kind, "structural_failure");
    assert.match(result.output, /invoker_structural_failure/);
    assert.doesNotMatch(
      result.output,
      /postgres|service_role|SECRET|stack|internal/i,
    );
  }
});

test("simples importacao do script nao executa, nao faz rede nem persiste", () => {
  const repositoryRoot = resolve(".");
  const scriptUrl = pathToFileURL(
    resolve(
      repositoryRoot,
      "scripts/redacao-automatica/run-http-newsroom-article-ingestion.ts",
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

test("invocador e script nao aceitam controlos HTTP nem imprimem dados proibidos", async () => {
  const [internalSource, scriptSource] = await Promise.all([
    readFile(
      new URL(
        "./manual-http-newsroom-article-invoker-internal.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../scripts/redacao-automatica/run-http-newsroom-article-ingestion.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.doesNotMatch(
    `${internalSource}\n${scriptSource}`,
    /\bfetch\s*\(|headers|cookies|timeoutMs|maxBytes|maxRedirects|service.role|sourceMetadata|contentHash/i,
  );
  assert.doesNotMatch(
    `${internalSource}\n${scriptSource}`,
    /editorial_articles|\bpublish\s*\(|createDraft|competition|season|matchday|cron|worker|retry|setInterval/i,
  );
  assert.equal(
    internalSource.match(/dependencies\.ingestArticle\(\{/g)?.length,
    1,
  );
  assert.match(scriptSource, /import "server-only"/);
  assert.match(
    scriptSource,
    /isDirectManualHttpArticleExecution\(import\.meta\.url, process\.argv\[1\]\)/,
  );
});
