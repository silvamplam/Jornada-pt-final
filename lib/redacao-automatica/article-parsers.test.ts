import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { abolaAdapter } from "@/lib/redacao-automatica/adapters/abola";
import { recordAdapter } from "@/lib/redacao-automatica/adapters/record";
import type { SourceAdapter } from "@/lib/redacao-automatica/adapters/source-adapter";
import type {
  AdapterResult,
  ArticleBodyBlock,
  CollectionError,
  CollectionErrorCode,
  LoadedPage,
  NormalizedDetectedArticle,
  SourceConfiguration,
} from "@/lib/redacao-automatica/types";

const LOADED_AT = "2026-07-20T11:45:00.000Z";
const DETECTED_AT = "2026-07-20T12:00:00.000Z";

const RECORD_FULL_URL =
  "https://www.record.pt/futebol/futebol-nacional/liga-betclic/benfica/detalhe/artigo-sintetico";
const RECORD_MINIMAL_URL =
  "https://www.record.pt/futebol/futebol-nacional/liga-betclic/porto/detalhe/artigo-minimo";
const RECORD_RESTRICTED_URL =
  "https://www.record.pt/futebol/futebol-nacional/liga-betclic/sporting/detalhe/artigo-restrito";
const RECORD_MAINVIDEO_URL =
  "https://www.record.pt/futebol/futebol-nacional/detalhe/artigo-linear-com-video-incidental";
const RECORD_DATE_ONLY_URL =
  "https://www.record.pt/futebol/futebol-nacional/detalhe/artigo-data-calendario";
const ABOLA_FULL_URL =
  "https://www.abola.pt/noticias/artigo-sintetico-1234567890123456789";
const ABOLA_MINIMAL_URL =
  "https://www.abola.pt/noticias/artigo-minimo-9876543210987654321";
const ABOLA_INSUFFICIENT_URL =
  "https://www.abola.pt/noticias/artigo-curto-1111111111111111111";

const RECORD_SOURCE: SourceConfiguration = {
  code: "record",
  name: "Record",
  domain: "record.pt",
  homepage: "https://www.record.pt/",
  adapterKey: "record",
  operationalStatus: "paused",
  monitoringEnabled: false,
  manualCollectionEnabled: false,
  inactiveReason: "Fixture local.",
  legalNote: null,
  editorialNote: "Fixture local sintética.",
  displayOrder: 10,
};

const ABOLA_SOURCE: SourceConfiguration = {
  code: "abola",
  name: "A Bola",
  domain: "abola.pt",
  homepage: "https://www.abola.pt/",
  adapterKey: "abola",
  operationalStatus: "paused",
  monitoringEnabled: false,
  manualCollectionEnabled: false,
  inactiveReason: "Fixture local.",
  legalNote: null,
  editorialNote: "Fixture local sintética.",
  displayOrder: 20,
};

async function readFixture(relativePath: string): Promise<string> {
  return readFile(new URL(`./__fixtures__/${relativePath}`, import.meta.url), "utf8");
}

function loadedPage(
  html: string,
  finalUrl: string,
  requestedUrl = finalUrl,
): LoadedPage {
  return {
    requestedUrl,
    finalUrl,
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: html,
    loadedAt: LOADED_AT,
    redirectCount: 0,
    byteLength: Buffer.byteLength(html, "utf8"),
  };
}

function extractArticle(
  adapter: SourceAdapter,
  source: SourceConfiguration,
  html: string,
  finalUrl: string,
  requestedUrl = finalUrl,
): AdapterResult<NormalizedDetectedArticle> {
  if (typeof adapter.extractArticle !== "function") {
    throw new Error(`O adapter ${adapter.key} não expõe extractArticle().`);
  }

  return adapter.extractArticle({
    source,
    page: loadedPage(html, finalUrl, requestedUrl),
    detectedAt: DETECTED_AT,
  });
}

function expectSuccess(
  result: AdapterResult<NormalizedDetectedArticle>,
): NormalizedDetectedArticle {
  if (!result.ok) {
    throw new Error(`Era esperado sucesso, mas foi devolvido ${result.error.code}.`);
  }

  return result.value;
}

