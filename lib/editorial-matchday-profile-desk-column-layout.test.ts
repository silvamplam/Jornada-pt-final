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

test("Mesa usa três colunas operacionais independentes", () => {
  assert.match(
    source,
    /\.thematic-zone-column/,
  );

  assert.match(
    source,
    /renderZonePanel\("benfica"\)[\s\S]*?renderZonePanel\("other_liga_clubs"\)[\s\S]*?thematic-latest-block/,
  );

  assert.match(
    source,
    /renderZonePanel\("sporting"\)[\s\S]*?renderZonePanel\("outside_liga_other"\)/,
  );

  assert.match(
    source,
    /renderZonePanel\("fc_porto"\)[\s\S]*?thematic-bank-panel/,
  );
});

test("posição visual da Mesa não altera thematicBlockOrder", () => {
  assert.match(
    source,
    /blockOrderIndex\.get\("latest"\)/,
  );

  assert.match(
    source,
    /moveMatchdayEditorialProfileThematicBlock/,
  );

  assert.doesNotMatch(
    source,
    /style=\{\{\s*order:\s*blockOrderIndex/,
  );
});

test("zonas mostram a posição pública real", () => {
  assert.match(
    source,
    /público · \{String\(publicPosition\)\.padStart/,
  );
});