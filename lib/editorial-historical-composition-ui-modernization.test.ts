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
const modernStyles = client.slice(
  client.indexOf("/* Mesa histórica modernizada"),
);

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
    /\.hc-desk-workspace \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(145px, 170px\) minmax\(0, 1\.08fr\) minmax\(0, 1fr\);/,
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

test("centro e candidatos usam três cartões por linha no desktop", () => {
  assert.match(
    modernStyles,
    /\.hc-desk-list \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    modernStyles,
    /\.hc-desk-slots,[\s\S]*?\.hc-desk-slots-faixa \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  );
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
});

test("checkbox e ação do cartão ficam estruturalmente sobre a imagem", () => {
  assert.match(
    client,
    /<span className="hc-desk-row-image">[\s\S]*?<input[\s\S]*?type="checkbox"[\s\S]*?<BackofficeImage/,
  );
  assert.match(
    modernStyles,
    /\.hc-desk-row-image > input \{[\s\S]*?position: absolute;[\s\S]*?top: 9px;[\s\S]*?left: 9px;/,
  );
  assert.match(
    modernStyles,
    /\.hc-desk-card button \{[\s\S]*?position: absolute;[\s\S]*?top: 9px;[\s\S]*?right: 9px;/,
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
  assert.match(modernStyles, /\.hc-desk-shell\[data-focus-mode="true"\] \.hc-desk-top-tools \{[\s\S]*?display: grid;/);
  assert.match(modernStyles, /\.hc-desk-shell\[data-focus-mode="true"\] \.hc-focus-entry \{[\s\S]*?display: none;/);
  assert.match(modernStyles, /\.composition-admin-shell-desk:has\(> \.hc-desk-shell\[data-focus-mode="true"\]\)/);
});

test("os menus superiores seguem a hierarquia visual da Editorial também em foco", () => {
  const topTools = sourceBetween(
    client,
    '      <div className="hc-desk-tools hc-desk-top-tools"',
    "\n      {selectionContext}",
  );

  assert.match(modernStyles, /\.hc-desk-top-tools \{[\s\S]*?grid-template-columns: repeat\(4, max-content\) minmax\(0, 1fr\);[\s\S]*?border: 1px solid #d7e0e9;[\s\S]*?background: #ffffff;/);
  assert.match(modernStyles, /\.hc-desk-top-tools > \.hc-desk-tool > summary \{[\s\S]*?min-height: 30px;[\s\S]*?letter-spacing: \.055em;/);
  assert.match(modernStyles, /\.hc-desk-top-tools > \.hc-desk-tool > summary::after/);
  assert.match(topTools, /<summary>Página e blocos<\/summary>[\s\S]*?\{children\}[\s\S]*?Modo foco/);
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
