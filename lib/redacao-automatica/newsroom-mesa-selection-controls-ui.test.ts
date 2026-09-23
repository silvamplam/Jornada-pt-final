import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mesaPath = "app/admin/editorial/redacao-automatica/mesa/";
const organization = readFileSync(`${mesaPath}_mesa-organization-client.tsx`, "utf8");
const selection = readFileSync(`${mesaPath}_mesa-selection-client.tsx`, "utf8");
const css = readFileSync(`${mesaPath}mesa.module.css`, "utf8");

function between(source: string, start: string, end: string): string {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing source boundary: ${start} / ${end}`);
  return source.slice(first, last);
}

test("Selecionar e Limpar partilham o slot à direita das fontes, fora de Temas", () => {
  const panel = organization.slice(organization.indexOf("export function MesaLooseSourcesPanel("));
  const header = between(panel, "<header className={styles.panelHeader}>", "</header>");
  assert.match(header, /<nav aria-label="Fontes">/);
  assert.match(header, /<\/nav>\s*<span id="mesa-selection-control" className=\{styles\.sourceSelectionControl\}>/);
  assert.equal((organization.match(/id="mesa-selection-control"/g) ?? []).length, 1);
  assert.match(header, /!hasSelection && tab !== "archive" \? <button/);
  assert.match(header, /className=\{styles\.sourceSelectionButton\}/);
  assert.doesNotMatch(header, />\s*Limpar\s*<|MesaOrganizationPanel|MesaThemeSelectionToggle/);
  assert.match(selection, /document\.getElementById\("mesa-selection-control"\)/);
  assert.match(selection, /loaded && total > 0 && selectionControlTarget\s*\? createPortal\(clearSelectionButton, selectionControlTarget\)/);
});

test("alternância conta fontes, Temas e Dossiês sem alterar a seleção em lote", () => {
  assert.match(organization, /const hasSelection = buffer\.sources\.length \+ \(buffer\.themes\?\.length \?\? 0\) \+ \(buffer\.dossiers\?\.length \?\? 0\) > 0/);
  assert.match(selection, /const total = buffer\.sources\.length \+ selectedThemes\.length \+ dossiers\.length/);
  const totalDefinition = selection.match(/const total = ([^;]+);/)?.[1];
  assert.ok(totalDefinition);
  assert.equal(totalDefinition, "buffer.sources.length + selectedThemes.length + dossiers.length");
  assert.doesNotMatch(totalDefinition, /title|preparationKey|themeId/);
  assert.match(selection, /const selectedThemes = buffer\.themes \?\? \[\]/);
  assert.match(selection, /const dossiers = buffer\.dossiers \?\? \[\]/);
  assert.match(organization, /MESA_MAX_NEWSROOM_SOURCES - buffer\.sources\.length/);
  assert.match(organization, /bulkSelection = unselectedItems\.slice\(0, remainingSelectionSlots\)/);
  assert.match(organization, /disabled=\{!loaded \|\| bulkSelection\.length === 0\}/);
  assert.match(organization, /onClick=\{\(\) => bulkSelection\.forEach\(\(material\) => select\(material\)\)\}/);
});

test("Limpar reutiliza o mesmo handler completo e o bloqueio de submissão", () => {
  const clearButton = between(selection, "const clearSelectionButton = (", "const selectionControlTarget =");
  assert.match(clearButton, /className=\{sourceThemeActions \? styles\.sourceSelectionButton : undefined\}/);
  assert.match(clearButton, /setThemeAction\(null\); setOrganizing\(false\); setTargetTheme\(""\); setMessage\(""\); setSelectionPanelOpen\(false\); clear\(\);/);
  assert.match(clearButton, /disabled=\{submitting\}/);
  assert.equal((clearButton.match(/\bclear\(\)/g) ?? []).length, 1);
  assert.equal((selection.match(/>\s*Limpar\s*<\/button>/g) ?? []).length, 1);
  assert.doesNotMatch(organization, /\bclear\(\)|clearMesaPreparationBuffer/);
  assert.doesNotMatch(clearButton, /fetch\(|router\.|sessionStorage|localStorage/);
  assert.match(selection, /\{clearSelectionButton\}/);
});

test("barra só existe com seleção real, sem resumo destacado nem Limpar duplicado", () => {
  assert.match(selection, /if \(!loaded \|\| total === 0\) return null/);
  assert.doesNotMatch(selection, /if \(!sourceThemeActions && \(!loaded \|\| total === 0\)\)/);
  assert.ok(selection.indexOf("if (!loaded || total === 0) return null;") < selection.indexOf("const clearSelectionButton = ("));
  assert.match(selection, /aria-label=\{sourceThemeActions \? "Ações da seleção" : undefined\}/);
  assert.match(selection, /aria-labelledby=\{sourceThemeActions \? undefined : "mesa-selection-title"\}/);
  const summary = between(selection, "{!sourceThemeActions ? <div className={styles.selectionSummary}>", "<div className={styles.selectionActions}>");
  assert.match(summary, /\{total\} selecionadas/);
  assert.match(summary, /\{clearSelectionButton\}/);
  assert.match(summary, /fontes soltas/);
  assert.match(summary, /<\/div> : null\}/);
  const actions = between(selection, "<div className={styles.selectionActions}>", "{sourceThemeActions && selectionPanelOpen");
  assert.match(actions, /sourceThemeActions && loaded && total > 0 && !selectionControlTarget\s*\? clearSelectionButton\s*: null/);
  assert.match(actions, /aria-label="Título de trabalho"/);
  assert.match(actions, /Criar tema/);
  assert.match(actions, /Adicionar a tema/);
  assert.match(actions, /DESCARTAR/);
  assert.doesNotMatch(actions, />\s*Limpar\s*</);
});

test("Ver seleção conserva toggle e portal e usa as mesmas cores de Atualizar", () => {
  const toggle = between(selection, "className={styles.selectionPanelToggle}", "</button>");
  assert.match(toggle, /aria-expanded=\{selectionPanelOpen\}/);
  assert.match(toggle, /aria-controls="mesa-selection-panel"/);
  assert.match(toggle, /onClick=\{\(\) => setSelectionPanelOpen\(\(open\) => !open\)\}/);
  assert.match(toggle, /disabled=\{submitting\}/);
  assert.match(selection, /sourceThemeActions && selectionPanelOpen && typeof document !== "undefined" \? createPortal/);
  const refreshStyle = css.match(/\.sourceFilter button,\s*\.refreshFilter button,\s*\.manualSourceToggle \{\s*(border-color:[^}]+)\}/)?.[1];
  const toggleStyle = css.match(/\.selectionActions \.selectionPanelToggle,[\s\S]*?\{([^}]+)\}/)?.[1];
  assert.ok(refreshStyle && toggleStyle);
  for (const property of ["border-color", "color", "background"]) {
    const value = new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`);
    assert.equal(toggleStyle.match(value)?.[1], refreshStyle.match(value)?.[1], property);
    assert.ok(toggleStyle.match(value), property);
  }
});

