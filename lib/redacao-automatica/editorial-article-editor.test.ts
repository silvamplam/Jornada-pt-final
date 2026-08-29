import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getEditorialArticleEditorData,
  requestedEditorialArticleId,
} from "./editorial-article-editor-repository-internal";

const ARTICLE_ID = "10000000-0000-4000-8000-000000000001";

test("articleId válido é normalizado e o modo novo mantém a criação manual", () => {
  assert.deepEqual(
    requestedEditorialArticleId(ARTICLE_ID.toUpperCase(), undefined),
    { kind: "valid", id: ARTICLE_ID },
  );
  assert.deepEqual(requestedEditorialArticleId(undefined, undefined), { kind: "absent" });
  assert.deepEqual(requestedEditorialArticleId(ARTICLE_ID, "novo"), { kind: "absent" });
});

test("articleId inválido é controlado antes de qualquer consulta", () => {
  assert.deepEqual(
    requestedEditorialArticleId("id=eq.anything", undefined),
    { kind: "invalid", value: "id=eq.anything" },
  );
  assert.deepEqual(
    requestedEditorialArticleId("00000000-0000-0000-0000-000000000000", undefined),
    { kind: "invalid", value: "00000000-0000-0000-0000-000000000000" },
  );
});

test("lookup direto não depende dos primeiros 100, da ordem nem do estado", () => {
  const repository = readFileSync(
    "lib/redacao-automatica/editorial-article-editor-repository.ts",
    "utf8",
  );
  const page = readFileSync("app/admin/editorial/artigos/page.tsx", "utf8");

  assert.match(repository, /editorial_articles\?select=\*/);
  assert.match(repository, /&id=eq\.\$\{encodeURIComponent\(articleId\)\}&limit=1/);
  assert.doesNotMatch(repository, /order=/);
  assert.doesNotMatch(repository, /status=eq\./);
  assert.doesNotMatch(repository, /limit=100/);
  assert.match(page, /getEditorialArticleEditorData\(/);
  assert.match(page, /requestedArticleState === "not_found"/);
  assert.match(page, /requestedArticleState === "invalid"/);
  assert.match(page, /selectedArticle \|\| canCreate/);
  assert.doesNotMatch(repository, /writeSupabaseAdmin/);
});

test("artigos draft e published abrem por ID, mesmo ausentes da lista de navegação", async () => {
  const draft = { id: ARTICLE_ID, status: "draft" };
  const published = {
    id: "10000000-0000-4000-8000-000000000002",
    status: "published",
  };
  const listedArticles = [{ id: "10000000-0000-4000-8000-000000000099" }];
  const rows = new Map([[draft.id, draft], [published.id, published]]);
  const readById = async (id: string) => ({ ok: true as const, value: rows.get(id) ?? null });

  for (const article of [draft, published]) {
    assert.equal(listedArticles.some((listed) => listed.id === article.id), false);
    const data = await getEditorialArticleEditorData(article.id, undefined, readById);
    assert.equal(data.state, "ready");
    assert.equal(data.article, article);
  }
});

test("UUID inexistente não abre criação e ausência de articleId mantém o comportamento atual", async () => {
  let reads = 0;
  const readById = async () => {
    reads += 1;
    return { ok: true as const, value: null };
  };
  const missing = await getEditorialArticleEditorData(ARTICLE_ID, undefined, readById);
  assert.equal(missing.state, "not_found");
  assert.equal(missing.article, null);
  assert.equal(missing.request.kind, "valid");

  const absent = await getEditorialArticleEditorData(undefined, undefined, readById);
  assert.equal(absent.state, "ready");
  assert.equal(absent.request.kind, "absent");
  assert.equal(reads, 1);
});

test("a lista continua limitada apenas para navegação e não recebe uma cópia do artigo direto", () => {
  const page = readFileSync("app/admin/editorial/artigos/page.tsx", "utf8");
  assert.match(
    page,
    /editorial_articles\?select=id,slug,title,subtitle,label,author,status,scope,image_url,published_at,created_at,updated_at,competition_id,season_id,matchday_id&order=.*&limit=100/,
  );
  assert.doesNotMatch(
    page,
    /editorial_articles\?select=\*/,
  );
  assert.match(page, /const sidebarItems = articles\.map/);
  assert.doesNotMatch(page, /articles\.(push|unshift)\(selectedArticle/);
});
