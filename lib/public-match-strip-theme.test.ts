import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPublicMatchStripTheme } from "./public-match-strip-theme";

test("ativa a identidade própria apenas na Liga Portugal", () => {
  assert.equal(getPublicMatchStripTheme("liga-portugal"), "liga-portugal");
  assert.equal(getPublicMatchStripTheme(" LIGA-PORTUGAL "), "liga-portugal");
  assert.equal(getPublicMatchStripTheme("la-liga"), null);
  assert.equal(getPublicMatchStripTheme("premier-league"), null);
  assert.equal(getPublicMatchStripTheme(null), null);
});

test("o componente expõe a competição como tema sem alterar os jogos", () => {
  const source = readFileSync("components/public/PublicMatchStrip.tsx", "utf8");

  assert.match(source, /competitionSlug\?: string \| null/);
  assert.match(source, /getPublicMatchStripTheme\(competitionSlug\)/);
  assert.match(source, /data-competition-theme=\{competitionTheme \?\? undefined\}/);
});

test("a identidade Liga Portugal permanece isolada no CSS modular", () => {
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");

  assert.match(css, /data-competition-theme="liga-portugal"/);
  assert.match(css, /#00235a/i);
  assert.match(css, /#f4c300/i);
});

test("os contextos competitivos passam o slug ao componente", () => {
  const matchdayPage = readFileSync(
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
    "utf8"
  );
  const articlePage = readFileSync("app/noticias/[slug]/page.tsx", "utf8");

  assert.match(matchdayPage, /competitionSlug=\{context\.competition\.slug\}/);
  assert.match(articlePage, /competitionSlug=\{articleContext\?\.competition\.slug\}/);
});

test("os cards Liga Portugal usam territórios cromáticos irregulares sem hífen central", () => {
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");

  assert.match(css, /\.row > \.card::before/);
  assert.match(css, /\.row > \.card::after/);
  assert.match(css, /clip-path:\s*polygon/);
  assert.match(css, /nth-child\(4n \+ 2\)/);
  assert.match(css, /nth-child\(4n \+ 3\)/);
  assert.match(css, /nth-child\(4n \+ 4\)/);
  assert.match(css, /\.scheduledSeparator\s*\{[\s\S]*?opacity:\s*0/);
  assert.match(css, /rgba\(var\(--public-liga-portugal-home-rgb\),\s*0\.27\)/);
  assert.match(css, /rgba\(var\(--public-liga-portugal-away-rgb\),\s*0\.23\)/);
});
