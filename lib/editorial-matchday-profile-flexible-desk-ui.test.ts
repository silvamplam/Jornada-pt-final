import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.join(
    process.cwd(),
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  ),
  "utf8",
);

test("Mesa deriva capacidade do layout em draft", () => {
  assert.match(
    source,
    /editorialProfileWithZoneLayouts\(\s*profile,\s*editorState\.draftPageControls\.thematicZoneLayouts/,
  );

  assert.match(
    source,
    /const effectiveProfile = useMemo/,
  );

  assert.match(
    source,
    /reconcileMatchdayEditorialProfileWorkspace\(\s*effectiveProfile/,
  );

  assert.match(
    source,
    /const destination = effectiveProfile\.zones\.find/,
  );
});

test("cada zona expõe seletor de layout independente", () => {
  assert.match(
    source,
    /aria-label={`Layout de \$\{zone\.label\}`}/,
  );

  assert.match(
    source,
    /EDITORIAL_VISUAL_FAMILIES\.map/,
  );

  assert.match(
    source,
    /EDITORIAL_VISUAL_FAMILY_DEFINITIONS\[\s*family\s*\]\.label/,
  );

  assert.match(
    source,
    /changeZoneLayout/,
  );
});

test("reduzir layout preserva Manual > automático por compactação", () => {
  assert.match(
    source,
    /compactMatchdayEditorialProfileManualOverridesForLayoutChange\(\s*effectiveProfile,\s*nextProfile,\s*operationalOverrides,\s*zoneKey/,
  );

  assert.match(
    source,
    /Não é possível reduzir este layout/,
  );
});

test("Últimas é o sexto bloco ordenável da mesma composição", () => {
  assert.match(
    source,
    /thematicBlockOrder\.map/,
  );

  assert.match(
    source,
    /moveMatchdayEditorialProfileThematicBlock/,
  );

  assert.match(
    source,
    /matchdayEditorialProfileThematicZoneOrderFromBlockOrder/,
  );

  assert.match(
    source,
    /Seleção editorial \+ Últimas/,
  );

  assert.match(
    source,
    /blockOrderIndex\.get\("latest"\)/,
  );

  assert.match(
    source,
    /blockOrderIndex\.get\(zone\.key\)/,
  );

  assert.doesNotMatch(
    source,
    /moveMatchdayEditorialProfileThematicZone\(/,
  );
});

test("Seleção editorial é manual, independente e aplicada no workspace V5", () => {
  assert.match(
    source,
    /draftEditorialSelection/,
  );

  assert.match(
    source,
    /selectionBankItemIds:\s*draftEditorialSelection/,
  );

  assert.match(
    source,
    /Seleção editorial é promoção manual independente/,
  );

  assert.doesNotMatch(
    source,
    /selection_set|selection_clear/,
  );
});

test("preview mantém um único write HTTP de Apply", () => {
  assert.equal(
    (source.match(/method:\s*"POST"/g) ?? []).length,
    1,
  );
});

test("operações de zona não usam o perfil estático", () => {
  for (const forbidden of [
    "fixMatchdayEditorialItemsAtPosition(profile,",
    "fixMatchdayEditorialItemsInZone(profile,",
    "moveMatchdayEditorialItemsToFaixa(profile,",
    "moveMatchdayEditorialItemsToBank(profile,",
    "returnMatchdayEditorialItemsToAutomatic(profile,",
    "releaseMatchdayEditorialFixedPositions(profile,",
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      forbidden,
    );
  }
});