function expectError(
  result: AdapterResult<NormalizedDetectedArticle>,
  expected: Readonly<{
    code: CollectionErrorCode;
    sourceCode: "record" | "abola";
    recoverable: boolean;
    detail: RegExp;
  }>,
): CollectionError {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error(`Era esperado o erro ${expected.code}.`);
  }

  assert.equal(result.error.code, expected.code);
  assert.equal(result.error.stage, "article");
  assert.equal(result.error.sourceCode, expected.sourceCode);
  assert.equal(result.error.recoverable, expected.recoverable);
  assert.match(result.error.detail ?? "", expected.detail);
  return result.error;
}

function replaceRequired(html: string, search: string, replacement: string): string {
  assert.ok(html.includes(search), `Não foi encontrado o marcador: ${search}`);
  return html.replace(search, replacement);
}

function replaceFixtureBody(html: string, replacement: string): string {
  const startMarker = "<!-- fixture-body-start -->";
  const endMarker = "<!-- fixture-body-end -->";
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);

  assert.ok(start >= 0 && end > start, "A fixture não contém os marcadores de corpo.");
  return `${html.slice(0, start + startMarker.length)}\n${replacement}\n${html.slice(end)}`;
}

function invalidateAllJsonLd(html: string): string {
  let replacementCount = 0;
  const invalidHtml = html.replace(
    /(<script type="application\/ld\+json">)[\s\S]*?(<\/script>)/gi,
    (_match, openingTag: string, closingTag: string) => {
      replacementCount += 1;
      return `${openingTag}\n{ json-invalido\n${closingTag}`;
    },
  );

  assert.ok(replacementCount > 0, "A fixture não contém JSON-LD para invalidar.");
  return invalidHtml;
}

function bodyWordCount(body: readonly ArticleBodyBlock[]): number {
  return body.reduce(
    (total, block) => total + block.text.trim().split(/\s+/).length,
    0,
  );
}

test("Record extrai integralmente uma fixture completa e preserva proveniência", async () => {
  const html = await readFixture("record/article-valid-full.html");
  const page = loadedPage(html, RECORD_FULL_URL);
  const article = expectSuccess(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_FULL_URL),
  );

  assert.equal(article.sourceCode, "record");
  assert.equal(article.originalUrl, RECORD_FULL_URL);
  assert.equal(article.normalizedUrl, RECORD_FULL_URL);
  assert.equal(article.externalId, "7654321");
  assert.equal(article.title, "Equipa prepara encontro com trabalho técnico");
  assert.equal(
    article.subtitle,
    "Sessão decorreu com intensidade e objetivos definidos",
  );
  assert.equal(
    article.summary,
    "Resumo sintético para validar a extração integral do artigo do Record.",
  );
  assert.equal(article.author, "Jornalista Sintético");
  assert.equal(article.publishedAt, "2026-07-20T08:00:00.000Z");
  assert.equal(article.modifiedAt, "2026-07-20T09:15:00.000Z");
  assert.equal(article.imageUrl, "https://assets.example.invalid/record-main.jpg");
  assert.equal(article.detectedAt, DETECTED_AT);
  assert.equal(article.excerpt, null);
  assert.equal(article.processingStatus, "detected");

  assert.deepEqual(article.body, [
    {
      type: "paragraph",
      text: "A equipa iniciou a sessão com exercícios técnicos e circulação rápida de bola em espaço reduzido.",
    },
    {
      type: "paragraph",
      text: "O treinador pediu intensidade, comunicação constante e decisões simples durante todos os momentos do trabalho.",
    },
    {
      type: "paragraph",
      text: "A preparação seguirá um plano interno criado apenas para esta fixture sintética.",
    },
    {
      type: "paragraph",
      text: "O exercício final manteve regras neutras e objetivos exclusivamente demonstrativos.",
    },
    {
      type: "paragraph",
      text: "Na parte final, o grupo ensaiou movimentos ofensivos e situações defensivas sem qualquer referência a acontecimentos reais.",
    },
  ]);

  const serializedBody = JSON.stringify(article.body);
  for (const excludedMarker of [
    "MARCADOR_PUBLICIDADE_RECORD_EXCLUIDO",
    "MARCADOR_PARTILHA_RECORD_EXCLUIDO",
    "MARCADOR_IFRAME_RECORD_EXCLUIDO",
    "MARCADOR_NEWSLETTER_RECORD_EXCLUIDO",
    "MARCADOR_RELACIONADO_RECORD_EXCLUIDO",
  ]) {
    assert.equal(serializedBody.includes(excludedMarker), false);
  }

  const metadata = article.sourceMetadata;
  const extractedWordCount = bodyWordCount(article.body);
  assert.equal(metadata.parser, "record-article-v1");
  assert.equal(metadata.finalUrl, RECORD_FULL_URL);
  assert.equal(metadata.loadedAt, LOADED_AT);
  assert.equal(metadata.statusCode, 200);
  assert.equal(metadata.redirectCount, 0);
  assert.equal(metadata.byteLength, page.byteLength);
  assert.equal(metadata.canonicalSource, "canonical");
  assert.equal(metadata.titleSource, "dom");
  assert.equal(metadata.subtitleSource, "dom");
  assert.equal(metadata.summarySource, "json_ld");
  assert.equal(metadata.authorSource, "dom");
  assert.equal(metadata.publishedAtSource, "json_ld");
  assert.equal(metadata.publishedAtPrecision, "instant");
  assert.equal(metadata.modifiedAtSource, "json_ld");
  assert.equal(metadata.imageSource, "json_ld");
  assert.equal(metadata.externalIdSource, "social_share");
  assert.equal(
    metadata.bodySelector,
    "article.main_article > #texto_styck > .text_container",
  );
  assert.equal(metadata.bodyBlockCount, article.body.length);
  assert.equal(metadata.extractedWordCount, extractedWordCount);
  assert.equal(metadata.declaredWordCount, 60);
  assert.equal(
    metadata.wordCountRatio,
    Number((extractedWordCount / 60).toFixed(4)),
  );
  assert.equal(metadata.accessibilitySource, "json_ld");
});

