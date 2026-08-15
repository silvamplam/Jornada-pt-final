import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildEditorialHorizontalNewsEditorOrders,
  buildEditorialHorizontalNewsItems,
  buildEditorialHorizontalNewsRows,
  moveEditorialHorizontalNewsItem,
  prioritizeEditorialHorizontalNewsItem,
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

test("buildEditorialHorizontalNewsRows equilibra as filas, limita a cinco e coloca o excedente em baixo", () => {
  const items = Array.from({ length: 26 }, (_, index) => index + 1);

  assert.deepEqual(buildEditorialHorizontalNewsRows(items.slice(0, 5)).map((row) => row.length), [5]);
  assert.deepEqual(buildEditorialHorizontalNewsRows(items.slice(0, 6)).map((row) => row.length), [3, 3]);
  assert.deepEqual(buildEditorialHorizontalNewsRows(items.slice(0, 7)).map((row) => row.length), [3, 4]);
  assert.deepEqual(buildEditorialHorizontalNewsRows(items.slice(0, 13)).map((row) => row.length), [4, 4, 5]);
  assert.deepEqual(buildEditorialHorizontalNewsRows(items.slice(0, 16)).map((row) => row.length), [4, 4, 4, 4]);
  assert.deepEqual(buildEditorialHorizontalNewsRows(items.slice(0, 17)).map((row) => row.length), [4, 4, 4, 5]);
  assert.deepEqual(buildEditorialHorizontalNewsRows(items.slice(0, 21)).map((row) => row.length), [4, 4, 4, 4, 5]);
  assert.deepEqual(buildEditorialHorizontalNewsRows(items).map((row) => row.length), [4, 4, 4, 4, 5, 5]);
  assert.deepEqual(buildEditorialHorizontalNewsRows(items).flat(), items);
  assert.ok(buildEditorialHorizontalNewsRows(items).every((row) => row.length <= 5));
});

test("a chegada mais recente à Faixa sobe para a primeira posição sem alterar a ordem relativa", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  assert.deepEqual(
    prioritizeEditorialHorizontalNewsItem(items, "c").map((item) => item.id),
    ["c", "a", "b", "d"],
  );
  assert.deepEqual(
    prioritizeEditorialHorizontalNewsItem(items, "a").map((item) => item.id),
    ["a", "b", "c", "d"],
  );
});

test("a ordem manual da Faixa move apenas para a posição anterior ou seguinte", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  assert.deepEqual(
    moveEditorialHorizontalNewsItem(items, "b", "up").map((item) => item.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    moveEditorialHorizontalNewsItem(items, "b", "down").map((item) => item.id),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    moveEditorialHorizontalNewsItem(items, "a", "up").map((item) => item.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    moveEditorialHorizontalNewsItem(items, "c", "down").map((item) => item.id),
    ["a", "b", "c"],
  );
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

test("a Mesa gerida dá precedência à Faixa viva e pode ocultá-la sem apagar itens", () => {
  const referenceItems = [{ id: "reference", title: "Faixa da composição", sortOrder: 1 }];
  const liveItems = [{ id: "live", title: "Faixa viva", sortOrder: 1 }];

  assert.equal(
    resolveMatchdayHorizontalNewsItems({
      hasPublishedReferenceComposition: true,
      isManagedByDesk: true,
      faixaVisible: true,
      referenceItems,
      liveItems,
    })[0]?.id,
    "live",
  );
  assert.deepEqual(
    resolveMatchdayHorizontalNewsItems({
      hasPublishedReferenceComposition: true,
      isManagedByDesk: true,
      faixaVisible: false,
      referenceItems,
      liveItems,
    }),
    [],
  );
  assert.equal(liveItems.length, 1);
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

test("a faixa publica equilibra cada fila, ocupa toda a largura e nunca passa de cinco noticias", () => {
  assert.match(publicHorizontalNewsSource, /buildEditorialHorizontalNewsRows\(items, 5\)/);
  assert.match(publicHorizontalNewsSource, /horizontalNewsRowStyle\(row\.length\)/);
  assert.doesNotMatch(publicHorizontalNewsSource, /desktopColumnCount/);
  assert.match(publicHorizontalNewsSource, /--horizontal-news-columns/);
  assert.match(publicHorizontalNewsSource, /grid-template-columns:\s*repeat\(var\(--horizontal-news-columns\), minmax\(0, 1fr\)\)/);
  assert.match(publicHorizontalNewsSource, /public-horizontal-news-stack/);
  assert.match(publicHorizontalNewsSource, /public-horizontal-news-row/);
  assert.doesNotMatch(publicHorizontalNewsSource, /buildEditorialHorizontalNewsRows\(items, 6\)/);
  assert.doesNotMatch(publicHorizontalNewsSource, /public-important-news-grid/);
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
