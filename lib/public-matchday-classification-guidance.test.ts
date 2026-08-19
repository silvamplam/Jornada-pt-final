import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  "utf8",
);

test("a classificação ganha cabeçalho sem perder a densidade", () => {
  assert.match(
    page,
    /JORNADA-CLASSIFICACAO-ORIENTACAO-INICIO/,
  );

  assert.match(
    page,
    /#classificacao::before \{[\s\S]*?content: "CLASSIFICAÇÃO";/,
  );

  assert.match(
    page,
    /#classificacao \.public-table thead tr:first-child th \{[\s\S]*?background: #e9eef4;/,
  );

  assert.match(
    page,
    /#classificacao \.public-table thead tr:nth-child\(2\) th \{[\s\S]*?border-bottom: 2px solid #9dabb9;/,
  );
});

test("as linhas orientam a leitura sem voltar à grelha horizontal", () => {
  assert.match(
    page,
    /tbody tr:nth-child\(even\) td \{[\s\S]*?rgba\(42, 67, 94, 0\.024\)/,
  );

  assert.match(
    page,
    /tbody tr:hover td \{[\s\S]*?rgba\(26, 72, 119, 0\.065\)/,
  );

  assert.match(
    page,
    /#classificacao \.public-table tbody td \{[\s\S]*?border-bottom: 0;/,
  );
});