test("Record aceita a fixture mínima com campos opcionais ausentes", async () => {
  const html = await readFixture("record/article-valid-minimal.html");
  const article = expectSuccess(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_MINIMAL_URL),
  );

  assert.equal(article.title, "Artigo sintético mínimo do Record");
  assert.equal(article.subtitle, null);
  assert.equal(article.summary, null);
  assert.equal(article.author, null);
  assert.equal(article.publishedAt, null);
  assert.equal(article.sourceMetadata.publishedAtPrecision, null);
  assert.equal(article.modifiedAt, null);
  assert.equal(article.imageUrl, null);
  assert.equal(article.externalId, null);
  assert.ok(article.body.length > 0);
});

test("Record aceita artigo linear completo com .mainVideo incidental", async () => {
  const html = await readFixture(
    "record/article-valid-mainvideo-incidental.html",
  );
  const article = expectSuccess(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_MAINVIDEO_URL),
  );

  assert.equal(article.normalizedUrl, RECORD_MAINVIDEO_URL);
});

test("Record extrai título de artigo linear com .mainVideo incidental", async () => {
  const html = await readFixture(
    "record/article-valid-mainvideo-incidental.html",
  );
  const article = expectSuccess(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_MAINVIDEO_URL),
  );

  assert.equal(article.title, "Artigo linear sintético com vídeo incidental");
});

test("Record extrai corpo de artigo linear com .mainVideo incidental", async () => {
  const html = await readFixture(
    "record/article-valid-mainvideo-incidental.html",
  );
  const article = expectSuccess(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_MAINVIDEO_URL),
  );

  assert.equal(article.body.length, 3);
  assert.match(article.body[0]?.text ?? "", /notícia linear completa/i);
  assert.match(article.body[2]?.text ?? "", /informação totalmente fictícia/i);
});

test("Record extrai datePublished do JSON-LD sem meta article:published_time", async () => {
  const html = await readFixture(
    "record/article-valid-mainvideo-incidental.html",
  );
  assert.equal(html.includes("article:published_time"), false);

  const article = expectSuccess(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_MAINVIDEO_URL),
  );

  assert.equal(article.publishedAt, "2026-07-29T09:30:00.000Z");
  assert.equal(article.sourceMetadata.publishedAtSource, "json_ld");
  assert.equal(article.sourceMetadata.publishedAtPrecision, "instant");
});

