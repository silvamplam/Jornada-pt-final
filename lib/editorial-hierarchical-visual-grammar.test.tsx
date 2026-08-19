import assert from "node:assert/strict";
import test from "node:test";

import { load } from "cheerio";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HierarchicalCompositionInterpretivePreview from "../components/admin/HierarchicalCompositionInterpretivePreview";
import PublicHierarchicalComposition from "../components/public/PublicHierarchicalComposition";
import type { PublicBeyondMatchdayNewsItem } from "../components/public/PublicBeyondMatchdayNews";
import {
  HIERARCHICAL_COMPOSITION_SLOT_KEYS,
  type HierarchicalCompositionSlot,
} from "./editorial-hierarchical-composition";

const slots: HierarchicalCompositionSlot[] = HIERARCHICAL_COMPOSITION_SLOT_KEYS.map((slotKey) => ({
  id: `slot-${slotKey}`,
  composition_id: "composition-visual-grammar",
  slot_key: slotKey,
  bank_item_id: `bank-${slotKey}`,
  source_identity: `source:${slotKey}`,
  label_snapshot: `Antetítulo ${slotKey}`,
  title_snapshot: `Título editorial suficientemente longo para validar a variante ${slotKey}`,
  subtitle_snapshot: `Pós-título exclusivo da posição ${slotKey}`,
  image_url_snapshot: "https://example.test/image.jpg",
  link_url_snapshot: `/noticias/${slotKey}`,
}));

const beyondMatchdayItems: PublicBeyondMatchdayNewsItem[] = Array.from({ length: 5 }, (_, index) => ({
  id: `beyond-${index + 1}`,
  label: `Atualidade ${index + 1}`,
  title: `Título para lá da jornada ${index + 1}`,
  subtitle: `Pós-título para lá da jornada ${index + 1}`,
  imageUrl: `https://example.test/beyond-${index + 1}.jpg`,
  linkUrl: `/noticias/beyond-${index + 1}`,
}));

const editorial = {
  title: "Editorial autónomo da Jornada",
  excerpt: "Excerto editorial para a capa.",
  text: "Primeiro parágrafo livre.\n\nSegundo parágrafo livre.",
  author: "Direção editorial",
};

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const publicMarkup = renderToStaticMarkup(
  <PublicHierarchicalComposition
    beyondMatchdayItems={beyondMatchdayItems}
    editorial={editorial}
    matchdayNumber={1}
    slots={slots}
  />,
);

const previewMarkup = renderToStaticMarkup(
  <HierarchicalCompositionInterpretivePreview
    beyondMatchdayItems={beyondMatchdayItems}
    editorial={editorial}
    matchdayNumber={1}
    slots={slots}
  />,
);

function cssFrom(markup: string) {
  const $ = load(markup);
  return $("style").map((_, element) => $(element).text()).get().join("\n");
}

function cssRule(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|})\\s*${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `regra CSS em falta: ${selector}`);
  return match[1];
}

function assertDeclaration(rule: string, property: string, value: string) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(rule, new RegExp(`${escapedProperty}:\\s*${escapedValue}(?:;|\\s*$)`));
}

function assertSubtitlePolicy(markup: string) {
  const $ = load(markup);

  const visibleSlots = [
    "dominant_main",
    "other_chronicle_1",
    "other_chronicle_2",
    "other_chronicle_3",
    "secondary_strong_1",
    "secondary_strong_2",
    "secondary_1",
    "secondary_2",
    "dominant_side_top",
    "dominant_side_bottom",
    "secondary_3",
    "secondary_4",
    "closing_1",
    "closing_2",
    "closing_3",
  ];

  for (const slotKey of visibleSlots) {
    assert.equal(
      $(
        `[data-slot="${slotKey}"] .composition-interpretive-subtitle`
      ).length,
      1,
      slotKey
    );
  }
}

test("público e preview aplicam a mesma política editorial de pós-títulos aos 15 slots", () => {
  assertSubtitlePolicy(publicMarkup);
  assertSubtitlePolicy(previewMarkup);
});

test("Para Lá apresenta pós-título nas quatro secundárias e mantém as inferiores sem imagem", () => {
  for (const markup of [publicMarkup, previewMarkup]) {
    const $ = load(markup);
    assert.equal($(".public-beyond-matchday-lead .public-beyond-matchday-subtitle").length, 1);
    assert.equal($("[data-secondary-presentation='image']").length, 2);
    assert.equal($("[data-secondary-presentation='image'] .public-beyond-matchday-subtitle").length, 2);
    assert.equal($("[data-secondary-presentation='text']").length, 2);
    assert.equal($("[data-secondary-presentation='text'] .public-beyond-matchday-subtitle").length, 2);
    assert.equal($("[data-secondary-presentation='text'] .public-beyond-matchday-media").length, 0);
  }
});

test("as variantes públicas e de preview protegem as razões editoriais das imagens", () => {
  const expectedRatios = new Map([
    [".composition-interpretive-dominant .composition-interpretive-media", "3 / 2"],
    [".composition-interpretive-chronicle .composition-interpretive-media", "16 / 9"],
    [".composition-interpretive-analysis-main .composition-interpretive-media", "2 / 1"],
    [".composition-interpretive-analysis-medium .composition-interpretive-media", "16 / 9"],
    [".composition-interpretive-analysis-side-item .composition-interpretive-media", "2.45 / 1"],
    [".composition-interpretive-other-featured .composition-interpretive-media", "3 / 1"],
    [".composition-interpretive-other-second-featured .composition-interpretive-media", "16 / 9"],
    [".composition-interpretive-other-compact .composition-interpretive-media", "16 / 9"],
  ]);

  for (const css of [cssFrom(publicMarkup), cssFrom(previewMarkup)]) {
    for (const [selector, ratio] of expectedRatios) {
      assertDeclaration(cssRule(css, selector), "aspect-ratio", ratio);
    }
    assertDeclaration(cssRule(css, ".public-beyond-matchday-lead .public-beyond-matchday-media"), "aspect-ratio", "16 / 9");
    assertDeclaration(cssRule(css, ".public-beyond-matchday-secondary-card .public-beyond-matchday-media"), "aspect-ratio", "16 / 9");
  }
});

