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

test("rail de zonas e estrutura derivam dos blocks físicos", () => {
  assert.match(
    source,
    /const orderedZoneBlocks = current\.blocks\.filter\(\(block\) => block\.kind === "zone"\)/,
  );
  assert.match(source, /orderedZoneBlocks\.map\(\(block\)/);
  assert.match(source, /current\.blocks\.map\(\(block, index\)/);
  assert.match(source, /workspaceKeyForBlock\(block\)/);
  assert.match(source, /blockLabel\(block\)/);
  assert.match(source, /blockCount\(block\)/);
});

test("reorder seleciona uma zona e usa duas setas externas", () => {
  const listStart = source.indexOf('className="thematic-zone-list"');
  const listEnd = source.indexOf("\n        </nav>", listStart);
  const zoneList = source.slice(listStart, listEnd);
  const controlsStart = source.indexOf('className="thematic-zone-move-controls"');
  const controlsEnd = source.indexOf("\n        </div>", controlsStart);
  const moveControls = source.slice(controlsStart, controlsEnd);

  assert.ok(listStart >= 0 && listEnd > listStart);
  assert.ok(controlsStart >= 0 && controlsEnd > controlsStart);
  assert.match(zoneList, /checked=\{selectedReorderZoneId === zone\.id\}/);
  assert.match(zoneList, /event\.target\.checked \? zone\.id : null/);
  assert.equal((zoneList.match(/type="checkbox"/g) ?? []).length, 1);
  assert.doesNotMatch(zoneList, /draggable|onDragStart/);
  assert.match(source, /movePhysicalDeskZone\(state, selectedReorderZoneId, direction\)/);
  assert.match(moveControls, /aria-label="Subir zona selecionada"/);
  assert.match(moveControls, /aria-label="Descer zona selecionada"/);
  assert.equal((moveControls.match(/<button/g) ?? []).length, 2);
  assert.doesNotMatch(source, /thematic-page-row-actions/);
  assert.doesNotMatch(source, /matchdayEditorialProfileThematicZoneOrderFromBlockOrder/);
  assert.doesNotMatch(source, /style=\{\{\s*order:/);
});

test("zonas aparecem numa coluna vertical à esquerda do workspace", () => {
  assert.match(
    source,
    /\.thematic-workspace \{ display: grid; grid-template-columns: 178px minmax\(0,1fr\);/,
  );
  assert.match(source, /\.thematic-zone-list \{ display: grid;/);
  assert.match(source, /aria-label="Lista vertical de zonas"/);
  assert.doesNotMatch(source, /thematic-zone-tabs/);
});

test("composição e candidatas ocupam as duas colunas sem cortar menus", () => {
  assert.match(
    source,
    /\.thematic-desk-grid \{ display: grid; grid-template-columns: minmax\(0,1\.15fr\) minmax\(460px,\.85fr\);/,
  );
  assert.match(source, /\.thematic-workspace-stack \{ display: grid;/);
  assert.match(
    source,
    /className=\{`thematic-desk-grid[\s\S]*className="thematic-workspace-stack"[\s\S]*renderOpeningWorkspace\(\)[\s\S]*renderActiveWorkspace\(\)[\s\S]*<\/section>\s*\{renderCandidates\(\)\}/,
  );
  assert.match(source, /\.thematic-workspace \{[^}]*overflow: visible;/);
  assert.match(source, /\.thematic-workspace-section \{[^}]*overflow: visible;/);
  assert.match(source, /\.thematic-sources \{[^}]*overflow: visible;/);
});

test("selects de destino seguem a ordem vertical do draft", () => {
  assert.match(source, /const orderedZones = orderedZoneBlocks\.flatMap/);
  assert.equal((source.match(/orderedZones\.map\(\(zone\) =>/g) ?? []).length, 2);
  assert.doesNotMatch(source, /current\.zones\.map\(\(zone\) => <option/);
});
