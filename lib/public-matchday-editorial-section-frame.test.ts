import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createPublicFlexibleZone, PublicFlexibleZoneContent, PublicFlexibleZoneHeading } from "../components/public/PublicFlexibleZoneRenderers";

Object.assign(globalThis, { React });

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
    /\[data-public-editorial-flow\]::before \{[\s\S]*?height: 1px;[\s\S]*?linear-gradient/,
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

// Run the real component without window/document: SSR must own the boundary.
function evaluateComponent(code: string, dependencies: Record<string, unknown>, globals = {}) {
  const exports: Record<string, (...args: any[]) => any> = {};
  runInNewContext(ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    require: (id: string) => {
      if (id === "react/jsx-runtime") return jsxRuntime;
      if (id in dependencies) return dependencies[id];
      throw new Error("Unexpected dependency: " + id);
    },
    ...globals,
  });
  return exports;
}

test("frame SSR emite a mesma fronteira sem browser, efeitos ou medição", () => {
  const Frame = evaluateComponent(frameComponent, {
    "./PublicMatchdayEditorialSectionFrame.module.css": { default: { frame: "frame" } },
  }).default;
  for (const kind of ["zone", "latest", "video", "faixa"]) {
    const html = renderToStaticMarkup(React.createElement(Frame, { kind, children: "Conteúdo" }));
    const $ = load(html);
    assert.equal($("[data-public-editorial-section-frame]").attr("data-public-editorial-section-frame"), kind);
    assert.equal($("[data-public-editorial-section-frame]").text(), "Conteúdo");
    assert.equal($("[style]").length, 0);
  }
  assert.doesNotMatch(frameComponent, /use client|useLayoutEffect|useEffect|ResizeObserver|getBoundingClientRect|setProperty/);
  assert.doesNotMatch(frameComponent + frameStyles, /public-editorial-section-rule-top|public-latest-header-reserve/);
});

