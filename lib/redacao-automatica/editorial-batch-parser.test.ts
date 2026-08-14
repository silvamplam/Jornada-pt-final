import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EDITORIAL_BATCH_ARTICLE_END_MARKER,
  EDITORIAL_BATCH_ARTICLE_START_MARKER,
  EDITORIAL_BATCH_MAX_ARTICLES,
  parseEditorialArticleBatch,
  preflightEditorialArticleBatch,
  type EditorialBatchIssueCode,
} from "./editorial-batch-parser";

type ArticleFixture = Readonly<{
  label?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  omit?: "label" | "title" | "subtitle" | "body";
}>;

function articleBlock({
  label = "LIGA PORTUGAL",
  title = "Título do artigo",
  subtitle = "Pós-título do artigo.",
  body = "Corpo do artigo.",
  omit,
}: ArticleFixture = {}) {
  const lines = [EDITORIAL_BATCH_ARTICLE_START_MARKER];
  if (omit !== "label") lines.push("ANTETÍTULO", label);
  if (omit !== "title") lines.push("TÍTULO", title);
  if (omit !== "subtitle") lines.push("PÓS-TÍTULO", subtitle);
  if (omit !== "body") lines.push("CORPO", body);
  lines.push(EDITORIAL_BATCH_ARTICLE_END_MARKER);
  return lines.join("\n");
}

function batch(count: number) {
  return Array.from({ length: count }, (_, index) => articleBlock({
    title: `Título ${String(index + 1).padStart(2, "0")}`,
    body: `Corpo ${index + 1}.`,
  })).join("\n\n");
}

function issueCodes(result: ReturnType<typeof preflightEditorialArticleBatch>) {
  return result.issues.map((batchIssue) => batchIssue.code);
}

function issueFor(
  result: ReturnType<typeof preflightEditorialArticleBatch>,
  code: EditorialBatchIssueCode,
) {
  return result.issues.find((batchIssue) => batchIssue.code === code);
}

test("interpreta um artigo válido e pronto para publicação", () => {
  const result = preflightEditorialArticleBatch(articleBlock());

  assert.deepEqual(result, {
    articles: [{
      index: 1,
      key: "01",
      label: "LIGA PORTUGAL",
      title: "Título do artigo",
      subtitle: "Pós-título do artigo.",
      body: "Corpo do artigo.",
    }],
    issues: [],
    total: 1,
    valid: 1,
    invalid: 0,
    ready: true,
  });
});

test("interpreta três artigos válidos", () => {
  const result = preflightEditorialArticleBatch(batch(3));

  assert.equal(result.total, 3);
  assert.equal(result.valid, 3);
  assert.equal(result.invalid, 0);
  assert.equal(result.ready, true);
});

test("a ordem de aparecimento produz as chaves 01, 02 e 03", () => {
  const result = preflightEditorialArticleBatch(batch(3));

  assert.deepEqual(result.articles.map(({ index, key }) => ({ index, key })), [
    { index: 1, key: "01" },
    { index: 2, key: "02" },
    { index: 3, key: "03" },
  ]);
});

test("aceita o máximo de trinta artigos", () => {
  const result = preflightEditorialArticleBatch(batch(EDITORIAL_BATCH_MAX_ARTICLES));

  assert.equal(result.total, 30);
  assert.equal(result.valid, 30);
  assert.equal(result.invalid, 0);
  assert.equal(result.ready, true);
  assert.equal(result.articles.at(-1)?.key, "30");
});

test("bloqueia trinta e um artigos sem os renumerar", () => {
  const result = preflightEditorialArticleBatch(batch(31));

  assert.equal(result.total, 31);
  assert.equal(result.valid, 31);
  assert.equal(result.invalid, 0);
  assert.equal(result.ready, false);
  assert.equal(result.articles.at(-1)?.key, "31");
  assert.equal(issueFor(result, "too_many_articles")?.severity, "error");
});

test("input vazio produz empty_input e não fica pronto", () => {
  const result = preflightEditorialArticleBatch("");

  assert.deepEqual(issueCodes(result), ["empty_input"]);
  assert.equal(result.total, 0);
  assert.equal(result.ready, false);
});

