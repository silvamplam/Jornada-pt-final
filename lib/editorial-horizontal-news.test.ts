import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildEditorialHorizontalNewsItems,
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
      title: "Primeira noticia",
      subtitle: null,
      imageUrl: null,
      linkUrl: null,
      sortOrder: 1
    },
    {
      id: "third",
      label: "Analise",
      title: "Terceira noticia",
      subtitle: "Contexto",
      imageUrl: "/image.jpg",
      linkUrl: "/noticias/terceira",
      sortOrder: 3
    }
  ]);
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
