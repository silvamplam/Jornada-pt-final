import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load } from "cheerio";
import { horizontalAdvertisingStyles } from "../components/public/PublicHorizontalAdvertisement";
import { sideAdvertisingStyles } from "../components/public/PublicSideAdvertisement";

const header = readFileSync("components/public/PublicLeagueNewsHeader.module.css", "utf8");
const layout = readFileSync("components/public/PublicEditorialLayout.tsx", "utf8");

function mediaBlock(source: string, width: number) {
  const marker = `@media (max-width: ${width}px)`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${width}px breakpoint`);
  let depth = 0;
  const opening = source.indexOf("{", start);
  for (let i = opening; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}" && --depth === 0) return source.slice(opening + 1, i);
  }
  assert.fail("unclosed media block");
}

function rule(source: string, selector: string) {
  const start = source.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector}`);
  return source.slice(source.indexOf("{", start) + 1, source.indexOf("}", start));
}

test("mobile masthead contains both season rows and stays in document flow above games", () => {
  const mobile = mediaBlock(header, 760);
  const tablet = mediaBlock(header, 980);
  assert.match(rule(mobile, ".topStack:global(.public-top-stack)"), /position:\s*relative/);
  for (const source of [tablet, mobile]) {
    assert.match(rule(source, ".topStack :global(.public-season-nav-inner)"), /height:\s*auto/);
  }
  assert.match(rule(mobile, '.topStack :global(nav[aria-label="Navegação pública"] [role="group"])'), /display:\s*contents/);
  for (const selector of [
    '.topStack :global(nav[aria-label="Navegação pública"] a)',
    '.topStack :global(.public-matchday-leg-nav a)',
    '.topStack :global(.public-matchday-nav-compact a)',
    '.topStack :global(.public-season-select)',
  ]) assert.match(rule(mobile, selector), /min-height:\s*44px/);
  assert.equal(header.match(/@media \(max-width: 760px\)/g)?.length, 1);
  assert.doesNotMatch(header, /@media \(max-width: 520px\)/);
});

test("mobile hides only redundant lockup names and preserves the accessible link label", () => {
  const mobile = mediaBlock(header, 760);
  const selector = '.competitionIdentity img:is([data-variant="laliga-horizontal"], [data-variant="premier-league-lockup"]) + span';
  const hiddenLabel = rule(mobile, selector);
  assert.match(hiddenLabel, /clip-path:\s*inset\(50%\)/);
  assert.match(hiddenLabel, /position:\s*absolute/);
  assert.doesNotMatch(hiddenLabel, /display:\s*none|visibility:\s*hidden/);
  for (const variant of ["laliga-horizontal", "premier-league-lockup", "liga-portugal-horizontal", "fallback", null]) {
    const logo = variant ? `<img alt="" data-variant="${variant}">` : "";
    const $ = load(`<a class="competitionIdentity">${logo}<span>Competition name</span></a>`);
    const incorporatesName = variant === "laliga-horizontal" || variant === "premier-league-lockup";
    assert.equal($(selector).length, incorporatesName ? 1 : 0, String(variant));
    assert.equal($("a").text(), "Competition name");
  }
  const desktop = header.slice(0, header.indexOf("@media (max-width: 760px)"));
  assert.equal(desktop.includes(selector), false);
});

test("one-column mobile highlight rule reaches three stories without affecting the Home scope", () => {
  const mobile = mediaBlock(layout, 760);
  const selector = mobile.slice(0, mobile.indexOf("{")).trim();
  assert.match(rule(mobile, selector), /grid-template-columns:\s*minmax\(0, 1fr\)/);
  for (const scope of ["matchday", "home"]) {
    for (const count of [1, 2, 3]) {
      const $ = load(`<section class="public-editorial-layout-panel" data-editorial-scope="${scope}"><section class="public-below-headline-highlights" data-highlight-count="${count}"><div class="public-cover-story-strip"></div></section></section>`);
      assert.equal($(selector).length, scope === "matchday" ? 1 : 0, `${scope}: ${count} stories`);
    }
  }
  assert.match(rule(mobile, '.public-editorial-layout-panel[data-editorial-scope="matchday"] .public-below-headline-highlights .public-cover-story > span'), /display:\s*block/);
});

test("side advertisements retain their intrinsic proportion and cannot upscale to column width on mobile", () => {
  const mobile = mediaBlock(sideAdvertisingStyles, 760);
  const image = rule(mobile, "a[data-public-side-advertisement] img");
  assert.match(image, /width:\s*auto;/);
  assert.match(image, /height:\s*auto;/);
  assert.match(image, /object-fit:\s*contain;/);
  assert.match(image, /max-height:\s*198px;/);
  assert.match(image, /max-width:\s*min\(100%, 90px\);/);
  assert.match(rule(mobile, "a[data-public-side-advertisement]"), /margin:\s*8px auto;/);
  const source = readFileSync("components/public/PublicSideAdvertisement.tsx", "utf8");
  assert.match(source, /<a\s+className=\{className\}\s+data-public-side-advertisement/);
  assert.equal(sideAdvertisingStyles.trim().startsWith("@media"), true);
});

test("horizontal mobile creative remains proportional with a discreet label and a 2x-width cap", () => {
  const mobile = mediaBlock(horizontalAdvertisingStyles, 760);
  assert.match(rule(mobile, ".public-horizontal-advertisement img"), /max-width:\s*min\(100%, 320px\);/);
  const base = rule(horizontalAdvertisingStyles, ".public-horizontal-advertisement img");
  assert.match(base, /width:\s*auto;/);
  assert.match(base, /height:\s*auto;/);
  assert.match(base, /object-fit:\s*contain;/);
  assert.doesNotMatch(mobile, /display:\s*none/);
});

test("white La Liga masthead text has at least 4.5:1 contrast on the darker coral", () => {
  const theme = rule(header, '.topStack[data-competition="la-liga"]:global(.public-top-stack)');
  assert.match(theme, /--league-header-ink:\s*#ffffff;/);
  assert.match(theme, /--league-header-muted:\s*#ffffff;/);
  const hex = theme.match(/--league-header-background:\s*#([a-f\d]{6});/i)?.[1];
  assert.ok(hex);
  const linear = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  assert.ok(1.05 / (luminance + 0.05) >= 4.5);
});
