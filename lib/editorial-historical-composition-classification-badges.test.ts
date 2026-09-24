import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  articleClassificationBadgeColors,
  articleClassificationLabel,
} from "./editorial-classifications";

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);
const editorialClient = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

function sourceBetween(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0, `início em falta: ${startNeedle}`);
  assert.ok(end > start, `fim em falta depois de ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

test("a Composição reutiliza a semântica e os rótulos da classificação Editorial", () => {
  const badge = sourceBetween(
    client,
    "function ClassificationBadge(",
    "\n\nfunction identity",
  );

  assert.match(client, /articleClassificationBadgeColors,[\s\S]*?articleClassificationLabel,[\s\S]*?isArticleClassificationKey/);
  assert.match(badge, /isArticleClassificationKey\(classificationKey\)/);
  assert.match(badge, /articleClassificationLabel\(key\)/);
  assert.match(badge, /className="thematic-classification-badge"/);
  assert.match(badge, /data-classification=\{key \?\? "unclassified"\}/);
  assert.match(badge, /style=\{articleClassificationBadgeColors\(key \?\? "unclassified"\)\}/);
  assert.equal(articleClassificationLabel("benfica"), "Benfica");
  assert.equal(articleClassificationLabel("sporting"), "Sporting");
  assert.equal(articleClassificationLabel("fc_porto"), "FC Porto");
  assert.equal(articleClassificationLabel("other_liga_clubs"), "1.ª Liga");
});

test("Composição e Editorial partilham a paleta central completa", () => {
  assert.match(
    editorialClient,
    /style=\{articleClassificationBadgeColors\(classificationKey \?\? "unclassified"\)\}/,
  );
  assert.equal(articleClassificationBadgeColors("other_liga_clubs").backgroundColor, "#000000");
  assert.equal(articleClassificationBadgeColors("other_liga_clubs").color, "#FFFFFF");
  assert.equal(articleClassificationBadgeColors("outside_liga_other").backgroundColor, "#FFD400");
  assert.equal(articleClassificationBadgeColors("outside_liga_other").color, "#000000");
  assert.equal(articleClassificationBadgeColors("unclassified").backgroundColor, "#E2E8F0");
  assert.equal(articleClassificationBadgeColors("unclassified").color, "#000000");
  assert.doesNotMatch(editorialClient, /thematic-classification-badge\[data-classification=/);
  assert.doesNotMatch(client, /thematic-classification-badge\[data-classification=/);
});

test("candidatos, herdados e artigos já colocados usam o mesmo badge", () => {
  const renderCard = sourceBetween(
    client,
    "  function renderCard(",
    "\n\n  function updateSettings",
  );
  const candidateList = sourceBetween(
    client,
    "            <div className=\"hc-desk-list\">",
    "\n\n            {inheritedAvailableArticles.length",
  );
  const inheritedList = sourceBetween(
    client,
    "            {inheritedAvailableArticles.length",
    "\n          </div>\n        </section>",
  );

  assert.match(renderCard, /articleByBankId\.get\(card\.bankItemId\)/);
  assert.match(renderCard, /<ClassificationBadge classificationKey=\{article\.naturalGroupKey\} \/>/);
  assert.match(candidateList, /<ClassificationBadge classificationKey=\{article\.naturalGroupKey\} \/>/);
  assert.match(inheritedList, /<ClassificationBadge classificationKey=\{article\.naturalGroupKey\} \/>/);
});

test("a classificação continua fora do plano, snapshot e payload histórico", () => {
  const targetCard = sourceBetween(client, "type TargetCard = {", "\n};");
  const applyChanges = sourceBetween(
    client,
    "  async function applyChanges() {",
    "\n\n  function renderCard",
  );

  assert.doesNotMatch(targetCard, /classification|naturalGroupKey/i);
  assert.doesNotMatch(applyChanges, /classification|naturalGroupKey/i);
  assert.match(client, /const article = card\.bankItemId \? articleByBankId\.get\(card\.bankItemId\) : null;/);
  assert.doesNotMatch(client, /inferClassification|calculateClassification|recalculateClassification/);
});
