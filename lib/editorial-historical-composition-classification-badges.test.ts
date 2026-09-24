import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { articleClassificationLabel } from "./editorial-classifications";

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

  assert.match(client, /articleClassificationLabel,[\s\S]*?isArticleClassificationKey/);
  assert.match(badge, /isArticleClassificationKey\(classificationKey\)/);
  assert.match(badge, /articleClassificationLabel\(key\)/);
  assert.match(badge, /className="thematic-classification-badge"/);
  assert.match(badge, /data-classification=\{key \?\? "unclassified"\}/);
  assert.equal(articleClassificationLabel("benfica"), "Benfica");
  assert.equal(articleClassificationLabel("sporting"), "Sporting");
  assert.equal(articleClassificationLabel("fc_porto"), "FC Porto");
  assert.equal(articleClassificationLabel("other_liga_clubs"), "1.ª Liga");
});

test("Benfica, Sporting, FC Porto e classificações neutras mantêm a paleta da Editorial", () => {
  const expectedRules = [
    ["benfica", "background: #ef4444;"],
    ["sporting", "background: #15803d; color: #fff;"],
    ["fc_porto", "background: #1d4ed8; color: #fff;"],
    ["other_liga_clubs", "border-color: #000; background: #fff;"],
  ] as const;

  for (const [key, declarations] of expectedRules) {
    const compactDeclarations = declarations.replace(/\s+/g, "\\s*");
    const rule = new RegExp(
      `\\.thematic-classification-badge\\[data-classification="${key}"\\] \\{\\s*${compactDeclarations}`,
    );
    assert.match(editorialClient, rule);
    assert.match(client, rule);
  }

  assert.match(client, /\.thematic-classification-badge \{[\s\S]*?background: #e2e8f0;[\s\S]*?color: #000;/);
  assert.match(client, /data-classification="unclassified"\][\s\S]*?background: #fde047;/);
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
