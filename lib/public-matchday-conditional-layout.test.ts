import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("components/public/PublicEditorialLayout.tsx", "utf8");
const sharedStyles = readFileSync("components/public/publicEditorialStyles.ts", "utf8");
const contextPostTitle = readFileSync("components/public/PublicContextPostTitle.tsx", "utf8");

test("a grelha identifica semanticamente qual zona lateral existe", () => {
  assert.match(layout, /data-has-latest=\{hasLatestNews \? "true" : "false"\}/);
  assert.match(layout, /data-has-context=\{hasSideBlock \? "true" : "false"\}/);
  assert.match(layout, /data-top-columns=\{topColumnCount\}/);
});

test("o estado completo preserva a geometria aprovada", () => {
  assert.match(
    layout,
    /public-matchday-lead-grid\[data-top-columns="3"\] \{\s*grid-template-columns: minmax\(0, 1fr\) minmax\(220px, 235px\) minmax\(190px, 205px\);/,
  );
  assert.match(layout, /grid-template-columns: minmax\(250px, 1fr\) minmax\(0, 420px\);/);
  assert.match(layout, /height: 300px;\s*max-height: 300px;/);
  assert.match(layout, /font-size: clamp\(30px, 1\.9vw, 34px\);/);
  assert.doesNotMatch(layout, /data-top-columns="3"[^}]*?public-editorial-main-image/);
});

test("sem Contexto cresce a coluna principal e mantém Últimas na largura aprovada", () => {
  assert.match(
    layout,
    /data-top-columns="2"\]\[data-has-latest="true"\]\[data-has-context="false"\] \{\s*grid-template-columns: minmax\(0, 1fr\) minmax\(220px, 235px\);/,
  );
  assert.match(layout, /data-top-columns="2"\] \.public-editorial-main-image \{\s*height: 285px;\s*max-height: 285px;/);
});

test("sem Últimas crescem moderadamente a coluna principal e o Contexto", () => {
  assert.match(
    layout,
    /data-top-columns="2"\]\[data-has-latest="false"\]\[data-has-context="true"\] \{\s*grid-template-columns: minmax\(0, 1fr\) minmax\(280px, 330px\);/,
  );
  assert.match(
    layout,
    /data-top-columns="2"\] \.public-cover-headline \{\s*grid-template-columns: minmax\(240px, 0\.76fr\) minmax\(480px, 1\.24fr\);\s*min-height: 285px;/,
  );
});

