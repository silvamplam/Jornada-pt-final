import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  "utf8",
);

const editorial = readFileSync(
  "components/public/PublicEditorialLayout.tsx",
  "utf8",
);

test("a classificação mantém os emblemas e reduz a altura das linhas", () => {
  assert.match(
    page,
    /JORNADA-CLASSIFICACAO-COMPACTA-INICIO/,
  );

  assert.match(
    page,
    /#classificacao \.public-table td \{[\s\S]*?padding-top: 1px;[\s\S]*?padding-bottom: 1px;[\s\S]*?border-bottom: 0;/,
  );

  assert.match(
    page,
    /#classificacao \.public-classification-team-badge \{[\s\S]*?height: 28px;/,
  );

  assert.match(
    page,
    /#classificacao \.public-club-cell \{[\s\S]*?transform: none;/,
  );
});

test("o Destaque da Jornada admite um parágrafo visível", () => {
  assert.match(
    editorial,
    /\.public-complement-body p \{[\s\S]*?-webkit-line-clamp: 3;[\s\S]*?line-clamp: 3;/,
  );
});
