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

test("bulk operation appears as contextual toolbar only after marking items", () => {
  assert.match(source, /selected\.size > 0 \? \(/);
  assert.match(source, /className="thematic-bulk-context"/);
  assert.match(source, /position: sticky;[^}]*top: 44px/);
  assert.doesNotMatch(source, /<details className="thematic-panel thematic-bulk">/);
});

test("bulk toolbar is placed before page structure and active workspace", () => {
  const toolbar = source.indexOf('className="thematic-bulk-context"');
  const structure = source.indexOf('aria-label="Página e blocos"');
  assert.ok(toolbar >= 0);
  assert.ok(structure > toolbar);
});

test("bulk actions are grouped by clear destinations", () => {
  for (const label of [
    "Zona de destino",
    "Mover para zona",
    "Posicao na zona",
    "Fixar posicao",
    "Posicao na Faixa",
    "Mover para Faixa",
    "Fixar na Faixa",
    "Mover para Banco",
    "Automatico",
    "Limpar marcacao",
  ]) {
    const normalized = source
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    assert.equal(normalized.includes(label), true, label);
  }
});
