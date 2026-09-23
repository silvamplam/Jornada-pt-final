import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { articleClassificationLabel } from "./editorial-classifications";

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = client.indexOf(start);
  const endIndex = client.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Início não encontrado: ${start}`);
  assert.ok(endIndex > startIndex, `Fim não encontrado: ${end}`);
  return client.slice(startIndex, endIndex);
}

const articleCard = sourceBetween("function ArticleCard", "function Diagnostics");
const cardFor = sourceBetween("function cardFor", "function renderOpeningWorkspace");
const placeInDisplaced = sourceBetween("function placeInDisplaced", "function placeInBank");

test("cartão apresenta a classificação no cabeçalho compacto sem criar uma nova linha", () => {
  assert.match(articleCard, /classificationKey: ArticleClassificationKey \| null/u);
  assert.match(
    articleCard,
    /classificationKey === null\s*\? "Sem classificação"\s*: classificationKey === "fc_porto" \? "Porto"\s*: classificationKey === "other_liga_clubs" \? "Primeira Liga"\s*: articleClassificationLabel\(classificationKey\)/u,
  );
  assert.match(
    articleCard,
    /\{item\.label \? <span className="thematic-card-label">\{item\.label\}<\/span> : null\}\s*<span className="thematic-classification-badge" data-classification=\{classificationKey \?\? "unclassified"\}/u,
  );
  assert.match(
    cardFor,
    /classificationKey=\{bankItemById\.get\(bankItemId\)\?\.classification\?\.key \?\? null\}/u,
  );
  assert.match(
    client,
    /\.thematic-card-top \{[^}]*flex-wrap: nowrap;[^}]*\}/u,
  );
  assert.match(
    client,
    /\.thematic-classification-badge \{[^}]*display: inline-flex;[^}]*flex: 0 0 auto;[^}]*height: 13px;[^}]*white-space: nowrap;[^}]*\}/u,
  );
});

test("badge conserva variantes visuais próprias sem contaminar o resto do cartão", () => {
  assert.match(
    client,
    /\.thematic-classification-badge \{[^}]*background: #e2e8f0; color: #000;[^}]*\}/u,
  );
  assert.match(
    client,
    /\.thematic-classification-badge\[data-classification="unclassified"\] \{ background: #fde047; \}/u,
  );
  assert.match(
    client,
    /\.thematic-classification-badge\[data-classification="benfica"\] \{ background: #ef4444; \}/u,
  );
  assert.match(
    client,
    /\.thematic-classification-badge\[data-classification="sporting"\] \{ background: #15803d; color: #fff; \}/u,
  );
  assert.match(
    client,
    /\.thematic-classification-badge\[data-classification="fc_porto"\] \{ background: #1d4ed8; color: #fff; \}/u,
  );
  assert.match(
    client,
    /\.thematic-classification-badge\[data-classification="other_liga_clubs"\] \{ border-color: #000; background: #fff; \}/u,
  );
  assert.equal(articleClassificationLabel("outside_liga_other"), "Outros assuntos");
  assert.doesNotMatch(client, /\.thematic-card\[data-classification=/u);
});

test("cartão sem antetítulo mantém a linha vazia sem altura", () => {
  assert.match(
    articleCard,
    /<div className="thematic-card-top" data-without-label=\{!item\.label\}>/u,
  );
  assert.match(
    client,
    /\.thematic-card-top\[data-without-label="true"\] \.thematic-classification-badge \{ position: absolute; z-index: 2; bottom: 100%; left: 0; \}/u,
  );

  const topRule = client.match(/\.thematic-card-top \{([^}]*)\}/u)?.[1];
  assert.ok(topRule);
  assert.doesNotMatch(topRule, /(?:^|;)\s*(?:min-)?height\s*:/u);
  assert.doesNotMatch(topRule, /(?:^|;)\s*padding\s*:/u);
});

test("ação Desalojadas existe só no cartão colocado em zona e reutiliza o reducer físico", () => {
  assert.match(
    articleCard,
    /\{placement\.kind === "zone" \? <button className="thematic-button" onClick=\{onDisplaced\} type="button">Mover para Desalojadas<\/button> : null\}/u,
  );
  assert.doesNotMatch(articleCard, /placement\.kind !== "displaced"[^\n]*Mover para Desalojadas/u);
  assert.match(cardFor, /onDisplaced=\{\(\) => placeInDisplaced\(bankItemId\)\}/u);
  assert.match(placeInDisplaced, /movePhysicalDeskItemToDisplaced\(state, bankItemId\)/u);
  assert.doesNotMatch(placeInDisplaced, /fetch\(|applyChanges|buildPhysicalDeskApplyPayload/u);
});
