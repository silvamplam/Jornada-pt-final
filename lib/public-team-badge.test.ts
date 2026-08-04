import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyPublicTeamBadgeShape,
  resolvePublicTeamBadgePresentation
} from "./public-team-badge";

const componentUrl = new URL("../components/public/PublicTeamBadge.tsx", import.meta.url);
const stylesUrl = new URL("../components/public/PublicTeamBadge.module.css", import.meta.url);
const helperUrl = new URL("./public-team-badge.ts", import.meta.url);
const homePageUrl = new URL("../app/page.tsx", import.meta.url);
const publicEditorialStylesUrl = new URL("../components/public/publicEditorialStyles.ts", import.meta.url);
const matchStripStylesUrl = new URL("../components/public/PublicMatchStrip.module.css", import.meta.url);
const integrations = [
  new URL("../components/public/PublicMatchStrip.tsx", import.meta.url),
  new URL("../components/public/PublicGamesPage.tsx", import.meta.url),
  new URL("../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx", import.meta.url),
  new URL("../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx", import.meta.url),
  new URL("../app/noticias/[slug]/page.tsx", import.meta.url)
];

test("normalização percetiva classifica emblemas por proporção sem conhecer clubes", () => {
  assert.equal(classifyPublicTeamBadgeShape(40, 80), "tall");
  assert.equal(classifyPublicTeamBadgeShape(80, 80), "balanced");
  assert.equal(classifyPublicTeamBadgeShape(120, 80), "wide");
  assert.equal(classifyPublicTeamBadgeShape(0, 80), "balanced");
  assert.equal(classifyPublicTeamBadgeShape(Number.NaN, 80), "balanced");
});

test("URLs HTTPS usam imagem e URLs ausentes ou inseguras usam fallback", () => {
  assert.deepEqual(
    resolvePublicTeamBadgePresentation("https://cdn.example.test/team.png", "equipa"),
    { kind: "image", logoUrl: "https://cdn.example.test/team.png", opticalScale: 1, contrastMode: "standard" }
  );
  for (const logoUrl of [null, undefined, "", "invalid", "http://cdn.example.test/team.png"]) {
    assert.deepEqual(
      resolvePublicTeamBadgePresentation(logoUrl, "equipa"),
      { kind: "fallback", opticalScale: 1, contrastMode: "standard" }
    );
  }
});

