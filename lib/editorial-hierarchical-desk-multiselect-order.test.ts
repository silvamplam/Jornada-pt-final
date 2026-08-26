import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

test("a seleção da Mesa é múltipla e preserva a ordem dos cliques", () => {
  assert.match(client, /selectedBankItemIds, setSelectedBankItemIds/);
  assert.match(client, /selectedBankItemIds\.map\([\s\S]*?index \+ 1/);
  assert.match(client, /toggleSelection/);
  assert.match(client, /rank \?\? "·"/);
});

test("as zonas podem receber várias notícias pela ordem selecionada", () => {
  assert.match(
    client,
    /function placeSelectedInDynamicZone/,
  );

  assert.match(
    client,
    /const freePositions = positions\.filter/,
  );

  assert.match(
    client,
    /selectedBankItemIds\.forEach/,
  );

  assert.match(
    client,
    /placeSelectedInDynamicZone\(activeDynamicZone\.clientId\)/,
  );

  assert.match(
    client,
    /placeSelectedInZone\("faixa"\)/,
  );

  assert.match(
    client,
    /A ordem de seleção definiu a ordem inicial da zona/,
  );
});

test("a ocupação múltipla usa apenas lugares livres e valida capacidade", () => {
  assert.match(client, /const freeKeys =/);
  assert.match(client, /freeKeys\.length < selectedArticles\.length/);
  assert.match(client, /lugares livres/);
});

test("os lugares específicos são destinos visuais e não um dropdown paralelo", () => {
  assert.match(client, /onDrop=\{\(event\) =>/);
  assert.doesNotMatch(client, /data-composition-destination/);
});
