import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.join(
    process.cwd(),
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  ),
  "utf8",
);

test("menu fica fisicamente encostado ao botão dos três pontos", () => {
  assert.match(
    source,
    /\.thematic-card-actions \{ position: absolute; top: 22px;/,
  );
});

test("mouseleave tem tolerância para permitir chegar ao painel", () => {
  assert.match(
    source,
    /window\.setTimeout\(\(\) => \{/,
  );

  assert.match(
    source,
    /!details\.matches\(":hover"\)/,
  );

  assert.match(
    source,
    /!details\.contains\(document\.activeElement\)/,
  );

  assert.match(
    source,
    /\}, 220\);/,
  );
});

test("menu continua a fechar quando o foco sai", () => {
  assert.match(
    source,
    /onBlur=\{\(event\) => \{/,
  );

  assert.match(
    source,
    /event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)/,
  );
});

test("executar uma ação continua a fechar imediatamente", () => {
  assert.match(
    source,
    /closest\("details"\)/,
  );

  assert.match(
    source,
    /details\.open = false/,
  );
});