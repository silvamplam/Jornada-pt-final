import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildPublicMatchdayEditorialVisibility, hasPublicMatchdayRoundupContent } from "@/lib/public-matchday-editorial-visibility";

test("um item de resumo com vídeo mas sem título continua a ser conteúdo público válido", () => {
  assert.equal(hasPublicMatchdayRoundupContent({ title: null, image_url: null, video_url: "https://youtu.be/exemplo" }), true);
  assert.equal(hasPublicMatchdayRoundupContent({ title: "", image_url: "https://exemplo.test/thumb.jpg", video_url: null }), true);
  assert.equal(hasPublicMatchdayRoundupContent({ title: "   ", image_url: "", video_url: "" }), false);
});

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

test("destaques publicados ficam na coluna principal sem ativar a zona inferior", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    highlightCount: 3
  });

  assert.equal(visibility.showHighlights, true);
  assert.equal(visibility.showBelowHeadline, true);
  assert.equal(visibility.showMainLower, false);
  assert.equal(visibility.showMainColumn, true);
  assert.equal(visibility.coverLayout, "main");
});

test("resumos publicados ativam a zona inferior sem criar uma coluna principal vazia", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    roundupCount: 2
  });

  assert.equal(visibility.showRoundup, true);
  assert.equal(visibility.showBelowHeadline, false);
  assert.equal(visibility.showMainLower, true);
  assert.equal(visibility.showMainColumn, false);
  assert.equal(visibility.showCoverPanel, true);
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

test("complemento isolado cria apenas uma única faixa inferior", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    hasComplementaryStory: true
  });

  assert.equal(visibility.showComplementaryStory, true);
  assert.equal(visibility.showMainLower, true);
  assert.equal(visibility.showMainColumn, false);
  assert.equal(visibility.mainLowerIsSingle, true);
  assert.equal(visibility.showCoverPanel, true);
});

test("destaques e complemento coexistem sem transformar os destaques em zona inferior", () => {
  const visibility = buildPublicMatchdayEditorialVisibility({
    ...emptyInput,
    highlightCount: 1,
    hasComplementaryStory: true
  });

  assert.equal(visibility.showHighlights, true);
  assert.equal(visibility.showMainColumn, true);
  assert.equal(visibility.showMainLower, true);
  assert.equal(visibility.mainLowerIsSingle, true);
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
    roundupCount: 2,
    hasComplementaryStory: true,
    latestNewsCount: 5,
    importantNewsCount: 4
  });

  assert.equal(visibility.showAnyEditorialContent, true);
  assert.equal(visibility.showCoverPanel, true);
  assert.equal(visibility.showHighlights, true);
  assert.equal(visibility.showRoundup, true);
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

test("a capa editorial e a faixa horizontal ficam antes da classificação", () => {
  const editorialAuthorityIndex = publicMatchdayPageSource.indexOf(
    "{thematicPublicUnavailable ? ("
  );
  const hierarchicalLegacyIndex = publicMatchdayPageSource.indexOf(
    "useHierarchicalReferenceComposition ? (",
    editorialAuthorityIndex
  );
  const horizontalNewsIndex = publicMatchdayPageSource.indexOf(
    "<PublicHorizontalNewsStrip"
  );
  const classificationIndex = publicMatchdayPageSource.indexOf(
    'id="classificacao"'
  );

  assert.notEqual(editorialAuthorityIndex, -1);
  assert.notEqual(hierarchicalLegacyIndex, -1);
  assert.notEqual(horizontalNewsIndex, -1);
  assert.notEqual(classificationIndex, -1);

  assert.ok(editorialAuthorityIndex < hierarchicalLegacyIndex);
  assert.ok(hierarchicalLegacyIndex < horizontalNewsIndex);
  assert.ok(horizontalNewsIndex < classificationIndex);
});


test("a rota publica reutiliza o layout editorial da Home e separa Destaques de Resumo", () => {
  assert.match(publicMatchdayPageSource, /import \{ PublicEditorialLayout \}/);
  assert.match(publicMatchdayPageSource, /const visibleHighlights = highlightsAreActive \? effectiveHighlights : \[\];/);
  assert.match(publicMatchdayPageSource, /const visibleRoundupItems = roundupIsActive \? effectiveRoundupItems : \[\];/);
  assert.match(publicMatchdayPageSource, /<PublicEditorialLayout/);
  assert.match(publicMatchdayPageSource, /highlights:\s*visibleHighlights/);
  assert.match(publicMatchdayPageSource, /roundupItems:\s*visibleRoundupItems/);
  assert.doesNotMatch(publicMatchdayPageSource, /import RoundupVideoSwitcher/);
  assert.doesNotMatch(publicMatchdayPageSource, /readBelowHeadlineSubtitle/);
});

test("a classificação pública respeita 1200 px e a barra usa a cor da competição", () => {
  assert.match(
    publicMatchdayPageSource,
    /#classificacao \{[\s\S]*?width:\s*min\(100%,\s*1200px\);[\s\S]*?max-width:\s*1200px;[\s\S]*?margin-left:\s*auto;[\s\S]*?margin-right:\s*auto;/
  );
  assert.match(
    publicMatchdayPageSource,
    /\.public-season-nav-bar \{[\s\S]*?background:\s*#262626;[\s\S]*?color:\s*#ffffff;/
  );
  assert.match(publicMatchdayPageSource, /competitionSlug === "liga-portugal"\) return "#00235a";/);
  assert.match(publicMatchdayPageSource, /competitionSlug === "premier-league"\) return "#3d195b";/);
  assert.match(publicMatchdayPageSource, /competitionSlug === "la-liga"\) return "#1d2230";/);
  assert.match(publicMatchdayPageSource, /style=\{\{ background: competitionBarColor \}\}/);
});