test("input apenas com whitespace produz empty_input", () => {
  const result = preflightEditorialArticleBatch(" \n\t\r\n ");

  assert.deepEqual(issueCodes(result), ["empty_input"]);
  assert.equal(result.ready, false);
});

test("CRLF e LF produzem o mesmo resultado semântico", () => {
  const lf = articleBlock({ body: "Primeiro.\n\nSegundo." });
  const crlf = lf.replace(/\n/g, "\r\n");

  assert.deepEqual(
    preflightEditorialArticleBatch(crlf),
    preflightEditorialArticleBatch(lf),
  );
});

test("aceita explicitamente line endings LF", () => {
  const result = preflightEditorialArticleBatch(articleBlock());

  assert.equal(result.articles[0].body, "Corpo do artigo.");
  assert.equal(result.ready, true);
});

test("aceita linhas vazias entre artigos", () => {
  const input = `${articleBlock({ title: "A" })}\n\n\n\n${articleBlock({ title: "B" })}`;
  const result = preflightEditorialArticleBatch(input);

  assert.equal(result.total, 2);
  assert.deepEqual(result.articles.map((article) => article.title), ["A", "B"]);
  assert.equal(result.ready, true);
});

test("preserva corpo com vários parágrafos e linhas internas", () => {
  const body = "Primeiro parágrafo.\n\nIntertítulo jornalístico\n\n- ponto um\n- ponto dois\n\n\"Citação: intacta.\"";
  const result = preflightEditorialArticleBatch(articleBlock({ body }));

  assert.equal(result.articles[0].body, body);
});

test("rejeita texto antes do primeiro bloco", () => {
  const result = preflightEditorialArticleBatch(`NOTÍCIAS DE HOJE\n\n${articleBlock()}`);

  assert.equal(issueFor(result, "text_outside_blocks")?.message, "Existe texto não vazio fora dos blocos de artigo.");
  assert.equal(result.total, 1);
  assert.equal(result.ready, false);
});

test("rejeita abertura sem fecho", () => {
  const input = articleBlock().replace(`\n${EDITORIAL_BATCH_ARTICLE_END_MARKER}`, "");
  const result = preflightEditorialArticleBatch(input);

  assert.equal(issueFor(result, "missing_close_marker")?.key, "01");
  assert.equal(result.total, 1);
  assert.equal(result.valid, 0);
  assert.equal(result.invalid, 1);
  assert.equal(result.ready, false);
});

test("rejeita fecho sem abertura", () => {
  const result = preflightEditorialArticleBatch(EDITORIAL_BATCH_ARTICLE_END_MARKER);

  assert.deepEqual(issueCodes(result), ["missing_open_marker", "no_articles"]);
  assert.equal(result.total, 0);
  assert.equal(result.ready, false);
});

test("rejeita marcador de abertura aninhado", () => {
  const input = articleBlock({
    body: `Primeiro.\n${EDITORIAL_BATCH_ARTICLE_START_MARKER}\nSegundo.`,
  });
  const result = preflightEditorialArticleBatch(input);

  assert.equal(issueFor(result, "nested_article_marker")?.key, "01");
  assert.equal(result.articles.length, 0);
  assert.equal(result.invalid, 1);
});

test("rejeita ANTETÍTULO em falta como erro estrutural", () => {
  const result = preflightEditorialArticleBatch(articleBlock({ omit: "label" }));
  const missing = issueFor(result, "missing_field_heading");

  assert.equal(missing?.field, "label");
  assert.equal(result.articles.length, 0);
  assert.equal(result.invalid, 1);
});

test("rejeita TÍTULO em falta como erro estrutural", () => {
  const result = preflightEditorialArticleBatch(articleBlock({ omit: "title" }));

  assert.equal(issueFor(result, "missing_field_heading")?.field, "title");
  assert.equal(result.invalid, 1);
});

test("rejeita PÓS-TÍTULO em falta como erro estrutural", () => {
  const result = preflightEditorialArticleBatch(articleBlock({ omit: "subtitle" }));

  assert.equal(issueFor(result, "missing_field_heading")?.field, "subtitle");
  assert.equal(result.invalid, 1);
});