test("Record prefere meta instant quando o JSON-LD só tem data de calendário", async () => {
  const html = replaceRequired(
    await readFixture("record/article-valid-full.html"),
    '"datePublished": "2026-07-20T09:00:00+01:00"',
    '"datePublished": "2026-07-20"',
  );
  const article = expectSuccess(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_FULL_URL),
  );

  assert.equal(article.publishedAt, "2026-07-20T08:00:00.000Z");
  assert.equal(article.sourceMetadata.publishedAtSource, "meta");
  assert.equal(article.sourceMetadata.publishedAtPrecision, "instant");
});

test("Record combina a data estruturada com uma hora DOM inequívoca", async () => {
  const fixture = await readFixture("record/article-valid-date-only.html");
  const html = fixture.replace(
    /(<div class="article_titles"[^>]*>)/,
    '$1<span class="publication-time">09:33</span>',
  );
  assert.notEqual(html, fixture, "A fixture tem de conter article_titles para inserir a hora.");

  const article = expectSuccess(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_DATE_ONLY_URL),
  );

  assert.equal(article.publishedAt, "2026-07-29T08:33:00.000Z");
  assert.equal(article.sourceMetadata.publishedAtSource, "dom");
  assert.equal(article.sourceMetadata.publishedAtPrecision, "instant");
});

test("Record normaliza datePublished de calendário com precisão date", async () => {
  const html = await readFixture("record/article-valid-date-only.html");
  assert.equal(html.includes("article:published_time"), false);

  const article = expectSuccess(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_DATE_ONLY_URL),
  );

  assert.equal(article.publishedAt, "2026-07-29T00:00:00.000Z");
  assert.equal(article.sourceMetadata.publishedAtSource, "json_ld");
  assert.equal(article.sourceMetadata.publishedAtPrecision, "date");
});

test("Record aceita uma data de calendário bissexta válida", async () => {
  const html = replaceRequired(
    await readFixture("record/article-valid-date-only.html"),
    '"datePublished": "2026-07-29"',
    '"datePublished": "2024-02-29"',
  );

  const article = expectSuccess(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_DATE_ONLY_URL),
  );

  assert.equal(article.publishedAt, "2024-02-29T00:00:00.000Z");
  assert.equal(article.sourceMetadata.publishedAtPrecision, "date");
});

for (const invalidDate of [
  "2026-02-29",
  "2026-13-01",
  "2026-00-10",
  "2026-07-32",
] as const) {
  test(`Record rejeita a data de calendário impossível ${invalidDate}`, async () => {
    const html = replaceRequired(
      await readFixture("record/article-valid-date-only.html"),
      '"datePublished": "2026-07-29"',
      `"datePublished": "${invalidDate}"`,
    );

    const article = expectSuccess(
      extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_DATE_ONLY_URL),
    );

    assert.equal(article.publishedAt, null);
    assert.equal(article.sourceMetadata.publishedAtSource, null);
    assert.equal(article.sourceMetadata.publishedAtPrecision, null);
  });
}

for (const invalidFormat of [
  "26-07-29",
  "2026-7-9",
  "29/07/2026",
  "texto livre",
] as const) {
  test(`Record rejeita o formato de data permissivo ${invalidFormat}`, async () => {
    const html = replaceRequired(
      await readFixture("record/article-valid-date-only.html"),
      '"datePublished": "2026-07-29"',
      `"datePublished": "${invalidFormat}"`,
    );

    const article = expectSuccess(
      extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_DATE_ONLY_URL),
    );

    assert.equal(article.publishedAt, null);
    assert.equal(article.sourceMetadata.publishedAtSource, null);
    assert.equal(article.sourceMetadata.publishedAtPrecision, null);
  });
}