test("sem ambas a coluna principal e a imagem usam a largura editorial disponível", () => {
  assert.match(layout, /public-matchday-lead-grid\[data-top-columns="1"\] \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(
    layout,
    /data-top-columns="1"\] \.public-cover-headline \{\s*grid-template-columns: minmax\(280px, 0\.7fr\) minmax\(580px, 1\.3fr\);\s*min-height: 295px;/,
  );
  assert.match(layout, /data-top-columns="1"\] \.public-editorial-main-image \{\s*height: 295px;\s*max-height: 295px;/);
});

test("Manchete e Destaques continuam dentro da mesma coluna principal", () => {
  const functionStart = layout.indexOf("export function PublicEditorialLayout");
  const source = layout.slice(functionStart);
  const mainStart = source.indexOf('<div className="public-matchday-main-column">');
  const headline = source.indexOf("<PublicHeadlineBlock", mainStart);
  const highlights = source.indexOf("<PublicHighlightsSection", headline);
  const mainEnd = source.indexOf("</div>", highlights);
  const latest = source.indexOf("<PublicLatestNewsBlock", highlights);

  assert.ok(mainStart >= 0);
  assert.ok(headline > mainStart);
  assert.ok(highlights > headline);
  assert.ok(mainEnd > highlights);
  assert.ok(latest > mainEnd);
  assert.match(layout, /\.public-matchday-main-column \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(
    layout,
    /\.public-matchday-main-column > \.public-matchday-editorial,[\s\S]*?\.public-matchday-main-column > \.public-editorial-highlights-section,[\s\S]*?width: 100%;\s*min-width: 0;\s*box-sizing: border-box;/,
  );
  assert.match(
    layout,
    /\.public-matchday-main-column > \.public-editorial-highlights-section \{\s*padding-right: 0;\s*padding-left: 0;/,
  );
  assert.match(sharedStyles, /\.public-below-headline-highlights \.public-cover-story \{[\s\S]*?padding: 0;/);
  assert.match(sharedStyles, /\.public-below-headline-highlights \.public-highlight-image \{[\s\S]*?width: 100%;/);
});

test("o Contexto fecha a coluna pelo crescimento da imagem sem deformação", () => {
  assert.match(
    layout,
    /data-top-columns="2"\]\[data-has-latest="false"\]\[data-has-context="true"\] > \.public-side-editorial-block \{\s*grid-template-rows: minmax\(0, 1fr\);\s*align-content: stretch;/,
  );
  assert.match(layout, /grid-template-rows: minmax\(0, 1fr\) auto;/);
  assert.match(layout, /> \.public-side-editorial-image \{\s*height: 100%;\s*min-height: 0;\s*aspect-ratio: auto;/);
  assert.match(sharedStyles, /\.public-side-editorial-image img \{[\s\S]*?height: 100%;[\s\S]*?object-fit: cover;/);
  assert.doesNotMatch(layout, /data-top-columns="3"[^}]*?grid-template-rows: minmax\(0, 1fr\)/);
});

test("as variantes são só da Jornada desktop e preservam os três breakpoints", () => {
  assert.match(layout, /@media \(min-width: 1181px\)/);
  assert.match(layout, /data-editorial-scope="matchday"/);
  assert.match(layout, /@media \(max-width: 1180px\)/);
  assert.match(layout, /@media \(max-width: 840px\)/);
  assert.match(layout, /@media \(max-width: 680px\)/);
  assert.doesNotMatch(layout, /data-editorial-scope="home"[^\n]*data-top-columns/);
});

test("PublicContextPostTitle mantém o limite visual dos Destaques", () => {
  assert.match(contextPostTitle, /data-editorial-slot="destaques-da-manchete"/);
  assert.match(contextPostTitle, /editorialBoundary\.getBoundingClientRect\(\)\.bottom - paragraph\.getBoundingClientRect\(\)\.top/);
  assert.match(contextPostTitle, /paragraph\.style\.setProperty\("-webkit-line-clamp"/);
  assert.match(contextPostTitle, /window\.matchMedia\("\(max-width: 1180px\)"\)/);
});

test("os títulos de Últimas na Jornada não são cortados por line-clamp", () => {
  assert.match(
    layout,
    /data-editorial-scope=\"matchday\"\] \.public-news-title \{\s*display: block;\s*-webkit-box-orient: initial;\s*-webkit-line-clamp: unset;\s*overflow: visible;\s*text-overflow: clip;/,
  );
  assert.doesNotMatch(
    layout,
    /data-editorial-scope=\"matchday\"\] \.public-news-title \{\s*-webkit-line-clamp: 4;/,
  );
});

test("os títulos editoriais públicos da Jornada não são truncados", () => {
  assert.match(layout, /public-below-headline-highlights \.public-cover-story strong \{[\s\S]*?-webkit-line-clamp: unset;/);
  assert.match(layout, /public-side-editorial-copy strong \{[\s\S]*?-webkit-line-clamp: unset;/);
  assert.match(layout, /public-complement-body strong \{[\s\S]*?-webkit-line-clamp: unset;/);
  assert.doesNotMatch(layout, /public-below-headline-highlights \.public-cover-story strong \{[^}]*-webkit-line-clamp: 3;/);
  assert.doesNotMatch(layout, /public-side-editorial-copy strong \{\s*-webkit-line-clamp: 6;/);
  assert.doesNotMatch(layout, /public-complement-body strong \{\s*-webkit-line-clamp: 2;/);
});

test("a Faixa da Jornada também mostra os títulos completos", () => {
  const horizontal = readFileSync("components/public/PublicHorizontalNewsStrip.tsx", "utf8");

  assert.match(
    horizontal,
    /public-horizontal-news\[data-editorial-scope=\"matchday\"\] \.public-horizontal-news-title \{[^}]*-webkit-line-clamp: unset;/,
  );
  assert.doesNotMatch(
    horizontal,
    /public-horizontal-news\[data-editorial-scope=\"matchday\"\] \.public-horizontal-news-title \{[^}]*-webkit-line-clamp: 3;/,
  );
});
