import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hierarchical = readFileSync(
  "components/public/PublicHierarchicalComposition.tsx",
  "utf8",
);

const fourNews = readFileSync(
  "components/public/PublicFourNewsLatestLayout.tsx",
  "utf8",
);

test("os separadores usam apenas linha fina com fade esquerda-direita", () => {
  assert.match(
    hierarchical,
    /JORNADA-SEPARADORES-FADE-LINE-INICIO/,
  );

  assert.match(
    hierarchical,
    /rgba\(76, 101, 128, 0\.34\) 0%[\s\S]*?rgba\(171, 184, 198, 0\) 100%/,
  );

  assert.match(
    hierarchical,
    /\.public-hierarchical-live-layouts::after,[\s\S]*?display: none;[\s\S]*?content: none;/,
  );

  assert.match(
    fourNews,
    /JORNADA-FOUR-NEWS-FADE-LINE-INICIO/,
  );

  assert.match(
    fourNews,
    /\.public-four-news-latest-layout::after \{[\s\S]*?display: none;[\s\S]*?content: none;/,
  );
});
