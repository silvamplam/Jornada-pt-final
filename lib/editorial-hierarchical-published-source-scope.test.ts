import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const compositionPage = source("app/admin/editorial/composicao/[matchdayId]/page.tsx");
const compositionRoute = source("app/api/admin/editorial/composicao/route.ts");

test("Publicação publicada limita notícias e vídeos à jornada atual ou sem jornada", () => {
  assert.match(compositionPage, /function readPublishedEditorialArticles\(matchdayId: string\)/);
  assert.match(compositionPage, /function readPublishedEditorialContents\(matchdayId: string\)/);
  assert.equal((compositionPage.match(/matchday_id\.is\.null/g) ?? []).length, 2);
  assert.match(compositionPage, /readPublishedEditorialArticles\(matchday\.id\)/);
  assert.match(compositionPage, /readPublishedEditorialContents\(matchday\.id\)/);
});

test("a action recusa publicação canónica pertencente a outra jornada", () => {
  assert.match(compositionRoute, /function publishedHierarchicalSourceMatchesMatchday/);
  assert.match(compositionRoute, /sourceMatchdayId === null \|\| sourceMatchdayId === matchdayId/);
  assert.equal(
    (compositionRoute.match(/publishedHierarchicalSourceMatchesMatchday\(article\.matchday_id, matchdayId\)/g) ?? []).length,
    2,
  );
  assert.match(compositionRoute, /publishedHierarchicalSourceMatchesMatchday\(content\.matchday_id, matchdayId\)/);
  assert.match(compositionRoute, /A publicação pertence a outra jornada\./);
  assert.match(compositionRoute, /editorial_contents\?select=id,matchday_id,slug/);
});