test("Record mantém article:published_time como fallback com precisão instant", async () => {
  const html = replaceRequired(
    await readFixture("record/article-valid-full.html"),
    '"datePublished": "2026-07-20T09:00:00+01:00"',
    '"datePublished": "data-inválida"',
  );

  const article = expectSuccess(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_FULL_URL),
  );

  assert.equal(article.publishedAt, "2026-07-20T08:00:00.000Z");
  assert.equal(article.sourceMetadata.publishedAtSource, "meta");
  assert.equal(article.sourceMetadata.publishedAtPrecision, "instant");
});

test("Record continua a rejeitar página vídeo-only sem corpo editorial", async () => {
  const html = replaceRequired(
    await readFixture("record/article-valid-mainvideo-incidental.html"),
    '<article class="main_article">',
    '<section class="video_only">',
  ).replace("</article>", "</section>");

  expectError(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_MAINVIDEO_URL),
    {
      code: "parse_failed",
      sourceCode: "record",
      recoverable: true,
      detail: /artigo principal/i,
    },
  );
});

test("Record continua a rejeitar timeline editorial", async () => {
  const html = replaceRequired(
    await readFixture("record/article-valid-mainvideo-incidental.html"),
    "<body>",
    '<body><div class="timeline-editorial"></div>',
  );

  expectError(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_MAINVIDEO_URL),
    {
      code: "unsupported_content",
      sourceCode: "record",
      recoverable: false,
      detail: /formato editorial especial/i,
    },
  );
});

test("Record continua a rejeitar cartão de timeline editorial", async () => {
  const html = replaceRequired(
    await readFixture("record/article-valid-mainvideo-incidental.html"),
    "<body>",
    '<body><div class="timeline-editorial__card"></div>',
  );

  expectError(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_MAINVIDEO_URL),
    {
      code: "unsupported_content",
      sourceCode: "record",
      recoverable: false,
      detail: /formato editorial especial/i,
    },
  );
});

test("Record continua a rejeitar #jed_resultado", async () => {
  const html = replaceRequired(
    await readFixture("record/article-valid-mainvideo-incidental.html"),
    "<body>",
    '<body><div id="jed_resultado"></div>',
  );

  expectError(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_MAINVIDEO_URL),
    {
      code: "unsupported_content",
      sourceCode: "record",
      recoverable: false,
      detail: /formato editorial especial/i,
    },
  );
});

test("Record continua a rejeitar NewsArticle ambíguo", async () => {
  const html = replaceRequired(
    await readFixture("record/article-valid-mainvideo-incidental.html"),
    "</head>",
    `    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "url": "${RECORD_MAINVIDEO_URL}",
        "headline": "Segundo artigo sintético incompatível"
      }
    </script>
  </head>`,
  );

  expectError(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_MAINVIDEO_URL),
    {
      code: "parse_failed",
      sourceCode: "record",
      recoverable: true,
      detail: /newsarticle inequivoco/i,
    },
  );
});

test("Record exige título editorial", async () => {
  const html = replaceRequired(
    await readFixture("record/article-valid-full.html"),
    "<h1>Equipa prepara encontro com trabalho técnico</h1>",
    "",
  );

  expectError(extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_FULL_URL), {
    code: "required_field_missing",
    sourceCode: "record",
    recoverable: false,
    detail: /titulo editorial/i,
  });
});

test("Record rejeita estrutura de corpo ausente", async () => {
  const html = replaceRequired(
    await readFixture("record/article-valid-full.html"),
    "class=\"text_container\"",
    "class=\"text_container_incompativel\"",
  );

  expectError(extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_FULL_URL), {
    code: "parse_failed",
    sourceCode: "record",
    recoverable: true,
    detail: /corpo editorial/i,
  });
});

test("Record rejeita corpo inferior ao limite mínimo", async () => {
  const html = replaceFixtureBody(
    await readFixture("record/article-valid-minimal.html"),
    "<p>Corpo sintético curto.</p>",
  );

  expectError(extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_MINIMAL_URL), {
    code: "required_field_missing",
    sourceCode: "record",
    recoverable: false,
    detail: /corpo editorial suficiente/i,
  });
});

