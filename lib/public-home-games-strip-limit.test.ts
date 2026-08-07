import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("a Home mostra no máximo oito jogos sem navegação no desktop", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const styles = readFileSync("components/public/publicEditorialStyles.ts", "utf8");

  assert.match(page, /matches=\{featuredMatches\.slice\(0, 8\)\}/);
  assert.match(page, /<div className="public-home-match-strip-static">[\s\S]*?<PublicMatchStrip/);
  assert.match(styles, /\.public-top-stack \{[\s\S]*?border-bottom:\s*0;[\s\S]*?box-shadow:\s*none;/);
  assert.match(styles, /\.public-home-games-transition-bar \{[\s\S]*?box-shadow:\s*0 3px 8px rgba\(68, 21, 47, 0\.12\);/);
  assert.match(styles, /\.public-home-match-strip-static > \.public-matchday-scoreboard-panel \{[\s\S]*?margin-top:\s*3px;/);
  assert.match(styles, /@media \(min-width: 1280px\)[\s\S]*?--match-carousel-arrow-zone-width:\s*0px !important;/);
  assert.match(styles, /\.public-home-match-strip-static \[data-public-match-carousel\] > button \{[\s\S]*?display:\s*none !important;/);
  assert.match(styles, /\.public-home-match-strip-static \[data-public-match-carousel-viewport\] \{[\s\S]*?overflow:\s*hidden !important;/);
  assert.match(styles, /\.public-home-match-strip-static \[data-matchday-strip\] \{[\s\S]*?transform:\s*translate3d\(0, 0, 0\) !important;/);
});
