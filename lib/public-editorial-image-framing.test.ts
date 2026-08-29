import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EDITORIAL_IMAGE_OBJECT_POSITION,
  HIERARCHICAL_EDITORIAL_IMAGE_FRAMING,
  editorialImageFramingProps,
} from "@/lib/editorial-image-framing";

function source(file: string): string {
  return readFileSync(file, "utf8");
}

test("a política comum favorece progressivamente o topo conforme o formato alarga", () => {
  assert.deepEqual(EDITORIAL_IMAGE_OBJECT_POSITION, {
    standard: "center 40%",
    wide: "center 38%",
    "extra-wide": "center 34%",
    panoramic: "center 30%",
  });
  assert.deepEqual(
    editorialImageFramingProps("wide"),
    {
      "data-editorial-image-framing": "wide",
      style: { objectPosition: "center 38%" },
    },
  );
});

test("o mapa hierárquico cobre 3:2, 16:9, 2:1, 2.45:1 e 3:1", () => {
  assert.equal(
    HIERARCHICAL_EDITORIAL_IMAGE_FRAMING.dominant_main,
    "standard",
  );
  assert.equal(
    HIERARCHICAL_EDITORIAL_IMAGE_FRAMING.other_chronicle_1,
    "wide",
  );
  assert.equal(
    HIERARCHICAL_EDITORIAL_IMAGE_FRAMING.secondary_strong_1,
    "extra-wide",
  );
  assert.equal(
    HIERARCHICAL_EDITORIAL_IMAGE_FRAMING.dominant_side_top,
    "panoramic",
  );
  assert.equal(
    HIERARCHICAL_EDITORIAL_IMAGE_FRAMING.secondary_3,
    "panoramic",
  );
});

for (const file of [
  "components/public/PublicHierarchicalComposition.tsx",
  "components/admin/HierarchicalCompositionInterpretivePreview.tsx",
]) {
  test(`${file}: usa o mesmo mapa de enquadramento em todos os slots`, () => {
    const fileSource = source(file);

    assert.match(
      fileSource,
      /hierarchicalEditorialImageFramingProps\(slotKey\)/u,
    );
    assert.match(fileSource, /aspect-ratio: 3 \/ 2;/u);
    assert.match(fileSource, /aspect-ratio: 16 \/ 9;/u);
    assert.match(fileSource, /aspect-ratio: 2 \/ 1;/u);
    assert.match(fileSource, /aspect-ratio: 2\.45 \/ 1;/u);
    assert.match(fileSource, /aspect-ratio: 3 \/ 1;/u);
    assert.match(
      fileSource,
      /composition-interpretive-media img,[\s\S]*object-fit: cover;/u,
    );
    assert.doesNotMatch(
      fileSource,
      /other-featured \.composition-interpretive-media img/u,
    );
  });
}

for (const file of [
  "components/public/PublicFourNewsLatestLayout.tsx",
  "components/public/PublicHorizontalNewsStrip.tsx",
  "components/public/PublicBeyondMatchdayNews.tsx",
]) {
  test(`${file}: fotografia editorial 16:9 usa a família wide`, () => {
    const fileSource = source(file);

    assert.match(
      fileSource,
      /editorialImageFramingProps\("wide"\)/u,
    );
    assert.match(fileSource, /aspect-ratio: 16 \/ 9;/u);
    assert.match(fileSource, /object-fit: cover;/u);
  });
}

test("Últimas reutiliza a família wide definida para fotografia editorial", () => {
  assert.match(
    source("components/public/PublicLatestNewsBlock.tsx"),
    /editorialImageFramingProps\("wide"\)/u,
  );
});

test("PublicEditorialLayout enquadra capa, side block, destaques e complemento", () => {
  const fileSource = source(
    "components/public/PublicEditorialLayout.tsx",
  );

  assert.match(
    fileSource,
    /editorialImageFramingProps\("standard"\)/u,
  );
  assert.equal(
    fileSource.match(
      /editorialImageFramingProps\("wide"\)/gu,
    )?.length,
    3,
  );
});

test("zonas flexíveis herdam a política dos renderers base sem a duplicar", () => {
  const fileSource = source(
    "components/public/PublicFlexibleZoneLayout.tsx",
  );

  assert.match(fileSource, /<PublicHierarchicalLiveLayouts/u);
  assert.match(fileSource, /<PublicBeyondMatchdayNews/u);
  assert.doesNotMatch(fileSource, /editorialImageFramingProps/u);
});

test("páginas editoriais públicas fora da Mesa reutilizam a mesma política", () => {
  for (const file of [
    "app/noticias/[slug]/page.tsx",
    "app/conteudos/[slug]/page.tsx",
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx",
  ]) {
    assert.match(source(file), /editorialImageFramingProps\(/u);
  }
});
