import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildEditorialHorizontalNewsEditorOrders,
  buildEditorialHorizontalNewsItems,
  buildEditorialHorizontalNewsRows,
  resolveMatchdayHorizontalNewsItems
} from "./editorial-horizontal-news";

test("buildEditorialHorizontalNewsItems ordena, limpa e exclui linhas sem titulo", () => {
  const items = buildEditorialHorizontalNewsItems([
    {
      id: "third",
      label: "  Analise  ",
      title: "  Terceira noticia  ",
      subtitle: "  Contexto  ",
      imageUrl: "  /image.jpg  ",
      linkUrl: "  /noticias/terceira  ",
      sortOrder: 3
    },
    {
      id: "empty",
      title: "   ",
      sortOrder: 2
    },
    {
      id: "first",
      title: "Primeira noticia",
      sortOrder: 1
    }
  ]);

  assert.deepEqual(items, [
    {
      id: "first",
      label: null,
      labelColor: null,
      title: "Primeira noticia",
      subtitle: null,
      imageUrl: null,
      linkUrl: null,
      sortOrder: 1
    },
    {
      id: "third",
      label: "Analise",
      labelColor: null,
      title: "Terceira noticia",
      subtitle: "Contexto",
      imageUrl: "/image.jpg",
      linkUrl: "/noticias/terceira",
      sortOrder: 3
    }
  ]);
});



test("buildEditorialHorizontalNewsItems nao limita a quantidade e preserva a cor do antetitulo", () => {
  const sources = Array.from({ length: 10 }, (_, index) => ({
    id: `item-${index + 1}`,
    label: `Etiqueta ${index + 1}`,
    labelColor: index === 0 ? "  #123456  " : null,
    title: `Noticia ${index + 1}`,
    sortOrder: index + 1
  }));

  const items = buildEditorialHorizontalNewsItems(sources);

  assert.equal(items.length, 10);
  assert.equal(items[0]?.labelColor, "#123456");
  assert.equal(items[9]?.sortOrder, 10);
});

test("buildEditorialHorizontalNewsRows distribui as noticias por linhas completas e equilibradas", () => {
  const items = Array.from({ length: 13 }, (_, index) => index + 1);

  assert.deepEqual(buildEditorialHorizontalNewsRows(items.slice(0, 6), 6).map((row) => row.length), [6]);
  assert.deepEqual(buildEditorialHorizontalNewsRows(items.slice(0, 7), 6).map((row) => row.length), [4, 3]);
  assert.deepEqual(buildEditorialHorizontalNewsRows(items.slice(0, 10), 6).map((row) => row.length), [5, 5]);
  assert.deepEqual(buildEditorialHorizontalNewsRows(items, 6).map((row) => row.length), [5, 4, 4]);
});

test("buildEditorialHorizontalNewsEditorOrders mantem as posicoes existentes e cria a seguinte", () => {
  assert.deepEqual(
    buildEditorialHorizontalNewsEditorOrders([
      { sortOrder: 5 },
      { sortOrder: 2 },
      { sortOrder: 5 },
      { sortOrder: 0 }
    ]),
    [2, 5, 6]
  );
  assert.deepEqual(buildEditorialHorizontalNewsEditorOrders([]), [1]);
});

test("resolveMatchdayHorizontalNewsItems preserva a fotografia da composicao publicada", () => {
  const referenceItems = [{ id: "reference", title: "Noticia publicada", sortOrder: 1 }];
  const liveItems = [{ id: "live", title: "Alteracao ainda nao publicada", sortOrder: 1 }];

  assert.equal(
    resolveMatchdayHorizontalNewsItems({
      hasPublishedReferenceComposition: true,
      referenceItems,
      liveItems
    })[0]?.id,
    "reference"
  );
  assert.equal(
    resolveMatchdayHorizontalNewsItems({
      hasPublishedReferenceComposition: false,
      referenceItems,
      liveItems
    })[0]?.id,
    "live"
  );
});



test("resolveMatchdayHorizontalNewsItems respeita uma composicao publicada sem itens na faixa", () => {
  const items = resolveMatchdayHorizontalNewsItems({
    hasPublishedReferenceComposition: true,
    referenceItems: [],
    liveItems: [{ id: "live", title: "Noticia viva publicada", sortOrder: 1 }]
  });

  assert.deepEqual(items, []);
});

