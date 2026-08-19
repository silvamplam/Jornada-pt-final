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

test("a Hierárquica continua a abrir por defeito", () => {
  assert.match(
    admin,
    /query\.presentation_mode === "standard" \? "standard" : "hierarchical"/,
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

test("Colocar em oferece Faixa 1 a Faixa 10 após os momentos posteriores", () => {
  assert.match(
    desk,
    /<optgroup label="Momentos posteriores">[\s\S]*?<\/optgroup>[\s\S]*?<optgroup label="Faixa de notícias">/,
  );

  assert.match(
    desk,
    /Faixa \{position\}/,
  );

  assert.match(
    desk,
    /faixa_\$\{position\}/,
  );
});

test("o mapa direito apresenta a Faixa com dez lugares", () => {
  assert.match(
    desk,
    /<h3>Para Lá da Jornada<\/h3>[\s\S]*?<h3>Faixa de notícias<\/h3>/,
  );

  assert.match(
    desk,
    /Até cinco notícias\. Todos os lugares são opcionais\./,
  );

  assert.match(
    desk,
    /occupiedFaixa\}\/5/,
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
    /importantNewsItems\.length > 0[\s\S]*?<PublicHorizontalNewsStrip/,
  );
});
