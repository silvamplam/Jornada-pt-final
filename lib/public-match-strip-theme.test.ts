import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPublicMatchStripTheme } from "./public-match-strip-theme";

test("a barra neutra usa branco contínuo e divisórias discretas entre jogos", () => {
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");
  const cleanCss = css.slice(css.indexOf('.panel[data-visual-variant="clean"]'));
  const panelRule = cleanCss.match(/\.panel\[data-visual-variant="clean"\]\s*\{([^}]*)\}/)?.[1] ?? "";
  const cardRule = cleanCss.match(/\.panel\[data-visual-variant="clean"\] \.row > \.card\s*\{([^}]*)\}/)?.[1] ?? "";
  const focusRule = cleanCss.match(/\.row > \.card\[data-live-focus="true"\]\s*\{([^}]*)\}/)?.[1] ?? "";

  for (const rule of [panelRule, cardRule]) {
    assert.match(rule, /background:\s*#ffffff;/);
    assert.match(rule, /border-radius:\s*0;/);
    assert.match(rule, /box-shadow:\s*none;/);
  }
  assert.match(panelRule, /border-bottom:\s*1px solid/);
  assert.match(cardRule, /border-inline-end-color:\s*#e0e3e6;/);
  assert.match(focusRule, /box-shadow:\s*none;/);
  assert.doesNotMatch(panelRule + cardRule, /gradient\(/);
  const viewportRule = cleanCss.match(/\.carouselViewport\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(viewportRule, /padding:\s*0;/);
});


test("a hora e o canal alinham pela grelha sem deslocamentos locais", () => {
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");
  const cleanCss = css.slice(css.indexOf('.panel[data-visual-variant="clean"]'));
  const scheduleRule = cleanCss.match(/\.cleanScheduleHeader\s*\{([^}]*)\}/)?.[1] ?? "";
  const footerRule = cleanCss.match(/> \.broadcast\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(scheduleRule, /justify-content:\s*space-between;/);
  assert.match(footerRule, /grid-row:\s*4;/);
  assert.match(footerRule, /justify-content:\s*flex-end;/);
  assert.doesNotMatch(cleanCss, /translate:|translate(?:X|Y)?\(/);
});


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

test("a jornada e as notícias contextuais usam a mesma barra neutra de jogos", () => {
  const matchdayPage = readFileSync(
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
    "utf8"
  );
  const articlePage = readFileSync("app/noticias/[slug]/page.tsx", "utf8");

  assert.doesNotMatch(matchdayPage, /competitionSlug=\{context\.competition\.slug\}/);
  assert.doesNotMatch(articlePage, /competitionSlug=\{articleContext\?\.competition\.slug\}/);
  assert.match(articlePage, /<PublicMatchStrip[\s\S]*?carouselLayout="fluid-peek"[\s\S]*?variant="clean"/);
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

test("os minutos ao vivo e o estado partilham a mesma linha compacta", () => {
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");
  const cleanCss = css.slice(css.indexOf('.panel[data-visual-variant="clean"]'));
  const statusRule = cleanCss.match(/\.status > \.cleanStatusLine\s*\{([^}]*)\}/)?.[1] ?? "";
  const badgeRule = cleanCss.match(/\.cleanStateBadge\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(statusRule, /display:\s*flex;/);
  assert.match(statusRule, /align-items:\s*center;/);
  assert.match(statusRule, /height:\s*16px;/);
  assert.match(badgeRule, /line-height:\s*16px;/);
  assert.doesNotMatch(badgeRule, /background:|border:|box-shadow:/);
});


test("os resultados reais alinham com as equipas e o rodapé conserva apenas TV", () => {
  const component = readFileSync("components/public/PublicMatchStrip.tsx", "utf8");
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");
  const cleanCss = css.slice(css.indexOf('.panel[data-visual-variant="clean"]'));

  assert.match(component, /const hasCleanBroadcast = Boolean\(/);
  assert.match(component, /const cleanTeamScores = visualVariant === "clean"[\s\S]*?presentation\.finishedScore \?\? \(activeScore/);
  assert.doesNotMatch(component, /\{ left: "0", right: "0" \}/);
  assert.match(component, /<span className=\{styles\.broadcast\}[\s\S]*?\{hasCleanBroadcast \? \(\s*<PublicMatchMeta/);
  assert.doesNotMatch(component, /cleanScoreContent|cleanActiveFooterWithoutBroadcast/);

  const scoreRule = cleanCss.match(/\.cleanTeamScore\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(scoreRule, /grid-column:\s*3;/);
  assert.match(scoreRule, /grid-row:\s*2;/);
  assert.match(scoreRule, /align-self:\s*center;/);
  assert.match(scoreRule, /justify-self:\s*end;/);
  assert.match(scoreRule, /font-size:\s*18px;/);
  assert.doesNotMatch(scoreRule, /border:|background:|box-shadow:/);
  assert.match(cleanCss, /\.cleanTeamScore\[data-public-match-team-score="away"\]\s*\{\s*grid-row:\s*3;/);
  assert.match(cleanCss, /> \.broadcast\s*\{[^}]*grid-row:\s*4;/);
  assert.doesNotMatch(cleanCss, /\.cleanScore\b|\.cleanScoreActive\b|\.cleanActiveFooterWithoutBroadcast\b/);
});
