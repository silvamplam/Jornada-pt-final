import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

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
const flexibleZoneRenderers = source(
  "components/public/PublicFlexibleZoneRenderers.tsx",
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

test("zona, Últimas, vídeo e Faixa pertencem ao mesmo contrato exterior", () => {
  assert.match(frameComponent, /kind: "zone" \| "latest" \| "video" \| "faixa"/);
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
  assert.doesNotMatch(flexibleZoneRenderers, /zone\.visualFamily\s*===/);
  assert.match(flexibleZoneRenderers, /PUBLIC_FLEXIBLE_ZONE_RENDERERS/);
  assert.match(flexibleZoneRenderers, /definition\.rendererKey/);
  assert.doesNotMatch(
    frameStyles,
    /six_news|five_news_balanced|five_news_secondary|data-public-visual-family/,
  );

  const flexibleExterior = cssRule(flexibleZoneRenderers, ".public-flexible-zone");
  assert.doesNotMatch(
    flexibleExterior,
    /margin-(?:top|bottom)|padding-(?:top|bottom)|border-(?:top|bottom)/,
  );
});

test("secondary abdica da segunda fronteira e separa os cartões pelo gap", () => {
  assert.match(
    flexibleZoneRenderers,
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
  assert.match(cssRule(beyondMatchday, ".public-beyond-matchday-secondary-grid"), /gap: 22px 18px/);
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
    /renderPublicAdvertisingBoundary\(historicalDynamicBodyBlocks, \(block\) => \{[\s\S]*?block\.kind === "video"[\s\S]*?<PublicMatchdayEditorialSectionFrame[\s\S]*?kind="video"[\s\S]*?<PublicHierarchicalPosteriorMoments[\s\S]*?ownsSectionBoundary=\{false\}/,
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

test("Faixa usa o frame comum e Classificação continua fora", () => {
  assert.match(
    page,
    /<PublicMatchdayEditorialSectionFrame kind="faixa">[\s\S]*?<PublicHorizontalNewsStrip[\s\S]*?ownsSectionBoundary=\{false\}/,
  );
  assert.match(
    page,
    /<section className="public-matchday-panel" id="classificacao"/,
  );
  assert.match(
    horizontalStrip,
    /data-owns-section-boundary="false"[\s\S]*?margin-top: 0;[\s\S]*?padding-top: 0;[\s\S]*?border-top: 0/,
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

// Execute the component's real layout effect against controlled rectangles.
// Browser verification separately covers CSS layout and ResizeObserver delivery.
function mountFrameGeometry(authority: string | null, heights: number[], tops = heights.map(() => 0)) {
  const makeStyle = () => {
    const values = new Map<string, string>();
    return {
      getPropertyValue: (name: string) => values.get(name) ?? "",
      getPropertyPriority: () => "",
      setProperty: (name: string, value: string) => { values.set(name, value); },
      removeProperty: (name: string) => { values.delete(name); },
    };
  };
  let cleanup: (() => void) | undefined;
  let resize = () => {};
  const frame = {
    style: makeStyle(),
    querySelectorAll: (): object[] => headings,
    closest: () => authority === "editorial_snapshot" ? {} : null,
    getBoundingClientRect: () => ({ top: 0 }),
  };
  const latest = { style: makeStyle() };
  const headings = heights.map((height, index) => {
    const style = makeStyle();
    const defaultMargin = index === 0 ? 16 : 0;
    const intrinsicGap = index === 0 ? 0 : 12;
    return {
      style, defaultMargin, textContent: `Title ${index}`,
      getClientRects: () => [true],
      getBoundingClientRect: () => ({ top: tops[index], bottom: tops[index] + height }),
      closest: (selector: string): object | null => selector === "[data-public-editorial-section-frame]"
        ? frame : selector === "[data-public-latest-news]" && index === 1 ? latest : null,
      nextElementSibling: {
        matches: () => false,
        getBoundingClientRect: () => ({
          top: tops[index] + height + intrinsicGap +
            Number.parseFloat(style.getPropertyValue("margin-bottom") || String(defaultMargin)),
        }),
      },
    };
  });
  const exports: { default?: (props: object) => unknown } = {};
  runInNewContext(ts.transpileModule(frameComponent, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    exports,
    require: (name: string) => name === "react" ? {
      useRef: () => ({ current: frame }),
      useLayoutEffect: (effect: () => () => void) => { cleanup = effect(); },
    } : name === "react/jsx-runtime" ? { jsx: () => null } : { frame: "frame" },
    getComputedStyle: (element: object, pseudo?: string) => ({
      height: pseudo ? "1px" : "0px",
      marginBottom: headings.find((title) => title === element)?.style.getPropertyValue("margin-bottom") ||
        String(headings.find((title) => title === element)?.defaultMargin ?? 0),
      getPropertyValue: (name: string) => name === "--public-editorial-section-title-rule-gap" ? "12px" : "24px",
    }),
    ResizeObserver: class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    },
    window: { addEventListener() {}, removeEventListener() {} },
  });
  exports.default!({ kind: "latest", children: null });
  return {
    headings, latest, tops,
    ruleTop: () => Number.parseFloat(frame.style.getPropertyValue("--public-editorial-section-rule-top")),
    contentTops: () => headings.map((title) => title.nextElementSibling.getBoundingClientRect().top),
    resize: () => resize(),
    cleanup: () => cleanup?.(),
  };
}

test("Viva deixa 12/24px abaixo do título mais alto sem sobrepor conteúdo", () => {
  for (const heights of [[18, 61.6], [61.6, 18], [18, 39.6, 61.6]]) {
    const geometry = mountFrameGeometry("editorial_snapshot", heights);
    const bottom = Math.max(...heights);
    assert.equal(geometry.ruleTop(), bottom + 12);
    assert.ok(geometry.contentTops().every((top) => Math.abs(top - bottom - 37) < 0.001));
    geometry.resize();
    geometry.resize();
    assert.ok(geometry.contentTops().every((top) => Math.abs(top - bottom - 37) < 0.001));
    geometry.cleanup();
    assert.ok(geometry.headings.every((title) => title.style.getPropertyValue("margin-bottom") === ""));
  }
});

test("Viva conserva baseline e reserva de Últimas quando cabeçalhos não colidem", () => {
  const live = mountFrameGeometry("editorial_snapshot", [18, 15.4]);
  const before = mountFrameGeometry(null, [18, 15.4]);
  assert.equal(live.ruleTop(), before.ruleTop());
  assert.deepEqual(live.contentTops(), before.contentTops());
  assert.equal(live.latest.style.getPropertyValue("--public-latest-header-reserve"),
    before.latest.style.getPropertyValue("--public-latest-header-reserve"));
});

test("títulos que passam a outra linha deixam de participar na divisória comum", () => {
  const geometry = mountFrameGeometry("editorial_snapshot", [18, 61.6]);
  geometry.tops[1] = 200;
  geometry.resize();
  assert.equal(geometry.ruleTop(), 30);
  assert.equal(geometry.contentTops()[0], 55);
  assert.equal(geometry.headings[1].style.getPropertyValue("margin-bottom"), "");
  assert.equal(geometry.latest.style.getPropertyValue("--public-latest-header-reserve"), "");
  geometry.tops[1] = 0;
  geometry.resize();
  assert.deepEqual(geometry.contentTops(), [98.6, 98.6]);
});

test("Histórica e frames sem autoridade Viva mantêm cálculo anterior", () => {
  for (const authority of [null, "published_reference_composition"]) {
    const geometry = mountFrameGeometry(authority, [18, 61.6]);
    assert.equal(geometry.ruleTop(), 30);
    assert.deepEqual(geometry.contentTops(), [55, 55]);
  }
  assert.match(page, /data-public-editorial-authority=\{publicEditorialAuthority\}/);
});
