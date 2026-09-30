import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createPublicFlexibleZone, PublicFlexibleZoneContent } from "@/components/public/PublicFlexibleZoneRenderers";
import type { EditorialVisualFamily } from "./editorial-visual-families";

Object.assign(globalThis, { React });
const require = createRequire(`${process.cwd()}/geometry-test.cjs`);
require.extensions[".css"] = (module) => { module.exports = { frame: "section-frame" }; };
const { default: ColumnRun, publicEditorialColumnRunStyles: columnsCSS } = require("./components/public/PublicEditorialColumnRunLayout") as typeof import("@/components/public/PublicEditorialColumnRunLayout");

function zone(key: string, family: EditorialVisualFamily, count: number, title = key) {
  return createPublicFlexibleZone({ key, publicTitle: title, visualFamily: family,
    items: Array.from({ length: count }, (_, i) => ({ id: `${key}-${i}`, sourceId: `${key}-${i}`,
      sortOrder: i + 1, label: "JORNADA", title: `Notícia ${i + 1}`, subtitle: `Pós-título ${i + 1}`,
      imageUrl: `/imagem-${i}.jpg`, linkUrl: `/noticias/${i}`, publishedAt: null })) });
}

function rule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  assert.ok(body, `Missing CSS rule: ${selector}`);
  return body;
}

function familyCSS(family: EditorialVisualFamily, count: number) {
  const $ = load(renderToStaticMarkup(<PublicFlexibleZoneContent zone={zone("teste", family, count)} matchdayNumber={7} />));
  return $("style").map((_, element) => $(element).text()).get().join("\n");
}

for (const lines of [[1, 1, 1, 1, 1], [1, 2, 1, 3, 1], [2, 4, 1, 2, 3], [4, 4, 4, 4, 4]]) {
  test(`column headings ${lines.join("/")} remain complete and share intrinsic rows in SSR`, () => {
    const zones = lines.map((n, i) => zone(`coluna-${i}`, "five_news_column", 5, Array(n).fill("Futebol internacional").join(" ")));
    for (const publicTitle of ["Histórias", undefined]) {
      const $ = load(renderToStaticMarkup(<ColumnRun zones={zones} publicTitle={publicTitle} matchdayNumber={7} />));
      assert.deepEqual($(".public-five-news-column-heading").map((_, h) => $(h).text()).get(), zones.map(z => z.publicTitle));
      assert.equal($(".public-five-news-column-image").length, 5);
      assert.equal($("article").length, 25);
      assert.equal($("[data-public-editorial-flow]").length, 1, "one unchanged section boundary");
    }
    const heading = rule(columnsCSS, ".public-five-news-column-heading");
    assert.doesNotMatch(heading, /(?:^|;)\s*(?:(?:min|max)-)?height\s*:|line-clamp|overflow:\s*hidden/);
    assert.match(columnsCSS, /@media \(min-width: 681px\)[\s\S]*?\.public-editorial-column-run > \.public-five-news-column \{[^}]*grid-template-rows: subgrid;[^}]*grid-row: span 2;/);
    assert.match(rule(columnsCSS, ".public-editorial-column-run > .public-five-news-column > .public-five-news-column-stories"), /grid-row: 2; align-self: start/);
    assert.match(columnsCSS, /grid-row: 1 \/ 4/, "untitled first row still reserves the shared separator");
  });
}