test("os fatores aprovados da La Liga e Premier League ficam centralizados sem alterar excecoes portuguesas", async () => {
  const laLigaScales = new Map([
    ["athletic-club", 0.89],
    ["atletico-de-madrid", 1.10],
    ["deportivo-alaves", 1.10],
    ["elche-cf", 0.98],
    ["fc-barcelona", 0.88],
    ["getafe-cf", 1.10],
    ["levante-ud", 0.95],
    ["malaga-cf", 0.92],
    ["osasuna", 1.10],
    ["rayo-vallecano", 1.10],
    ["rc-celta-de-vigo", 1.10],
    ["rc-deportivo", 0.96],
    ["rcd-espanyol", 1.10],
    ["real-betis", 1.10],
    ["real-madrid", 1.02],
    ["real-racing-club", 1.06],
    ["real-sociedad", 0.96],
    ["sevilla-fc", 0.97],
    ["valencia-cf", 0.96],
    ["villarreal-cf", 0.97]
  ]);
  const premierLeagueScales = new Map([
    ["arsenal", 0.98],
    ["aston-villa", 1],
    ["bournemouth", 1],
    ["brentford", 1],
    ["brighton-hove-albion", 0.96],
    ["chelsea", 0.96],
    ["coventry-city", 0.98],
    ["crystal-palace", 1.08],
    ["everton", 1.08],
    ["fulham", 1],
    ["hull-city", 1.08],
    ["ipswich-town", 1],
    ["leeds-united", 1.02],
    ["liverpool", 1.06],
    ["manchester-city", 0.96],
    ["manchester-united", 1],
    ["newcastle-united", 0.96],
    ["nottingham-forest", 1.08],
    ["sunderland", 1.10],
    ["tottenham-hotspur", 1.05]
  ]);

  assert.deepEqual(
    resolvePublicTeamBadgePresentation("https://cdn.example.test/moreirense.png", "moreirense"),
    { kind: "image", logoUrl: "https://cdn.example.test/moreirense.png", opticalScale: 1, contrastMode: "standard" }
  );
  assert.deepEqual(
    resolvePublicTeamBadgePresentation("https://cdn.example.test/sporting.svg", "sporting"),
    { kind: "image", logoUrl: "https://cdn.example.test/sporting.svg", opticalScale: 1.38, contrastMode: "standard" }
  );
  for (const [slug, opticalScale] of laLigaScales) {
    const logoUrl = `https://cdn.example.test/${slug}.png`;
    assert.deepEqual(
      resolvePublicTeamBadgePresentation(logoUrl, slug),
      { kind: "image", logoUrl, opticalScale, contrastMode: "standard" }
    );
  }
  for (const [slug, opticalScale] of premierLeagueScales) {
    const logoUrl = `https://cdn.example.test/${slug}.png`;
    assert.deepEqual(
      resolvePublicTeamBadgePresentation(logoUrl, slug),
      { kind: "image", logoUrl, opticalScale, contrastMode: "standard" }
    );
  }
  assert.deepEqual(
    resolvePublicTeamBadgePresentation("https://cdn.example.test/santa-clara.png", "santa-clara"),
    { kind: "image", logoUrl: "https://cdn.example.test/santa-clara.png", opticalScale: 1, contrastMode: "light-detail" }
  );

  const source = await readFile(helperUrl, "utf8");
  assert.deepEqual(
    [...source.matchAll(/^\s*\["([^"]+)", \{ opticalScale:/gm)].map((match) => match[1]),
    ["sporting", "santa-clara", ...laLigaScales.keys(), ...premierLeagueScales.keys()]
  );
  assert.doesNotMatch(source, /moreirense/);
  assert.doesNotMatch(source, /Math\.sqrt|alphaArea|calculatePublicTeamBadgeOpticalScale/);
});

test("o componente cliente mantem alt text e troca uma imagem falhada pelo fallback", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /^"use client";/);
  assert.match(source, /export type PublicTeamBadgeVariant = "compact" \| "default"/);
  assert.match(source, /alt=\{exactAlt\}/);
  assert.match(source, /title=\{exactAlt\}/);
  assert.match(source, /onError=\{\(\) => setFailedUrl\(presentation\.logoUrl\)\}/);
  assert.match(source, /presentation\.logoUrl !== failedUrl/);
  assert.match(source, /data-logo-shape=\{logoShape\}/);
  assert.match(source, /classifyPublicTeamBadgeShape\(event\.currentTarget\.naturalWidth, event\.currentTarget\.naturalHeight\)/);
  assert.match(source, /<span className=\{styles\.fallback\} title=\{exactAlt\}>\{fallbackLabel\}<\/span>/);
  assert.match(source, /--public-team-badge-optical-scale/);
  assert.doesNotMatch(source, /aria-hidden="true"|alt=""/);
});

