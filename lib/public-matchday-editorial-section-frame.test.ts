import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(relativePath, "utf8");
}

function cssRule(styles: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

const frameComponent = source(
  "components/public/PublicMatchdayEditorialSectionFrame.tsx",
);
const frameStyles = source(
  "components/public/PublicMatchdayEditorialSectionFrame.module.css",
);
const flexibleZone = source(
  "components/public/PublicFlexibleZoneLayout.tsx",
);
const fourNewsLatest = source(
  "components/public/PublicFourNewsLatestLayout.tsx",
);
const thematicLatestOnly = source(
  "components/public/PublicThematicLatestOnlyLayout.tsx",
);
const beyondMatchday = source(
  "components/public/PublicBeyondMatchdayNews.tsx",
);
const hierarchical = source(
  "components/public/PublicHierarchicalComposition.tsx",
);
const editorialLayout = source(
  "components/public/PublicEditorialLayout.tsx",
);
const page = source(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
);
const horizontalStrip = source(
  "components/public/PublicHorizontalNewsStrip.tsx",
);

test("zona, Últimas e vídeo pertencem ao mesmo contrato exterior", () => {
  assert.match(frameComponent, /kind: "zone" \| "latest" \| "video"/);
  assert.match(frameComponent, /data-public-editorial-section-frame=\{kind\}/);
  assert.equal(
    flexibleZone.match(/<PublicMatchdayEditorialSectionFrame kind="zone">/g)?.length,
    1,
  );
  assert.match(
    fourNewsLatest,
    /<PublicMatchdayEditorialSectionFrame kind="latest">/,
  );
  assert.match(
    thematicLatestOnly,
    /<PublicMatchdayEditorialSectionFrame kind="latest">/,
  );
  assert.doesNotMatch(frameStyles, /nth-child|first-child|last-child/);
});

test("a família visual não altera o contrato exterior", () => {
  assert.match(flexibleZone, /zone\.visualFamily === "five_news_secondary"/);
  assert.match(flexibleZone, /zone\.visualFamily === "six_news"/);
  assert.match(flexibleZone, /FIVE_NEWS_BALANCED_SLOT_KEYS/);
  assert.doesNotMatch(
    frameStyles,
    /six_news|five_news_balanced|five_news_secondary|data-public-visual-family/,
  );

  const flexibleExterior = cssRule(flexibleZone, ".public-flexible-zone");
  assert.doesNotMatch(
    flexibleExterior,
    /margin-(?:top|bottom)|padding-(?:top|bottom)|border-(?:top|bottom)/,
  );
});

test("secondary abdica da segunda fronteira mas conserva separadores internos", () => {
  assert.match(
    flexibleZone,
    /<PublicBeyondMatchdayNews[\s\S]*?ownsSectionBoundary=\{false\}/,
  );
  assert.match(
    hierarchical,
    /<PublicBeyondMatchdayNews[\s\S]*?ownsSectionBoundary=\{false\}/,
  );

  const embeddedBoundary = cssRule(
    beyondMatchday,
    '.public-beyond-matchday[data-owns-section-boundary="false"]',
  );
  assert.match(embeddedBoundary, /padding-top: 0/);
  assert.match(embeddedBoundary, /padding-bottom: 0/);
  assert.match(embeddedBoundary, /border-top: 0/);
  assert.match(
    beyondMatchday,
    /\.public-beyond-matchday-text-only \{[\s\S]*?border-top: 1px solid #dbe4ee/,
  );
});

test("o frame é o único proprietário da transição, entrada e separador", () => {
  const frame = cssRule(frameStyles, ".frame");
  assert.match(frame, /margin: var\(--public-editorial-section-transition\) auto 0/);
  assert.match(frame, /padding-top: var\(--public-editorial-section-entry\)/);
  assert.match(
    frameStyles,
    /\.frame::before \{[\s\S]*?height: 1px;[\s\S]*?linear-gradient/,
  );
  assert.doesNotMatch(frameStyles, /\.frame::after|border-(?:top|bottom)/);
  assert.doesNotMatch(
    fourNewsLatest,
    /public-four-news-latest-layout::(?:before|after)|margin-top: clamp\(46px|padding-top: clamp\(24px/,
  );
  assert.doesNotMatch(
    hierarchical,
    /public-hierarchical-live-layouts::(?:before|after)|public-hierarchical-live-layouts \{[^}]*margin-top: clamp\(46px/,
  );
});

test("o contrato declara desktop, 980 e 680 com os valores editoriais existentes", () => {
  assert.match(
    frameStyles,
    /--public-editorial-section-transition: clamp\(32px, 3\.2vw, 44px\)/,
  );
  assert.match(
    frameStyles,
    /--public-editorial-section-entry: clamp\(24px, 2\.6vw, 34px\)/,
  );
  assert.match(
    frameStyles,
    /@media \(max-width: 980px\) \{[\s\S]*?--public-editorial-section-transition: 36px;[\s\S]*?--public-editorial-section-entry: 26px;/,
  );
  assert.match(
    frameStyles,
    /@media \(max-width: 680px\) \{[\s\S]*?--public-editorial-section-transition: 28px;[\s\S]*?--public-editorial-section-entry: 20px;/,
  );
});

test("o histórico dinâmico entrega apenas a fronteira exterior do vídeo ao frame", () => {
  assert.match(
    page,
    /historicalDynamicBodyBlocks\.map\(\(block\) => \{[\s\S]*?block\.kind === "video"[\s\S]*?<PublicMatchdayEditorialSectionFrame[\s\S]*?kind="video"[\s\S]*?<PublicHierarchicalPosteriorMoments[\s\S]*?ownsSectionBoundary=\{false\}/,
  );
  assert.doesNotMatch(page, /clamp\(46px, 5vw, 68px\) auto 0/);

  const framedHistoricalVideos = cssRule(
    hierarchical,
    '.public-hierarchical-posterior-moments[data-owns-section-boundary="false"] .public-hierarchical-videos',
  );
  assert.match(framedHistoricalVideos, /padding-top: 0/);
  assert.match(framedHistoricalVideos, /border-top: 0/);
  assert.match(
    hierarchical,
    /\.public-hierarchical-videos \{[\s\S]*?border-top: 2px solid #10151b/,
  );
});

test("thematic e live enquadram vídeo sem duplicar a entrada do layout", () => {
  assert.match(
    page,
    /function renderLivePublicZone[\s\S]*?zone === "video"[\s\S]*?<PublicMatchdayEditorialSectionFrame kind="video"[\s\S]*?<PublicEditorialLayout[\s\S]*?ownsSectionBoundary=\{false\}/,
  );

  const framedPanel = cssRule(
    editorialLayout,
    '.public-matchday-panel.public-editorial-layout-panel[data-owns-section-boundary="false"]',
  );
  const framedDepthRow = cssRule(
    editorialLayout,
    '.public-editorial-layout-panel[data-owns-section-boundary="false"] .public-matchday-depth-row',
  );
  assert.match(framedPanel, /margin-top: 0/);
  assert.match(
    editorialLayout,
    /data-owns-section-boundary="false"\] \.public-matchday-cover \{[\s\S]*?padding-top: 0/,
  );
  assert.match(framedDepthRow, /padding-top: 0/);
  assert.match(framedDepthRow, /border-top: 0/);
  assert.match(
    editorialLayout,
    /\.public-editorial-layout-panel \.public-matchday-cover \{[\s\S]*?padding: 18px 0 22px/,
  );
  assert.match(
    editorialLayout,
    /\.public-editorial-layout-panel \.public-matchday-depth-row \{[\s\S]*?padding-top: 18px;[\s\S]*?border-top: 1px solid #dbe4ee/,
  );
});

test("o legacy partilha uma única variável entre o gap e a compensação framed", () => {
  assert.match(
    page,
    /wrapVideoSection=\{[\s\S]*?<PublicMatchdayEditorialSectionFrame[\s\S]*?kind="video"/,
  );
  assert.match(
    hierarchical,
    /data-video-section-framed=\{wrapVideoSection && hasVideoBlock \? "true" : undefined\}/,
  );
  assert.match(
    hierarchical,
    /\.composition-interpretive-preview \{[\s\S]*?--composition-interpretive-preview-gap: 64px;[\s\S]*?gap: var\(--composition-interpretive-preview-gap\)/,
  );
  assert.match(
    hierarchical,
    /@media \(max-width: 980px\) \{[\s\S]*?\.composition-interpretive-preview \{[\s\S]*?--composition-interpretive-preview-gap: 50px;/,
  );
  assert.match(
    hierarchical,
    /@media \(max-width: 720px\) \{[\s\S]*?\.composition-interpretive-preview \{[\s\S]*?--composition-interpretive-preview-gap: 38px;/,
  );
  assert.match(
    hierarchical,
    /data-video-section-framed="true"\] > \[data-public-editorial-section-frame="video"\] \{[\s\S]*?calc\(var\(--public-editorial-section-transition\) - var\(--composition-interpretive-preview-gap\)\)/,
  );
  assert.match(
    hierarchical,
    /data-video-section-framed="true"\] > \.public-hierarchical-framed-video-group \{[\s\S]*?calc\(0px - var\(--composition-interpretive-preview-gap\)\)/,
  );
  assert.equal(
    hierarchical.match(/data-video-section-framed="true"\] > \[data-public-editorial-section-frame="video"\]/g)?.length,
    1,
  );
  assert.equal(
    hierarchical.match(/data-video-section-framed="true"\] > \.public-hierarchical-framed-video-group/g)?.length,
    1,
  );
  for (const gap of [64, 50, 38]) {
    assert.equal(
      hierarchical.match(new RegExp(`\\b${gap}px\\b`, "g"))?.length,
      1,
    );
  }
  assert.doesNotMatch(
    hierarchical,
    /margin-top:[^;]*(?:64|50|38)px/,
  );
});

test("Faixa e Classificação continuam fora do frame de vídeo", () => {
  assert.match(
    page,
    /<div className="public-matchday-editorial-region">\s*<PublicHorizontalNewsStrip/,
  );
  assert.match(
    page,
    /<section className="public-matchday-panel" id="classificacao"/,
  );
  assert.doesNotMatch(
    horizontalStrip,
    /PublicMatchdayEditorialSectionFrame/,
  );
});

test("a integração de vídeo não introduz ordem, antecessor, família nem J04", () => {
  assert.doesNotMatch(
    page,
    /historicalDynamicBodyBlocks\.map\(\(block,\s*index\)/,
  );
  assert.doesNotMatch(
    hierarchical,
    /data-video-(?:index|previous|family)|video(?:Index|Previous|Family)|J04/,
  );
  assert.doesNotMatch(
    page,
    /historical-(?:video-index|video-previous|video-family)|J04/,
  );
  assert.doesNotMatch(frameStyles, /nth-child|first-child|last-child/);
});
