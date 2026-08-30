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
const page = source(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
);
const horizontalStrip = source(
  "components/public/PublicHorizontalNewsStrip.tsx",
);

test("zona e Últimas usam o mesmo frame exterior sem conhecer a ordem", () => {
  assert.match(frameComponent, /kind: "zone" \| "latest"/);
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

test("vídeo, Faixa e Classificação ficam fora do contrato novo", () => {
  assert.doesNotMatch(frameComponent, /"video"/);
  assert.doesNotMatch(page, /kind="video"/);
  assert.match(
    page,
    /block\.kind === "video"[\s\S]*?<PublicHierarchicalPosteriorMoments/,
  );
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
