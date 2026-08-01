import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITORIAL_EXTERNAL_ARTICLE_END_MARKER,
  EDITORIAL_EXTERNAL_ARTICLE_START_MARKER,
  parseEditorialExternalArticleResponse,
  parseStoredEditorialExternalArticle,
  storedEditorialExternalArticle,
} from "./editorial-external-article-import";

test("interpreta a estrutura editorial completa entre os marcadores", () => {
  const result = parseEditorialExternalArticleResponse(`
${EDITORIAL_EXTERNAL_ARTICLE_START_MARKER}
ANTETÍTULO

GOVERNAÇÃO DO FUTEBOL MUNDIAL

TÍTULO

A FIFA recuou no negócio, mas não resolveu o problema de confiança

PÓS-TÍTULO

O plano foi abandonado depois da oposição internacional.

CORPO

Primeiro parágrafo.

Segundo parágrafo.
${EDITORIAL_EXTERNAL_ARTICLE_END_MARKER}
  `);

  assert.deepEqual(result, {
    ok: true,
    value: {
      anteTitle: "GOVERNAÇÃO DO FUTEBOL MUNDIAL",
      title: "A FIFA recuou no negócio, mas não resolveu o problema de confiança",
      postTitle: "O plano foi abandonado depois da oposição internacional.",
      body: "Primeiro parágrafo.\n\nSegundo parágrafo.",
    },
  });
});

test("aceita a estrutura legível sem marcadores e com títulos Markdown", () => {
  const result = parseEditorialExternalArticleResponse(`
## ANTETÍTULO
Mercado

**TÍTULO**
Título principal

### PÓS-TÍTULO
Contexto adicional.

CORPO:
Corpo integral.
  `);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.anteTitle, "Mercado");
    assert.equal(result.value.title, "Título principal");
    assert.equal(result.value.postTitle, "Contexto adicional.");
    assert.equal(result.value.body, "Corpo integral.");
  }
});

test("permite antetítulo e pós-título vazios", () => {
  const result = parseEditorialExternalArticleResponse(`
${EDITORIAL_EXTERNAL_ARTICLE_START_MARKER}
ANTETÍTULO
TÍTULO
Uma breve
PÓS-TÍTULO
CORPO
Texto curto.
${EDITORIAL_EXTERNAL_ARTICLE_END_MARKER}
  `);

  assert.deepEqual(result, {
    ok: true,
    value: {
      anteTitle: null,
      title: "Uma breve",
      postTitle: null,
      body: "Texto curto.",
    },
  });
});

test("rejeita marcadores incompletos, título ausente e corpo ausente", () => {
  assert.deepEqual(
    parseEditorialExternalArticleResponse(`${EDITORIAL_EXTERNAL_ARTICLE_START_MARKER}\nTÍTULO\nTeste`),
    { ok: false, error: "markers_incomplete" },
  );
  assert.deepEqual(
    parseEditorialExternalArticleResponse("CORPO\nTexto"),
    { ok: false, error: "title_missing" },
  );
  assert.deepEqual(
    parseEditorialExternalArticleResponse("TÍTULO\nTexto"),
    { ok: false, error: "body_missing" },
  );
});

test("o payload temporário expira e preserva apenas os quatro campos editoriais", () => {
  const article = {
    anteTitle: "ANÁLISE",
    title: "Título",
    postTitle: "Pós-título",
    body: "Corpo.",
  };
  const stored = storedEditorialExternalArticle(article, 1_000);

  assert.deepEqual(
    parseStoredEditorialExternalArticle(JSON.stringify(stored), 1_500),
    article,
  );
  assert.equal(
    parseStoredEditorialExternalArticle(JSON.stringify(stored), 1_000 + 31 * 60 * 1000),
    null,
  );
});
