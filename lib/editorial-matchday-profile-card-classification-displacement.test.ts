import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import {
  articleClassificationBadgeColors,
  articleClassificationLabel,
} from "./editorial-classifications";

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

test("cartão mantém classificação e data juntas quando o antetítulo quebra linha", () => {
  assert.match(articleCard, /classificationKey: ArticleClassificationKey \| null/u);
  assert.match(
    articleCard,
    /classificationKey === null\s*\? "Sem classificação"\s*: classificationKey === "fc_porto" \? "Porto"\s*: classificationKey === "other_liga_clubs" \? "Primeira Liga"\s*: articleClassificationLabel\(classificationKey\)/u,
  );
  assert.match(
    articleCard,
    /\{item\.label \? <span className="thematic-card-label">\{item\.label\}<\/span> : null\}\s*<span[\s\S]*?className="thematic-classification-badge"[\s\S]*?data-classification=\{classificationKey \?\? "unclassified"\}/u,
  );
  assert.match(
    cardFor,
    /classificationKey=\{bankItemById\.get\(bankItemId\)\?\.classification\?\.key \?\? null\}/u,
  );
  assert.match(
    client,
    /\.thematic-card-top \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0,1fr\) auto auto;[^}]*\}/u,
  );
  assert.match(client, /@container \(max-width: 300px\) \{\s*\.thematic-card-top \{ grid-template-columns: minmax\(0,1fr\) auto; \}\s*\.thematic-card-label \{ grid-column: 1 \/ -1; \}/u);
  assert.match(client, /\.thematic-card time \{[^}]*white-space: nowrap;/u);
  assert.match(
    client,
    /\.thematic-classification-badge \{[^}]*display: inline-flex;[^}]*flex: 0 0 auto;[^}]*height: 19px;[^}]*white-space: nowrap;[^}]*\}/u,
  );
  assert.match(client, /\.thematic-workspace-stack \.thematic-classification-badge \{ height: 17px;/u);
});

test("badge usa a paleta central sem contaminar o resto do cartão", () => {
  assert.match(
    articleCard,
    /style=\{articleClassificationBadgeColors\(classificationKey \?\? "unclassified"\)\}/u,
  );
  assert.equal(articleClassificationBadgeColors("benfica").color, "#000000");
  assert.equal(articleClassificationBadgeColors("sporting").color, "#FFFFFF");
  assert.equal(articleClassificationBadgeColors("fc_porto").color, "#FFFFFF");
  assert.equal(articleClassificationBadgeColors("other_liga_clubs").backgroundColor, "#000000");
  assert.equal(articleClassificationBadgeColors("outside_liga_other").backgroundColor, "#FFD400");
  assert.equal(articleClassificationBadgeColors("unclassified").backgroundColor, "#E2E8F0");
  assert.doesNotMatch(client, /thematic-classification-badge\[data-classification=/u);
  assert.equal(articleClassificationLabel("outside_liga_other"), "Outros assuntos");
  assert.doesNotMatch(client, /\.thematic-card\[data-classification=/u);
});

test("cartão sem antetítulo mantém classificação e data na mesma linha", () => {
  assert.match(
    articleCard,
    /<div className="thematic-card-top" data-without-label=\{!item\.label\}>/u,
  );
  assert.match(
    client,
    /\.thematic-card-top\[data-without-label="true"\] \{ grid-template-columns: minmax\(0,1fr\) auto; \}/u,
  );
  assert.doesNotMatch(client, /\.thematic-card-top\[data-without-label="true"\] \.thematic-classification-badge \{[^}]*position: absolute;/u);

  const topRule = client.match(/\.thematic-card-top \{([^}]*)\}/u)?.[1];
  assert.ok(topRule);
  assert.doesNotMatch(topRule, /(?:^|;)\s*(?:min-)?height\s*:/u);
  assert.doesNotMatch(topRule, /(?:^|;)\s*padding\s*:/u);
});

test("a única data do cartão fica depois da classificação na metadata, com o mesmo contrato", () => {
  const tree = ts.createSourceFile("ArticleCard.tsx", articleCard, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const dates: ts.JsxElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "time") dates.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(dates.length, 1, "A data deve continuar a existir uma única vez no cartão");
  const date = dates[0];
  const conditional = date.parent;
  assert.ok(ts.isConditionalExpression(conditional));
  assert.equal(conditional.condition.getText(tree), "publishedAt");
  assert.equal(conditional.whenTrue, date);
  assert.equal(conditional.whenFalse.kind, ts.SyntaxKind.NullKeyword);
  const wrapper = conditional.parent;
  assert.ok(ts.isJsxExpression(wrapper));
  const metadata = wrapper.parent;
  assert.ok(ts.isJsxElement(metadata));
  const className = metadata.openingElement.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === "className");
  assert.ok(className && ts.isJsxAttribute(className) && className.initializer && ts.isStringLiteral(className.initializer));
  assert.equal(className.initializer.text, "thematic-card-top");
  const elements = metadata.children.filter((child) => !ts.isJsxText(child));
  assert.equal(elements.length, 3, "A metadata contém antetítulo, classificação e data, nesta ordem");
  assert.ok(ts.isJsxExpression(elements[0]) && elements[0].expression && ts.isConditionalExpression(elements[0].expression));
  assert.equal(elements[0].expression.condition.getText(tree), "item.label");
  assert.ok(ts.isJsxElement(elements[1]));
  assert.match(elements[1].openingElement.getText(tree), /className="thematic-classification-badge"/u);
  assert.equal(elements[2], wrapper);
  assert.equal(date.openingElement.attributes.properties.length, 1);
  const dateTime = date.openingElement.attributes.properties[0];
  assert.ok(ts.isJsxAttribute(dateTime) && dateTime.initializer && ts.isJsxExpression(dateTime.initializer));
  assert.equal(dateTime.name.getText(tree), "dateTime");
  assert.equal(dateTime.initializer.expression?.getText(tree), "item.publishedAt ?? undefined");
  assert.equal(date.children.length, 1);
  assert.ok(ts.isJsxExpression(date.children[0]));
  assert.equal(date.children[0].expression?.getText(tree), "publishedAt");
  assert.match(articleCard, /const publishedAt = formattedDate\(item\.publishedAt\);/u);
  assert.match(client, /const dateFormatter = new Intl\.DateTimeFormat\("pt-PT", \{\s*dateStyle: "short",\s*timeStyle: "short",\s*timeZone: "Europe\/Lisbon",\s*\}\);/u);
  assert.match(client, /function formattedDate\(value: string \| null\): string \| null \{\s*if \(!value\) return null;\s*const date = new Date\(value\);\s*return Number\.isNaN\(date\.getTime\(\)\) \? null : dateFormatter\.format\(date\);\s*\}/u);
});

