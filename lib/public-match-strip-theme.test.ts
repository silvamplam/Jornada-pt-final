import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPublicMatchStripTheme } from "./public-match-strip-theme";

test("a barra neutra conserva o fundo branco com rebordo exterior solido apenas inferior", () => {
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");
  const selectors = [
    '.panel[data-visual-variant="clean"] .row > .card',
    '.panel[data-visual-variant="clean"] .row > .card[data-live-focus="true"]',
    '.panel[data-visual-variant="clean"][data-carousel-layout="fluid-peek"] .row > .card'
  ];

  for (const selector of selectors) {
    const start = css.indexOf(selector + " {");
    assert.ok(start >= 0, selector);
    const rule = css.slice(start).split("{")[1]?.split("}")[0] ?? "";
    assert.match(rule, /box-shadow:\s*0 1px 0 #a8bac9 !important;/);
    assert.doesNotMatch(rule, /inset|gradient\(/);
    if (selector.includes("data-live-focus")) {
      assert.doesNotMatch(rule, /background(?:-color)?:/);
    } else {
      assert.match(rule, /background:\s*#ffffff;/);
      assert.match(rule, /border-radius:\s*9px;/);
    }
  }

  const viewportRule = css.match(/\.carouselViewport\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(viewportRule, /padding-block:\s*3px 5px;/);
});

test("a hora e o canal recuam juntos apenas na variante clean sem substituir os transforms", () => {
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");
  const rule = css.match(
    /\.panel\[data-visual-variant="clean"\] \.cleanScheduleTime,\s*\.panel\[data-visual-variant="clean"\] \.row > \.card > \.broadcast > :global\(\[data-public-match-meta\]\)\s*\{([^}]*)\}/
  )?.[1] ?? "";

  assert.match(rule, /translate:\s*-7px 0;/);
  assert.doesNotMatch(rule, /transform:|margin|padding|width|height/);
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

test("os resultados ao vivo alinham com as equipas e o rodape conserva apenas TV", () => {
  const component = readFileSync("components/public/PublicMatchStrip.tsx", "utf8");
  const css = readFileSync("components/public/PublicMatchStrip.module.css", "utf8");

  assert.match(component, /const hasCleanBroadcast = Boolean\(/);
  assert.match(component, /const cleanTeamScores = visualVariant === "clean"[\s\S]*?presentation\.finishedScore \?\? \(activeScore/);
  assert.match(component, /kind === "scheduled" && presentation\.center\.kind === "placeholder"\s*\? \{ left: "0", right: "0" \}/);
  assert.match(component, /<span className=\{cleanFooterClassName\}[\s\S]*?\{hasCleanBroadcast \? \(\s*<PublicMatchMeta/);
  assert.doesNotMatch(component, /cleanScoreContent|cleanActiveFooterWithoutBroadcast/);
  assert.match(
    css,
    /\.panel\[data-visual-variant="clean"\] \.row > \.card > \.broadcast\.cleanActiveFooter \{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;[\s\S]*?column-gap:\s*8px;/
  );
  assert.match(
    css,
    /\.broadcast\.cleanActiveFooter > :global\(\[data-public-match-meta\]\) \{[\s\S]*?grid-column:\s*2;[\s\S]*?justify-self:\s*end;/
  );
  assert.doesNotMatch(css, /\.cleanScore\b|\.cleanScoreActive\b|\.cleanActiveFooterWithoutBroadcast\b/);
  assert.match(css, /\.cleanStateBadgeLive\s*\{[^}]*margin-inline-start:\s*auto;[^}]*margin-inline-end:\s*13px/);
  assert.match(
    css,
    /\[data-carousel-layout="fluid-peek"\][\s\S]*?\.broadcast\.cleanActiveFooter \{[\s\S]*?position:\s*static;[\s\S]*?width:\s*100%;/
  );
  assert.match(
    css,
    /\.panel\[data-visual-variant="clean"\] \.cleanTeamScore \{[^}]*grid-column:\s*3;[^}]*grid-row:\s*3;[^}]*align-self:\s*center;[^}]*justify-self:\s*end;/
  );
  assert.match(
    css,
    /\.panel\[data-visual-variant="clean"\] \.cleanTeamScore \{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*background:\s*#f1f4f8;/
  );
  assert.match(
    css,
    /\.panel\[data-visual-variant="clean"\] \.row > \.card:global\(\.public-matchday-mini-card-finished\) > \.status > :global\(\.public-matchday-mini-time\)\s*\{[^}]*background:\s*#111111;[^}]*color:\s*#ffffff;/
  );
});
