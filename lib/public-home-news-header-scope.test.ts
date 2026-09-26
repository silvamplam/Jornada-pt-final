import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const homeStylesPath = "components/public/PublicHomeNewsHeader.module.css";
const homeStylesSpecifier = "PublicHomeNewsHeader.module.css";
const leagueNewsStylesPath = "components/public/PublicLeagueNewsHeader.module.css";
const leagueNewsStylesSpecifier = "PublicLeagueNewsHeader.module.css";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function normalizedPath(path: string) {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function consumersOf(specifier: string) {
  return [...sourceFiles("app"), ...sourceFiles("components")]
    .filter((path) => readFileSync(path, "utf8").includes(specifier))
    .map(normalizedPath)
    .sort();
}

function assertScopedConsumer(path: string, moduleName: string) {
  const source = readFileSync(path, "utf8");
  const escapedModuleName = moduleName.replaceAll(".", "\\.");
  const binding = source.match(
    new RegExp(`import\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+"@/components/public/${escapedModuleName}"`)
  )?.[1];

  assert.ok(binding, `${path} importa a variante por default`);
  const markerIndex = source.indexOf("public-top-stack");
  const openingStart = source.lastIndexOf("<div", markerIndex);
  const openingEnd = source.indexOf(">", markerIndex);
  const openingTag = source.slice(openingStart, openingEnd + 1);

  assert.ok(markerIndex >= 0, `${path} mantém o contentor público existente`);
  assert.ok(openingStart >= 0 && openingEnd > markerIndex, `${path} tem um opening tag válido`);
  assert.ok(openingTag.includes(`${binding}.topStack`), `${path} aplica o scoping no contentor azul`);
}

test("a Home fica congelada e a variante pertence ao cabeçalho partilhado da Jornada e às Notícias", () => {
  assert.deepEqual(consumersOf(homeStylesSpecifier), ["app/page.tsx"]);
  assert.deepEqual(consumersOf(leagueNewsStylesSpecifier), [
    "app/noticias/[slug]/page.tsx",
    "components/public/PublicMatchdayHeader.tsx"
  ]);

  assertScopedConsumer("app/page.tsx", homeStylesSpecifier);
  assertScopedConsumer(
    "components/public/PublicMatchdayHeader.tsx",
    leagueNewsStylesSpecifier
  );
  assertScopedConsumer("app/noticias/[slug]/page.tsx", leagueNewsStylesSpecifier);

  const legacyCompetitionPage = readFileSync("app/competicao/[slug]/page.tsx", "utf8");
  const legacyMatchdayPage = readFileSync("app/competicao/[slug]/jornada/[matchday]/page.tsx", "utf8");
  assert.doesNotMatch(legacyCompetitionPage, /PublicLeagueNewsHeader/);
  assert.doesNotMatch(legacyMatchdayPage, /PublicLeagueNewsHeader/);

  const homePage = readFileSync("app/page.tsx", "utf8");
  const homeHeaderStart = homePage.indexOf("public-top-stack");
  const homeHeaderEnd = homePage.indexOf("public-home-games-transition-bar", homeHeaderStart);
  const homeHeader = homePage.slice(homeHeaderStart, homeHeaderEnd);
  assert.match(homeHeader, /<span>a Jornada<\/span>/);
  assert.doesNotMatch(homeHeader, /matchdayNumber/, "a Home não infere um número de Jornada");
});

test("a variante Liga + Notícias não atravessa a fronteira da barra branca", () => {
  const styles = readFileSync(leagueNewsStylesPath, "utf8");
  const protectedHooks = [
    ".public-home-games-transition-bar",
    ".public-home-match-strip-static",
    ".public-league-match-strip-scroll",
    ".matchStrip",
    "[data-public-match-carousel",
    "--public-match-strip-",
    "PublicMatchStrip.module.css"
  ];

  for (const protectedHook of protectedHooks) {
    assert.equal(styles.includes(protectedHook), false, `${protectedHook} fica fora da variante azul`);
  }

  assert.match(styles, /\.topStack:global\(\.public-top-stack\)\s*\{/);
  assert.equal(
    styles.split(/\r?\n/).some((line) => /^\s*:global\(/.test(line)),
    false,
    "nenhum seletor global escapa a uma classe local"
  );
  assert.doesNotMatch(styles, /(?:linear|radial)-gradient|box-shadow|backdrop-filter/);
  assert.match(styles, /max-width:\s*1232px/);
  assert.match(styles, /--league-masthead-height:\s*124px/);
  assert.match(styles, /min-height:\s*49px/);
  assert.doesNotMatch(styles, /(?:^|[^\d])(?:1540|155|61)px/);
  assert.match(styles, /border-top:\s*2px solid var\(--league-header-accent, #c1172f\)/);
  assert.match(styles, /background:\s*var\(--league-header-background, #002a6a\)/);
  assert.match(styles, /a\[aria-current="page"\][\s\S]*?border-bottom-color:\s*var\(--league-header-ink, #ffffff\)/);

  const newsPage = readFileSync("app/noticias/[slug]/page.tsx", "utf8");
  assert.doesNotMatch(newsPage, /public-site-search|>Entrar</);

  const matchdayPage = readFileSync(
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
    "utf8"
  );
  assert.match(matchdayPage, /public-league-match-strip-scroll \$\{styles\.matchStrip\}/);
});

test("o módulo congelado da Home mantém o seu scoping anterior", () => {
  const styles = readFileSync(homeStylesPath, "utf8");
  assert.match(styles, /\.topStack:global\(\.public-top-stack\)\s*\{/);
  assert.doesNotMatch(styles, /PublicLeagueNewsHeader/);
});
