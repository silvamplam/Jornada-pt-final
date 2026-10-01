import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);
const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);
const page = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);
const modernStyles = client.slice(
  client.indexOf("/* Mesa histórica modernizada"),
);

function cssRule(selector: string, css = modernStyles) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|[{}])\\s*${escapedSelector}\\s*\\{([^{}]*)\\}`));
  assert.ok(match, `regra CSS em falta: ${selector}`);
  return match[1];
}

function sourceBetween(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0, `início em falta: ${startNeedle}`);
  assert.ok(end > start, `fim em falta depois de ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

test("a Mesa Histórica está dividida em rail, zona ativa e candidatos", () => {
  assert.match(
    modernStyles,
    /\.hc-desk-workspace \{[^}]*display: grid;[^}]*grid-template-columns: 188px minmax\(0, 1\.12fr\) minmax\(0, 1fr\);/,
  );
  assert.match(client, /<aside className="hc-zone-rail" aria-label="Zonas da Composição">/);
  assert.match(client, /<section className="hc-desk-map" aria-label="Zona ativa da Composição"/);
  assert.match(client, /className="hc-desk-library"[\s\S]*?aria-label="Artigos e candidatos"/);
});

test("a rail é navegação vertical e mudar zona não altera o plano", () => {
  const rail = sourceBetween(
    client,
    '        <aside className="hc-zone-rail"',
    "\n\n        <section",
  );
  const pendingCount = sourceBetween(
    client,
    "  const pendingCount = useMemo(() => {",
    "\n\n  useEffect(() => {",
  );

  assert.match(rail, /aria-label="Lista vertical de zonas"/);
  assert.match(rail, /aria-pressed=\{activeWorkspaceKey === "opening"\}/);
  assert.match(rail, /setActiveWorkspaceKey\("opening"\)/);
  assert.match(rail, /setActiveWorkspaceKey\(workspaceKey\)/);
  assert.doesNotMatch(rail, /commit\(|setPlan|setHistory|fetch\(/);
  assert.doesNotMatch(pendingCount, /activeWorkspaceKey|focusMode|historicalDecisionFilter|selectedGroupKey|search/);
});

test("workspace usa duas colunas e ganha uma terceira em ecrãs largos; candidatos mantêm duas", () => {
  assert.match(cssRule(".hc-desk-list"), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  const slots = ".hc-desk-slots, .hc-desk-slots-4, .hc-desk-slots-5, .hc-desk-slots-6, .hc-desk-slots-faixa";
  assert.match(cssRule(slots), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  const wideStart = modernStyles.indexOf("@media (min-width: 1600px)");
  assert.ok(wideStart >= 0);
  const wideStyles = modernStyles.slice(wideStart, modernStyles.indexOf("@media", wideStart + 1));
  assert.match(cssRule(slots, wideStyles), /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(cssRule(".hc-desk-row"), /grid-template-columns: 104px minmax\(0, 1fr\);/);
  assert.match(cssRule(".hc-desk-list"), /grid-auto-rows: 124px;/);
  assert.match(cssRule(".hc-desk-row"), /grid-template-rows: 28px 80px;[^}]*height: 124px;/);
  assert.match(cssRule(".hc-desk-row-image"), /grid-column: 1;[^}]*grid-row: 2;[^}]*height: 80px;/);
  assert.match(cssRule(".hc-desk-row > .hc-desk-copy"), /display: contents;/);
  assert.match(cssRule(".hc-desk-row > .hc-desk-copy > .hc-desk-meta"), /grid-column: 1 \/ -1;[^}]*grid-row: 1;[^}]*height: 28px;/);
  assert.match(cssRule(".hc-desk-row > .hc-desk-copy > strong"), /grid-column: 2;[^}]*grid-row: 2;[^}]*max-height: 80px;/);
  assert.match(cssRule(".hc-desk-copy strong"), /overflow: hidden;[^}]*-webkit-line-clamp: 4;/);
  assert.match(cssRule(".hc-desk-card-media"), /height: clamp\(128px, 11vw, 176px\);/);
  assert.match(client, /activeWorkspaceKey === "opening" && openingSection/);
  assert.match(client, /activeDynamicZone \?/);
  assert.match(client, /activeWorkspaceKey === "editorial"/);
  assert.match(client, /activeWorkspaceKey === "highlight"/);
  assert.match(client, /activeWorkspaceKey === "faixa"/);
});

