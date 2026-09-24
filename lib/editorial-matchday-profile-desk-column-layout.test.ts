import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

function cssRule(selector: RegExp) {
  const rule = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find((match) => selector.test(match[1]));
  assert.ok(rule, `regra CSS em falta: ${selector}`);
  return { selector: rule[1], declarations: rule[2] };
}

test("todos os cartões partilham imagem larga e controlos sobrepostos com contraste", () => {
  const image = cssRule(/^\s*\.thematic-image,\s*\.thematic-image-placeholder\s*$/).declarations;
  assert.match(image, /grid-column:\s*1\s*\/\s*-1;/);
  assert.match(image, /grid-row:\s*1;/);
  assert.match(image, /width:\s*100%;/);
  assert.match(image, /aspect-ratio:\s*16\s*\/\s*9;/);

  const checkbox = cssRule(/^\s*\.thematic-card input\[type="checkbox"\]\s*$/).declarations;
  assert.match(checkbox, /grid-column:\s*1;/);
  assert.match(checkbox, /grid-row:\s*1;/);
  assert.match(checkbox, /z-index:\s*1;/);
  assert.match(checkbox, /outline:\s*2px solid #fff;/);
  assert.match(checkbox, /box-shadow:\s*0 0 0 4px rgba\(15,23,42,\.45\);/);

  const menu = cssRule(/^\s*\.thematic-card-menu\s*$/).declarations;
  assert.match(menu, /grid-column:\s*3;/);
  assert.match(menu, /grid-row:\s*1;/);
  assert.match(menu, /z-index:\s*1;/);
  assert.match(cssRule(/^\s*\.thematic-card-menu summary\s*$/).declarations, /background:\s*#fff;/);
  assert.match(cssRule(/^\s*\.thematic-card-menu\[open\]\s*$/).declarations, /z-index:\s*15;/);
});

test("checkboxes de Faixa e candidatas conservam o foco nativo de teclado", () => {
  const focus = cssRule(/\.thematic-card input\[type="checkbox"\]:focus-visible/);
  assert.match(focus.selector, /\.thematic-faixa-slots/);
  assert.match(focus.selector, /\.thematic-candidates-grid/);
  assert.doesNotMatch(focus.selector, /thematic-workspace-section|thematic-opening-workspace|data-zone-id/);
  assert.match(focus.declarations, /outline:\s*revert;/);
});

test("só Faixa e candidatas conservam a altura da antiga coluna da imagem", () => {
  const spacer = cssRule(/\.thematic-card::before/);
  assert.match(spacer.selector, /\.thematic-faixa-slots/);
  assert.match(spacer.selector, /\.thematic-candidates-grid/);
  assert.doesNotMatch(spacer.selector, /thematic-workspace-section|thematic-opening-workspace|data-zone-id/);
  assert.match(spacer.declarations, /content:\s*"";/);
  assert.match(spacer.declarations, /grid-column:\s*2;/);
  assert.match(spacer.declarations, /grid-row:\s*1;/);
  assert.match(spacer.declarations, /width:\s*100%;/);
  assert.match(spacer.declarations, /aspect-ratio:\s*16\s*\/\s*9;/);

  const image = cssRule(/\.thematic-faixa-slots[^{}]*\.thematic-image-placeholder/);
  assert.match(image.selector, /\.thematic-candidates-grid/);
  assert.doesNotMatch(image.selector, /thematic-workspace-section|thematic-opening-workspace|data-zone-id/);
  assert.match(image.declarations, /position:\s*absolute;/);
  assert.match(image.declarations, /grid-row:\s*1\s*\/\s*2;/);
  assert.match(image.declarations, /inset:\s*0;/);
  assert.match(image.declarations, /height:\s*100%;/);
});

test("Abertura e zonas mantêm a geometria e não recebem a reserva de altura", () => {
  const scope = String.raw`\.thematic-workspace-section:is\(\[data-zone-id\], #thematic-opening-workspace\)`;
  assert.match(cssRule(new RegExp(`^\\s*${scope} \\.thematic-card\\s*$`)).declarations, /gap: 4px; padding: 6px;/);
  assert.match(cssRule(new RegExp(`^\\s*${scope} \\.thematic-card > \\.thematic-card-copy\\s*$`)).declarations, /gap: 3px;/);
  assert.match(cssRule(new RegExp(`^\\s*${scope} \\.thematic-card-title\\s*$`)).declarations, /-webkit-line-clamp: 3;/);
});

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

test("rail e estrutura derivam dos blocks físicos sem autoridade paralela", () => {
  assert.match(
    source,
    /const orderedZoneBlocks = current\.blocks\.filter\(\(block\) => block\.kind === "zone"\)/,
  );
  assert.match(source, /const railOrderBlocks = current\.blocks\.filter\(/);
  assert.match(
    source,
    /block\.kind === "zone" \|\| block\.kind === "video"/,
  );
  assert.match(source, /railOrderBlocks\.map\(\(block\)/);
  assert.match(source, /pageStructureBlocks = current\.blocks\.filter\(/);
  assert.match(source, /block\.kind !== "latest"/);
  assert.match(source, /pageStructureBlocks\.map\(\(block, index\)/);
  assert.match(source, /workspaceKeyForBlock\(block\)/);
  assert.match(source, /blockLabel\(block\)/);
  assert.match(source, /blockCount\(block\)/);
});

test("reorder seleciona uma zona ou Destaque e usa duas setas externas", () => {
  const listStart = source.indexOf('className="thematic-zone-list"');
  const listEnd = source.indexOf("\n        </nav>", listStart);
  const railList = source.slice(listStart, listEnd);
  const controlsStart = source.indexOf('className="thematic-zone-move-controls"');
  const controlsEnd = source.indexOf("\n        </div>", controlsStart);
  const moveControls = source.slice(controlsStart, controlsEnd);
  const secondaryStart = source.indexOf('className="thematic-secondary-workspaces"');
  const secondaryEnd = source.indexOf("\n        </div>", secondaryStart);
  const secondary = source.slice(secondaryStart, secondaryEnd);

  assert.ok(listStart >= 0 && listEnd > listStart);
  assert.ok(controlsStart >= 0 && controlsEnd > controlsStart);
  assert.ok(secondaryStart >= 0 && secondaryEnd > secondaryStart);
  assert.match(railList, /railOrderBlocks\.map\(\(block\)/);
  assert.match(railList, /workspaceKeyForBlock\(block\)/);
  assert.match(railList, /checked=\{selectedReorderBlockId === block\.id\}/);
  assert.match(railList, /event\.target\.checked \? block\.id : null/);
  assert.equal((railList.match(/type="checkbox"/g) ?? []).length, 1);
  assert.doesNotMatch(railList, /latest|draggable|onDragStart/);
  assert.match(
    source,
    /movePhysicalDeskRailBlock\([\s\S]*selectedReorderBlockId,[\s\S]*direction/,
  );
  assert.match(moveControls, /aria-label="Subir item selecionado"/);
  assert.match(moveControls, /aria-label="Descer item selecionado"/);
  assert.equal((moveControls.match(/<button/g) ?? []).length, 2);
  assert.match(secondary, /Faixa/);
  assert.doesNotMatch(secondary, /Destaque|highlight/);
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

test("ação das candidatas alterna entre selecionar as visíveis e limpar a seleção", () => {
  const actionStart = candidates.indexOf('className="thematic-candidate-actions"');
  const actionEnd = candidates.indexOf("</section>", actionStart);
  const action = candidates.slice(actionStart, actionEnd);

  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  assert.match(action, /selected\.size === 0 && visibleCandidateEntries\.length === 0/u);
  assert.match(action, /selected\.size > 0[\s\S]*selectItems\(\[\]\)[\s\S]*return;/u);
  assert.match(action, /selectItems\([\s\S]*visibleCandidateEntries\.map\(\(entry\) => entry\.bankItemId\)[\s\S]*\)/u);
  assert.match(action, /selected\.size > 0 \? "Limpar" : "Selecionar visíveis"/u);
  assert.equal((action.match(/Selecionar visíveis/g) ?? []).length, 1);
  assert.equal((action.match(/Limpar/g) ?? []).length, 1);
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