test("rejeita CORPO em falta como erro estrutural", () => {
  const result = preflightEditorialArticleBatch(articleBlock({ omit: "body" }));

  assert.equal(issueFor(result, "missing_field_heading")?.field, "body");
  assert.equal(result.invalid, 1);
});

test("rejeita cabeçalho duplicado", () => {
  const input = articleBlock().replace(
    "PÓS-TÍTULO",
    "TÍTULO\nOutro título\nPÓS-TÍTULO",
  );
  const result = preflightEditorialArticleBatch(input);

  assert.equal(issueFor(result, "duplicate_field_heading")?.field, "title");
  assert.equal(result.invalid, 1);
});

test("rejeita cabeçalhos na ordem errada", () => {
  const input = [
    EDITORIAL_BATCH_ARTICLE_START_MARKER,
    "TÍTULO",
    "Título",
    "ANTETÍTULO",
    "Liga",
    "PÓS-TÍTULO",
    "Resumo.",
    "CORPO",
    "Corpo.",
    EDITORIAL_BATCH_ARTICLE_END_MARKER,
  ].join("\n");
  const result = preflightEditorialArticleBatch(input);

  assert.equal(issueFor(result, "wrong_field_order")?.key, "01");
  assert.equal(result.invalid, 1);
});

test("antetítulo vazio é sintaticamente válido mas não publicável", () => {
  const parsed = parseEditorialArticleBatch(articleBlock({ label: "" }));
  const preflight = preflightEditorialArticleBatch(articleBlock({ label: "" }));

  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.articles[0].label, "");
  assert.equal(issueFor(preflight, "empty_label")?.field, "label");
  assert.equal(preflight.ready, false);
});

test("título vazio é sintaticamente válido mas não publicável", () => {
  const result = preflightEditorialArticleBatch(articleBlock({ title: "" }));

  assert.equal(issueFor(result, "empty_title")?.field, "title");
  assert.equal(result.articles[0].title, "");
  assert.equal(result.invalid, 1);
});

test("pós-título vazio é sintaticamente válido mas não publicável", () => {
  const result = preflightEditorialArticleBatch(articleBlock({ subtitle: "" }));

  assert.equal(issueFor(result, "empty_subtitle")?.field, "subtitle");
  assert.equal(result.invalid, 1);
});

test("corpo vazio é sintaticamente válido mas não publicável", () => {
  const result = preflightEditorialArticleBatch(articleBlock({ body: "" }));

  assert.equal(issueFor(result, "empty_body")?.field, "body");
  assert.equal(result.invalid, 1);
});

test("artigo 02 inválido não renumera o artigo 03", () => {
  const input = [
    articleBlock({ title: "Primeiro" }),
    articleBlock({ title: "Segundo", subtitle: "" }),
    articleBlock({ title: "Terceiro" }),
  ].join("\n\n");
  const result = preflightEditorialArticleBatch(input);

  assert.deepEqual(result.articles.map((article) => article.key), ["01", "02", "03"]);
  assert.equal(issueFor(result, "empty_subtitle")?.key, "02");
  assert.equal(result.total, 3);
  assert.equal(result.valid, 2);
  assert.equal(result.invalid, 1);
});

test("preserva conteúdo sem reescrita, capitalização ou alteração de aspas", () => {
  const fixture = {
    label: "  Mercado & análise  ",
    title: "FC Porto: \"não há acordo\" — confirmou o dirigente",
    subtitle: "Texto com pontuação; hífen - e travessão — intactos.",
    body: "  Linha indentada.\n\nFim...?!  ",
  };
  const result = preflightEditorialArticleBatch(articleBlock(fixture));

  assert.deepEqual(result.articles[0], { index: 1, key: "01", ...fixture });
});

