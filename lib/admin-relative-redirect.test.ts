import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const redirectFiles = [
  "middleware.ts",
  "app/api/admin/login/route.ts",
  "app/api/admin/logout/route.ts"
] as const;

test("os redirects administrativos usam Location relativa e não expõem o host interno", async () => {
  const sources = await Promise.all(
    redirectFiles.map(async (file) => ({
      file,
      source: await readFile(file, "utf8")
    }))
  );

  for (const { file, source } of sources) {
    assert.doesNotMatch(
      source,
      /new URL\([^\n]*request\.url/,
      `${file} não pode construir redirects com request.url`
    );
    assert.doesNotMatch(
      source,
      /NextResponse\.redirect/,
      `${file} não deve depender de redirects absolutos do NextResponse`
    );
    assert.match(
      source,
      /Location:/,
      `${file} deve declarar explicitamente o header Location`
    );
  }

  assert.match(
    sources.find(({ file }) => file === "middleware.ts")?.source ?? "",
    /Location:\s*`\$\{url\.pathname\}\$\{url\.search\}`/
  );
  assert.match(
    sources.find(({ file }) => file === "app\/api\/admin\/login\/route.ts")?.source ?? "",
    /const response = relativeRedirect\(nextPath\)/
  );
  assert.match(
    sources.find(({ file }) => file === "app\/api\/admin\/logout\/route.ts")?.source ?? "",
    /Location:\s*"\/admin\/login\?loggedOut=1"/
  );
});
