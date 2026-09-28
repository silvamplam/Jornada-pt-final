import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { createPublicFlexibleZone, PublicFlexibleZoneContent } from "@/components/public/PublicFlexibleZoneRenderers";
import { renderPublicAdvertisingBoundary } from "@/components/public/renderPublicAdvertisingBoundary";
import { composePublicEditorialColumnRuns } from "./public-editorial-column-runs";
import { EDITORIAL_VISUAL_FAMILIES, editorialVisualFamilyDefinition, editorialVisualFamilyPublicationPositionsAreValid, materializeEditorialVisualFamilySlots } from "./editorial-visual-families";
import { isMatchdayLatestHostEligible } from "./editorial-matchday-latest-placement";
import { normalizeEditorialZoneTitleColor } from "./editorial-zone-title-color";
import { initialDynamicZonePlan, dynamicZonesFingerprint } from "@/app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const require = createRequire(`${process.cwd()}/column-test.cjs`);
require.extensions[".css"] = (module) => { module.exports = { frame: "section-frame" }; };
const Run = require("./components/public/PublicEditorialColumnRunLayout").default;

function zone(key: string, positions = [1, 2, 3, 4, 5], color: string | null = null) {
  return createPublicFlexibleZone({ key, visualFamily: "five_news_column", publicTitle: key, publicTitleColor: color,
    items: positions.map((position) => ({ id: `${key}-${position}`, sourceId: `${key}-${position}`,
      sortOrder: position, title: `Título ${key} posição ${position}`, subtitle: "Resumo não público",
      imageUrl: `/imagem-${key}-${position}.jpg`, linkUrl: `/noticias/${key}-${position}`,
      label: "Antetítulo não público", publishedAt: null })) });
}
type Block = { kind: "zone"; zone: ReturnType<typeof zone> } | { kind: "video" | "latest" | "other" };
const group = (blocks: readonly Block[]) => composePublicEditorialColumnRuns(blocks, (block) => block.kind === "zone" ? block.zone : undefined);
const html = (value: ReturnType<typeof zone>) => renderToStaticMarkup(<PublicFlexibleZoneContent zone={value} matchdayNumber={7} />);

test("column contract: five own slots, partial only here, slot 6 rejected, unchanged host eligibility", () => {
  assert.equal(editorialVisualFamilyDefinition("five_news_column")?.slots.length, 5);
  assert.equal(materializeEditorialVisualFamilySlots("five_news_column", [{ position: 6, item: 1 }]).ok, false);
  assert.deepEqual(EDITORIAL_VISUAL_FAMILIES.filter(isMatchdayLatestHostEligible),
    ["six_news", "five_news_balanced", "five_news_secondary", "four_news", "six_news_1_2_3"]);
  assert.deepEqual(EDITORIAL_VISUAL_FAMILIES.filter((family) => editorialVisualFamilyDefinition(family)?.allowsPartialPublication), ["five_news_column"]);
  for (let count = 0; count <= 5; count++) assert.equal(editorialVisualFamilyPublicationPositionsAreValid("five_news_column", [1, 2, 3, 4, 5].slice(0, count)), true);
  for (const positions of [[1, 3, 5], [2, 5]]) assert.equal(editorialVisualFamilyPublicationPositionsAreValid("five_news_column", positions), true);
  for (const positions of [[1, 1], [6], [0], [1.5]]) assert.equal(editorialVisualFamilyPublicationPositionsAreValid("five_news_column", positions), false);
  for (const family of EDITORIAL_VISUAL_FAMILIES.filter((family) => family !== "five_news_column")) assert.equal(editorialVisualFamilyPublicationPositionsAreValid(family, [1]), false);
});

test("only slot 1 mounts an image; gaps and an empty lead never promote another slot", () => {
  const full = html(zone("Benfica"));
  assert.equal((full.match(/<img /g) ?? []).length, 1);
  assert.doesNotMatch(full, /Resumo não público|Antetítulo não público|imagem-Benfica-[2-5]/);
  const sparse = html(zone("Sporting", [2, 5]));
  assert.doesNotMatch(sparse, /<img|data-column-position="1"/);
  assert.deepEqual([...sparse.matchAll(/data-column-position="(\d)"/g)].map((match) => Number(match[1])), [2, 5]);
  assert.equal(html(zone("Vazia", [])), "");
});