test("ação Desalojadas admite Abertura, zonas, Novas e Bank classificado, sem no-op em Desalojadas", () => {
  assert.match(
    articleCard,
    /const canMoveToDisplaced = placement\.kind === "zone"\s*\|\| placement\.kind === "opening"\s*\|\| placement\.kind === "new"\s*\|\| \(placement\.kind === "bank" && classificationKey !== null\);/u,
  );
  assert.match(
    articleCard,
    /\{canMoveToDisplaced \? <button className="thematic-button" onClick=\{onDisplaced\} type="button">Mover para Desalojadas<\/button> : null\}/u,
  );
  assert.doesNotMatch(articleCard, /placement\.kind !== "displaced"[^\n]*Mover para Desalojadas/u);
  assert.match(cardFor, /onDisplaced=\{\(\) => placeInDisplaced\(bankItemId\)\}/u);
  assert.match(placeInDisplaced, /movePhysicalDeskItemToDisplaced\(state, bankItemId\)/u);
  assert.doesNotMatch(placeInDisplaced, /fetch\(|applyChanges|buildPhysicalDeskApplyPayload/u);
});

test("todas as posições da Abertura reutilizam o cartão e handler comuns, sem exceção para Contexto", () => {
  const opening = sourceBetween("function renderOpeningWorkspace", "function renderFaixaWorkspace");
  assert.match(opening, /MATCHDAY_EDITORIAL_PROFILE_OPENING_SLOT_KEYS\.map\(\(slot, index\) =>/u);
  assert.match(opening, /cardFor\(placement\.bankItemId, \{ kind: "opening" \}\)/u);
  assert.doesNotMatch(opening, /onDisplaced|fetch\(|applyChanges|slot ===|slot !==/u);
  assert.match(articleCard, /placement\.kind !== "faixa" \? <button className="thematic-button" onClick=\{onFaixa\}/u);
  assert.match(articleCard, /placement\.kind !== "bank" \? <button className="thematic-button" onClick=\{onBank\}/u);
});
