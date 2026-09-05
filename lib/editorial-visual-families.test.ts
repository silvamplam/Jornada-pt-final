import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  resolvePublicFlexibleZoneRenderer,
} from "@/components/public/public-flexible-zone-renderer-registry";
import {
  createPublicFlexibleZone,
  PublicFlexibleZoneContent,
  type PublicFlexibleZoneItem,
} from "@/components/public/PublicFlexibleZoneRenderers";
import {
  EDITORIAL_VISUAL_FAMILIES,
  EDITORIAL_VISUAL_FAMILY_DEFINITIONS,
  editorialVisualFamilyCapacity,
  materializeEditorialVisualFamilySlots,
  type EditorialVisualFamily,
  type EditorialVisualFamilyRendererKey,
} from "@/lib/editorial-visual-families";

(globalThis as typeof globalThis & {
  React: typeof React;
}).React = React;

const expectedCapacity: Readonly<
  Record<EditorialVisualFamily, number>
> = {
  six_news: 6,
  five_news_balanced: 5,
  five_news_secondary: 5,
};

function publicItem(
  sortOrder: number,
): PublicFlexibleZoneItem {
  return {
    id: `item-${sortOrder}`,
    sourceId: `source-${sortOrder}`,
    sortOrder,
    label: `Etiqueta ${sortOrder}`,
    title: `Artigo ${sortOrder}`,
    subtitle: `Resumo ${sortOrder}`,
    imageUrl: `/imagem-${sortOrder}.jpg`,
    linkUrl: `/noticias/artigo-${sortOrder}`,
    publishedAt: null,
  };
}

function renderZone(
  family: EditorialVisualFamily,
  positions: readonly number[],
) {
  const zone = createPublicFlexibleZone({
    key: `zone-${family}`,
    visualFamily: family,
    publicTitle: `Zona ${family}`,
    items: positions.map(publicItem),
  });

  return renderToStaticMarkup(
    React.createElement(PublicFlexibleZoneContent, {
      matchdayNumber: 1,
      zone,
    }),
  );
}

for (const family of EDITORIAL_VISUAL_FAMILIES) {
  test(`${family}: capacidade deriva do schema de slots`, () => {
    const definition =
      EDITORIAL_VISUAL_FAMILY_DEFINITIONS[family];

    assert.equal(
      definition.slots.length,
      expectedCapacity[family],
    );
    assert.equal(
      editorialVisualFamilyCapacity(family),
      definition.slots.length,
    );
  });
}

test("slots 1 e 3 ocupados preservam o gap 2", () => {
  const result = materializeEditorialVisualFamilySlots(
    "six_news",
    [
      { position: 1, item: "artigo-1" },
      { position: 3, item: "artigo-3" },
    ],
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(
    result.slots.map((slot) => slot.item),
    ["artigo-1", null, "artigo-3", null, null, null],
  );
  assert.deepEqual(
    result.slots.map((slot) => slot.position),
    [1, 2, 3, 4, 5, 6],
  );
});

test("zero artigos é uma ocupação válida", () => {
  const result = materializeEditorialVisualFamilySlots(
    "five_news_balanced",
    [],
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.slots.length, 5);
  assert.ok(result.slots.every((slot) => slot.item === null));

  const html = renderZone("five_news_balanced", []);
  assert.match(html, /data-public-visual-family="five_news_balanced"/);
  assert.doesNotMatch(html, /Artigo \d/);

  const secondaryHtml = renderZone("five_news_secondary", []);
  assert.match(secondaryHtml, /Zona five_news_secondary/);
  assert.doesNotMatch(secondaryHtml, /Artigo \d/);
});

test("um artigo é uma ocupação válida", () => {
  const result = materializeEditorialVisualFamilySlots(
    "five_news_secondary",
    [{ position: 4, item: "artigo-4" }],
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.slots[3]?.item, "artigo-4");
  assert.equal(
    result.slots.filter((slot) => slot.item !== null).length,
    1,
  );

  const html = renderZone("five_news_secondary", [4]);
  assert.match(html, /Artigo 4/);
  assert.match(html, /data-public-slot-position="4"/);
});

test("três artigos renderizam sem compactar os seus slots", () => {
  const html = renderZone("six_news", [1, 3, 5]);

  assert.match(html, /Artigo 1/);
  assert.match(html, /Artigo 3/);
  assert.match(html, /Artigo 5/);
  assert.ok(html.indexOf("Artigo 1") < html.indexOf("Artigo 3"));
  assert.ok(html.indexOf("Artigo 3") < html.indexOf("Artigo 5"));
});

test("zona completa é uma ocupação válida", () => {
  const result = materializeEditorialVisualFamilySlots(
    "six_news",
    Array.from({ length: 6 }, (_, index) => ({
      position: index + 1,
      item: `artigo-${index + 1}`,
    })),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.ok(result.slots.every((slot) => slot.item !== null));

  const html = renderZone(
    "six_news",
    [1, 2, 3, 4, 5, 6],
  );
  assert.match(html, /Artigo 6/);
});

test("placement fora da capacidade é estruturalmente inválido", () => {
  assert.deepEqual(
    materializeEditorialVisualFamilySlots(
      "five_news_balanced",
      [{ position: 6, item: "fora" }],
    ),
    {
      ok: false,
      reason: "invalid-slot-position",
    },
  );
});

test("posição duplicada é estruturalmente inválida", () => {
  assert.deepEqual(
    materializeEditorialVisualFamilySlots(
      "six_news",
      [
        { position: 2, item: "a" },
        { position: 2, item: "b" },
      ],
    ),
    {
      ok: false,
      reason: "duplicate-slot-position",
    },
  );
});

test("renderer desconhecido falha de forma explícita", () => {
  const renderers: Readonly<
    Record<EditorialVisualFamilyRendererKey, string>
  > = {
    hierarchical_analysis: "analysis",
    hierarchical_other_games: "other-games",
    secondary_news: "secondary",
  };

  assert.throws(
    () =>
      resolvePublicFlexibleZoneRenderer(
        renderers,
        "renderer_inexistente",
      ),
    /Unknown public flexible zone renderer: renderer_inexistente/,
  );
});

test("os três layouts preservam o contrato público atual", () => {
  assert.deepEqual(
    EDITORIAL_VISUAL_FAMILIES,
    [
      "six_news",
      "five_news_balanced",
      "five_news_secondary",
    ],
  );

  assert.deepEqual(
    EDITORIAL_VISUAL_FAMILIES.map((family) => ({
      id: EDITORIAL_VISUAL_FAMILY_DEFINITIONS[family].id,
      rendererKey:
        EDITORIAL_VISUAL_FAMILY_DEFINITIONS[family].rendererKey,
    })),
    [
      {
        id: "six_news",
        rendererKey: "hierarchical_analysis",
      },
      {
        id: "five_news_balanced",
        rendererKey: "hierarchical_other_games",
      },
      {
        id: "five_news_secondary",
        rendererKey: "secondary_news",
      },
    ],
  );

  assert.match(
    renderZone("six_news", [1, 2, 3, 4, 5, 6]),
    /composition-interpretive-analysis/,
  );
  assert.match(
    renderZone("five_news_balanced", [1, 2, 3, 4, 5]),
    /composition-interpretive-other-games/,
  );
  assert.match(
    renderZone("five_news_secondary", [1, 2, 3, 4, 5]),
    /public-beyond-matchday/,
  );
});
