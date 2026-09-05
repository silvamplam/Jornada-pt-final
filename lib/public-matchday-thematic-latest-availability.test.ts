import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const page = readFileSync(
  path.join(
    process.cwd(),
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  ),
  "utf8",
);

const fallback = readFileSync(
  path.join(
    process.cwd(),
    "components/public/PublicThematicLatestOnlyLayout.tsx",
  ),
  "utf8",
);

test("Últimas tem autoridade independente das quatro", () => {
  assert.match(
    page,
    /const showBodyLatestBlock =\s*latestZonePlacement === "four_news"\s*&& latestNewsItems\.length > 0/,
  );

  assert.match(
    page,
    /const showFourNewsLatestLayout =\s*physicalSnapshot \|\| thematicSnapshot\s*\? showBodyLatestBlock\s*&& liveFourNewsItems\.length > 0\s*: latestZonePlacement[\s\S]{0,160}liveFourNewsItems\.length === 4/,
  );
});

test("modo temático mantém Últimas quando não há quatro completas", () => {
  assert.match(
    page,
    /if \(!showBodyLatestBlock\) \{\s*return null;/,
  );

  assert.match(
    page,
    /showFourNewsLatestLayout \? \(/,
  );

  assert.match(
    page,
    /<PublicLatestOnlyLayout/,
  );
});

test("Seleção temática aceita 1–4 itens e Legacy exige os quatro completos", () => {
  assert.match(
    page,
    /physicalSnapshot \|\| thematicSnapshot\s*\? showBodyLatestBlock\s*&& liveFourNewsItems\.length > 0/,
  );

  assert.match(
    page,
    /: latestZonePlacement === "four_news"[\s\S]{0,160}liveFourNewsItems\.length === 4/,
  );

  assert.doesNotMatch(
    fallback,
    /liveFourNewsItems/,
  );
});

test("fallback de Últimas é compacto e usa o título público", () => {
  assert.match(
    fallback,
    /\.slice\(0, 6\)/,
  );

  assert.match(
    fallback,
    /title=\{title\}/,
  );

  assert.match(
    fallback,
    /titleColor=\{titleColor\}/,
  );
});

test("Legacy continua dependente do layout completo de quatro", () => {
  assert.match(
    page,
    /if \(zone === "four_news"\) \{\s*if \(!showFourNewsLatestLayout\) return null;/,
  );
});
