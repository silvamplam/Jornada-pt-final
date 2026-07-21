import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolvePublicTeamBadgePresentation } from "./public-team-badge";

const componentUrl = new URL("../components/public/PublicTeamBadge.tsx", import.meta.url);
const stylesUrl = new URL("../components/public/PublicTeamBadge.module.css", import.meta.url);
const helperUrl = new URL("./public-team-badge.ts", import.meta.url);
const homePageUrl = new URL("../app/page.tsx", import.meta.url);
const integrations = [
  new URL("../components/public/PublicMatchStrip.tsx", import.meta.url),
  new URL("../components/public/PublicGamesPage.tsx", import.meta.url),
  new URL("../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx", import.meta.url),
  new URL("../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx", import.meta.url),
  new URL("../app/noticias/[slug]/page.tsx", import.meta.url)
];
const duplicateStyleSources = [
  new URL("../components/public/publicEditorialStyles.ts", import.meta.url),
  integrations[1],
  integrations[2],
  integrations[3],
  integrations[4]
];
const publicEditorialStylesUrl = duplicateStyleSources[0];

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

test("a configuração ótica fica centralizada apenas para Moreirense e Santa Clara", async () => {
  assert.deepEqual(
    resolvePublicTeamBadgePresentation("https://cdn.example.test/moreirense.png", "moreirense"),
    { kind: "image", logoUrl: "https://cdn.example.test/moreirense.png", opticalScale: 1.16, contrastMode: "standard" }
  );
  assert.deepEqual(
    resolvePublicTeamBadgePresentation("https://cdn.example.test/santa-clara.png", "santa-clara"),
    { kind: "image", logoUrl: "https://cdn.example.test/santa-clara.png", opticalScale: 1, contrastMode: "light-detail" }
  );

  const source = await readFile(helperUrl, "utf8");
  assert.deepEqual([...source.matchAll(/^\s*\["([^"]+)", \{ opticalScale:/gm)].map((match) => match[1]), ["moreirense", "santa-clara"]);
});

test("o componente cliente mantém alt text e troca uma imagem falhada pelo fallback", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /^"use client";/);
  assert.match(source, /export type PublicTeamBadgeVariant = "compact" \| "default"/);
  assert.match(source, /alt=\{exactAlt\}/);
  assert.match(source, /title=\{exactAlt\}/);
  assert.match(source, /onError=\{\(\) => setFailedUrl\(presentation\.logoUrl\)\}/);
  assert.match(source, /presentation\.logoUrl !== failedUrl/);
  assert.match(source, /<span className=\{styles\.fallback\} title=\{exactAlt\}>\{fallbackLabel\}<\/span>/);
  assert.doesNotMatch(source, /aria-hidden="true"|alt=""/);
});

test("o CSS preserva transparência, proporção e uma área estável sem círculos nem clipping", async () => {
  const source = await readFile(stylesUrl, "utf8");
  assert.match(source, /\.root\s*\{[\s\S]*?overflow:\s*visible[\s\S]*?border:\s*0[\s\S]*?border-radius:\s*0[\s\S]*?background:\s*transparent/);
  assert.match(source, /\.compact\s*\{[\s\S]*?width:\s*24px[\s\S]*?height:\s*24px/);
  assert.match(source, /\.default\s*\{[\s\S]*?width:\s*30px[\s\S]*?height:\s*30px/);
  assert.match(source, /\.image\s*\{[\s\S]*?object-fit:\s*contain[\s\S]*?transform:\s*scale\(var\(--public-team-badge-optical-scale, 1\)\)/);
  assert.match(source, /\.lightDetail\s*\{[\s\S]*?drop-shadow[\s\S]*?drop-shadow/);
  assert.doesNotMatch(source, /border-radius:\s*999px|background:\s*#fff(?:fff)?|overflow:\s*hidden[\s\S]*?\.image/);
});

test("todas as superfícies reutilizam PublicTeamBadge e fornecem slug", async () => {
  const sources = await Promise.all(integrations.map((url) => readFile(url, "utf8")));
  for (const source of sources) {
    assert.match(source, /import PublicTeamBadge/);
    assert.match(source, /<PublicTeamBadge/);
    assert.match(source, /slug=\{team\?\.slug\}/);
  }
  assert.match(sources[0], /variant="compact"/);
  assert.match(sources[1], /variant="default"/);
  assert.match(sources[2], /variant="compact"/);
  assert.match(sources[3], /variant="compact"/);
  assert.match(sources[4], /variant="compact"/);
  assert.doesNotMatch(sources[0], /team\?\.logo_url \? <img/);
  assert.doesNotMatch(sources[1], /public-game-team-badge|team\?\.logo_url\s*\?\s*<img/);
});

test("Home e página global de jogos carregam o slug necessário à configuração central", async () => {
  const [homeSource, gamesSource] = await Promise.all([
    readFile(homePageUrl, "utf8"),
    readFile(integrations[1], "utf8")
  ]);
  assert.match(homeSource, /"id,name,public_name,short_name,code,slug,logo_url"/);
  assert.match(gamesSource, /"id,name,public_name,short_name,code,slug,logo_url"/);
});

test("não restam estilos locais que criem círculos ou recortem o emblema", async () => {
  const sources = await Promise.all(duplicateStyleSources.map((url) => readFile(url, "utf8")));
  const combined = sources.join("\n");
  assert.doesNotMatch(combined, /\.public-team-badge\s*\{|\.public-game-team-badge/);
  assert.match(combined, /span:not\(\[data-public-team-badge\]\)/);

  const [editorialStyles, matchdayPage, gamesPage] = await Promise.all([
    readFile(publicEditorialStylesUrl, "utf8"),
    readFile(integrations[2], "utf8"),
    readFile(integrations[1], "utf8")
  ]);
  assert.match(editorialStyles, /\.public-matchday-mini-team\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(matchdayPage, /\.public-matchday-mini-team\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(gamesPage, /grid-template-columns:\s*30px minmax\(120px, 180px\) 70px minmax\(120px, 180px\) 30px/);
});
