import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { middleware, config } from "../../middleware";
import { POST as login } from "../../app/api/admin/login/route";
import { POST as logout } from "../../app/api/admin/logout/route";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS, createAdminSession } from "../admin-session";

// Real middleware, matcher and login/logout handlers. Synthetic secrets only.
// No Supabase adapter is imported and any attempted fetch fails the suite.
const origin = "https://mesa-entry.test.invalid";
const id = "b0000000-0000-4000-8000-000000000001";
const paths = [
  "/admin/editorial/redacao-automatica/mesa",
  `/admin/editorial/redacao-automatica/mesa/temas/${id}`,
  `/admin/editorial/redacao-automatica/mesa/producao/${id}`,
  "/admin/editorial/redacao-automatica/publicacao-lote",
  "/api/admin/editorial/redacao-automatica/mesa/preparar",
  "/api/admin/editorial/redacao-automatica/mesa/workspace",
  "/api/admin/editorial/redacao-automatica/mesa/organizacao",
  "/api/admin/editorial/redacao-automatica/publicacao-lote",
  `/api/admin/editorial/redacao-automatica/source-package/2026/09/${id}`,
];
function request(path: string, session?: string) {
  return new NextRequest(origin + path, { headers: session ? { cookie: `${ADMIN_SESSION_COOKIE}=${session}` } : {} });
}
function signedAt(timestamp: number, secret: string) {
  const payload = `v1.${timestamp}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
function loginRequest(password: string, next: string) {
  const body = new FormData(); body.set("password", password); body.set("next", next);
  return new Request(origin + "/api/admin/login", { method: "POST", body });
}

test("Mesa: fronteira administrativa real, sem rede nem dados de produção", async (t) => {
  const previous = { password: process.env.ADMIN_PASSWORD, secret: process.env.ADMIN_SESSION_SECRET, node: process.env.NODE_ENV };
  const secret = randomBytes(32).toString("hex");
  const password = randomBytes(24).toString("hex");
  const fetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; throw new Error("admin-entry-external-network-forbidden"); };
  Object.assign(process.env, { ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: secret, NODE_ENV: "production" });
  try {
    await t.test("o matcher real cobre todas as páginas e APIs do circuito", () => {
      for (const path of paths) {
        assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: origin + path }), true, path);
      }
      assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: origin + "/_next/static/chunk.js" }), false);
    });
    await t.test("sem sessão, todas as entradas são recusadas antes do handler", async () => {
      for (const path of paths) {
        const response = await middleware(request(path + "?ensaio=1"));
        assert.equal(response.status, 303, path);
        assert.equal(response.headers.get("x-middleware-next"), null);
        const destination = new URL(response.headers.get("location")!);
        assert.equal(destination.origin, origin); assert.equal(destination.pathname, "/admin/login");
        assert.equal(destination.searchParams.get("next"), path.startsWith("/api/") ? "/admin/clubes" : path + "?ensaio=1");
      }
    });
    await t.test("cookie forjado, assinatura de outro segredo e sessão expirada são recusados", async () => {
      const expired = signedAt(Date.now() - (ADMIN_SESSION_MAX_AGE_SECONDS + 1) * 1000, secret);
      for (const session of ["admin", "v1.NaN.invalid", signedAt(Date.now(), "different-test-secret"), expired]) {
        for (const path of paths) assert.equal((await middleware(request(path, session))).status, 303, path);
      }
    });
    await t.test("sessão assinada pelo código real atravessa todas as entradas", async () => {
      const session = await createAdminSession();
      for (const path of paths) {
        const response = await middleware(request(path, session));
        assert.equal(response.status, 200, path);
        assert.equal(response.headers.get("x-middleware-next"), "1", path);
      }
    });
    await t.test("login inválido não cria sessão nem usa Supabase", async () => {
      const response = await login(loginRequest("incorrect", paths[1]));
      assert.equal(response.status, 303); assert.equal(response.cookies.get(ADMIN_SESSION_COOKIE), undefined);
      const url = new URL(response.headers.get("location")!, origin);
      assert.equal(url.searchParams.get("error"), "invalid");
    });
    await t.test("login real regressa ao Tema e emite cookie protegido aceite pelo middleware", async () => {
      const response = await login(loginRequest(password, paths[1]));
      assert.equal(response.headers.get("location"), paths[1]);
      const cookie = response.cookies.get(ADMIN_SESSION_COOKIE)!;
      assert.ok(cookie.value); assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true);
      assert.equal(cookie.sameSite, "lax"); assert.equal(cookie.path, "/");
      assert.equal(cookie.maxAge, ADMIN_SESSION_MAX_AGE_SECONDS);
      assert.equal((await middleware(request(paths[1], cookie.value))).headers.get("x-middleware-next"), "1");
    });
    await t.test("login não redireciona para um endereço externo", async () => {
      for (const next of ["https://example.invalid", "//example.invalid", "/admin/login"]) {
        assert.equal((await login(loginRequest(password, next))).headers.get("location"), "/admin");
      }
    });
    await t.test("logout apaga o cookie e o pedido seguinte deixa de passar", async () => {
      const response = await logout();
      assert.equal(response.status, 303); assert.equal(response.cookies.get(ADMIN_SESSION_COOKIE)?.maxAge, 0);
      assert.equal((await middleware(request(paths[0]))).status, 303);
    });
    await t.test("configuração em falta falha fechada sem consultar dados", async () => {
      delete process.env.ADMIN_PASSWORD; delete process.env.ADMIN_SESSION_SECRET;
      assert.equal((await middleware(request(paths[0], signedAt(Date.now(), secret)))).status, 303);
      const response = await login(loginRequest(password, paths[0]));
      assert.equal(response.headers.get("location"), "/admin/login?error=missing");
      assert.equal(response.cookies.get(ADMIN_SESSION_COOKIE), undefined);
    });
    assert.equal(fetches, 0, "Authentication must not call the editorial database");
  } finally {
    globalThis.fetch = fetch;
    for (const [key, value] of Object.entries({ ADMIN_PASSWORD: previous.password, ADMIN_SESSION_SECRET: previous.secret, NODE_ENV: previous.node })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
