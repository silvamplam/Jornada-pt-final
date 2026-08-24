import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(
  "components/public/PublicEditorialLayout.tsx",
  "utf8",
);

test("a Abertura conta apenas os blocos superiores realmente presentes", () => {
  assert.match(
    layout,
    /const topColumnCount = \[hasMainColumn, hasLatestNews, hasSideBlock\]\.filter\(Boolean\)\.length/,
  );
  assert.match(
    layout,
    /const hasMainColumn = showHeadline \|\| hasHighlights/,
  );
});

test("os Destaques ocupam toda a largura disponível sem slots vazios", () => {
  assert.match(
    layout,
    /data-highlight-count=\{Math\.min\(data\.highlights\.length, 3\)\}/,
  );

  assert.match(
    layout,
    /data-highlight-count="1"\][\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
  );

  assert.match(
    layout,
    /data-highlight-count="2"\][\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
});

test("zero Destaques continua a eliminar integralmente a zona", () => {
  assert.match(
    layout,
    /if \(data\.highlights\.length === 0\) \{\s*return null;\s*\}/,
  );
});

test("em mobile dois Destaques deixam de ser forçados lado a lado", () => {
  assert.match(
    layout,
    /@media \(max-width: 760px\)[\s\S]*?data-highlight-count="2"[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
});
test("a Abertura da Mesa permanece acessível durante o drag", () => {
  const desk = readFileSync(
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
    "utf8",
  );

  assert.match(
    desk,
    /\.thematic-opening-panel\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*8px;/,
  );

  assert.match(
    desk,
    /className="thematic-panel thematic-opening-panel"\s+aria-label="Abertura editorial manual"/,
  );

  assert.match(
    desk,
    /@media \(max-width: 820px\)[\s\S]*?\.thematic-opening-panel\s*\{\s*position:\s*static;/,
  );
});

test("a Abertura da página viva não incorpora publicidade", () => {
  const page = readFileSync(
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
    "utf8",
  );

  assert.doesNotMatch(
    layout,
    /PublicSideAdvertisement/,
  );

  assert.doesNotMatch(
    layout,
    /sideAdvertisement/,
  );

  assert.doesNotMatch(
    layout,
    /data-public-ad-slot="thematic-opening"/,
  );

  assert.doesNotMatch(
    page,
    /topSideAdvertisement/,
  );

  assert.doesNotMatch(
    page,
    /sideAdvertisement=\{/,
  );
});

test("o percurso four_news continua a ser o único dono da sua própria publicidade", () => {
  const fourNews = readFileSync(
    "components/public/PublicFourNewsLatestLayout.tsx",
    "utf8",
  );

  const latestOnly = readFileSync(
    "components/public/PublicThematicLatestOnlyLayout.tsx",
    "utf8",
  );

  assert.match(
    fourNews,
    /data-public-ad-slot="four-news-latest"/,
  );

  assert.match(
    latestOnly,
    /data-public-ad-slot="thematic-latest-only"/,
  );
});

test("Manchete compacta apenas quando Últimas e Contexto coexistem na Abertura", () => {
  assert.match(
    layout,
    /data-top-columns="3"\]\[data-has-latest="true"\]\[data-has-context="true"\][\s\S]*?\.public-cover-headline\s*\{[\s\S]*?grid-template-columns:\s*minmax\(300px, 1fr\) minmax\(0, 390px\)/,
  );

  assert.match(
    layout,
    /data-top-columns="3"\]\[data-has-latest="true"\]\[data-has-context="true"\][\s\S]*?\.public-cover-headline p\s*\{[\s\S]*?-webkit-line-clamp:\s*4;/,
  );

  assert.match(
    layout,
    /data-top-columns="3"\]\[data-has-latest="true"\]\[data-has-context="true"\][\s\S]*?font-size:\s*clamp\(28px, 1\.6vw, 30px\)/,
  );
});