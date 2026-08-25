import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const publicArticlePage = source("app/noticias/[slug]/page.tsx");
const adminHomePage = source("app/admin/editorial/home/page.tsx");
const adminMatchdayPage = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
const publishedSources = source("lib/editorial-published-sources.ts");
const publicMatchday = source("lib/public-matchday.ts");

test("as requests de artigos públicos usam apenas contratos explícitos válidos e bounded", () => {
  const articleSelects = Array.from(
    publicArticlePage.matchAll(/editorial_articles\?select=([^&`"\r\n]+)/g),
    (match) => match[1].split(","),
  );

  assert.equal(articleSelects.length, 2);
  assert.ok(articleSelects.some((fields) => fields.includes("body")));
  assert.ok(articleSelects.some((fields) => !fields.includes("body")));

  for (const fields of articleSelects) {
    assert.equal(fields.includes("*"), false);
    for (const invalidField of ["summary", "excerpt", "category", "type", "author_name"]) {
      assert.equal(fields.includes(invalidField), false);
    }
  }

  assert.doesNotMatch(publicArticlePage, /limit=80/);
  assert.match(publicArticlePage, /id=neq\.\$\{encodeURIComponent\([\s\S]*?currentArticle\.id/);
  assert.match(publicArticlePage, /limit=\$\{limit\}/);
});

test("a Home admin deixou de executar a dead read de artigos", () => {
  assert.doesNotMatch(adminHomePage, /readPublishedHomeEditorialArticles/);
  assert.doesNotMatch(adminHomePage, /HomeEditorialArticleOption/);
  assert.doesNotMatch(adminHomePage, /publishedArticles/);
});

test("a Jornada não executa o pipeline legado sem consumidor", () => {
  assert.doesNotMatch(adminMatchdayPage, /readPublishedEditorialArticles/);
  assert.doesNotMatch(adminMatchdayPage, /publishedEditorialArticles/);
  assert.doesNotMatch(adminMatchdayPage, /sideBlockArticleOptions/);
  assert.doesNotMatch(adminMatchdayPage, /sideBlockTextFromArticle|excerptFromBody/);
});

test("as fontes publicadas aplicam o scope antes do order e mantêm body de conteúdos", () => {
  assert.equal((publishedSources.match(/status=eq\.published\$\{contextFilter\}&order=/g) ?? []).length, 2);
  assert.match(publishedSources, /editorial_contents\?select=[^`\r\n]*summary,body,image_url/);
  assert.match(publishedSources, /return filters\.length > 0 \? `&and=/);
});

test("o diagnóstico público procura a competição diretamente e não mexe nas queries de matches", () => {
  const diagnosticStart = publicMatchday.indexOf("export async function getPublicMatchdayDiagnostic");
  assert.notEqual(diagnosticStart, -1);
  const diagnosticSource = publicMatchday.slice(diagnosticStart);

  assert.match(
    diagnosticSource,
    /competitions\?select=id,name,slug,country_id,country,logo_url,accent_color,is_active&slug=eq\.\$\{encodeURIComponent\(competitionSlug\)\}&limit=1/,
  );
  assert.doesNotMatch(diagnosticSource, /competitions\?select=[^"`\r\n]*order=name\.asc&limit=500/);
  assert.equal((diagnosticSource.match(/matches\?select=/g) ?? []).length >= 2, true);
});
