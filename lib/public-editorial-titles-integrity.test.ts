import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(
  "components/public/PublicEditorialLayout.tsx",
  "utf8",
);
const baseStyles = readFileSync(
  "components/public/publicEditorialStyles.ts",
  "utf8",
);
const fourNews = readFileSync(
  "components/public/PublicFourNewsLatestLayout.tsx",
  "utf8",
);
const beyond = readFileSync(
  "components/public/PublicBeyondMatchdayNews.tsx",
  "utf8",
);
const hierarchical = readFileSync(
  "components/public/PublicHierarchicalComposition.tsx",
  "utf8",
);
const horizontal = readFileSync(
  "components/public/PublicHorizontalNewsStrip.tsx",
  "utf8",
);
const roundup = readFileSync(
  "components/public/RoundupVideoSwitcher.tsx",
  "utf8",
);

test("a manchete pública não é truncada", () => {
  assert.match(
    layout,
    /\.public-editorial-layout-panel \.public-matchday-editorial h1 \{[^}]*-webkit-line-clamp: unset;[^}]*overflow: visible;[^}]*text-overflow: clip;/,
  );
  assert.match(
    baseStyles,
    /\.public-matchday-editorial h1 \{[^}]*-webkit-line-clamp: unset;[^}]*overflow: visible;[^}]*text-overflow: clip;/,
  );
});

test("as quatro notícias automáticas mostram o título completo", () => {
  assert.match(
    fourNews,
    /\.public-four-news-title \{[^}]*overflow: visible;[^}]*-webkit-line-clamp: unset;[^}]*line-clamp: unset;/,
  );
});

test("as notícias para além da Jornada mostram títulos completos", () => {
  assert.match(
    beyond,
    /\.public-beyond-matchday-title \{[^}]*overflow: visible;[^}]*text-overflow: clip;/,
  );
  assert.match(
    beyond,
    /\.public-beyond-matchday-lead \.public-beyond-matchday-title \{[^}]*-webkit-line-clamp: unset;[^}]*line-clamp: unset;/,
  );
  assert.match(
    beyond,
    /\.public-beyond-matchday-secondary-card \.public-beyond-matchday-title \{[^}]*-webkit-line-clamp: unset;[^}]*line-clamp: unset;/,
  );
});

test("a composição hierárquica neutraliza clamps de todos os títulos", () => {
  assert.match(
    hierarchical,
    /\.composition-interpretive-title \{[^}]*display: block !important;[^}]*overflow: visible !important;[^}]*-webkit-line-clamp: unset !important;[^}]*line-clamp: unset !important;/,
  );
});

test("Últimas, Destaques, Contexto, Complemento e Faixa mantêm títulos completos", () => {
  assert.match(
    layout,
    /public-below-headline-highlights \.public-cover-story strong \{[^}]*-webkit-line-clamp: unset;[^}]*overflow: visible;/,
  );
  assert.match(
    layout,
    /\.public-news-title \{[^}]*-webkit-line-clamp: unset;[^}]*overflow: visible;/,
  );
  assert.match(
    layout,
    /public-side-editorial-copy strong \{[^}]*-webkit-line-clamp: unset;[^}]*overflow: visible;/,
  );
  assert.match(
    layout,
    /public-complement-body strong \{[^}]*-webkit-line-clamp: unset;[^}]*overflow: visible;/,
  );
  assert.match(
    horizontal,
    /\.public-horizontal-news\[data-editorial-scope="matchday"\] \.public-horizontal-news-title \{[^}]*-webkit-line-clamp: unset;[^}]*overflow: visible;/,
  );
});

test("o título do vídeo ativo não é truncado", () => {
  assert.match(
    roundup,
    /\.public-roundup-video-layout \.public-roundup-active-body strong \{[^}]*-webkit-line-clamp: unset;[^}]*overflow: visible;[^}]*text-overflow: clip;/,
  );
});

test("os limites editoriais permanecem nos textos secundários", () => {
  assert.match(
    fourNews,
    /\.public-four-news-subtitle \{[^}]*-webkit-line-clamp: 2;/,
  );
  assert.match(
    horizontal,
    /\.public-horizontal-news\[data-editorial-scope="matchday"\] \.public-horizontal-news-card p \{[^}]*-webkit-line-clamp: 3;/,
  );
  assert.match(
    roundup,
    /\.public-roundup-video-layout \.public-roundup-active-body p \{[^}]*-webkit-line-clamp: 1;[^}]*overflow: hidden;/,
  );
});

test("as métricas tipográficas validadas no browser são preservadas", () => {
  assert.match(
    layout,
    /\.public-editorial-layout-panel \.public-matchday-editorial h1 \{[^}]*line-height: 1\.15;/,
  );
  assert.match(
    layout,
    /\.public-editorial-layout-panel \.public-matchday-editorial h2 \{[^}]*line-height: 1\.15;/,
  );
  assert.match(
    baseStyles,
    /\.public-matchday-editorial h1 \{[^}]*line-height: 1\.15;/,
  );
  assert.match(
    baseStyles,
    /\.public-matchday-editorial h2 \{[^}]*line-height: 1\.15;/,
  );
  assert.match(
    fourNews,
    /\.public-four-news-title \{[^}]*line-height: 1\.22;[^}]*padding-block: 0\.11em;[^}]*box-sizing: border-box;/,
  );
  assert.match(
    beyond,
    /\.public-beyond-matchday-lead \.public-beyond-matchday-title \{[^}]*line-height: 1\.15;/,
  );
  assert.match(
    beyond,
    /\.public-beyond-matchday-secondary-card \.public-beyond-matchday-title \{[^}]*line-height: 1\.15;/,
  );
  assert.match(
    hierarchical,
    /\.composition-interpretive-dominant \.composition-interpretive-title \{[^}]*line-height: 1\.15;/,
  );
  assert.match(
    hierarchical,
    /\.composition-interpretive-chronicle \.composition-interpretive-title \{[^}]*line-height: 1\.22;/,
  );
  assert.match(
    hierarchical,
    /\.composition-interpretive-analysis-main \.composition-interpretive-title \{[^}]*line-height: 1\.22;/,
  );
  assert.match(
    hierarchical,
    /\.composition-interpretive-analysis-medium \.composition-interpretive-title \{[^}]*line-height: 1\.22;/,
  );
  assert.match(
    hierarchical,
    /\.composition-interpretive-analysis-side-item \.composition-interpretive-title \{[^}]*line-height: 1\.22;/,
  );
  assert.match(
    hierarchical,
    /\.composition-interpretive-other-featured \.composition-interpretive-title \{[^}]*line-height: 1\.22;/,
  );
  assert.match(
    hierarchical,
    /\.composition-interpretive-other-second-featured \.composition-interpretive-title \{[^}]*line-height: 1\.22;/,
  );
  assert.match(
    hierarchical,
    /\.composition-interpretive-other-compact \.composition-interpretive-title \{[^}]*line-height: 1\.22;/,
  );
  assert.match(
    hierarchical,
    /\.composition-interpretive-title \{[^}]*padding-block: 0\.11em;[^}]*box-sizing: border-box;/,
  );
});
