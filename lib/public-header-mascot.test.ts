import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL(
  "../components/public/PublicMatchdayNavigation.tsx",
  import.meta.url
);
const stylesUrl = new URL(
  "../components/public/PublicMatchdayNavigation.module.css",
  import.meta.url
);

const integrationUrls = [
  "../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  "../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx",
  "../app/noticias/[slug]/page.tsx",
  "../components/public/PublicGamesPage.tsx"
].map((path) => new URL(path, import.meta.url));

test("mantem o boneco com gravata e resposta imediata", async () => {
  const [componentSource, stylesSource] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(componentSource, /className=\{styles\.runner\}/);
  assert.match(componentSource, /className=\{styles\.tieKnot\}/);
  assert.match(componentSource, /className=\{styles\.tie\}/);
  assert.match(componentSource, /handleMatchdayClick/);
  assert.match(componentSource, /setPendingId\(item\.id\)/);
  assert.match(componentSource, /window\.location\.assign\(item\.href\)/);
  assert.doesNotMatch(componentSource, /className=\{styles\.letter\}/);
  assert.match(stylesSource, /\.tie,/);
  assert.match(stylesSource, /@keyframes journey-tie/);
  assert.match(stylesSource, /a\[data-active="true"\][\s\S]*?color:\s*#ffffff/);
});

test("a jornada usa faixa compacta sem boneco e os restantes contextos preservam a navegação partilhada", async () => {
  const sources = await Promise.all(integrationUrls.map((url) => readFile(url, "utf8")));
  const competitionSource = sources[0];

  assert.match(competitionSource, /public-season-context-card/);
  assert.match(competitionSource, /public-matchday-date-row/);
  assert.match(competitionSource, /<strong>Data:<\/strong>/);
  assert.match(competitionSource, /className="public-matchday-nav-compact"/);
  assert.match(competitionSource, /background:\s*#c40012/);
  assert.match(competitionSource, /flex-wrap:\s*wrap/);
  assert.doesNotMatch(competitionSource, /import PublicMatchdayNavigation|<PublicMatchdayNavigation/);
  assert.doesNotMatch(competitionSource, /public-matchday-status-card|Jornada selecionada/);
  assert.match(competitionSource, /<PublicMatchStrip/);
  assert.doesNotMatch(competitionSource, />Jogos<\/a>/);

  for (const source of sources.slice(1)) {
    assert.match(source, /public-season-context-card/);
    assert.match(source, /public-matchday-date-row/);
    assert.doesNotMatch(source, /public-matchday-status-card|Jornada selecionada/);
  }
});
