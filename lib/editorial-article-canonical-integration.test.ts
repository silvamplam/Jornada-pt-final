import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publicar artigo exige os campos canónicos, mas guardar rascunho continua permitido", async () => {
  const [route, service, page, form] = await Promise.all([
    readFile("app/api/admin/editorial/artigos/route.ts", "utf8"),
    readFile("lib/editorial-article-service-internal.ts", "utf8"),
    readFile("app/admin/editorial/artigos/page.tsx", "utf8"),
    readFile("app/admin/editorial/artigos/_articleForm.tsx", "utf8"),
  ]);
  assert.match(route, /createEditorialArticle/);
  assert.match(route, /updateEditorialArticle/);
  assert.match(service, /missingEditorialArticleCanonicalFields/);
  assert.match(service, /targetStatus === "published"/);
  assert.match(service, /missing-ante-title/);
  assert.match(service, /missing-author/);
  assert.match(page, /precisa de antetítulo/);
  assert.match(page, /precisa de autor/);
  assert.match(form, /Antetítulo · obrigatório para publicar/);
  assert.match(form, /Autor · obrigatório para publicar/);
  assert.doesNotMatch(form, /name="label"[^>]*required/);
  assert.doesNotMatch(form, /name="author"[^>]*required/);
});

test("a Composição só projeta artigos completos para o circuito de zonas", async () => {
  const route = await readFile("app/api/admin/editorial/composicao/route.ts", "utf8");
  assert.match(route, /select=id,slug,label,title,subtitle,body,image_url,author,published_at/);
  assert.match(route, /missingEditorialArticleCanonicalFields\(article\)/);
  assert.match(route, /Completa o artigo antes de o publicar ou transferir entre zonas/);
});
