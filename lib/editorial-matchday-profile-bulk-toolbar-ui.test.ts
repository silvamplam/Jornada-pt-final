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

  const normalized = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const toolbar = normalized.slice(
    normalized.indexOf('className="thematic-bulk-context"'),
    normalized.indexOf('className="thematic-global-tools"'),
  );
  assert.equal(toolbar.includes("Posicao na zona"), false);
  assert.equal(toolbar.includes("Fixar posicao"), false);
});

test("selecionar todos e limpar marcação existem mesmo com zero selecionados", () => {
  const globalToolsStart = source.indexOf('className="thematic-global-tools"');
  const videoStart = source.indexOf('<summary>Vídeos</summary>', globalToolsStart);
  const controlsStart = source.indexOf('aria-label="Controlos de seleção"');
  const workspaceStart = source.indexOf('className="thematic-panel thematic-workspace"', controlsStart);

  assert.ok(globalToolsStart >= 0 && videoStart > globalToolsStart);
  assert.ok(controlsStart > videoStart && workspaceStart > controlsStart);
  assert.match(source.slice(controlsStart, workspaceStart), /Selecionar todos/u);
  assert.match(source.slice(controlsStart, workspaceStart), /Limpar marcação/u);
  assert.match(source, /selected\.size === 1\s*\? "1 notícia selecionada"\s*:\s*`\$\{selected\.size\} notícias selecionadas`/u);
  assert.match(source, /selectedIdentities:\s*filteredSourceItems\.map\(identity\)/u);
  assert.match(source, /\.thematic-global-tools \{[^}]*grid-template-columns: max-content max-content minmax\(0,1fr\)/u);
  assert.match(source, /\.thematic-selection-controls \{[^}]*justify-content: flex-end/u);
});