test("Record rejeita a fixture com restrição de acesso", async () => {
  const html = await readFixture("record/article-restricted.html");

  expectError(
    extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_RESTRICTED_URL),
    {
      code: "unsupported_content",
      sourceCode: "record",
      recoverable: false,
      detail: /restrito|truncagem/i,
    },
  );
});

test("Record rejeita razão de wordCount compatível com truncagem", async () => {
  const html = replaceRequired(
    await readFixture("record/article-valid-full.html"),
    '"wordCount": 60',
    '"wordCount": 500',
  );

  expectError(extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_FULL_URL), {
    code: "unsupported_content",
    sourceCode: "record",
    recoverable: false,
    detail: /sinais de truncagem/i,
  });
});

test("Record rejeita JSON-LD totalmente inválido", async () => {
  const html = invalidateAllJsonLd(
    await readFixture("record/article-valid-full.html"),
  );

  expectError(extractArticle(recordAdapter, RECORD_SOURCE, html, RECORD_FULL_URL), {
    code: "parse_failed",
    sourceCode: "record",
    recoverable: true,
    detail: /json-ld/i,
  });
});

test("Record rejeita URL final pertencente a outra fonte", async () => {
  const html = await readFixture("record/article-valid-full.html");

  expectError(extractArticle(recordAdapter, RECORD_SOURCE, html, ABOLA_FULL_URL), {
    code: "invalid_url",
    sourceCode: "record",
    recoverable: false,
    detail: /url final/i,
  });
});

test("A Bola extrai integralmente uma fixture completa e preserva proveniência", async () => {
  const html = await readFixture("abola/article-valid-full.html");
  const page = loadedPage(html, ABOLA_FULL_URL);
  const article = expectSuccess(
    extractArticle(abolaAdapter, ABOLA_SOURCE, html, ABOLA_FULL_URL),
  );

  assert.equal(article.sourceCode, "abola");
  assert.equal(article.originalUrl, ABOLA_FULL_URL);
  assert.equal(article.normalizedUrl, ABOLA_FULL_URL);
  assert.equal(article.externalId, "1234567890123456789");
  assert.equal(article.title, "Grupo realiza sessão de preparação sintética");
  assert.equal(
    article.subtitle,
    "Trabalho decorreu num cenário totalmente inventado para testes locais",
  );
  assert.equal(
    article.summary,
    "Resumo sintético para validar a extração integral do artigo de A Bola.",
  );
  assert.equal(article.author, "Jornalista Sintético");
  assert.equal(article.publishedAt, "2026-07-20T10:00:00.000Z");
  assert.equal(article.modifiedAt, "2026-07-20T10:30:00.000Z");
  assert.equal(article.imageUrl, "https://assets.example.invalid/abola-main.jpg");
  assert.equal(article.detectedAt, DETECTED_AT);
  assert.equal(article.excerpt, null);
  assert.equal(article.processingStatus, "detected");

  assert.deepEqual(article.body, [
    {
      type: "paragraph",
      text: "O grupo iniciou o trabalho com movimentos simples, comunicação constante e exercícios técnicos definidos para esta fixture.",
    },
    { type: "heading", text: "Contexto exclusivamente sintético" },
    {
      type: "paragraph",
      text: "A segunda sequência combinou organização coletiva e decisões rápidas num cenário neutro que não descreve acontecimentos reais.",
    },
    {
      type: "paragraph",
      text: "No encerramento, todos os participantes seguiram um plano fictício criado apenas para validar a ordem dos parágrafos.",
    },
  ]);

  const serializedBody = JSON.stringify(article.body);
  for (const excludedMarker of [
    "MARCADOR_PARAGRAFO_DIRETO_ABOLA_NAO_SUPORTADO",
    "MARCADOR_PUBLICIDADE_ABOLA_EXCLUIDO",
    "MARCADOR_IFRAME_ABOLA_EXCLUIDO",
    "MARCADOR_PARTILHA_ABOLA_EXCLUIDO",
    "MARCADOR_GALLERY_ABOLA_EXCLUIDO",
    "MARCADOR_COMENTARIOS_ABOLA_EXCLUIDO",
    "MARCADOR_NEWSLETTER_ABOLA_EXCLUIDO",
  ]) {
    assert.equal(serializedBody.includes(excludedMarker), false);
  }

  const metadata = article.sourceMetadata;
  assert.equal(metadata.parser, "abola-article-v1");
  assert.equal(metadata.finalUrl, ABOLA_FULL_URL);
  assert.equal(metadata.loadedAt, LOADED_AT);
  assert.equal(metadata.statusCode, 200);
  assert.equal(metadata.redirectCount, 0);
  assert.equal(metadata.byteLength, page.byteLength);
  assert.equal(metadata.canonicalSource, "canonical");
  assert.equal(metadata.titleSource, "dom");
  assert.equal(metadata.summarySource, "json_ld");
  assert.equal(metadata.authorSource, "json_ld");
  assert.equal(metadata.publishedAtSource, "json_ld");
  assert.equal(metadata.publishedAtPrecision, "instant");
  assert.equal(metadata.modifiedAtSource, "json_ld");
  assert.equal(metadata.imageSource, "json_ld");
  assert.equal(metadata.bodySelector, "#article_body");
  assert.equal(metadata.bodyBlockCount, article.body.length);
});

