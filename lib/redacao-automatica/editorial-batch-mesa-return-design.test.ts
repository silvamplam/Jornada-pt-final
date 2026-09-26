import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/editorial/redacao-automatica/publicacao-lote/page.tsx", "utf8");
const client = readFileSync("app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx", "utf8");
const css = readFileSync("app/admin/editorial/redacao-automatica/publicacao-lote/publicacao-lote.module.css", "utf8");

test("publicação em lote aponta visual e operacionalmente para a Mesa", () => {
  assert.match(page, /href="\/admin\/editorial\/redacao-automatica\/mesa">Mesa da Redação/);
  assert.match(client, /const MESA_ROUTE = "\/admin\/editorial\/redacao-automatica\/mesa"/);
  assert.match(client, /window\.location\.assign\(MESA_ROUTE\)/);
});

test("regresso à Mesa acontece nos percursos de sucesso integral e no retry exclusivamente histórico", () => {
  assert.equal((client.match(/returnToMesaAfterSuccessfulPublication\(\);/g) ?? []).length, 3);
});

test("página reutiliza a gramática visual verde e editorial da Mesa", () => {
  assert.match(css, /Continuidade visual com a Mesa da Redação/);
  assert.match(css, /\.hero[\s\S]*background: #173d27/);
  assert.match(css, /\.articleHeading h4[\s\S]*font-family: Georgia/);
  assert.match(css, /\.analysisActions button,[\s\S]*background: #1f7843/);
});
