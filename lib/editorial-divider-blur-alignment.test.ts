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

const sectionFrame = readFileSync(
  "components/public/PublicMatchdayEditorialSectionFrame.module.css",
  "utf8",
);

test("todos os divisores com blur nascem à esquerda", () => {
  assert.match(
    sectionFrame,
    /\.frame::before \{[\s\S]*?right: 0;[\s\S]*?left: 0;[\s\S]*?rgba\(76, 101, 128, 0\.34\) 0%/,
  );

  assert.match(
    hierarchical,
    /\.composition-interpretive-preview > \.composition-interpretive-section::before,[\s\S]*?right: 0;[\s\S]*?left: 0;[\s\S]*?rgba\(108, 130, 154, 0\.20\) 0%/,
  );

  assert.match(
    hierarchical,
    /\.composition-interpretive-preview > \.composition-interpretive-section::after,[\s\S]*?left: 0;[\s\S]*?rgba\(178, 191, 205, 0\.045\) 0%/,
  );

  assert.doesNotMatch(
    hierarchical,
    /composition-interpretive-section:nth-child\(even\)::before/,
  );

  assert.doesNotMatch(
    hierarchical,
    /composition-interpretive-other-games::before/,
  );

  assert.match(
    fourNews,
    /<PublicMatchdayEditorialSectionFrame kind="latest">/,
  );

  assert.doesNotMatch(
    fourNews,
    /public-four-news-latest-layout::(?:before|after)/,
  );
});