test("slot mantém dimensões e grid não reserva altura da barra sem seleção", () => {
  const workspace = between(css, ".workspaceChrome {", "}");
  assert.match(workspace, /grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.doesNotMatch(workspace, /grid-template-rows: auto auto|padding-top|height: [1-9]/);
  const workspaceWithTray = between(css, ".workspaceChrome:has(> .controlStrip + .selectionTray) {", "}");
  assert.match(workspaceWithTray, /grid-template-rows: auto auto minmax\(0, 1fr\)/);
  const control = between(css, ".sourceSelectionControl {", "}");
  assert.match(control, /flex: 0 0 84px/);
  assert.match(control, /width: 84px/);
  assert.match(control, /height: 30px/);
  assert.match(control, /margin-left: auto/);
  const button = between(css, ".sourceSelectionControl .sourceSelectionButton {", "}");
  assert.match(button, /width: 100%/);
  assert.match(button, /height: 100%/);
  assert.match(css, /\.selectionSummary button,\s*\.sourceSelectionButton,/);
  const tray = between(css, '.selectionTray[data-source-theme-actions="true"] {', "}");
  assert.match(tray, /min-height: 0/);
  assert.match(tray, /gap: 0/);
  assert.match(tray, /box-shadow: none/);
  assert.match(css, /\.selectionTray\[data-source-theme-actions="true"\] \.selectionTrayHeader \{\s*min-height: 30px/);
});

test("classificação mantém condição e guardas originais sem alterar o fluxo editorial", () => {
  assert.match(selection, /\{classificationBatchAvailable \? \(/);
  assert.doesNotMatch(selection, /\{sourceThemeActions \|\| classificationBatchAvailable \? \(/);
  const batch = between(selection, '<div className={styles.batchClassification}>', "</div>");
  assert.match(batch, /disabled=\{submitting\}/);
  assert.match(batch, /disabled=\{submitting \|\| !batchClassificationKey\}/);
  assert.match(batch, /onClick=\{\(\) => void classifySelection\(\)\}/);
  assert.match(selection, /async function classifySelection\(\) \{\s*if \(!classificationBatchAvailable \|\| !batchClassificationKey\) return/);
});
