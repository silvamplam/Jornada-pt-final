import assert from "node:assert/strict";
import test from "node:test";

import { readAdminJsonResponse } from "./admin-json-response";

test("resposta administrativa 200 application/json é lida normalmente", async () => {
  const payload = await readAdminJsonResponse<Readonly<{ ok: boolean }>>(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );

  assert.deepEqual(payload, { ok: true });
});

test("erro administrativo JSON preserva status e mensagem original", async () => {
  await assert.rejects(
    () => readAdminJsonResponse(
      new Response(
        JSON.stringify({
          ok: false,
          error: "authentication-required",
          message: "É necessária uma sessão administrativa válida.",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 401/);
      assert.match(error.message, /sessão administrativa válida/);
      return true;
    },
  );
});

test("erro administrativo text/plain preserva status e texto sem erro de JSON", async () => {
  await assert.rejects(
    () => readAdminJsonResponse(
      new Response("upstream temporariamente indisponível", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 503/);
      assert.match(error.message, /upstream temporariamente indisponível/);
      assert.doesNotMatch(error.message, /JSON\.parse|unexpected character/i);
      return true;
    },
  );
});

test("erro administrativo text/html é controlado sem expor o HTML", async () => {
  const html = `<html><body>${"detalhe interno ".repeat(100)}</body></html>`;

  await assert.rejects(
    () => readAdminJsonResponse(
      new Response(html, {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 500/);
      assert.match(error.message, /text\/html/);
      assert.doesNotMatch(error.message, /<html>|detalhe interno/);
      assert.doesNotMatch(error.message, /JSON\.parse|unexpected character/i);
      return true;
    },
  );
});

test("application/json inválido produz erro controlado com contexto HTTP", async () => {
  await assert.rejects(
    () => readAdminJsonResponse(
      new Response("{json-inválido", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 200/);
      assert.match(error.message, /JSON inválida/);
      assert.doesNotMatch(error.message, /JSON\.parse|unexpected character/i);
      return true;
    },
  );
});
