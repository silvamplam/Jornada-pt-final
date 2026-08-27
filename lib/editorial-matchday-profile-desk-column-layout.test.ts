import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

test("Mesa deixou de distribuir clubes por três colunas hardcoded", () => {
  assert.doesNotMatch(source, /className="thematic-zone-column"/);
  assert.doesNotMatch(source, /renderZonePanel\("benfica"\)/);
  assert.doesNotMatch(source, /renderZonePanel\("sporting"\)/);
  assert.doesNotMatch(source, /renderZonePanel\("fc_porto"\)/);
  assert.match(
    source,
    /isZoneWorkspaceKey\(activeWorkspaceKey\)[\s\S]*renderZonePanel\(activeWorkspaceKey\)/,
  );
});

test("tabs e estrutura derivam de thematicBlockOrder", () => {
  const occurrences =
    source.match(
      /editorState\.draftPageControls\.thematicBlockOrder\.map/g,
    ) ?? [];

  assert.ok(occurrences.length >= 2);
  assert.match(source, /workspaceKeyForBlock\(block\)/);
  assert.match(source, /blockLabel\(block\)/);
  assert.match(source, /blockCount\(block\)/);
});

test("escolher um tab não muda a posição pública e reorder mantém o helper existente", () => {
  assert.match(source, /setActiveWorkspaceKey\(workspaceKey\)/);
  assert.match(source, /moveMatchdayEditorialProfileThematicBlock/);
  assert.match(source, /matchdayEditorialProfileThematicZoneOrderFromBlockOrder/);
  assert.doesNotMatch(
    source,
    /setActiveWorkspaceKey[\s\S]{0,200}moveContentBlock/,
  );
  assert.doesNotMatch(source, /style=\{\{\s*order:/);
});
