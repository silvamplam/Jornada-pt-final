import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

test("Mesa deixou de distribuir clubes por colunas ou chaves hardcoded", () => {
  assert.doesNotMatch(source, /className="thematic-zone-column"/);
  assert.doesNotMatch(source, /renderZonePanel\("benfica"\)/);
  assert.doesNotMatch(source, /renderZonePanel\("sporting"\)/);
  assert.doesNotMatch(source, /renderZonePanel\("fc_porto"\)/);
  assert.match(
    source,
    /isZoneWorkspaceKey\(activeWorkspaceKey\)[^\n]*renderZonePanel\(activeWorkspaceKey\)/,
  );
});

test("tabs e estrutura derivam dos blocks físicos", () => {
  const occurrences = source.match(/current\.blocks\.map/g) ?? [];
  assert.ok(occurrences.length >= 2);
  assert.match(source, /workspaceKeyForBlock\(block\)/);
  assert.match(source, /blockLabel\(block\)/);
  assert.match(source, /blockCount\(block\)/);
});

test("reorder usa MatchdayLiveLayoutBlock e preserva o seletor de foco", () => {
  assert.match(source, /setActiveWorkspaceKey\(workspaceKey\)/);
  assert.match(source, /movePhysicalDeskBlock\(state, block, "up"\)/);
  assert.match(source, /movePhysicalDeskBlock\(state, block, "down"\)/);
  assert.doesNotMatch(source, /matchdayEditorialProfileThematicZoneOrderFromBlockOrder/);
  assert.doesNotMatch(source, /style=\{\{\s*order:/);
});

test("menu da Mesa permanece horizontal acima do workspace", () => {
  assert.match(
    source,
    /\.thematic-workspace \{ display: grid; grid-template-columns: minmax\(0,1fr\);/,
  );
  assert.match(source, /\.thematic-zone-tabs \{ display: flex; flex-wrap: wrap;/);
  assert.doesNotMatch(source, /\.thematic-zone-tabs \{[^}]*flex-direction: column/);
  assert.doesNotMatch(source, /grid-template-columns: 150px/);
});