test("os limites de linhas pertencem às variantes semânticas e usam ellipsis", () => {
  const expectedClamps = new Map([
    [".composition-interpretive-dominant .composition-interpretive-title", "4"],
    [".composition-interpretive-dominant .composition-interpretive-subtitle", "6"],
    [".composition-interpretive-chronicle .composition-interpretive-title", "4"],
    [".composition-interpretive-chronicle .composition-interpretive-subtitle", "3"],
    [".composition-interpretive-analysis-main .composition-interpretive-title", "3"],
    [".composition-interpretive-analysis-main .composition-interpretive-subtitle", "4"],
    [".composition-interpretive-analysis-medium .composition-interpretive-title", "3"],
    [".composition-interpretive-analysis-medium .composition-interpretive-subtitle", "2"],
    [".composition-interpretive-analysis-side-item .composition-interpretive-title", "3"],
    [".composition-interpretive-analysis-side-item .composition-interpretive-subtitle", "2"],
    [".composition-interpretive-other-featured .composition-interpretive-title", "2"],
    [".composition-interpretive-other-featured .composition-interpretive-subtitle", "3"],
    [".composition-interpretive-other-second-featured .composition-interpretive-title", "3"],
    [".composition-interpretive-other-second-featured .composition-interpretive-subtitle", "3"],
    [".composition-interpretive-other-compact .composition-interpretive-title", "3"],
    [".composition-interpretive-other-compact > .composition-interpretive-subtitle", "2"],
  ]);

  for (const css of [cssFrom(publicMarkup), cssFrom(previewMarkup)]) {
    for (const [selector, lines] of expectedClamps) {
      assertDeclaration(cssRule(css, selector), "-webkit-line-clamp", lines);
    }
    assertDeclaration(cssRule(css, ".composition-interpretive-title"), "text-overflow", "ellipsis");
    assertDeclaration(cssRule(css, ".composition-interpretive-subtitle"), "text-overflow", "ellipsis");
    assertDeclaration(cssRule(css, ".public-beyond-matchday-lead .public-beyond-matchday-title"), "-webkit-line-clamp", "3");
    assertDeclaration(cssRule(css, ".public-beyond-matchday-secondary-card .public-beyond-matchday-title"), "-webkit-line-clamp", "3");
    assertDeclaration(cssRule(css, ".public-beyond-matchday-subtitle"), "-webkit-line-clamp", "4");
    assertDeclaration(
      cssRule(css, ".public-beyond-matchday-secondary-card[data-secondary-presentation=\"image\"] .public-beyond-matchday-subtitle"),
      "-webkit-line-clamp",
      "3",
    );
    assertDeclaration(cssRule(css, ".public-beyond-matchday-text-only .public-beyond-matchday-subtitle"), "-webkit-line-clamp", "2");
  }
});

test("a principal 2 elimina o corte silencioso e as compactas usam uma reserva comum", () => {
  for (const css of [cssFrom(publicMarkup), cssFrom(previewMarkup)]) {
    const secondSubtitle = cssRule(css, ".composition-interpretive-other-second-featured .composition-interpretive-subtitle");
    assert.doesNotMatch(secondSubtitle, /max-height/);
    assertDeclaration(secondSubtitle, "font-size", "12.5px");
    assertDeclaration(cssRule(css, ".composition-interpretive-other-compact-column"), "grid-template-rows", "repeat(3, minmax(0, 1fr))");
    assertDeclaration(cssRule(css, ".composition-interpretive-other-compact .composition-interpretive-title"), "min-height", "calc(3 * 15px * 1.17)");
    assertDeclaration(cssRule(css, ".composition-interpretive-other-compact > .composition-interpretive-subtitle"), "grid-column", "1 / -1");
  }

  for (const markup of [publicMarkup, previewMarkup]) {
    const $ = load(markup);
    const compactCards = $(".composition-interpretive-other-compact");
    assert.equal(compactCards.length, 3);
    compactCards.each((_, element) => {
      assert.equal($(element).children(".composition-interpretive-subtitle").length, 1);
      assert.equal($(element).find(".composition-interpretive-copy .composition-interpretive-subtitle").length, 0);
    });
  }
});

test("o Editorial continua livre e as inferiores de Para Lá não recebem altura artificial", () => {
  for (const markup of [publicMarkup, previewMarkup]) {
    const $ = load(markup);
    assert.equal($(".composition-interpretive-editorial-body .composition-interpretive-editorial-copy").length, 1);
    assert.equal(
      $(".composition-interpretive-editorial-body .composition-interpretive-editorial-copy").text(),
      editorial.excerpt,
    );
    assert.equal($(".composition-interpretive-editorial-signature").text(), editorial.author);
    const css = cssFrom(markup);
    const editorialBody = cssRule(css, ".composition-interpretive-editorial-body");
    assert.doesNotMatch(editorialBody, /line-clamp|max-height|overflow/);
    assertDeclaration(cssRule(css, ".public-beyond-matchday-text-only"), "min-height", "0");
    assert.equal($("[data-secondary-presentation='text'] .public-beyond-matchday-subtitle").length, 2);
  }
});
