import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const compositionPage = source("app/admin/editorial/composicao/[matchdayId]/page.tsx");

test("o banco hierárquico reconhece momentos posteriores pela identidade editorial, não apenas pelo bank_item_id", () => {
  assert.match(compositionPage, /function hierarchicalAuxiliaryBankItemPlacementLabel/);
  assert.match(compositionPage, /compositionItemMatchesCandidate\(item, \{/);
  assert.match(compositionPage, /item\.slot_type === "complement"[\s\S]*"Destaque da Jornada"/);
  assert.match(compositionPage, /item\.slot_type === "beyond_matchday"[\s\S]*Para Lá da Jornada/);
  assert.match(
    compositionPage,
    /hierarchicalAuxiliaryBankItemPlacementLabel\(hierarchicalAuxiliaryItems, item\)/,
  );
});

test("Disponíveis e Em uso derivam da mesma identidade resolvida do banco", () => {
  assert.match(compositionPage, /const availableBankItems = bankItems\.filter\([\s\S]*!bankPlacementById\.get\(item\.id\)/);
  assert.match(compositionPage, /bankFilter === "in_use"[\s\S]*Boolean\(placement\)/);
  assert.match(compositionPage, /in_use: bankItems\.filter\([\s\S]*Boolean\(bankPlacementById\.get\(item\.id\)\)/);
});
