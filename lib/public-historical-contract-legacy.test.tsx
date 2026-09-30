import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { columnGroupMember } from "./editorial-column-groups";
import { editorialVisualFamilyCapacity, editorialVisualFamilyPublicationPositionsAreValid } from "./editorial-visual-families";
import { HIERARCHICAL_COMPOSITION_SLOT_KEYS } from "./editorial-hierarchical-composition";
import PublicHierarchicalComposition from "../components/public/PublicHierarchicalComposition";
import { createPublicFlexibleZone, PublicFlexibleZoneContent } from "../components/public/PublicFlexibleZoneRenderers";

Object.assign(globalThis, { React });
const require = createRequire(`${process.cwd()}/historical-contract-test.cjs`);
require.extensions[".css"] = (module) => { module.exports = { frame: "section-frame" }; };
const { default: Frame } = require("./components/public/PublicMatchdayEditorialSectionFrame") as typeof import("../components/public/PublicMatchdayEditorialSectionFrame");

const publicPage = readFileSync("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx", "utf8");
const adminPage = readFileSync("app/admin/editorial/composicao/[matchdayId]/page.tsx", "utf8");
const api = readFileSync("app/api/admin/editorial/composicao/route.ts", "utf8");
const frameCSS = readFileSync("components/public/PublicMatchdayEditorialSectionFrame.module.css", "utf8");

function fragment(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source fragment: ${start}`);
  return source.slice(from, to);
}

function evaluate(code: string, result: string, dependencies: Record<string, unknown>) {
  return runInNewContext(ts.transpileModule(`${code}\n${result}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, dependencies);
}

function rows(family = "six_news", title = "") {
  const count = family.startsWith("five_") ? 5 : 6;
  return {
    zones: [{ id: "zone", composition_id: "composition", sort_order: 1, public_title: title,
      public_title_color: "#008A44", visual_family: family }],
    items: Array.from({ length: count }, (_, i) => ({ id: `item-${i}`, composition_id: "composition",
      zone_id: "zone", position: i + 1, bank_item_id: null, source_identity: `source-${i}`,
      label_snapshot: "JORNADA", title_snapshot: `Notícia ${i + 1}`, subtitle_snapshot: "Pós-título",
      image_url_snapshot: "/fixture.jpg", link_url_snapshot: `/noticias/${i}` })),
  };
}

function readZones(data: ReturnType<typeof rows>) {
  const read = evaluate(fragment(publicPage, "async function readPublicHistoricalDynamicZones(", "const publicMatchdayStyles"),
    "readPublicHistoricalDynamicZones", {
      fetchSupabaseAdminTable: async (path: string) => path.startsWith("matchday_historical_composition_zones?") ? data.zones : data.items,
      readHistoricalColumnGroups: async () => [], columnGroupMember, createPublicFlexibleZone,
      editorialVisualFamilyPublicationPositionsAreValid,
    });
  return read("composition");
}

for (const family of ["six_news", "six_news_1_2_3", "five_news_balanced", "five_news_secondary", "five_news_column"]) {
  test(`reader histórico aceita ${family} completa sem título e conserva a cor`, async () => {
    for (const title of ["", "   "]) {
      const [state] = await readZones(rows(family, title));
      assert.equal(state.complete, true);
      assert.equal(state.zone.publicTitle, "");
      assert.equal(state.zone.publicTitleColor, "#008A44");
      const $ = load(renderToStaticMarkup(<Frame kind="zone"><PublicFlexibleZoneContent zone={state.zone} matchdayNumber={7} /></Frame>));
      assert.equal($("h2, header, [data-public-editorial-heading], [data-public-editorial-flow]").length, 0);
      assert.equal($("article").length, state.zone.slots.length);
    }
  });
}

test("título opcional não dispensa snapshots, posições, família ou ordem", async () => {
  for (const field of ["label_snapshot", "title_snapshot", "subtitle_snapshot", "image_url_snapshot", "link_url_snapshot"] as const) {
    const data = rows();
    data.items[0][field] = " ";
    assert.equal((await readZones(data))[0].complete, false, field);
  }
  const missing = rows(); missing.items.pop();
  assert.equal((await readZones(missing))[0].complete, false);
  const unordered = rows(); unordered.zones[0].sort_order = 2;
  assert.equal((await readZones(unordered))[0].complete, false);
  const duplicate = rows(); duplicate.items[1].position = 1;
  await assert.rejects(readZones(duplicate), /duplicate-slot-position/);
  await assert.rejects(readZones(rows("invalid")), /unknown-layout/);
});

