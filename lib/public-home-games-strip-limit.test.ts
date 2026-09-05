import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("a Home limita a seleção a oito jogos e permite navegar quando não cabem", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const styles = readFileSync("components/public/publicEditorialStyles.ts", "utf8");
  const stripStyles = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");

  assert.match(page, /matches=\{featuredMatches\.slice\(0, 8\)\}/);
  assert.match(page, /<PublicMatchStrip[\s\S]*?carouselLayout="fluid-peek"/);
  assert.match(stripStyles, /\.carouselViewport\s*\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(styles, /--match-carousel-arrow-zone-width:\s*0px\s*!important/);
  assert.doesNotMatch(styles, /\.public-home-match-strip-static \[data-public-match-carousel\] > button\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(styles, /\.public-home-match-strip-static \[data-public-match-carousel-viewport\]\s*\{[^}]*overflow:\s*hidden/);
});