test("column transitions keep a separator and air on both sides without changing image-to-title spacing", () => {
  assert.match(rule(columnsCSS, ".public-five-news-column-stories"), /gap: 12px/);
  assert.match(rule(columnsCSS, ".public-five-news-column-stories article + article"), /padding-top: 10px; border-top: 1px solid/);
  assert.match(rule(columnsCSS, ".public-five-news-column-image"), /aspect-ratio: 16 \/ 9; margin-bottom: 14px/);
  assert.match(rule(columnsCSS, ".public-editorial-column-run"), /repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(rule(columnsCSS, ".public-editorial-column-run"), /gap: 40px 36px/);
  assert.match(rule(columnsCSS, ".public-five-news-column::before"), /left: -18px;.*border-left: 1px solid/);
  assert.match(columnsCSS, /@media \(max-width: 680px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\); gap: 36px/);
});

test("tiered lead shares the lower row's columns and retains the previous height at every desktop width", () => {
  const css = familyCSS("six_news_1_2_3", 6);
  const desktop = css.match(/@media \(min-width: 681px\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(desktop);
  const card = rule(desktop, '.public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-card');
  const middle = rule(css, '.public-six-news-tiered-row[data-editorial-tier="middle"]');
  const leadColumns = card.match(/grid-template-columns: ([^;]+)/)?.[1];
  assert.equal(leadColumns, middle.match(/grid-template-columns: ([^;]+)/)?.[1]);
  assert.equal(card.match(/gap: ([^;]+)/)?.[1], rule(css, ".public-six-news-tiered-row").match(/gap: ([^;]+)/)?.[1]);
  assert.match(card, /container-type: inline-size/);
  const media = rule(desktop, '.public-six-news-tiered-row[data-editorial-tier="lead"] .public-six-news-tiered-media');
  const height = media.match(/height: calc\(\(100cqi - ([\d.]+)px\) \/ ([\d.]+)\)/);
  assert.ok(height, "height must use the row's SSR CSS geometry");
  for (const width of [681, 728, 976, 1200]) {
    const oldWidth = (width - 28) * .48;
    const newWidth = (width - 32) / 2;
    const newHeight = (width - Number(height[1])) / Number(height[2]);
    assert.ok(Math.abs(newHeight - oldWidth / 2.64) < .001, `unchanged height at ${width}`);
    assert.ok(newWidth > oldWidth);
    assert.equal(width - newWidth, (width + 32) / 2, "left matches the lower right article");
  }
  assert.match(media, /aspect-ratio: auto/);
  assert.doesNotMatch(media, /\b(?:top|bottom|right|transform)\s*:/);
  assert.match(rule(css, ".public-six-news-tiered-media img"), /object-fit: cover/);
  assert.match(rule(css, '.public-six-news-tiered-row[data-editorial-tier="final"]'), /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(rule(css, ".public-six-news-tiered-row + .public-six-news-tiered-row"), /margin-top: 24px;\s*padding-top: 24px/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?data-editorial-tier="lead"[^}]*grid-template-columns: minmax\(0, 1fr\); gap: 18px/);
});

test("six_news breathes only between central and right articles, preserving column spans and the dominant", () => {
  const css = familyCSS("six_news", 6);
  const prefix = ".composition-interpretive-analysis-";
  assert.match(rule(css, prefix + "grid"), /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);[\s\S]*gap: 28px/);
  for (const [name, span] of [["main", 4], ["center", 5], ["side", 3]] as const) {
    assert.match(rule(css, prefix + name), new RegExp(`grid-column: span ${span}`));
  }
  assert.match(rule(css, prefix + "main"), /gap: 9px/);
  assert.match(rule(css, prefix + "main .composition-interpretive-media"), /aspect-ratio: 2 \/ 1/);
  for (const name of ["center", "side"]) assert.match(rule(css, prefix + name), /gap: 18px/);
  for (const name of ["medium", "side-item"]) {
    assert.match(rule(css, prefix + name), /padding-bottom: 18px;\s*border-bottom: 1px solid/);
    assert.match(rule(css, prefix + name + ":last-child"), /padding-bottom: 0;\s*border-bottom: 0/);
  }
  assert.match(rule(css, prefix + "medium .composition-interpretive-media"), /aspect-ratio: 4 \/ 3/);
  assert.match(rule(css, prefix + "side-item .composition-interpretive-media"), /aspect-ratio: 2.45 \/ 1/);
});

test("these family renderers remain independent of browser geometry and mount effects", () => {
  for (const file of ["PublicEditorialColumnRunLayout", "PublicSixNewsTiered", "PublicHierarchicalComposition"]) {
    const source = readFileSync(`components/public/${file}.tsx`, "utf8");
    assert.doesNotMatch(source, /ResizeObserver|getBoundingClientRect|useLayoutEffect|useEffect|style\.setProperty|window\./);
  }
});