test("preserva acentos portugueses", () => {
  const result = preflightEditorialArticleBatch(articleBlock({
    label: "SELEÇÃO",
    title: "João Félix regressa à ação após lesão",
    subtitle: "O avançado está disponível para o próximo encontro.",
    body: "A recuperação terminou e a equipa técnica confirmou a opção.",
  }));

  assert.equal(result.articles[0].label, "SELEÇÃO");
  assert.equal(result.articles[0].title, "João Félix regressa à ação após lesão");
  assert.equal(result.articles[0].subtitle, "O avançado está disponível para o próximo encontro.");
});

test("a palavra TÍTULO numa linha própria dentro do corpo não parte o parser", () => {
  const body = "Primeiro parágrafo.\n\nTÍTULO\n\nEsta palavra faz parte do corpo.";
  const result = preflightEditorialArticleBatch(articleBlock({ body }));

  assert.equal(result.ready, true);
  assert.equal(result.articles[0].body, body);
  assert.equal(issueFor(result, "duplicate_field_heading"), undefined);
});

test("o core puro não depende de server-only, Supabase, rede, IA ou persistência", () => {
  const source = readFileSync(
    "lib/redacao-automatica/editorial-batch-parser.ts",
    "utf8",
  );

  assert.doesNotMatch(source, /server-only|supabase|fetch\s*\(|openai|createEditorialArticle|updateEditorialArticle/i);
  assert.doesNotMatch(source, /placePublishedArticleInitially|writeSupabase|localStorage|FileList/i);
  assert.doesNotMatch(source, /^import\s/m);
});

test("o mesmo input produz resultado determinístico", () => {
  const input = batch(3);
  const first = preflightEditorialArticleBatch(input);
  const second = preflightEditorialArticleBatch(input);

  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
});

test("aceita BOM apenas no início técnico do paste", () => {
  const result = preflightEditorialArticleBatch(`\uFEFF${articleBlock()}`);

  assert.equal(result.ready, true);
  assert.equal(result.total, 1);
});

test("aceita espaços exteriores nos marcadores e cabeçalhos", () => {
  const structuralLines = new Set([
    EDITORIAL_BATCH_ARTICLE_START_MARKER,
    EDITORIAL_BATCH_ARTICLE_END_MARKER,
    "ANTETÍTULO",
    "TÍTULO",
    "PÓS-TÍTULO",
    "CORPO",
  ]);
  const input = articleBlock()
    .split("\n")
    .map((line) => structuralLines.has(line) ? `  ${line}  ` : line)
    .join("\n");
  const result = preflightEditorialArticleBatch(input);

  assert.equal(result.ready, true);
});

test("não aceita aliases de cabeçalhos nem tenta adivinhar estrutura", () => {
  const input = articleBlock().replace("ANTETÍTULO", "HEADLINE");
  const result = preflightEditorialArticleBatch(input);

  assert.ok(issueCodes(result).includes("unexpected_block_text"));
  assert.ok(issueCodes(result).includes("missing_field_heading"));
  assert.equal(result.ready, false);
});

test("marcador de fecho literal dentro do corpo é reportado sem recuperação silenciosa", () => {
  const input = articleBlock({
    body: `Texto com ${EDITORIAL_BATCH_ARTICLE_END_MARKER} no conteúdo.`,
  });
  const result = preflightEditorialArticleBatch(input);

  assert.equal(issueFor(result, "nested_article_marker")?.key, "01");
  assert.equal(result.ready, false);
});

test("texto depois do último bloco também é rejeitado", () => {
  const result = preflightEditorialArticleBatch(`${articleBlock()}\nFIM DO DOCUMENTO`);

  assert.ok(issueCodes(result).includes("text_outside_blocks"));
  assert.equal(result.ready, false);
});

test("títulos localmente duplicados são detetados apenas por igualdade após whitespace trivial", () => {
  const input = [
    articleBlock({ title: "Título   repetido" }),
    articleBlock({ title: "Título repetido" }),
    articleBlock({ title: "título repetido" }),
  ].join("\n\n");
  const result = preflightEditorialArticleBatch(input);
  const duplicates = result.issues.filter((batchIssue) => batchIssue.code === "duplicate_title");

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].key, "02");
  assert.equal(result.valid, 2);
  assert.equal(result.invalid, 1);
  assert.equal(result.ready, false);
});
