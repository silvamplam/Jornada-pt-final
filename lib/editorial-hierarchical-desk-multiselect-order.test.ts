import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

test("a seleção da Mesa é múltipla e preserva a ordem dos cliques", () => {
  assert.match(
    client,
    /selectedBankItemIds, setSelectedBankItemIds/,
  );

  assert.match(
    client,
    /selectedBankItemIds\.map\([\s\S]*?index \+ 1/,
  );

  assert.match(
    client,
    /toggleSelection/,
  );

  assert.match(
    client,
    /rank \?\? "·"/,
  );
});

test("as zonas podem receber várias notícias pela ordem selecionada", () => {
  assert.match(
    client,
    /zone::core:\$\{section\.key\}/,
  );

  assert.match(
    client,
    /zone::beyond/,
  );

  assert.match(
    client,
    /zone::faixa/,
  );

  assert.match(
    client,
    /A ordem de seleção definiu a ordem inicial da zona/,
  );
});

test("a ocupação múltipla usa apenas lugares livres e valida capacidade", () => {
  assert.match(
    client,
    /const freeKeys =/,
  );

  assert.match(
    client,
    /freeKeys\.length <[\s\S]*?selectedBankItemIds\.length/,
  );

  assert.match(
    client,
    /lugares livres/,
  );
});

test("posição específica continua reservada a uma única notícia", () => {
  assert.match(
    client,
    /Para escolher um lugar específico, seleciona apenas uma notícia/,
  );
});
