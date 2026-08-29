import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const admin = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);

const desk = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

const api = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);

const publicPage = readFileSync(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  "utf8",
);

test("a Composição abre diretamente no modo hierárquico", () => {
  assert.match(
    admin,
    /function historicalCompositionDeskPresentationMode\(\): ReferenceCompositionPresentationMode \{[\s\S]*?return "hierarchical";[\s\S]*?\}/,
  );
});

test("a Faixa não tem editor autónomo", () => {
  assert.doesNotMatch(
    admin,
    /function HierarchicalFaixaEditor/,
  );

  assert.doesNotMatch(
    admin,
    /assign_bank_item_to_hierarchical_faixa/,
  );
});

test("a Faixa é um workspace próprio com colocação em lote", () => {
  assert.match(
    desk,
    /setActiveWorkspaceKey\("faixa"\)/,
  );

  assert.match(
    desk,
    /placeSelectedInZone\("faixa"\)/,
  );

  assert.match(
    desk,
    /\[1,2,3,4,5,6,7,8,9,10\]\.map/,
  );
});

test("o workspace da Faixa apresenta dez lugares opcionais", () => {
  assert.match(
    desk,
    /activeWorkspaceKey === "faixa"/,
  );

  assert.match(
    desk,
    /Até dez notícias\. Todos os lugares são opcionais\./,
  );

  assert.match(
    desk,
    /occupiedFaixa\}\/10/,
  );
});

test("faixa_N é persistida como important_item N", () => {
  assert.match(
    api,
    /slotType: "complement" \| "beyond_matchday" \| "important_item"/,
  );

  assert.match(
    api,
    /value\?\.match\(\/\^faixa_\(\(\?:\[1-9\]\|10\)\)\$\//,
  );

  assert.match(
    api,
    /slotType: "important_item",[\s\S]*?sortOrder: faixaSortOrder/,
  );
});

test("a Faixa é opcional para publicação", () => {
  assert.doesNotMatch(
    api,
    /Completa[^\n]*Faixa/,
  );

  assert.doesNotMatch(
    api,
    /Faixa[^\n]*antes de publicar/,
  );
});

test("a Faixa continua disponível na página pública hierárquica", () => {
  assert.match(
    publicPage,
    /visibleImportantNewsItems\.length > 0[\s\S]*?<PublicHorizontalNewsStrip/,
  );
});
