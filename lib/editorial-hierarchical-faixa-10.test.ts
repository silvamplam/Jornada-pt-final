import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);

test("a Faixa da Composição aceita dez posições", () => {
  for (let position = 1; position <= 10; position += 1) {
    assert.ok(
      client.includes(`faixa_${position}`) ||
        client.includes("length: 10") ||
        client.includes(
          "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]",
        ),
      `falta suporte à Faixa ${position}`,
    );
  }

  assert.match(
    client,
    /(?:length:\s*10|1, 2, 3, 4, 5, 6, 7, 8, 9, 10)/,
  );
});

test("o target faixa_10 é persistido como important_item 10", () => {
  const start = route.indexOf(
    "function hierarchicalAuxiliaryTarget",
  );

  assert.ok(start >= 0);

  const end = route.indexOf(
    "\nfunction ",
    start + 20,
  );

  const helper =
    end > start
      ? route.slice(start, end)
      : route.slice(start);

  assert.match(helper, /important_item/);
  assert.match(helper, /10/);
});

test("a Faixa continua opcional para publicar a Composição", () => {
  const publicationChecks = [
    "incompleteHierarchicalCompositionSlots",
    "isPublishableHierarchicalBeyondMatchday",
    "isPublishableHierarchicalCompositionEditorial",
  ];

  for (const check of publicationChecks) {
    assert.ok(
      route.includes(check),
      `validação nuclear ausente: ${check}`,
    );
  }

  assert.doesNotMatch(
    route,
    /missingHierarchical.*important_item/,
  );

  assert.doesNotMatch(
    route,
    /incompleteHierarchical.*important_item/,
  );
});

test("não existe mínimo obrigatório de notícias na Faixa", () => {
  assert.doesNotMatch(
    route,
    /important_item[^\n]{0,120}(?:required|obrigat|min(?:imum|imo)|length\s*[<]=?\s*[1-9])/i,
  );
});

test("o plano base inclui as dez posições persistíveis da Faixa", () => {
  const start = client.indexOf("function initialPlan(");
  const end = client.indexOf("\nfunction samePlan", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const initialPlanSource = client.slice(start, end);

  assert.match(
    initialPlanSource,
    /for \(let position = 1; position <= 10; position \+= 1\)/,
  );

  assert.doesNotMatch(
    initialPlanSource,
    /for \(let position = 1; position <= 5; position \+= 1\)/,
  );
});

test("a identificação das colocações da Faixa cobre posições 1 a 10", () => {
  const start = client.indexOf(
    "const placementByBankItem = useMemo",
  );
  const end = client.indexOf(
    "\n  const normalizedSearch",
    start,
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const placementSource = client.slice(start, end);

  assert.match(
    placementSource,
    /for \(let position = 1; position <= 10; position \+= 1\)/,
  );
});

test("os indicadores visuais da Faixa refletem dez lugares", () => {
  assert.match(
    client,
    /<strong>\{occupiedFaixa\}\/10<\/strong>/,
  );

  assert.match(
    client,
    /<span>\{occupiedFaixa\}\/10<\/span>/,
  );

  assert.match(
    client,
    /Até dez notícias\. Todos os lugares são opcionais\./,
  );
});