test("resolveMatchdayHorizontalNewsItems devolve uma lista vazia sem noticias publicaveis", () => {
  assert.deepEqual(
    resolveMatchdayHorizontalNewsItems({
      hasPublishedReferenceComposition: false,
      referenceItems: [],
      liveItems: [{ id: "empty", title: null, sortOrder: 1 }]
    }),
    []
  );
});

const homePageSource = readFileSync(
  fileURLToPath(new URL("../app/page.tsx", import.meta.url)),
  "utf8"
);

test("a faixa horizontal da Home fica depois de toda a composição editorial existente", () => {
  const editorialLayoutIndex = homePageSource.indexOf("<PublicEditorialLayout");
  const horizontalNewsIndex = homePageSource.indexOf("<PublicHorizontalNewsStrip");

  assert.notEqual(editorialLayoutIndex, -1);
  assert.notEqual(horizontalNewsIndex, -1);
  assert.ok(editorialLayoutIndex < horizontalNewsIndex);
});


const publicHorizontalNewsSource = readFileSync(
  fileURLToPath(new URL("../components/public/PublicHorizontalNewsStrip.tsx", import.meta.url)),
  "utf8"
);
const compositionPageSource = readFileSync(
  fileURLToPath(new URL("../app/admin/editorial/composicao/[matchdayId]/page.tsx", import.meta.url)),
  "utf8"
);
const compositionRouteSource = readFileSync(
  fileURLToPath(new URL("../app/api/admin/editorial/composicao/route.ts", import.meta.url)),
  "utf8"
);
const publicMatchdayLoaderSource = readFileSync(
  fileURLToPath(new URL("./public-matchday.ts", import.meta.url)),
  "utf8"
);

const publicMatchdayPageSource = readFileSync(
  fileURLToPath(
    new URL(
      "../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
      import.meta.url
    )
  ),
  "utf8"
);

test("a faixa publica adapta a largura e admite seis noticias na mesma linha", () => {
  assert.match(publicHorizontalNewsSource, /buildEditorialHorizontalNewsRows\(items, 6\)/);
  assert.match(publicHorizontalNewsSource, /--horizontal-news-columns/);
  assert.match(publicHorizontalNewsSource, /grid-template-columns:\s*repeat\(var\(--horizontal-news-columns\), minmax\(0, 1fr\)\)/);
  assert.match(publicHorizontalNewsSource, /public-horizontal-news-stack/);
  assert.match(publicHorizontalNewsSource, /public-horizontal-news-row/);
  assert.doesNotMatch(publicHorizontalNewsSource, /public-important-news-grid/);
  assert.doesNotMatch(publicHorizontalNewsSource, /repeat\(5, minmax\(0, 1fr\)\)/);
});

test("a faixa horizontal integra a composicao editorial e preserva a cor", () => {
  assert.match(compositionPageSource, /Faixa de notícias/);
  assert.match(compositionPageSource, /label_color_snapshot/);
  assert.match(compositionRouteSource, /sourceType:\s*"matchday_horizontal_news"/);
  assert.match(compositionRouteSource, /slot_type:\s*"important_item"/);
  assert.match(compositionRouteSource, /label_color_snapshot:\s*item\.label_color/);
});

test("as leituras publicas da faixa nao impõem o limite antigo de quatro itens", () => {
  assert.doesNotMatch(homePageSource, /site_editorial_horizontal_news[^`]*limit=4/);
  assert.doesNotMatch(publicMatchdayLoaderSource, /matchday_horizontal_news[^`]*limit=4/);
});

test("a faixa horizontal da Liga respeita os 1200 px da zona editorial", () => {
  assert.match(
    publicMatchdayPageSource,
    /\.public-matchday-editorial-region\s*\{[\s\S]*width:\s*min\(100%,\s*1200px\)[\s\S]*max-width:\s*1200px/
  );
  assert.match(
    publicMatchdayPageSource,
    /<div className="public-matchday-editorial-region">\s*<PublicHorizontalNewsStrip/
  );
});