test("filtros de estado, classificação e pesquisa continuam combinatórios", () => {
  assert.match(
    client,
    /filterHistoricalCompositionReservoir\([\s\S]*?selectedGroupKeys,[\s\S]*?search,[\s\S]*?historicalDecisionFilter,/,
  );
  assert.match(client, /Todos \(\{historicalDecisionCounts\.all\}\)/);
  assert.match(client, /Sem decisão \(\{historicalDecisionCounts\.undecided\}\)/);
  assert.match(client, /Bank \(\{historicalDecisionCounts\.bank\}\)/);
  assert.match(client, /Histórica \(\{historicalDecisionCounts\.selected\}\)/);
  assert.match(client, /groups\.map\(\(group\) =>/);
  assert.match(client, /aria-label="Pesquisar artigos"/);
});

test("o topo dos candidatos tem duas linhas, lupa e nenhuma ordenação visível", () => {
  const toolbar = sourceBetween(
    client,
    "  const articleToolbar = (",
    "\n\n  const selectionContext",
  );

  assert.match(toolbar, /className="hc-desk-scope"/);
  assert.match(toolbar, /className="hc-desk-filter-row"/);
  assert.match(toolbar, /candidateSearchOpen \? \([\s\S]*?type="search"/);
  assert.match(toolbar, /className="hc-desk-search-toggle"/);
  assert.match(toolbar, /className="hc-desk-visible-selection"/);
  assert.doesNotMatch(toolbar, /hc-desk-toolbar-status|hc-desk-selection-actions|aria-label="Ordenação"/);
  assert.doesNotMatch(client, /articleOrder|setArticleOrder|Mais recentes|Mais antigos/);
  assert.match(cssRule(".hc-desk-groups"), /flex-wrap: wrap;/);
  assert.match(cssRule(".hc-desk-groups"), /overflow: visible;/);
  assert.match(cssRule(".hc-desk-groups button"), /flex: 0 0 auto;/);
  assert.match(cssRule(".hc-desk-groups button"), /white-space: nowrap;/);
  assert.match(cssRule(".hc-desk-toolbar.selection-mode"), /overflow: visible;/);
});

test("checkbox e ação do cartão ficam estruturalmente sobre a imagem", () => {
  assert.match(
    client,
    /<span className="hc-desk-row-image">[\s\S]*?<input[\s\S]*?type="checkbox"[\s\S]*?<BackofficeImage/,
  );
  assert.match(
    modernStyles,
    /\.hc-desk-row-image > input \{[^}]*position: absolute;[^}]*top: 6px;[^}]*left: 6px;/,
  );
  assert.match(
    modernStyles,
    /\.hc-desk-card button \{[^}]*position: absolute;[^}]*top: 6px;[^}]*right: 6px;/,
  );
});

test("Selecionar visíveis e Limpar são o mesmo controlo contextual", () => {
  const toggle = sourceBetween(
    client,
    "  function toggleVisibleSelection() {",
    "\n\n  const openingSection",
  );

  assert.match(toggle, /selectedBankItemIds\.length > 0[\s\S]*?setSelectedBankItemIds\(\[\]\)/);
  assert.match(toggle, /visibleArticles\.map\(\(article\) => article\.bankItemId\)/);
  assert.match(client, /onClick=\{toggleVisibleSelection\}/);
  assert.match(client, /selectedBankItemIds\.length > 0 \? "Limpar" : "Selecionar visíveis"/);
  assert.equal((client.match(/Selecionar visíveis/g) ?? []).length, 1);
});