test("manual title colour is normalized, nullable, independent and never styles article titles", () => {
  assert.equal(normalizeEditorialZoneTitleColor("#ab123f"), "#AB123F");
  assert.equal(normalizeEditorialZoneTitleColor(null), null);
  for (const invalid of ["", "red", "#abc", "#12345678", " #123456", "#GG0000", 123]) assert.throws(() => normalizeEditorialZoneTitleColor(invalid), /color-invalid/);
  const colors = ["#D71920", "#008A44", "#1234AB", null, "#654321"];
  const output = renderToStaticMarkup(<Run zones={colors.map((color, i) => zone(`Zona${i}`, [1, 3], color))} matchdayNumber={7} />);
  assert.equal((output.match(/<img /g) ?? []).length, 5);
  assert.equal((output.match(/<h2[^>]*style="color:/g) ?? []).length, 4);
  assert.doesNotMatch(output, /<h3[^>]*style=/);
  for (const color of colors.filter(Boolean)) assert.ok(output.includes(`color:${color}`));
});

for (const count of [1, 2, 3, 4, 5, 6, 7, 11]) test(`${count} consecutive independent zones form one ad unit, keep order and mount no placeholders`, () => {
  const zones = Array.from({ length: count }, (_, i) => zone(`Coluna${i}`));
  const blocks = group(zones.map((value) => ({ kind: "zone", zone: value })));
  assert.equal(blocks.length, 1);
  const run = blocks[0]; assert.equal(run.kind, "column_run");
  if (run.kind !== "column_run") return;
  assert.deepEqual(run.zones.map((value) => value.key), zones.map((value) => value.key));
  const output = renderToStaticMarkup(<Run zones={run.zones} matchdayNumber={7} />);
  assert.equal((output.match(/data-public-flexible-zone=/g) ?? []).length, count);
  assert.equal((output.match(/data-public-editorial-section-frame=/g) ?? []).length, 1);
  assert.doesNotMatch(output, /placeholder|vacancy/);
});

for (const kind of ["video", "latest", "other"] as const) test(`hidden ${kind} still splits column runs before filtering`, () => {
  const a: Block = { kind: "zone", zone: zone("A") }, b: Block = { kind: "zone", zone: zone("B") };
  assert.deepEqual(group([a, { kind }, b]).map((block) => block.kind), ["column_run", kind, "column_run"]);
  assert.deepEqual(group([a, b, { kind }]).map((block) => block.kind), ["column_run", kind]);
});

test("another family breaks the run; empty columns remain editorial state and render nothing", () => {
  const other = createPublicFlexibleZone({ key: "Outra", visualFamily: "six_news", publicTitle: "Outra", items: [] });
  const blocks = group([{ kind: "zone", zone: zone("A") }, { kind: "zone", zone: other }, { kind: "zone", zone: zone("B") }]);
  assert.deepEqual(blocks.map((block) => block.kind), ["column_run", "zone", "column_run"]);
  assert.deepEqual(group([{ kind: "zone", zone: zone("Vazia", []) }]), []);
});

test("advertisement boundary surrounds a run and cannot split its columns", () => {
  const blocks = group(Array.from({ length: 5 }, (_, i) => ({ kind: "zone", zone: zone(`Zona${i}`) })));
  const output = renderToStaticMarkup(<>{renderPublicAdvertisingBoundary(
    [...blocks, { kind: "other" as const }],
    (block) => block.kind === "column_run" ? <Run zones={block.zones} matchdayNumber={7} /> : <div>Outra zona</div>,
    <aside>Publicidade de teste</aside>, true,
  )}</>);
  const start = output.indexOf('data-public-column-run=');
  const last = output.lastIndexOf('data-public-flexible-zone=');
  assert.ok(start > 0 && last > start);
  assert.doesNotMatch(output.slice(start, last), /Publicidade de teste/);
  assert.equal((output.match(/Publicidade de teste/g) ?? []).length, 1);
});

test("old families ignore the generic colour property visually", () => {
  for (const family of EDITORIAL_VISUAL_FAMILIES.filter((family) => family !== "five_news_column")) {
    const base = createPublicFlexibleZone({ key: "old", publicTitle: "Atualidade", visualFamily: family,
      items: Array.from({ length: editorialVisualFamilyDefinition(family)!.slots.length }, (_, i) => ({
        id: `old-${i}`, sourceId: `old-${i}`, sortOrder: i + 1, title: `Notícia ${i + 1}`,
        subtitle: "Pós-título atual", imageUrl: "/imagem.jpg", linkUrl: `/noticias/old-${i}`,
        label: "Antetítulo atual", publishedAt: null,
      })) });
    assert.equal(html(base), html({ ...base, publicTitleColor: "#D71920" }));
  }
});

test("historical editor reload keeps independent colours and sparse slots; colour-only edits change its fingerprint", () => {
  const plan = initialDynamicZonePlan(["#D71920", "#008A44", null].map((color, index) => ({
    id: `zone-${index}`, sortOrder: index + 1, publicTitle: `Coluna ${index}`, publicTitleColor: color,
    visualFamily: "five_news_column", items: [2, 5].map((position) => ({ id: `item-${index}-${position}`,
      bankItemId: `bank-${index}-${position}`, position, label: "JORNADA", title: "Título",
      subtitle: "Pós-título", imageUrl: "/image.jpg", linkUrl: "/noticias/artigo",
    })),
  })));
  assert.deepEqual(plan.map((zone) => zone.publicTitleColor), ["#D71920", "#008A44", null]);
  assert.deepEqual(Object.values(plan[0].items).map((item) => Boolean(item)), [false, true, false, false, true]);
  for (const color of ["#AABBCC", null]) assert.notEqual(dynamicZonesFingerprint(plan),
    dynamicZonesFingerprint(plan.map((zone, index) => index ? zone : { ...zone, publicTitleColor: color })));
});
