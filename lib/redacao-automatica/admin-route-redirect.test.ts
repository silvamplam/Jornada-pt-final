import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeFiles = [
  "app/api/admin/editorial/redacao-automatica/drafts/route.ts",
  "app/api/admin/editorial/redacao-automatica/review/route.ts",
] as const;

for (const routeFile of routeFiles) {
  test(`${routeFile} devolve redirects internos relativos ao host usado pelo browser`, () => {
    const source = readFileSync(routeFile, "utf8");

    assert.match(source, /function redirectTo\(path: string, params: Record<string, string>\)/);
    assert.match(source, /new URL\(path, "https:\/\/jornada\.local"\)/);
    assert.match(source, /const location = `\$\{url\.pathname\}\$\{url\.search\}`/);
    assert.match(source, /headers: \{ Location: location \}/);
    assert.doesNotMatch(source, /new URL\(path, request\.url\)/);
    assert.doesNotMatch(source, /NextResponse\.redirect\(/);
  });
}
