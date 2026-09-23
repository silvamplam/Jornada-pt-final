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

test("composição e candidatas ocupam duas colunas com scroll independente no desktop", () => {
  assert.match(
    source,
    /\.thematic-desk-grid \{ display: grid; grid-template-columns: minmax\(0,1\.15fr\) minmax\(460px,\.85fr\);/,
  );
  assert.match(source, /\.thematic-workspace-stack \{ display: grid;/);
  assert.match(
    source,
    /className=\{`thematic-desk-grid[\s\S]*className="thematic-workspace-stack"[\s\S]*renderOpeningWorkspace\(\)[\s\S]*renderActiveWorkspace\(\)[\s\S]*<\/section>\s*\{renderCandidates\(\)\}/,
  );
  assert.match(source, /\.thematic-workspace-section \{[^}]*overflow: visible;/);

  const desktopStart = source.indexOf("  @media (min-width: 1121px) {");
  const desktopEnd = source.indexOf(
    "  @media (min-width: 1121px) and (min-height: 800px) {",
    desktopStart,
  );
  assert.ok(desktopStart >= 0 && desktopEnd > desktopStart);
  const desktop = source.slice(desktopStart, desktopEnd);

  assert.match(
    desktop,
    /\.thematic-content \{ display: flex; flex-direction: column; height: calc\(100dvh - \d+px\); min-height: 0; \}/,
  );
  assert.match(desktop, /\.thematic-desk-grid \{ flex: 1; min-height: 0; align-items: stretch; \}/);
  assert.match(desktop, /\.thematic-workspace \{ min-height: 0; overflow: hidden; \}/);
  assert.match(
    desktop,
    /\.thematic-workspace-stack \{ min-height: 0; overflow-y: auto;[^}]*scrollbar-gutter: stable; \}/,
  );
  assert.match(
    desktop,
    /\.thematic-sources \{ display: flex; flex-direction: column; min-height: 0; overflow: hidden; \}/,
  );
  assert.match(
    desktop,
    /\.thematic-candidates-grid \{ flex: 1; min-height: 0;[^}]*overflow-y: auto;[^}]*scrollbar-gutter: stable; \}/,
  );
  assert.match(
    desktop,
    /\.thematic-candidates-grid \{[^}]*grid-auto-rows: max-content;/,
  );
  assert.match(
    source,
    /className="thematic-workspace-stack"[^>]*aria-label="Composição editorial"[^>]*role="region"[^>]*tabIndex=\{0\}/,
  );
  assert.match(
    source,
    /className="thematic-candidates-grid"[\s\S]*?aria-label="Lista de artigos candidatos"[\s\S]*?role="region"[\s\S]*?tabIndex=\{0\}/,
  );
});

test("selects de destino seguem a ordem vertical do draft", () => {
  assert.match(source, /const orderedZones = orderedZoneBlocks\.flatMap/);
  assert.equal((source.match(/orderedZones\.map\(\(zone\) =>/g) ?? []).length, 2);
  assert.doesNotMatch(source, /current\.zones\.map\(\(zone\) => <option/);
});

const candidates = source.slice(
  source.indexOf("function renderCandidates"),
  source.indexOf("function isZoneWorkspaceKey"),
);

test("cabeçalho das candidatas tem tabs e uma única linha de filtros e ações", () => {
  assert.match(candidates, /className="thematic-sources-toolbar">\s*<nav className="thematic-candidate-tabs"/u);
  assert.match(candidates, /<\/nav>\s*<div className="thematic-candidate-filters">/u);
  assert.match(candidates, /className="thematic-candidate-actions"[\s\S]*Pesquisar artigos candidatos[\s\S]*Selecionar visíveis/u);
  assert.match(candidates, /visibleCandidateEntries\.map\(\(entry\) => entry\.bankItemId\)/u);
  assert.doesNotMatch(candidates, /<h2>|A mostrar|Largar aqui|thematic-candidate-results|thematic-sources-toolbar-top/u);
  assert.match(source, /\.thematic-candidate-filters \{ display: flex; min-width: 0; gap: 4px; align-items: center; \}/u);
  assert.match(source, /\.thematic-candidate-actions \{ display: flex; flex: 0 0 auto;/u);
  assert.match(source, /\.thematic-candidate-filters nav button \{[^}]*white-space: nowrap;/u);
});

test("lupa alterna pesquisa e filtros na mesma linha sem apagar a pesquisa existente", () => {
  assert.match(source, /\[candidateSearchOpen, setCandidateSearchOpen\] = useState\(false\)/u);
  assert.match(candidates, /candidateSearchOpen \? \([\s\S]*className="thematic-reservoir-search"[\s\S]*\) : <nav aria-label="Filtrar candidatas por classificação"/u);
  assert.match(candidates, /aria-expanded=\{candidateSearchOpen\}/u);
  assert.match(candidates, /onClick=\{\(\) => setCandidateSearchOpen\(\(open\) => !open\)\}/u);
  assert.match(candidates, /onChange=\{\(event\) => setCandidateQuery\(event\.target\.value\)\}/u);
  assert.match(candidates, /value=\{candidateQuery\}/u);
  assert.match(candidates, /event\.key === "Escape"[\s\S]*setCandidateSearchOpen\(false\);[\s\S]*candidateSearchToggleRef\.current\?\.focus\(\)/u);
  assert.match(candidates, /data-query-active=\{normalizedCandidateQuery\.length > 0\}/u);
  assert.doesNotMatch(candidates, /setCandidateQuery\(""\)|fetch\(|applyChanges\(/u);
});
