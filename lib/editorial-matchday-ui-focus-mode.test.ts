import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const state = readFileSync(
  "lib/editorial-matchday-live-layout-desk-state.ts",
  "utf8",
);

function sourceBetween(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0, `início em falta: ${startNeedle}`);
  assert.ok(end > start, `fim em falta depois de ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

test("modo foco nasce desligado e é refletido apenas no invólucro da Mesa", () => {
  assert.match(client, /const \[focusMode, setFocusMode\] = useState\(false\);/);
  assert.match(
    client,
    /<main className="thematic-shell" data-focus-mode=\{focusMode\}>/,
  );
});

test("mudar modo foco transfere o foco de teclado sem tocar no estado editorial", () => {
  const changeFocusMode = sourceBetween(
    client,
    "  function changeFocusMode(nextFocusMode: boolean) {",
    "\n\n  function resetLocal",
  );

  assert.match(client, /const enterFocusButtonRef = useRef<HTMLButtonElement>\(null\);/);
  assert.match(client, /const exitFocusButtonRef = useRef<HTMLButtonElement>\(null\);/);
  assert.match(changeFocusMode, /setFocusMode\(nextFocusMode\);/);
  assert.match(changeFocusMode, /requestAnimationFrame\(\(\) => \{/);
  assert.match(
    changeFocusMode,
    /\(nextFocusMode \? exitFocusButtonRef : enterFocusButtonRef\)\.current\?\.focus\(\);/,
  );
  assert.doesNotMatch(
    changeFocusMode,
    /setPhysicalDesk|setActiveWorkspaceKey|setOpeningVisible|fetch\(|router\./,
  );
});

test("nenhum effect ou handler da Abertura e das zonas altera o modo foco", () => {
  const changeFocusMode = sourceBetween(
    client,
    "  function changeFocusMode(nextFocusMode: boolean) {",
    "\n\n  function resetLocal",
  );
  const setterOccurrences = [...client.matchAll(/\bsetFocusMode\b/g)];

  assert.equal(setterOccurrences.length, 2);
  assert.ok(
    setterOccurrences[1].index !== undefined
      && setterOccurrences[1].index >= client.indexOf(changeFocusMode)
      && setterOccurrences[1].index < client.indexOf(changeFocusMode) + changeFocusMode.length,
  );

  const zoneRail = sourceBetween(
    client,
    "  function renderZoneRail() {",
    "\n\n  function undo()",
  );
  assert.match(zoneRail, /setOpeningVisible/);
  assert.match(zoneRail, /setActiveWorkspaceKey/);
  assert.doesNotMatch(zoneRail, /setFocusMode|changeFocusMode/);
});

test("barra compacta e controlos normais permanecem montados e são acessíveis", () => {
  const mainMarkup = client.slice(
    client.indexOf('<main className="thematic-shell" data-focus-mode={focusMode}>'),
  );

  assert.match(
    mainMarkup,
    /<header className="thematic-focus-bar" hidden=\{!focusMode\}>/,
  );
  assert.match(
    mainMarkup,
    /onClick=\{\(\) => changeFocusMode\(false\)\}[\s\S]*?ref=\{exitFocusButtonRef\}[\s\S]*?>Mostrar controlos<\/button>/,
  );
  assert.match(
    mainMarkup,
    /onClick=\{\(\) => changeFocusMode\(true\)\}[\s\S]*?ref=\{enterFocusButtonRef\}[\s\S]*?>Modo foco<\/button>/,
  );
  assert.match(mainMarkup, /<header className="thematic-hero">/);
  assert.match(mainMarkup, /<MatchdayEditorialContextSelector/);
  assert.match(mainMarkup, /<div className="thematic-global-tools">/);
});

test("CSS oculta apenas os controlos globais no foco e não desmonta o JSX", () => {
  assert.match(client, /\.thematic-focus-bar\[hidden\] \{ display: none; \}/);
  assert.match(
    client,
    /\.thematic-shell\[data-focus-mode=\\?"true\\?"\] \.thematic-hero,\s*\.thematic-shell\[data-focus-mode=\\?"true\\?"\] \.thematic-context-selector,\s*\.thematic-shell\[data-focus-mode=\\?"true\\?"\] \.thematic-global-tools \{ display: none; \}/,
  );
  assert.doesNotMatch(client, /focusMode \? null : renderZoneRail\(\)/);
});

test("Só Abertura é estado local e continua independente do modo foco", () => {
  assert.match(
    client,
    /const \[activeWorkspaceVisible, setActiveWorkspaceVisible\] = useState\(true\);/,
  );
  assert.match(
    client,
    /const openingOnly = openingVisible && !activeWorkspaceVisible;/,
  );
  assert.match(
    client,
    /<div className="thematic-workspace-stack" data-opening-only=\{openingOnly\}>[\s\S]*?openingVisible \? renderOpeningWorkspace\(\) : null[\s\S]*?renderActiveWorkspace\(\)/,
  );
  assert.match(
    client,
    /\.thematic-workspace-stack\[data-opening-only=\\?"true\\?"\] > :not\(#thematic-opening-workspace\) \{ display: none; \}/,
  );
  assert.match(client, /aria-pressed=\{openingOnly\}/);
  assert.match(
    client,
    /onClick=\{\(\) => setActiveWorkspaceVisible\(\(visible\) => !visible\)\}/,
  );
  assert.match(client, /openingOnly \? "Mostrar composição" : "Ver só Abertura"/);

  const zoneRail = sourceBetween(
    client,
    "  function renderZoneRail() {",
    "\n\n  function undo()",
  );
  assert.match(
    zoneRail,
    /setActiveWorkspaceKey\(zone\.id\);\s*setActiveWorkspaceVisible\(true\);/,
  );

  const changeFocusMode = sourceBetween(
    client,
    "  function changeFocusMode(nextFocusMode: boolean) {",
    "\n\n  function resetLocal",
  );
  assert.doesNotMatch(
    changeFocusMode,
    /activeWorkspaceVisible|openingOnly|setActiveWorkspaceVisible|setOpeningVisible/,
  );

  const applyChanges = sourceBetween(
    client,
    "  async function applyChanges() {",
    "\n\n  return (",
  );
  assert.doesNotMatch(
    state,
    /\bactiveWorkspaceVisible\b|\bopeningOnly\b|\bfocusMode\b/,
  );
  assert.doesNotMatch(
    applyChanges,
    /\bactiveWorkspaceVisible\b|\bopeningOnly\b|\bfocusMode\b/,
  );
});

test("imagem da zona usa a fração restante do viewport sem altura rígida", () => {
  const denseZoneCss = sourceBetween(
    client,
    "  @media (min-width: 1121px) and (min-height: 800px) {",
    "\n  @media (max-width: 1120px)",
  );

  assert.match(client, /data-fit-zone=\{selected\.size === 0\}/);
  assert.match(
    denseZoneCss,
    /\.thematic-desk-grid\[data-fit-zone=\\?"true\\?"\]:not\(\.opening-visible\)/,
  );
  assert.match(denseZoneCss, /height: calc\(100dvh - \d+px\);/);
  assert.match(
    denseZoneCss,
    /\.thematic-workspace-body \{ flex: 1; min-height: 0; grid-template-rows: auto minmax\(0,1fr\); \}/,
  );
  assert.match(
    denseZoneCss,
    /\.thematic-slots \{ min-height: 0; grid-auto-rows: minmax\(0,1fr\); \}/,
  );
  assert.match(
    denseZoneCss,
    /\.thematic-card \{ min-height: 0; grid-template-rows: minmax\(0,1fr\) auto; \}/,
  );
  assert.match(
    denseZoneCss,
    /\.thematic-image-placeholder \{ height: 100%; min-height: 0; aspect-ratio: auto; \}/,
  );
  assert.doesNotMatch(denseZoneCss, /[;{]\s*height:\s*\d+px/);
});

test("modo foco não entra no reducer nem no payload de Apply", () => {
  assert.doesNotMatch(state, /\bfocusMode\b|\bfocus_mode\b/);

  const applyChanges = sourceBetween(
    client,
    "  async function applyChanges() {",
    "\n\n  return (",
  );
  assert.match(
    applyChanges,
    /buildPhysicalDeskApplyPayload\(desk\.profileKey, physicalDesk\)/,
  );
  assert.doesNotMatch(applyChanges, /\bfocusMode\b|\bfocus_mode\b/);
});
