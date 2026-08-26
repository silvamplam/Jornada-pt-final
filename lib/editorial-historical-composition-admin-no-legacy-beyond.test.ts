import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);

test("dynamic historical composition hides legacy beyond-matchday UI", () => {
  assert.match(
    source,
    /showBeyondMatchday=\{!hasHistoricalDynamicZones\}/,
  );

  assert.match(
    source,
    /\.\.\.\(showBeyondMatchday \? HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS/,
  );

  const legacyMap = source.indexOf(
    "HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS.map((position) => {",
  );
  assert.ok(legacyMap >= 0);

  const conditional = source.lastIndexOf(
    "{showBeyondMatchday ? (",
    legacyMap,
  );
  assert.ok(conditional >= 0);

  const card = source.indexOf(
    "Momentos posteriores aos 15 lugares",
  );
  assert.ok(card >= 0);

  const dynamicDecision = source.lastIndexOf(
    "hasHistoricalDynamicZones ?",
    card,
  );
  assert.ok(dynamicDecision >= 0);
});