import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPublicMatchStripTheme } from "./public-match-strip-theme";

test("ativa as identidades próprias apenas nas competições suportadas", () => {
  assert.equal(getPublicMatchStripTheme("liga-portugal"), "liga-portugal");
  assert.equal(getPublicMatchStripTheme(" LIGA-PORTUGAL "), "liga-portugal");
  assert.equal(getPublicMatchStripTheme("premier-league"), "premier-league");
  assert.equal(getPublicMatchStripTheme(" PREMIER-LEAGUE "), "premier-league");
  assert.equal(getPublicMatchStripTheme("la-liga"), "la-liga");
  assert.equal(getPublicMatchStripTheme(" LA-LIGA "), "la-liga");
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


test("a identidade Premier League usa sombras cromáticas simétricas e remove o hífen central", () => {
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");
  const premierLeagueStart = css.indexOf('.panel[data-competition-theme="premier-league"]');
  const laligaStart = css.indexOf('.panel[data-competition-theme="la-liga"]', premierLeagueStart);
  const premierLeagueCss = css.slice(premierLeagueStart, laligaStart);

  assert.ok(premierLeagueStart >= 0);
  assert.ok(laligaStart > premierLeagueStart);
  assert.match(premierLeagueCss, /#3d195b/i);
  assert.match(premierLeagueCss, /#00ff85/i);
  assert.match(premierLeagueCss, /#04f5ff/i);
  assert.match(premierLeagueCss, /radial-gradient\(ellipse at 12% 17%/);
  assert.match(premierLeagueCss, /radial-gradient\(ellipse at 88% 17%/);
  assert.match(premierLeagueCss, /radial-gradient\(circle at 8% 12%/);
  assert.match(premierLeagueCss, /radial-gradient\(circle at 92% 12%/);
  assert.match(premierLeagueCss, /\.panel\[data-competition-theme="premier-league"\] \.center \{\s*display: none;/);
  assert.doesNotMatch(premierLeagueCss, /clip-path|polygon\(/);
  assert.doesNotMatch(premierLeagueCss, /\.center::before|\.center::after/);
});


test("a identidade LALIGA usa placas triangulares sóbrias em confronto e remove o hífen central", () => {
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");
  const laligaStart = css.indexOf('.panel[data-competition-theme="la-liga"]');
  const sharedLayoutStart = css.indexOf(".shell > .row", laligaStart);
  const laligaCss = css.slice(laligaStart, sharedLayoutStart);

  assert.ok(laligaStart >= 0);
  assert.ok(sharedLayoutStart > laligaStart);
  assert.match(laligaCss, /#ff4b44/i);
  assert.match(laligaCss, /#f7b32b/i);
  assert.match(laligaCss, /#3478f6/i);
  assert.match(laligaCss, /#7c4dff/i);
  assert.match(laligaCss, /#20c4d9/i);
  assert.match(laligaCss, /width:\s*86px/);
  assert.match(laligaCss, /height:\s*86px/);
  assert.match(laligaCss, /left:\s*-18px/);
  assert.match(laligaCss, /right:\s*-18px/);
  assert.match(laligaCss, /clip-path:\s*polygon\(0 26%, 72% 0, 100% 42%, 52% 100%, 0 100%\)/);
  assert.match(laligaCss, /clip-path:\s*polygon\(28% 0, 100% 26%, 100% 100%, 0 100%, 0 42%\)/);
  assert.match(laligaCss, /linear-gradient\(138deg,/);
  assert.match(laligaCss, /linear-gradient\(222deg,/);
  assert.match(laligaCss, /nth-child\(4n \+ 2\)::before/);
  assert.match(laligaCss, /nth-child\(4n \+ 3\)::after/);
  assert.match(laligaCss, /opacity:\s*0\.78/);
  assert.match(laligaCss, /\.panel\[data-competition-theme="la-liga"\] \.center \{\s*display: none;/);
  assert.doesNotMatch(laligaCss, /\.center::before|\.center::after/);
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

test("os minutos ao vivo ficam centrados na mesma linha da caixa AGORA", () => {
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");

  assert.match(
    css,
    /\.panel\[data-visual-variant="clean"\] \.cleanStatusLine \{[\s\S]*?align-items:\s*center;[\s\S]*?height:\s*15px;/
  );
  assert.match(
    css,
    /\.panel\[data-visual-variant="clean"\] \.cleanStatusLead \{[\s\S]*?height:\s*15px;[\s\S]*?align-items:\s*center;[\s\S]*?line-height:\s*15px;[\s\S]*?transform:\s*translateY\(-1px\);/
  );
  assert.match(
    css,
    /\.panel\[data-visual-variant="clean"\] \.cleanStateBadge \{[\s\S]*?height:\s*15px;[\s\S]*?transform:\s*none;/
  );
});

test("o rodape ao vivo alinha resultado e TV pelas colunas dos emblemas e centra o resultado sem TV", () => {
  const component = readFileSync("components/public/PublicMatchStrip.tsx", "utf8");
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");

  assert.match(component, /const hasCleanBroadcast = Boolean\(/);
  assert.match(component, /hasCleanBroadcast \? "" : styles\.cleanActiveFooterWithoutBroadcast/);
  assert.match(component, /<span className=\{cleanFooterClassName\}[\s\S]*?\{cleanScoreContent\}[\s\S]*?\{hasCleanBroadcast \? \(/);
  assert.match(
    css,
    /\.panel\[data-visual-variant="clean"\] \.row > \.card > \.broadcast\.cleanActiveFooter \{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(2, var\(--match-card-team-column-width\)\);[\s\S]*?column-gap:\s*var\(--match-card-gap\);/
  );
  assert.match(
    css,
    /\.broadcast\.cleanActiveFooter > \.cleanScore \{[\s\S]*?grid-column:\s*1;[\s\S]*?justify-self:\s*center;/
  );
  assert.match(
    css,
    /\.broadcast\.cleanActiveFooter:not\(\.cleanActiveFooterWithoutBroadcast\) > \.cleanScore \{[\s\S]*?transform:\s*translateY\(2px\);/
  );
  assert.match(
    css,
    /\.broadcast\.cleanActiveFooter > :global\(\[data-public-match-meta\]\) \{[\s\S]*?grid-column:\s*2;[\s\S]*?justify-self:\s*center;/
  );
  assert.match(
    css,
    /\.broadcast\.cleanActiveFooterWithoutBroadcast > \.cleanScore \{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?justify-self:\s*center;/
  );
  assert.match(
    css,
    /\[data-carousel-layout="fluid-peek"\][\s\S]*?\.broadcast\.cleanActiveFooter \{[\s\S]*?position:\s*static;[\s\S]*?width:\s*100%;/
  );
  assert.match(
    css,
    /\.panel\[data-visual-variant="clean"\] \.cleanFinishedFooter \{[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*center;/
  );
});
