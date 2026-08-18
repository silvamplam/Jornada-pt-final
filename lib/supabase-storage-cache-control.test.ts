import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const CACHE_HEADER = "max-age=31536000";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function countCacheHeaders(value: string) {
  return value.split(`Cache-Control': '${CACHE_HEADER}`).length - 1
    + value.split(`Cache-Control": "${CACHE_HEADER}`).length - 1;
}

test("uploads editoriais novos ficam com cache persistente no Storage", () => {
  const articleForm = source("app/admin/editorial/artigos/_articleForm.tsx");
  const contentForm = source("app/admin/editorial/conteudos/_contentForm.tsx");
  const batchPublicationClient = source(
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
  );
  const importedImageRoute = source("app/api/admin/editorial/artigos/import-source-image/route.ts");
  const homeImageRoute = source("app/api/admin/editorial/home/image/route.ts");
  const matchdayImageRoute = source("app/api/admin/gestor/editorial-image/route.ts");

  assert.equal(countCacheHeaders(articleForm), 1);
  assert.equal(countCacheHeaders(contentForm), 2);
  assert.equal(countCacheHeaders(batchPublicationClient), 1);
  assert.equal(countCacheHeaders(importedImageRoute), 0);
  assert.equal(countCacheHeaders(homeImageRoute), 1);
  assert.equal(countCacheHeaders(matchdayImageRoute), 1);

  assert.match(importedImageRoute, /createClient/);
  assert.match(importedImageRoute, /\.storage\s*\.from\(BUCKET\)[\s\S]*?\.upload\(/);
  assert.match(importedImageRoute, /cacheControl:\s*"31536000"/);
  assert.match(importedImageRoute, /contentType,/);
  assert.match(importedImageRoute, /upsert:\s*false/);
  assert.doesNotMatch(importedImageRoute, /"Cache-Control":\s*"max-age=31536000"/);
  assert.doesNotMatch(importedImageRoute, /method:\s*"POST"/);
});

test("a política de cache acompanha uploads versionados, sem alterar URLs públicas", () => {
  const articleUploadRoute = source("app/api/admin/editorial/artigos/upload-image/sign/route.ts");
  const contentImageUploadRoute = source("app/api/admin/editorial/conteudos/upload-image/sign/route.ts");
  const contentVideoUploadRoute = source("app/api/admin/editorial/conteudos/upload-video/sign/route.ts");

  for (const route of [articleUploadRoute, contentImageUploadRoute, contentVideoUploadRoute]) {
    assert.match(route, /Date\.now\(\)/);
    assert.match(route, /randomUUID\(\)/);
    assert.match(route, /storage\/v1\/object\/public/);
  }
});
