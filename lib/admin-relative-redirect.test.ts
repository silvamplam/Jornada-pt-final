import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const routeRedirectFiles = [
  "app/api/admin/login/route.ts",
  "app/api/admin/logout/route.ts"
] as const;

test("o middleware sem sessão redireciona com URL absoluta no mesmo origin", async () => {
  const cases = [
    {
      requestedUrl: "https://www.jornada.pt/admin?area=editorial",
      expectedNext: "/admin?area=editorial"
    },
    {
      requestedUrl: "https://jornada-pt-final-preview.vercel.app/admin/editorial/redacao-automatica",
      expectedNext: "/admin/editorial/redacao-automatica"
    },
    {
      requestedUrl: "http://localhost:3000/admin",
      expectedNext: "/admin"
    },
    {
      requestedUrl: "https://www.jornada.pt/api/admin/competitions",
      expectedNext: "/admin/clubes"
    }
  ] as const;

  for (const { requestedUrl, expectedNext } of cases) {
    const request = new NextRequest(requestedUrl);
    const response = await middleware(request);
    const location = response.headers.get("location");

    assert.equal(response.status, 303);
    assert.ok(location, `Falta Location para ${requestedUrl}`);

    const requested = new URL(requestedUrl);
    const redirected = new URL(location);

    assert.equal(redirected.origin, requested.origin);
    assert.equal(redirected.pathname, "/admin/login");
    assert.equal(redirected.searchParams.get("next"), expectedNext);
    assert.notEqual(redirected.hostname, "jornada.local");
  }
});

test("o middleware usa request.nextUrl e NextResponse.redirect sem host fixo", async () => {
  const source = await readFile("middleware.ts", "utf8");

  assert.match(source, /const url = request\.nextUrl\.clone\(\)/);
  assert.match(source, /url\.pathname = "\/admin\/login"/);
  assert.match(source, /url\.search = ""/);
  assert.match(source, /NextResponse\.redirect\(url, \{ status: 303 \}\)/);
  assert.doesNotMatch(source, /https:\/\/jornada\.local/);
  assert.doesNotMatch(source, /www\.jornada\.pt/);
  assert.doesNotMatch(source, /headers:\s*\{\s*Location:/);
});

test("login e logout mantêm Location relativa nas route handlers", async () => {
  const sources = await Promise.all(
    routeRedirectFiles.map(async (file) => ({
      file,
      source: await readFile(file, "utf8")
    }))
  );

  for (const { file, source } of sources) {
    assert.match(source, /Location:/, `${file} deve declarar o header Location`);
    assert.doesNotMatch(
      source,
      /new URL\([^\n]*request\.url/,
      `${file} não deve voltar a expor o host interno através de request.url`
    );
  }

  assert.match(
    sources.find(({ file }) => file === "app/api/admin/login/route.ts")?.source ?? "",
    /Location:\s*`\$\{url\.pathname\}\$\{url\.search\}`/
  );
  assert.match(
    sources.find(({ file }) => file === "app/api/admin/logout/route.ts")?.source ?? "",
    /Location:\s*"\/admin\/login\?loggedOut=1"/
  );
});