test("A Bola aceita a fixture mínima com campos opcionais ausentes", async () => {
  const html = await readFixture("abola/article-valid-minimal.html");
  const article = expectSuccess(
    extractArticle(abolaAdapter, ABOLA_SOURCE, html, ABOLA_MINIMAL_URL),
  );

  assert.equal(article.title, "Artigo sintético mínimo de A Bola");
  assert.equal(article.externalId, "9876543210987654321");
  assert.equal(article.subtitle, null);
  assert.equal(article.summary, null);
  assert.equal(article.author, null);
  assert.equal(article.publishedAt, null);
  assert.equal(article.sourceMetadata.publishedAtPrecision, null);
  assert.equal(article.modifiedAt, null);
  assert.equal(article.imageUrl, null);
  assert.ok(article.body.length > 0);
});

test("A Bola exige título editorial", async () => {
  const html = replaceRequired(
    await readFixture("abola/article-valid-full.html"),
    '<h1 id="article_title">Grupo realiza sessão de preparação sintética</h1>',
    "",
  );

  expectError(extractArticle(abolaAdapter, ABOLA_SOURCE, html, ABOLA_FULL_URL), {
    code: "required_field_missing",
    sourceCode: "abola",
    recoverable: false,
    detail: /t.tulo editorial/i,
  });
});

test("A Bola rejeita corpo editorial ambíguo", async () => {
  const html = replaceRequired(
    await readFixture("abola/article-valid-full.html"),
    "</body>",
    '  <div id="article_body"></div>\n  </body>',
  );

  expectError(extractArticle(abolaAdapter, ABOLA_SOURCE, html, ABOLA_FULL_URL), {
    code: "parse_failed",
    sourceCode: "abola",
    recoverable: true,
    detail: /corpo editorial/i,
  });
});

test("A Bola rejeita a fixture com corpo insuficiente", async () => {
  const html = await readFixture("abola/article-insufficient-body.html");

  expectError(
    extractArticle(abolaAdapter, ABOLA_SOURCE, html, ABOLA_INSUFFICIENT_URL),
    {
      code: "required_field_missing",
      sourceCode: "abola",
      recoverable: false,
      detail: /corpo editorial suficiente/i,
    },
  );
});

test("A Bola rejeita JSON-LD totalmente inválido", async () => {
  const html = invalidateAllJsonLd(
    await readFixture("abola/article-valid-full.html"),
  );

  expectError(extractArticle(abolaAdapter, ABOLA_SOURCE, html, ABOLA_FULL_URL), {
    code: "parse_failed",
    sourceCode: "abola",
    recoverable: true,
    detail: /json-ld/i,
  });
});

test("A Bola rejeita URL final pertencente a outra fonte", async () => {
  const html = await readFixture("abola/article-valid-full.html");

  expectError(extractArticle(abolaAdapter, ABOLA_SOURCE, html, RECORD_FULL_URL), {
    code: "invalid_url",
    sourceCode: "abola",
    recoverable: false,
    detail: /url final/i,
  });
});