test("centro e painel direito têm scroll independente sem medições frágeis", () => {
  assert.match(modernStyles, /\.hc-desk-map \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
  assert.match(modernStyles, /\.hc-desk-scroll \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
  assert.match(modernStyles, /\.hc-zone-rail \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
  assert.doesNotMatch(client, /ResizeObserver|addEventListener\(["']resize|offsetHeight|clientHeight/);
  assert.match(cssRule(".hc-desk-scroll"), /overscroll-behavior: contain;[^}]*scrollbar-gutter: stable;/);
  assert.match(cssRule(".hc-desk-map"), /overscroll-behavior: contain;[^}]*scrollbar-gutter: stable;/);
  assert.match(cssRule(".hc-desk-map:focus-visible, .hc-desk-scroll:focus-visible"), /outline: 2px solid/);
});

test("Modo foco é local, persistente e não entra no dirty state nem no payload", () => {
  const changeFocusMode = sourceBetween(
    client,
    "  function changeFocusMode(nextFocusMode: boolean) {",
    "\n\n  function toggleVisibleSelection",
  );
  const applyChanges = sourceBetween(
    client,
    "  async function applyChanges() {",
    "\n\n  function renderCard",
  );

  assert.match(client, /const \[focusMode, setFocusMode\] = useState\(false\);/);
  assert.match(client, /<section className="hc-desk-shell" data-focus-mode=\{focusMode\}>/);
  assert.match(client, />\s*Modo foco\s*<\/button>/);
  assert.match(client, />\s*Mostrar controlos\s*<\/button>/);
  assert.match(changeFocusMode, /setFocusMode\(nextFocusMode\)/);
  assert.doesNotMatch(changeFocusMode, /setPlan|commit\(|fetch\(|router\./);
  assert.doesNotMatch(applyChanges, /focusMode|focus_mode|activeWorkspaceKey|historicalDecisionFilter|selectedGroupKey|search/);
  assert.match(modernStyles, /\.hc-desk-shell\[data-focus-mode="true"\] \.hc-desk-top-tools \{\s*display: none;/);
  assert.match(cssRule('.hc-desk-shell[data-focus-mode="true"] .hc-desk-map-heading'), /display: none;/);
  assert.match(cssRule(".hc-desk-map-heading"), /display: flex;/);
  assert.match(client, /<header className="hc-focus-bar" hidden=\{!focusMode\}>/);
  assert.match(client, /Jornada \{String\(matchdayNumber\)\.padStart\(2, "0"\)\} · \{activeWorkspaceLabel\}/);
  assert.match(modernStyles, /\.hc-desk-shell\[data-focus-mode="true"\] \.hc-focus-entry \{[\s\S]*?display: none;/);
  assert.match(modernStyles, /\.composition-admin-shell-desk:has\(> \.hc-desk-shell\[data-focus-mode="true"\]\)/);
});

test("os quatro menus ficam disponíveis no modo normal e recolhidos no modo compacto", () => {
  const topTools = sourceBetween(
    client,
    '      <div className="hc-desk-tools hc-desk-top-tools"',
    "\n      {selectionContext}",
  );

  assert.match(cssRule(".hc-desk-top-tools"), /grid-template-columns: repeat\(4, max-content\) minmax\(0, 1fr\);[^}]*border: 0;[^}]*border-bottom: 1px solid #cbd5dc;[^}]*background: transparent;/);
  assert.match(cssRule(".hc-desk-top-tools > .hc-desk-tool > summary"), /min-height: 30px;[^}]*letter-spacing: 0;[^}]*text-transform: none;/);
  assert.match(modernStyles, /\.hc-desk-top-tools > \.hc-desk-tool > summary::after/);
  assert.match(topTools, /<summary>Página e blocos<\/summary>[\s\S]*?\{children\}[\s\S]*?Modo foco/);
  assert.match(page, /className="hc-desk-tool hc-desk-video-tool" name="composition-tools">\s*<summary>Vídeo \+ Destaque<\/summary>/);
  assert.match(page, /className="hc-desk-tool hc-desk-publish-tool" name="composition-tools">\s*<summary>Publicar composição<\/summary>/);
  assert.match(page, /className="hc-desk-tool hc-desk-preview-tool" name="composition-tools">\s*<summary>Pré-visualização<\/summary>/);
  assert.match(cssRule(".hc-desk-top-tools"), /display: grid;/);
  const compactToolRules = [...modernStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1].includes('[data-focus-mode="true"]') && match[1].includes(".hc-desk-top-tools"));
  assert.equal(compactToolRules.length, 1, "Nenhum breakpoint deve voltar a mostrar os menus em modo compacto");
  assert.match(compactToolRules[0][2], /display: none;/);
  assert.match(client, /\.hc-desk-preview-tool\[open\] > \.hc-desk-tool-body/);
});

test("Guardar montagem e a RPC transacional conservam o contrato", () => {
  const applyChanges = sourceBetween(
    client,
    "  async function applyChanges() {",
    "\n\n  function renderCard",
  );

  assert.match(applyChanges, /action_type",\s*"apply_hierarchical_desk_plan"/);
  assert.match(applyChanges, /operations_json/);
  assert.match(applyChanges, /settings_json/);
  assert.match(applyChanges, /dynamic_zones_json/);
  assert.doesNotMatch(applyChanges, /focusMode|activeWorkspaceKey|historicalDecisionFilter|selectedGroupKey|search/);
  assert.match(route, /actionType === "apply_hierarchical_desk_plan"/);
  assert.match(route, /rpc\/apply_historical_composition_workspace_plan_v3/);
});
