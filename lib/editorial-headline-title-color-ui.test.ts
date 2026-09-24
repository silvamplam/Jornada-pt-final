import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const liveDesk = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const historicalDesk = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);
const historicalPage = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);
const publicPage = readFileSync(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  "utf8",
);

test("os dois editores deixaram de expor seleção manual da cor da Manchete", () => {
  assert.doesNotMatch(liveDesk, /Cor da Manchete|Cor do texto da Manchete/u);
  assert.doesNotMatch(historicalDesk, /Cor do título da Manchete|hc-color-control/u);
  assert.doesNotMatch(liveDesk, /input[^>]+type="color"/u);
  assert.doesNotMatch(historicalDesk, /input[^>]+type="color"/u);
});

test("a Composição usa a classificação projetada pelo read model sem persistência nova", () => {
  assert.match(
    historicalPage,
    /item\.sourceId,[\s\S]*item\.classifiedZoneKey/u,
  );
  assert.match(
    historicalPage,
    /naturalGroupKey: hierarchicalNaturalGroupByArticleId\.get\(bankItem\.source_id\) \?\? null/u,
  );
  assert.match(
    historicalDesk,
    /synchronizeHistoricalHeadlineTitleColor\([\s\S]*articleByBankId\.get\(bankItemId\)\?\.naturalGroupKey/u,
  );
});

test("Guardar e os dois públicos continuam a transportar e ler snapshots existentes", () => {
  assert.match(historicalDesk, /settings_json", JSON\.stringify\(plan\.settings\)/u);
  assert.match(publicPage, /referenceComposition\?\.hierarchical_headline_title_color/u);
  assert.match(publicPage, /physicalSnapshot\.settings\.headlineTitleColor/u);
  assert.doesNotMatch(publicPage, /headlineTitleColorForClassification/u);
});
