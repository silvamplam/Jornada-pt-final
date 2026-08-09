import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EDITORIAL_CONTEXT_DESTINATION,
  EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS,
} from "@/lib/editorial-context-post-title";
import {
  EDITORIAL_EXTERNAL_ARTICLE_END_MARKER,
  EDITORIAL_EXTERNAL_ARTICLE_START_MARKER,
  parseEditorialExternalArticleResponse,
  parseStoredEditorialExternalArticle,
  parseStoredEditorialExternalArticleTransfer,
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

test("o máximo de Contexto só é aplicado quando a resposta declara esse destino", () => {
  const generic = parseEditorialExternalArticleResponse(`
${EDITORIAL_EXTERNAL_ARTICLE_START_MARKER}
ANTETÍTULO
LIGA
TÍTULO
Título válido
PÓS-TÍTULO
${"x".repeat(EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS + 1)}
CORPO
Corpo válido.
${EDITORIAL_EXTERNAL_ARTICLE_END_MARKER}
  `);
  assert.equal(generic.ok, true);

  const context = parseEditorialExternalArticleResponse(`
${EDITORIAL_EXTERNAL_ARTICLE_START_MARKER}
DESTINO EDITORIAL
CONTEXTO
ANTETÍTULO
LIGA
TÍTULO
Título válido
PÓS-TÍTULO
${"x".repeat(EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS + 1)}
CORPO
Corpo válido.
${EDITORIAL_EXTERNAL_ARTICLE_END_MARKER}
  `);
  assert.deepEqual(context, { ok: false, error: "context_post_title_too_long" });
});

test("um destino editorial desconhecido é rejeitado em vez de ser tratado como Contexto", () => {
  const result = parseEditorialExternalArticleResponse(`
${EDITORIAL_EXTERNAL_ARTICLE_START_MARKER}
DESTINO EDITORIAL
FAIXA
TÍTULO
Título válido
PÓS-TÍTULO
Pós-título válido.
CORPO
Corpo válido.
${EDITORIAL_EXTERNAL_ARTICLE_END_MARKER}
  `);

  assert.deepEqual(result, { ok: false, error: "structure_invalid" });
});

test("a resposta pode declarar explicitamente Contexto e o parser transporta esse destino", () => {
  const result = parseEditorialExternalArticleResponse(`
${EDITORIAL_EXTERNAL_ARTICLE_START_MARKER}
DESTINO EDITORIAL
CONTEXTO
ANTETÍTULO
FC PORTO-ALVERCA
TÍTULO
Título para Contexto
PÓS-TÍTULO
Texto factual preparado para o perfil de Contexto.
CORPO
Corpo integral.
${EDITORIAL_EXTERNAL_ARTICLE_END_MARKER}
  `);

  assert.deepEqual(result, {
    ok: true,
    value: {
      editorialDestination: EDITORIAL_CONTEXT_DESTINATION,
      anteTitle: "FC PORTO-ALVERCA",
      title: "Título para Contexto",
      postTitle: "Texto factual preparado para o perfil de Contexto.",
      body: "Corpo integral.",
    },
  });
});

test("o payload temporário expira e preserva os quatro campos editoriais", () => {
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

test("o payload temporário transporta imagens do pacote sem duplicar URLs", () => {
  const article = {
    anteTitle: "ANÁLISE",
    title: "Título",
    postTitle: "Pós-título",
    body: "Corpo.",
  };
  const sourcePackage = {
    year: "2026",
    month: "08",
    packageId: "11111111-1111-4111-8111-111111111111",
  };
  const stored = storedEditorialExternalArticle(article, 1_000, {
    sourcePackage,
    imageCandidates: [
      {
        position: 1,
        sourceCode: "record",
        articleTitle: "Fonte A",
        imageUrl: "https://example.com/a.jpg",
      },
      {
        position: 2,
        sourceCode: "abola",
        articleTitle: "Fonte B",
        imageUrl: "https://example.com/a.jpg",
      },
      {
        position: 3,
        sourceCode: "maisfutebol",
        articleTitle: "Fonte C",
        imageUrl: "https://example.com/c.webp",
      },
    ],
  });

  assert.deepEqual(
    parseStoredEditorialExternalArticleTransfer(JSON.stringify(stored), 1_500),
    {
      article,
      sourcePackage,
      imageCandidates: [
        {
          position: 1,
          sourceCode: "record",
          articleTitle: "Fonte A",
          imageUrl: "https://example.com/a.jpg",
        },
        {
          position: 3,
          sourceCode: "maisfutebol",
          articleTitle: "Fonte C",
          imageUrl: "https://example.com/c.webp",
        },
      ],
    },
  );
});


test("o payload temporário preserva o destino Contexto até ao editor de Artigos", () => {
  const article = {
    editorialDestination: EDITORIAL_CONTEXT_DESTINATION,
    anteTitle: "CONTEXTO",
    title: "Título",
    postTitle: "Pós-título adequado ao Contexto.",
    body: "Corpo.",
  };
  const stored = storedEditorialExternalArticle(article, 1_000);

  assert.deepEqual(
    parseStoredEditorialExternalArticleTransfer(JSON.stringify(stored), 1_500)?.article,
    article,
  );
});

test("novo artigo assume Silvestre Chícharo como autor sem alterar artigos existentes", () => {
  const form = readFileSync(
    "app/admin/editorial/artigos/_articleForm.tsx",
    "utf8",
  );

  assert.match(
    form,
    /const DEFAULT_ARTICLE_AUTHOR = "Silvestre Chícharo";/,
  );
  assert.match(
    form,
    /defaultValue=\{isEdit \? article\?\.author \?\? "" : DEFAULT_ARTICLE_AUTHOR\}/,
  );
});