test("resumo editorial e validador HTTP concordam com o reader para título vazio", async () => {
  const data = rows();
  const historicalDynamicZones = data.zones.map((zone) => ({ sortOrder: zone.sort_order, publicTitle: zone.public_title,
    visualFamily: zone.visual_family, items: data.items.map((item) => ({ position: item.position, label: item.label_snapshot,
      title: item.title_snapshot, subtitle: item.subtitle_snapshot, imageUrl: item.image_url_snapshot, linkUrl: item.link_url_snapshot })) }));
  const warnings = () => evaluate(fragment(adminPage, "const historicalDynamicZoneWarnings =", "const historicalDynamicVideoPosition ="),
    "historicalDynamicZoneWarnings", { historicalDynamicZones, editorialVisualFamilyCapacity, editorialVisualFamilyPublicationPositionsAreValid });
  assert.equal(warnings().length, 0);
  historicalDynamicZones[0].items[0].title = "";
  assert.equal(warnings().length, 1);

  const keys = ["dominant_main", "other_chronicle_1", "other_chronicle_2", "other_chronicle_3"];
  const validate = evaluate(fragment(api, "async function validateHistoricalDynamicPublication(", "async function publishReferenceComposition("),
    "validateHistoricalDynamicPublication", {
      fetchSupabaseAdminTable: async (path: string) => path.startsWith("matchday_historical_composition_zones?") ? data.zones : data.items,
      HISTORICAL_DYNAMIC_OPENING_KEYS: keys, HISTORICAL_DYNAMIC_PUBLICATION_CAPACITY: { six_news: 6 },
      editorialVisualFamilyPublicationPositionsAreValid, CompositionPublicationError: Error,
    });
  const result = await validate({ id: "composition", hierarchical_video_position: 1 }, keys.map((slot_key) => ({ ...data.items[0], slot_key })));
  assert.equal(result.enabled, true);
  assert.equal(result.zoneCount, 1);
});

test("SSR sem título usa só a fronteira existente sem reservar uma linha de cabeçalho", () => {
  assert.match(frameCSS, /\.frame:not\(:has\(\[data-public-editorial-flow\]\)\)::before\s*\{[^}]*height: 1px;[^}]*margin-bottom: var\(--public-editorial-section-rule-content-gap\)/);
  assert.doesNotMatch(frameCSS, /min-height|reserve|ResizeObserver|getBoundingClientRect/);
});

const slots = HIERARCHICAL_COMPOSITION_SLOT_KEYS.map((slot_key) => ({ ...rows().items[0], id: slot_key, slot_key }));
const beyond = rows("five_news_secondary").items.map((item) => ({ id: item.id, label: item.label_snapshot,
  title: item.title_snapshot, subtitle: item.subtitle_snapshot, imageUrl: item.image_url_snapshot, linkUrl: item.link_url_snapshot }));
const wrap = (children: React.ReactNode, key: string) => <Frame kind="zone" key={key}>{children}</Frame>;
const markup = (framed: boolean) => load(renderToStaticMarkup(<PublicHierarchicalComposition slots={slots}
  beyondMatchdayItems={beyond} matchdayNumber={7} wrapLegacySection={framed ? wrap : undefined} />));

test("legacy análise/outros jogos entregam título e linha ao frame sem alterar as grelhas", () => {
  const before = markup(false);
  const after = markup(true);
  for (const section of ["analysis", "other-games"]) {
    const selector = `.composition-interpretive-${section}`;
    assert.equal(after(selector).parent().attr("data-public-editorial-section-frame"), "zone");
    assert.equal(after(selector).attr("data-public-editorial-flow"), "single");
    assert.equal(after(selector).children().first().is("h2[data-public-editorial-heading]"), true);
    assert.equal(after(`.composition-interpretive-preview > ${selector}`).length, 0, "old absolute separator selector cannot match");
    assert.equal(after(selector).children("div").html(), before(selector).children("div").html());
  }
  assert.match(frameCSS, /--public-editorial-section-title-rule-gap: 12px/);
  assert.match(frameCSS, /--public-editorial-section-rule-content-gap: 24px/);
  assert.match(frameCSS, /grid-row: 2;[^}]*height: 1px/);
});

test("momentos posteriores legacy usam a fronteira editorial e isolam o cabeçalho do painel", () => {
  const before = markup(false);
  const after = markup(true);
  assert.equal(after(".public-beyond-matchday").parent().attr("data-public-editorial-section-frame"), "zone");
  assert.equal(after(".public-beyond-matchday").attr("data-owns-section-boundary"), "false");
  assert.equal(after(".public-beyond-matchday").attr("data-public-editorial-flow"), "single");
  assert.equal(after(".public-beyond-matchday-grid").html(), before(".public-beyond-matchday-grid").html());
  assert.equal(after(".public-beyond-matchday-header").html(), before(".public-beyond-matchday-header").html());
  const css = after("style").map((_, element) => after(element).text()).get().join("\n");
  assert.match(css, /\.public-hierarchical-composition \[data-public-editorial-section-frame="zone"\] \.public-beyond-matchday-header\s*\{\s*padding: 0;\s*border: 0;\s*background: transparent;/);
  assert.match(publicPage, /\.public-matchday-panel header\s*\{\s*padding: 18px 20px;\s*border-bottom: 1px solid #e6ebf1;\s*background: #f8fafc;/);
  assert.match(publicPage, /wrapLegacySection=\{\s*useHistoricalDynamicZones\s*\? undefined/);
  assert.doesNotMatch(readFileSync("components/public/PublicHierarchicalComposition.tsx", "utf8"), /ResizeObserver|getBoundingClientRect|useLayoutEffect|useEffect/);
});
