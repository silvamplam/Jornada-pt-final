import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildPublicMatchdayEditorialVisibility } from "@/lib/public-matchday-editorial-visibility";

const emptyInput = {
  hasHeadline: false,
  hasSideBlock: false,
  highlightCount: 0,
  roundupCount: 0,
  hasComplementaryStory: false,
  latestNewsCount: 0,
  importantNewsCount: 0
};

test("sem conteúdo publicado não cria qualquer área editorial", () => {
  const visibility = buildPublicMatchdayEditorialVisibility(emptyInput);

  assert.equal(visibility.showAnyEditorialContent, false);
  assert.equal(visibility.showCoverPanel, false);
  assert.equal(visibility.showImportantNews, false);
  assert.equal(visibility.coverLayout, "none");
});

test("uma manchete publicada cria apenas a coluna principal", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    hasHeadline: true
  });

  assert.equal(visibility.showHeadline, true);
  assert.equal(visibility.showMainColumn, true);
  assert.equal(visibility.showMainLower, false);
  assert.equal(visibility.showCoverPanel, true);
  assert.equal(visibility.coverLayout, "main");
});

test("destaques publicados ativam a zona inferior sem placeholders", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    highlightCount: 3
  });

  assert.equal(visibility.showBelowHeadline, true);
  assert.equal(visibility.showMainLower, true);
  assert.equal(visibility.showMainColumn, true);
  assert.equal(visibility.mainLowerIsSingle, true);
  assert.equal(visibility.coverLayout, "main");
});

test("resumos publicados ativam a mesma zona inferior", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    roundupCount: 2
  });

  assert.equal(visibility.showBelowHeadline, true);
  assert.equal(visibility.showMainLower, true);
  assert.equal(visibility.showMainColumn, true);
});

test("bloco lateral e linha editorial adaptam a grelha sem coluna vazia", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    hasSideBlock: true,
    latestNewsCount: 4
  });

  assert.equal(visibility.showMainColumn, false);
  assert.equal(visibility.showCoverPanel, true);
  assert.equal(visibility.coverLayout, "feature-news");
});

test("complemento isolado ocupa a coluna principal e uma única faixa inferior", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    hasComplementaryStory: true
  });

  assert.equal(visibility.showComplementaryStory, true);
  assert.equal(visibility.showMainLower, true);
  assert.equal(visibility.mainLowerIsSingle, true);
  assert.equal(visibility.coverLayout, "main");
});

test("destaques e complemento mantêm duas zonas na faixa inferior", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    highlightCount: 1,
    hasComplementaryStory: true
  });

  assert.equal(visibility.showMainLower, true);
  assert.equal(visibility.mainLowerIsSingle, false);
});

test("notícias importantes podem existir sem a capa editorial", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    importantNewsCount: 2
  });

  assert.equal(visibility.showCoverPanel, false);
  assert.equal(visibility.showImportantNews, true);
  assert.equal(visibility.showAnyEditorialContent, true);
});

test("contagens inválidas ou negativas não tornam conteúdo visível", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    highlightCount: -1,
    roundupCount: Number.NaN,
    latestNewsCount: Number.NEGATIVE_INFINITY,
    importantNewsCount: -4
  });

  assert.equal(visibility.showAnyEditorialContent, false);
});

test("todos os módulos publicados produzem a grelha completa", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    hasHeadline: true,
    hasSideBlock: true,
    highlightCount: 3,
    roundupCount: 0,
    hasComplementaryStory: true,
    latestNewsCount: 5,
    importantNewsCount: 4
  });

  assert.equal(visibility.showAnyEditorialContent, true);
  assert.equal(visibility.showCoverPanel, true);
  assert.equal(visibility.coverLayout, "feature-main-news");
  assert.equal(visibility.mainLowerIsSingle, false);
});

const publicMatchdayPagePath = fileURLToPath(
  new URL(
    "../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
    import.meta.url
  )
);
const publicMatchdayPageSource = readFileSync(publicMatchdayPagePath, "utf8");

test("a rota pública não contém placeholders editoriais nem imagens fictícias", () => {
  assert.doesNotMatch(publicMatchdayPageSource, /Espaco editorial por definir/i);
  assert.doesNotMatch(publicMatchdayPageSource, /Espaço editorial preparado/i);
  assert.doesNotMatch(publicMatchdayPageSource, /Bloco complementar por definir/i);
  assert.doesNotMatch(publicMatchdayPageSource, /images\.unsplash\.com/i);
});

test("a capa editorial é condicional e a classificação permanece depois dela", () => {
  const conditionalCoverIndex = publicMatchdayPageSource.indexOf(
    "{editorialVisibility.showCoverPanel ? ("
  );
  const classificationIndex = publicMatchdayPageSource.indexOf(
    'id="classificacao"'
  );

  assert.notEqual(conditionalCoverIndex, -1);
  assert.notEqual(classificationIndex, -1);
  assert.ok(conditionalCoverIndex < classificationIndex);
});
