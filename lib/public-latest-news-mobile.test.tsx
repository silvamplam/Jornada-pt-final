import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import PublicLatestNewsBlock, { publicLatestNewsMobileStyles } from "../components/public/PublicLatestNewsBlock";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("mobile visibility preserves the complete latest feed and its title for desktop", () => {
  const items = Array.from({ length: 120 }, (_, i) => Object.freeze({
    id: String(i), title: `Article ${i}`, linkUrl: `/noticias/${i}`,
  }));
  const $ = load(renderToStaticMarkup(<PublicLatestNewsBlock items={items} title="Últimas" />));
  assert.equal($("[data-public-latest-news]").length, 1);
  assert.equal($("[data-public-latest-news] h3").text(), "Últimas");
  assert.equal($(".public-news-item").length, items.length);
  assert.deepEqual($(".public-news-title").map((_, e) => $(e).attr("href")).get(), items.map(i => i.linkUrl));
  assert.equal($("style").text(), publicLatestNewsMobileStyles);
  assert.match(publicLatestNewsMobileStyles.trim(), /^@media \(max-width: 760px\)/);
  assert.equal(publicLatestNewsMobileStyles.match(/@media/g)?.length, 1);
});

test("mobile removes the list owner and empty frames without hiding neighbouring content or ads", () => {
  const html = `
    <div class="public-latest-companion-grid">
      <section id="editorial">Editorial</section>
      <div class="public-latest-companion-news" id="companion"><aside class="public-matchday-news" data-public-latest-news>Últimas</aside></div>
      <aside class="public-latest-companion-ad" id="companion-ad">Ad</aside>
    </div>
    <div class="public-four-news-latest-grid">
      <div class="public-four-news-latest-column" id="four"><div><aside class="public-matchday-news" data-public-latest-news>Últimas</aside></div></div>
      <aside class="public-four-news-ad-column" id="four-ad">Ad</aside>
    </div>
    <div data-public-editorial-section-frame="latest" id="empty-frame"><section class="public-thematic-latest-only-layout"><aside class="public-matchday-news" data-public-latest-news>Últimas</aside></section></div>
    <div data-public-editorial-section-frame="latest" id="ad-frame"><section class="public-thematic-latest-only-layout"><aside class="public-matchday-news" data-public-latest-news>Últimas</aside><aside class="public-thematic-latest-only-ad-column" id="thematic-ad">Ad</aside></section></div>
    <section class="public-editorial-layout-panel" id="latest-only-opening"><div class="public-matchday-cover"><div class="public-matchday-lead-grid"><aside class="public-matchday-news" data-public-latest-news>Últimas</aside></div></div></section>
    <section class="public-editorial-layout-panel" id="mixed-opening"><div class="public-matchday-cover"><div class="public-matchday-lead-grid"><div id="headline">Headline</div><aside class="public-matchday-news" data-public-latest-news>Últimas</aside></div></div></section>`;
  const $ = load(html);
  const rules = [...publicLatestNewsMobileStyles.matchAll(/([^{}]+)\{\s*display:\s*none;\s*\}/g)]
    .map(match => match[1].trim()).filter(selector => !selector.includes("::before"));
  assert.ok(rules.length >= 2);
  const hiddenIds = rules.flatMap(selector => $(selector).map((_, el) => $(el).attr("id")).get()).filter(Boolean);
  for (const id of ["companion", "four", "empty-frame", "latest-only-opening"]) assert.ok(hiddenIds.includes(id), id);
  for (const id of ["editorial", "headline", "companion-ad", "four-ad", "thematic-ad", "ad-frame", "mixed-opening"]) assert.ok(!hiddenIds.includes(id), id);
  assert.match(publicLatestNewsMobileStyles, /grid-template-areas:\s*none/);
});
