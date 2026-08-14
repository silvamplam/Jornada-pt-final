import assert from "node:assert/strict";
import test from "node:test";

import {
  preflightEditorialBatchImages,
  type EditorialBatchImageFile,
} from "./editorial-batch-image-preflight";

const keys = ["01", "02", "03"] as const;

function image(
  name: string,
  type = "image/jpeg",
  size = 100,
): EditorialBatchImageFile {
  return { name, type, size };
}

function fileProblemCodes(result: ReturnType<typeof preflightEditorialBatchImages>) {
  return result.fileProblems.map((problem) => problem.code);
}

test("associa três artigos às três imagens pelo prefixo", () => {
  const result = preflightEditorialBatchImages(keys, [
    image("01-fc-porto.jpg"),
    image("02-sporting.jpg"),
    image("03-benfica.jpg"),
  ]);

  assert.deepEqual(result.articles.map(({ key, file }) => [key, file?.name]), [
    ["01", "01-fc-porto.jpg"],
    ["02", "02-sporting.jpg"],
    ["03", "03-benfica.jpg"],
  ]);
  assert.equal(result.ready, true);
});

test("a ordem do array de ficheiros não altera a associação", () => {
  const result = preflightEditorialBatchImages(keys, [
    image("03-benfica.webp", "image/webp"),
    image("01-porto.jpg"),
    image("02-sporting.png", "image/png"),
  ]);

  assert.deepEqual(result.articles.map((article) => article.file?.name), [
    "01-porto.jpg",
    "02-sporting.png",
    "03-benfica.webp",
  ]);
});

test("reporta a imagem 02 em falta", () => {
  const result = preflightEditorialBatchImages(keys, [
    image("01-porto.jpg"),
    image("03-benfica.jpg"),
  ]);

  assert.equal(result.articles[1].status, "missing");
  assert.equal(result.articles[1].message, "IMAGEM EM FALTA");
  assert.equal(result.missing, 1);
  assert.equal(result.ready, false);
});

test("bloqueia duas imagens com o prefixo 02 sem escolher uma", () => {
  const result = preflightEditorialBatchImages(keys, [
    image("01-porto.jpg"),
    image("02-sporting.jpg"),
    image("02-sporting-alternativa.webp", "image/webp"),
    image("03-benfica.jpg"),
  ]);

  assert.equal(result.articles[1].status, "duplicate");
  assert.equal(result.articles[1].file, null);
  assert.equal(result.articles[1].message, "DUAS IMAGENS COM O PREFIXO 02");
  assert.equal(result.ready, false);
});

test("reporta ficheiro sem prefixo", () => {
  const result = preflightEditorialBatchImages(["01"], [image("benfica.jpg")]);

  assert.deepEqual(fileProblemCodes(result), ["invalid_prefix"]);
  assert.equal(result.fileProblems[0].message, "PREFIXO EM FALTA OU INVÁLIDO");
});

test("reporta prefixo 04 quando só existem três artigos", () => {
  const result = preflightEditorialBatchImages(keys, [image("04-braga.jpg")]);

  assert.deepEqual(fileProblemCodes(result), ["unknown_article"]);
  assert.equal(result.fileProblems[0].message, "NÃO EXISTE ARTIGO 04");
});

test("rejeita prefixo 1-", () => {
  const result = preflightEditorialBatchImages(["01"], [image("1-porto.jpg")]);

  assert.deepEqual(fileProblemCodes(result), ["invalid_prefix"]);
});

test("rejeita prefixo 001-", () => {
  const result = preflightEditorialBatchImages(["01"], [image("001-porto.jpg")]);

  assert.deepEqual(fileProblemCodes(result), ["invalid_prefix"]);
});

test("rejeita prefixo AA-", () => {
  const result = preflightEditorialBatchImages(["01"], [image("AA-porto.jpg")]);

  assert.deepEqual(fileProblemCodes(result), ["invalid_prefix"]);
});

test("aceita JPG", () => {
  assert.equal(preflightEditorialBatchImages(["01"], [image("01-porto.jpg")]).ready, true);
});

test("aceita JPEG", () => {
  assert.equal(preflightEditorialBatchImages(["01"], [image("01-porto.jpeg")]).ready, true);
});

test("aceita PNG", () => {
  assert.equal(preflightEditorialBatchImages(["01"], [image("01-porto.png", "image/png")]).ready, true);
});

test("aceita WEBP", () => {
  assert.equal(preflightEditorialBatchImages(["01"], [image("01-porto.webp", "image/webp")]).ready, true);
});

test("rejeita GIF", () => {
  const result = preflightEditorialBatchImages(["01"], [image("01-porto.gif", "image/gif")]);

  assert.ok(fileProblemCodes(result).includes("unsupported_format"));
  assert.equal(result.ready, false);
});

test("rejeita SVG", () => {
  const result = preflightEditorialBatchImages(["01"], [image("01-porto.svg", "image/svg+xml")]);

  assert.ok(fileProblemCodes(result).includes("unsupported_format"));
  assert.equal(result.ready, false);
});

test("rejeita PDF", () => {
  const result = preflightEditorialBatchImages(["01"], [image("01-porto.pdf", "application/pdf")]);

  assert.ok(fileProblemCodes(result).includes("unsupported_format"));
  assert.equal(result.ready, false);
});

test("usa a extensão válida como fallback quando o MIME está vazio", () => {
  const result = preflightEditorialBatchImages(["01"], [image("01-porto.WEBP", "")]);

  assert.equal(result.ready, true);
  assert.equal(result.articles[0].file?.name, "01-porto.WEBP");
});

test("usa o MIME disponível em vez de aceitar uma extensão enganadora", () => {
  const result = preflightEditorialBatchImages(["01"], [
    image("01-porto.jpg", "image/gif"),
  ]);

  assert.ok(fileProblemCodes(result).includes("unsupported_format"));
  assert.equal(result.ready, false);
});

test("uma key 31 nunca é associável mesmo que surja no lote inválido", () => {
  const result = preflightEditorialBatchImages(["31"], [image("31-fora-do-limite.jpg")]);

  assert.equal(result.articles[0].status, "missing");
  assert.deepEqual(fileProblemCodes(result), ["unknown_article"]);
  assert.equal(result.ready, false);
});

test("a mesma entrada produz exatamente o mesmo resultado", () => {
  const files = [image("02-sporting.png", "image/png"), image("01-porto.jpg")];

  assert.deepEqual(
    preflightEditorialBatchImages(["01", "02"], files),
    preflightEditorialBatchImages(["01", "02"], files),
  );
});

test("cada artigo válido tem exatamente uma associação", () => {
  const result = preflightEditorialBatchImages(keys, [
    image("03-benfica.png", "image/png"),
    image("01-porto.jpg"),
    image("02-sporting.webp", "image/webp"),
  ]);

  for (const article of result.articles) {
    assert.equal(article.status, "associated");
    assert.equal(article.candidates.length, 1);
    assert.ok(article.file);
  }
});

test("ready é false perante qualquer problema", () => {
  const scenarios = [
    preflightEditorialBatchImages([], []),
    preflightEditorialBatchImages(["01"], []),
    preflightEditorialBatchImages(["01"], [image("01-a.jpg"), image("01-b.jpg")]),
    preflightEditorialBatchImages(["01"], [image("02-orfa.jpg")]),
    preflightEditorialBatchImages(["01"], [image("01-porto.gif", "image/gif")]),
  ];

  assert.ok(scenarios.every((result) => result.ready === false));
});
