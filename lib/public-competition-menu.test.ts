import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const menu = readFileSync("lib/public-competition-menu.ts", "utf8");
const landing = readFileSync(
  "app/competicoes/[competitionSlug]/[seasonLabel]/page.tsx",
  "utf8"
);

test("o menu entra sempre pela raiz da época e não escolhe jornadas", () => {
  assert.match(
    menu,
    /const href = `\/competicoes\/\$\{competition\.slug\}\/\$\{seasonSegment\}`;/
  );
  assert.doesNotMatch(menu, /\/jornadas\/\$\{/);
  assert.doesNotMatch(menu, /resolvePublicCompetitionCurrentMatchday/);
  assert.doesNotMatch(menu, /matchdays\?select=/);
});

test("a página de entrada concentra a decisão temporal da jornada", () => {
  assert.match(landing, /selectPublicCompetitionEntryMatchday/);
  assert.match(
    landing,
    /redirect\(`\/competicoes\/\$\{competitionSlug\}\/\$\{seasonLabel\}\/jornadas\/\$\{context\.matchday\.number\}`\)/
  );
});
