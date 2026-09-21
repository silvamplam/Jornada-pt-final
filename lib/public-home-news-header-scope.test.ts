import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const headerStylesPath = "components/public/PublicHomeNewsHeader.module.css";
const headerStylesSpecifier = "PublicHomeNewsHeader.module.css";

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

test("a variante azul pertence exclusivamente à Home e às Notícias", () => {
  const consumers = [...sourceFiles("app"), ...sourceFiles("components")]
    .filter((path) => readFileSync(path, "utf8").includes(headerStylesSpecifier))
    .map(normalizedPath)
    .sort();

  assert.deepEqual(consumers, ["app/noticias/[slug]/page.tsx", "app/page.tsx"]);

  for (const path of consumers) {
    const source = readFileSync(path, "utf8");
    const binding = source.match(
      /import\s+([A-Za-z_$][\w$]*)\s+from\s+"@\/components\/public\/PublicHomeNewsHeader\.module\.css"/
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

  const newsPage = readFileSync("app/noticias/[slug]/page.tsx", "utf8");
  assert.doesNotMatch(newsPage, /jornadas\/\[matchdayNumber\]\/page\.module\.css/);

  const homePage = readFileSync("app/page.tsx", "utf8");
  const homeHeaderStart = homePage.indexOf("public-top-stack");
  const homeHeaderEnd = homePage.indexOf("public-home-games-transition-bar", homeHeaderStart);
  const homeHeader = homePage.slice(homeHeaderStart, homeHeaderEnd);
  assert.match(homeHeader, /<span>a Jornada<\/span>/);
  assert.doesNotMatch(homeHeader, /matchdayNumber/, "a Home não infere um número de Jornada");
});

test("a variante azul não atravessa a fronteira da barra branca de jogos", () => {
  const styles = readFileSync(headerStylesPath, "utf8");
  const protectedHooks = [
    ".public-home-games-transition-bar",
    ".public-home-match-strip-static",
    ".public-league-match-strip-scroll",
    "[data-public-match-carousel",
    "--public-match-strip-",
    "PublicMatchStrip.module.css"
  ];

  for (const protectedHook of protectedHooks) {
    assert.equal(styles.includes(protectedHook), false, `${protectedHook} fica fora da variante azul`);
  }

  assert.match(styles, /\.topStack:global\(\.public-top-stack\)\s*\{/);
  assert.equal(
    styles
      .split(/\r?\n/)
      .some((line) => /^\s*:global\(/.test(line)),
    false,
    "nenhum seletor global escapa a uma classe local"
  );
  assert.doesNotMatch(styles, /(?:linear|radial)-gradient|box-shadow|backdrop-filter/);
  assert.match(styles, /background:\s*#052e68/);
  assert.match(styles, /a\[aria-current="page"\][\s\S]*?border-bottom-color:\s*#ffffff/);
  assert.match(styles, /@media \(max-width: 860px\)/);
});