test("o CSS usa altura comum, largura automatica e area estavel sem clipping", async () => {
  const source = await readFile(stylesUrl, "utf8");
  assert.match(source, /\.root\s*\{[\s\S]*?overflow:\s*visible[\s\S]*?border:\s*0[\s\S]*?border-radius:\s*0[\s\S]*?background:\s*transparent/);
  assert.match(source, /\.compact\s*\{[\s\S]*?width:\s*50px[\s\S]*?height:\s*28px/);
  assert.match(source, /\.default\s*\{[\s\S]*?width:\s*60px[\s\S]*?height:\s*33px/);
  assert.match(source, /\.image\s*\{[\s\S]*?width:\s*auto[\s\S]*?height:\s*auto[\s\S]*?object-fit:\s*contain/);
  assert.match(source, /\.compact \.image\s*\{[\s\S]*?height:\s*25px[\s\S]*?max-width:\s*50px/);
  assert.match(source, /\.default \.image\s*\{[\s\S]*?height:\s*30px[\s\S]*?max-width:\s*60px/);
  assert.match(source, /\.lightDetail\s*\{[\s\S]*?drop-shadow[\s\S]*?drop-shadow/);
  assert.match(source, /transform:\s*scale\(var\(--public-team-badge-optical-scale, 1\)\)/);
  assert.doesNotMatch(source, /border-radius:\s*999px|background:\s*#fff(?:fff)?/);
});

test("todas as superficies reutilizam PublicTeamBadge e fornecem slug", async () => {
  const sources = await Promise.all(integrations.map((url) => readFile(url, "utf8")));
  for (const source of sources.slice(0, 4)) {
    assert.match(source, /import PublicTeamBadge/);
    assert.match(source, /<PublicTeamBadge/);
    assert.match(source, /slug=\{team\?\.slug\}/);
  }
  assert.match(sources[0], /variant="compact"/);
  assert.match(sources[1], /variant="default"/);
  assert.match(sources[2], /<PublicMatchStrip/);
  assert.match(sources[3], /variant="compact"/);
  assert.match(sources[4], /import PublicMatchStrip/);
  assert.match(sources[4], /<PublicMatchStrip/);
  assert.doesNotMatch(sources[4], /import PublicTeamBadge|<PublicTeamBadge/);
  assert.doesNotMatch(sources[0], /team\?\.logo_url \? <img/);
  assert.doesNotMatch(sources[1], /public-game-team-badge|team\?\.logo_url\s*\?\s*<img/);
});

test("Home e pagina global de jogos carregam o slug necessario ao contraste central", async () => {
  const [homeSource, gamesSource] = await Promise.all([
    readFile(homePageUrl, "utf8"),
    readFile(integrations[1], "utf8")
  ]);
  assert.match(homeSource, /"id,name,public_name,short_name,code,slug,logo_url"/);
  assert.match(gamesSource, /"id,name,public_name,short_name,code,slug,logo_url"/);
});

test("as linhas de equipa usam alturas fixas e nao recortam o emblema", async () => {
  const [editorialStyles, gamesPage, matchdayPage, matchdayGamesPage, newsPage, stripStyles] = await Promise.all([
    readFile(publicEditorialStylesUrl, "utf8"),
    readFile(integrations[1], "utf8"),
    readFile(integrations[2], "utf8"),
    readFile(integrations[3], "utf8"),
    readFile(integrations[4], "utf8"),
    readFile(matchStripStylesUrl, "utf8")
  ]);
  const combined = [editorialStyles, gamesPage, matchdayPage, matchdayGamesPage, newsPage].join("\n");
  assert.doesNotMatch(combined, /\.public-team-badge\s*\{|\.public-game-team-badge/);
  assert.match(combined, /span:not\(\[data-public-team-badge\]\)/);

  for (const source of [editorialStyles, matchdayPage]) {
    assert.match(source, /\.public-matchday-mini-team\s*\{[\s\S]*?height:\s*28px[\s\S]*?gap:\s*6px[\s\S]*?overflow:\s*visible/);
  }
  assert.match(matchdayGamesPage, /\.public-games-team-line\s*\{[\s\S]*?height:\s*28px[\s\S]*?gap:\s*6px[\s\S]*?overflow:\s*visible/);
  assert.match(newsPage, /<PublicMatchStrip/);
  assert.doesNotMatch(newsPage, /\.news-article-game-team|text-overflow:\s*ellipsis/);
  assert.match(stripStyles, /data-public-team-badge\]\)\s*\{[\s\S]*?width:\s*36px;[\s\S]*?height:\s*31px/);
  assert.match(stripStyles, /data-logo-shape="tall"[\s\S]*?--public-match-team-badge-width:\s*27px;[\s\S]*?--public-match-team-badge-height:\s*33px/);
  assert.match(stripStyles, /data-logo-shape="wide"[\s\S]*?--public-match-team-badge-width:\s*36px;[\s\S]*?--public-match-team-badge-height:\s*28px/);
  assert.match(gamesPage, /\.public-game-team\s*\{[\s\S]*?height:\s*33px/);
  assert.match(gamesPage, /grid-template-columns:\s*60px minmax\(120px, 180px\) 70px minmax\(120px, 180px\) 60px/);
});

test("nomes públicos ficam numa linha sem ellipsis ou line-clamp em todas as superfícies", async () => {
  const [stripStyles, editorialStyles, gamesPage, matchdayPage, matchdayGamesPage, newsPage] = await Promise.all([
    readFile(matchStripStylesUrl, "utf8"),
    readFile(publicEditorialStylesUrl, "utf8"),
    readFile(integrations[1], "utf8"),
    readFile(integrations[2], "utf8"),
    readFile(integrations[3], "utf8"),
    readFile(integrations[4], "utf8")
  ]);

  const stripNameRule = stripStyles.match(/\.teamNames > \.teamName\s*\{([^}]*)\}/)?.[1] ?? "";
  const detailedGamesNameRule = gamesPage.match(/^\s{2}\.public-game-team-name\s*\{([^}]*)\}/m)?.[1] ?? "";
  const matchdayGamesNameRule = matchdayGamesPage.match(/\.public-games-team-line > span:not\(\[data-public-team-badge\]\)\s*\{([^}]*)\}/)?.[1] ?? "";
  for (const rule of [stripNameRule, detailedGamesNameRule, matchdayGamesNameRule]) {
    assert.match(rule, /white-space:\s*nowrap/);
    assert.match(rule, /text-overflow:\s*clip/);
    assert.doesNotMatch(rule, /ellipsis|line-clamp|overflow:\s*hidden/);
  }

  for (const sharedSource of [editorialStyles, matchdayPage]) {
    const legacyOverride = sharedSource.match(/\.public-matchday-mini-team > span:not\(\[data-public-team-badge\]\)\s*\{([^}]*)\}/)?.[1] ?? "";
    assert.match(legacyOverride, /overflow:\s*visible/);
    assert.match(legacyOverride, /text-overflow:\s*clip/);
    assert.doesNotMatch(legacyOverride, /ellipsis|line-clamp/);
  }

  assert.match(newsPage, /<PublicMatchStrip/);
  assert.doesNotMatch(newsPage, /news-article-game-team|ArticleMatchCard/);
});

test("dez jogos usam uma unica grelha dinamica sem scroll", async () => {
  const [matchStrip, stripStyles, editorialStyles, matchdayPage] = await Promise.all([
    readFile(integrations[0], "utf8"),
    readFile(matchStripStylesUrl, "utf8"),
    readFile(publicEditorialStylesUrl, "utf8"),
    readFile(integrations[2], "utf8")
  ]);

  assert.match(matchStrip, /import styles from "\.\/PublicMatchStrip\.module\.css"/);
  assert.match(matchStrip, /styles\.shell/);
  assert.match(matchStrip, /styles\.row/);
  assert.match(matchStrip, /styles\.card/);
  assert.doesNotMatch(matchStrip, /gridTemplateColumns/);
  assert.match(matchStrip, /"--public-match-strip-columns":\s*matches\.length/);
  assert.match(stripStyles, /\.shell\.shell\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(stripStyles, /\.shell\s*>\s*\.row\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(var\(--public-match-strip-columns\), minmax\(0, 1fr\)\);[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?gap:\s*clamp\([\s\S]*?overflow:\s*visible/);
  assert.match(stripStyles, /\.row\s*>\s*\.card\s*\{[\s\S]*?--public-match-card-inline-padding:\s*clamp\(3px, 0\.5vw, 8px\);[\s\S]*?min-width:\s*0;[\s\S]*?width:\s*auto;[\s\S]*?padding-inline:\s*var\(--public-match-card-inline-padding\)/);
  const cleanVariantStart = stripStyles.indexOf('.panel[data-visual-variant="clean"]');
  assert.ok(cleanVariantStart > 0);
  const defaultStripStyles = stripStyles.slice(0, cleanVariantStart);
  const cleanStripStyles = stripStyles.slice(cleanVariantStart);
  assert.doesNotMatch(defaultStripStyles, /overflow-x:\s*auto|flex-shrink|min-width:\s*154px|display:\s*flex/);
  assert.match(cleanStripStyles, /overflow-x:\s*auto/);
  assert.doesNotMatch(cleanStripStyles, /flex-shrink|min-width:\s*154px|display:\s*flex/);

  const matches = Array.from({ length: 10 }, (_, index) => ({ id: `jogo-${index + 1}` }));
  assert.equal(matches.length, 10);

  assert.match(matchdayPage, /import PublicMatchStrip/);
  assert.match(matchdayPage, /<PublicMatchStrip/);
  assert.doesNotMatch(matchdayPage, /function CompactMatchCard/);
  assert.doesNotMatch(matchdayPage, /style=\{\{\s*gridTemplateColumns/);
  for (const source of [editorialStyles, matchdayPage]) {
    assert.doesNotMatch(source, /\.public-matchday-strip\s*\{\s*grid-template-columns:\s*repeat\(auto-fit/m);
    for (const block of source.matchAll(/\.public-matchday-strip\s*\{([^}]*)\}/g)) {
      assert.doesNotMatch(block[1], /overflow-x:\s*auto|scrollbar-width|grid-template-columns:\s*repeat\(10/);
    }
  }
  assert.doesNotMatch(matchdayPage, /\.public-matchday-strip::?-webkit-scrollbar/);
});
