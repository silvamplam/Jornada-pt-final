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
  const fullDeskStart = source.indexOf('{deskView === "full"');
  const columnMarker = '<div className="thematic-zone-column">';
  const leftStart = source.indexOf(columnMarker, fullDeskStart);
  const centerStart = source.indexOf(columnMarker, leftStart + 1);
  const rightStart = source.indexOf(columnMarker, centerStart + 1);
  const fullDeskEnd = source.indexOf("</section>", rightStart);
  const leftColumn = source.slice(leftStart, centerStart);
  const centerColumn = source.slice(centerStart, rightStart);
  const rightColumn = source.slice(rightStart, fullDeskEnd);

  assert.ok(
    fullDeskStart >= 0
    && leftStart > fullDeskStart
    && centerStart > leftStart
    && rightStart > centerStart
    && fullDeskEnd > rightStart,
  );

  assert.match(
    source,
    /\.thematic-zone-column/,
  );

  assert.match(
    leftColumn,
    /renderZonePanel\("benfica"\)[\s\S]*?renderZonePanel\("other_liga_clubs"\)[\s\S]*?thematic-bank-panel/,
  );

  assert.match(
    centerColumn,
    /renderZonePanel\("sporting"\)[\s\S]*?renderZonePanel\("outside_liga_other"\)/,
  );

  assert.match(
    rightColumn,
    /renderZonePanel\("fc_porto"\)[\s\S]*?!selectionPinnedForDrag[\s\S]*?renderEditorialSelectionPanel\(false\)/,
  );

  assert.doesNotMatch(leftColumn, /renderEditorialSelectionPanel/u);
  assert.doesNotMatch(centerColumn, /thematic-bank-panel|renderEditorialSelectionPanel/u);
  assert.doesNotMatch(rightColumn, /thematic-bank-panel/u);
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