test("separador ocupa a segunda linha em fluxo e reserva 12/1/24 no CSS inicial", () => {
  const rule = cssRule(frameStyles, ".frame [data-public-editorial-flow]::before");
  assert.match(rule, /grid-row: 2/);
  assert.match(rule, /grid-column: 1 \/ -1/);
  assert.match(rule, /height: 1px/);
  assert.match(rule, /margin-top: calc\(var\(--public-editorial-section-title-rule-gap\)/);
  assert.match(rule, /margin-bottom: calc\(var\(--public-editorial-section-rule-content-gap\)/);
  assert.match(frameStyles, /--public-editorial-section-title-rule-gap: 12px/);
  assert.match(frameStyles, /--public-editorial-section-rule-content-gap: 24px/);
  assert.doesNotMatch(frameStyles, /position: absolute|\btop: 5px/);
  assert.match(cssRule(frameStyles, '.frame [data-public-editorial-flow="single"]'), /display: grid/);
  assert.match(cssRule(frameStyles, ".frame [data-public-editorial-flow] > [data-public-editorial-heading]"), /grid-row: 1/);
});

test("cabeçalhos partilham altura natural e publicidade não expande a linha de títulos", () => {
  const companion = source("components/public/PublicLatestCompanionLayout.tsx");
  assert.match(companion, /grid-template-rows: max-content max-content minmax\(0, 1fr\)/);
  assert.match(companion, /grid-template-rows: subgrid/);
  assert.match(companion, /public-latest-companion-content \{ grid-row: 3/);
  assert.match(companion, /<PublicFlexibleZoneHeading zone=\{zone\}/);
  assert.match(companion, /showTitle=\{false\}/);
  const heading = cssRule(companion, ".public-latest-companion-heading > :is(h2, header)");
  assert.doesNotMatch(heading, /height|clamp|line-clamp/);
  assert.match(companion, /@media \(max-width: 1100px\)[\s\S]*?public-latest-companion-grid::before \{ display: none/);
  assert.match(companion, /public-latest-companion-zone" data-public-editorial-flow="single"/);
});

test("cinco colunas sem título global partilham só os cabeçalhos da primeira linha responsive", () => {
  const columns = source("components/public/PublicEditorialColumnRunLayout.tsx");
  const Component = evaluateComponent(columns, {
    "./PublicMatchdayEditorialSectionFrame": { default: ({ children }: { children: React.ReactNode }) => children },
    "./PublicFlexibleZoneRenderers": { PublicFlexibleZoneContent: ({ zone }: { zone: { key: string; publicTitle: string } }) =>
      React.createElement("section", { "data-column": zone.key },
        React.createElement("h2", null, zone.publicTitle), React.createElement("article", null, "Artigo")) },
  }).default;
  const zones = Array.from({ length: 5 }, (_, i) => ({ key: String(i), publicTitle: "Título ".repeat(i + 1), slots: [{ item: {} }] }));
  for (const publicTitle of [undefined, "Histórias"]) {
    const $ = load(renderToStaticMarkup(React.createElement(Component, { zones, publicTitle, matchdayNumber: 7 })));
    assert.equal($("[data-public-editorial-flow]").length, 1);
    assert.equal($("[data-public-editorial-flow]").attr("data-public-editorial-flow"), publicTitle ? "single" : "shared");
    assert.equal($("[data-column]").length, 5);
    assert.equal($("article").length, 5);
    assert.equal($(".public-column-group-heading").length, publicTitle ? 1 : 0);
  }
  assert.match(columns, /@media \(min-width: 1101px\)[\s\S]*?nth-of-type\(-n \+ 5\)/);
  assert.match(columns, /@media \(min-width: 681px\) and \(max-width: 1100px\)[\s\S]*?nth-of-type\(-n \+ 3\)/);
  assert.match(columns, /@media \(max-width: 680px\)[\s\S]*?first-of-type/);
  assert.match(columns, /grid-template-rows: subgrid/);
  assert.match(columns, /gap: 40px 36px/);
  assert.doesNotMatch(columns, /getBoundingClientRect|ResizeObserver/);
});

test("Últimas recorta apenas itens completos sem escrever nem medir a geometria exterior", () => {
  let resize = () => {};
  let collapsed = false;
  let limit = 700;
  let effect: (() => (() => void) | undefined) | undefined;
  const writes: string[] = [];
  const items = Array.from({ length: 10 }, (_, i) => ({
    style: { display: "", removeProperty() { this.display = ""; } },
    getBoundingClientRect: () => ({ bottom: (i + 1) * 100 }),
  }));
  const list = { getBoundingClientRect: () => ({ bottom: limit }), querySelectorAll: () => items };
  const boundary = { getBoundingClientRect: () => { throw new Error("Exterior must not be measured"); } };
  const root = {
    style: new Proxy({ removeProperty(name: string) { writes.push(name); } }, {
      set: (_, key) => { writes.push(String(key)); return true; },
    }),
    getBoundingClientRect: () => { throw new Error("Exterior must not be measured"); },
    closest: () => ({ querySelector: () => boundary }),
    querySelector: () => list,
  };
  const Latest = evaluateComponent(source("components/public/PublicLatestNewsBlock.tsx"), {
    react: { useRef: () => ({ current: root }), useEffect: (fn: typeof effect) => { effect = fn; } },
    "./PublicEditorialImage": { default: () => null },
    "@/lib/editorial-image-framing": { editorialImageFramingProps: () => ({}) },
  }, {
    ResizeObserver: class { constructor(fn: () => void) { resize = fn; } observe() {} disconnect() {} },
    window: {
      matchMedia: () => ({ matches: collapsed }),
      requestAnimationFrame: (fn: () => void) => { fn(); return 1; },
      cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {},
    },
  }).default;
  Latest({ items: [], title: "Últimas", constrainToCompanionZone: true });
  const cleanup = effect?.();
  assert.equal(items.filter(i => i.style.display !== "none").length, 7);
  limit = 800;
  resize();
  assert.equal(items.filter(i => i.style.display !== "none").length, 8);
  limit = 750;
  resize();
  assert.equal(items.filter(i => i.style.display !== "none").length, 7);
  collapsed = true;
  resize();
  assert.equal(items.filter(i => i.style.display !== "none").length, 10);
  cleanup?.();
  assert.deepEqual(writes, []);
  const companion = source("components/public/PublicLatestCompanionLayout.tsx");
  assert.match(cssRule(companion, ".public-latest-companion-news .public-news-list"), /contain: size/);
});

test("separar o cabeçalho preserva título, tipografia declarada e cartões de todas as famílias anfitriãs", () => {
  for (const [visualFamily, count] of [
    ["four_news", 4], ["six_news", 6], ["six_news_1_2_3", 6],
    ["five_news_balanced", 5], ["five_news_secondary", 5],
  ] as const) {
    const zone = createPublicFlexibleZone({
      key: visualFamily, publicTitle: "Título público", visualFamily,
      items: Array.from({ length: count }, (_, i) => ({
        id: String(i), sourceId: String(i), sortOrder: i + 1,
        label: "Contexto", title: "Notícia " + i, subtitle: "Pós-título",
        imageUrl: "/imagem.jpg", linkUrl: "/noticias/" + i, publishedAt: null,
      })),
    });
    const before = load(renderToStaticMarkup(React.createElement(PublicFlexibleZoneContent, { zone, matchdayNumber: 7 })));
    const after = load(renderToStaticMarkup(React.createElement(React.Fragment, null,
      React.createElement(PublicFlexibleZoneHeading, { zone }),
      React.createElement(PublicFlexibleZoneContent, { zone, matchdayNumber: 7, showTitle: false }))));
    assert.equal(after("h2").text(), before("h2").text(), visualFamily);
    assert.equal(after("h2").attr("class"), before("h2").attr("class"), visualFamily);
    assert.deepEqual(after("article").map((_, e) => after.html(e)).get(),
      before("article").map((_, e) => before.html(e)).get(), visualFamily);
  }
});
