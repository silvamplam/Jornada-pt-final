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

test("Mesa deriva capacidade do layout em draft", () => {
  assert.match(
    source,
    /editorialProfileWithZoneLayouts\(\s*profile,\s*editorState\.draftPageControls\.thematicZoneLayouts/,
  );

  assert.match(
    source,
    /const effectiveProfile = useMemo/,
  );

  assert.match(
    source,
    /reconcileMatchdayEditorialProfileWorkspace\(\s*effectiveProfile/,
  );

});

test("cada zona expõe seletor de apresentação independente", () => {
  assert.match(
    source,
    /aria-label={`Apresentação de \$\{zone\.label\}`}/,
  );

  assert.match(
    source,
    /EDITORIAL_VISUAL_FAMILIES\.map/,
  );

  assert.match(
    source,
    /EDITORIAL_VISUAL_FAMILY_DEFINITIONS\[\s*family\s*\]\.label/,
  );

  assert.match(
    source,
    /changeZoneLayout/,
  );
});

test("reduzir layout preserva Manual > automático por compactação", () => {
  assert.match(
    source,
    /compactMatchdayEditorialProfileManualOverridesForLayoutChange\(\s*effectiveProfile,\s*nextProfile,\s*operationalOverrides,\s*zoneKey/,
  );

  assert.match(
    source,
    /Não é possível reduzir este layout/,
  );
});

test("Últimas continua um bloco especial ordenável na mesma composição", () => {
  assert.match(
    source,
    /thematicBlockOrder\.map/,
  );

  assert.match(
    source,
    /moveMatchdayEditorialProfileThematicBlock/,
  );

  assert.match(
    source,
    /matchdayEditorialProfileThematicZoneOrderFromBlockOrder/,
  );

  assert.match(
    source,
    /Últimas \+ quatro ao lado/,
  );

  assert.match(
    source,
    /latestZonePlacement: event\.target\.value as/,
  );

  assert.match(
    source,
    /<option value="top">Topo<\/option>[\s\S]*<option value="four_news">Últimas \+ quatro ao lado<\/option>[\s\S]*<option value="hidden">Oculto<\/option>/,
  );

  assert.doesNotMatch(
    source,
    /moveMatchdayEditorialProfileThematicZone\(/,
  );
});

test("As quatro ao lado das Últimas são manuais, independentes e aplicadas no mesmo workspace", () => {
  assert.match(
    source,
    /draftEditorialSelection/,
  );

  assert.match(
    source,
    /selectionBankItemIds:\s*draftEditorialSelection/,
  );

  assert.match(
    source,
    /aria-label="Quatro ao lado das Últimas"/,
  );

  assert.doesNotMatch(
    source,
    /selection_set|selection_clear/,
  );
});

test("zona ativa mantém apenas os controlos funcionais numa linha", () => {
  assert.match(source, /function renderZonePanel/);
  assert.match(source, /aria-label={`Título público de \$\{zone\.label\}`}/);
  assert.match(source, /aria-label={`Apresentação de \$\{zone\.label\}`}/);
  assert.match(source, /<span>Título público<\/span>/);
  assert.match(source, /<span>Apresentação<\/span>/);
  assert.doesNotMatch(source, /<span>Família<\/span>/);
  assert.match(source, /className="thematic-zone-editor-count"/);
  assert.match(
    source,
    /\.thematic-zone-editor label \{ display: grid; grid-template-columns: auto minmax\(0,1fr\);/,
  );
  assert.doesNotMatch(source, /thematic-workspace-head/);
});

test("tabs mantêm apenas Abertura fixa e deixam o tracking simultâneo separado", () => {
  assert.match(source, /className="thematic-zone-tabs"/);
  assert.match(source, /Abertura \{openingOccupied\}/);

  const tabsStart = source.indexOf('className="thematic-zone-tabs"');
  const tabsEnd = source.indexOf("{renderActiveWorkspace()}", tabsStart);
  assert.ok(tabsStart >= 0 && tabsEnd > tabsStart);
  assert.doesNotMatch(source.slice(tabsStart, tabsEnd), /Faixa/);
  assert.match(source, /aria-label="Tracking editorial por classe"/);
  assert.match(source, /const TRACKING_STATES = \["NOVA", "FAIXA", "DESALOJADA"\]/);
  assert.doesNotMatch(source, /aria-label="Fontes editoriais"/);
});

test("Últimas mantém só Título público, Apresentação e contador na faixa funcional", () => {
  assert.match(source, /aria-label="Título público de Últimas"/);
  assert.match(source, /aria-label="Apresentação de Últimas"/);
  assert.match(source, /<span>Título público<\/span>/);
  assert.match(source, /<span>Apresentação<\/span>/);
  assert.match(
    source,
    /className="thematic-zone-editor-count"[\s\S]{0,80}\{editorialSelectionOccupied\}\/4/,
  );
});

test("quatro Últimas alinham os cards sem numeração visual dos slots", () => {
  assert.match(
    source,
    /\.thematic-workspace-slot \.thematic-card\.thematic-selection-card \{ grid-template-columns: 16px 44px minmax\(0,1fr\) 22px; \}/,
  );
  assert.match(
    source,
    /\.thematic-editorial-selection \.thematic-workspace-slot \{ display: grid; grid-template-rows: minmax\(0,1fr\); gap: 0; \}/,
  );
  assert.doesNotMatch(source, /thematic-position/);
  assert.match(
    source,
    /\.thematic-card-title \{ display: -webkit-box;[\s\S]*?-webkit-line-clamp: 2; \}/,
  );
  assert.doesNotMatch(
    source,
    /\.thematic-card-title \{[^}]*white-space: nowrap/,
  );
});

test("Destaque coloca visibilidade e posição editorial lado a lado", () => {
  assert.match(
    source,
    /\.thematic-highlight-row \{ display: grid; grid-template-columns: minmax\(120px,160px\) minmax\(0,520px\);/,
  );
  assert.match(source, /className="thematic-highlight-row"/);
  assert.match(source, /className="thematic-highlight-controls"/);
  assert.match(source, /aria-label="Destaque editorial"/);
});

test("as cinco zonas são fixas e não existe criação ou remoção de zona", () => {
  assert.doesNotMatch(source, /\+ Adicionar zona|Remover zona/);
  assert.doesNotMatch(source, /newZone|createZone|deleteZone/);
});

test("preview mantém um único write HTTP de Apply", () => {
  const applyStart = source.indexOf("async function applyChanges()");
  const applyEnd = source.indexOf("function cardFor", applyStart);
  const apply = source.slice(applyStart, applyEnd);

  assert.ok(applyStart >= 0 && applyEnd > applyStart);
  assert.equal(
    (apply.match(/method:\s*"POST"/g) ?? []).length,
    1,
  );
});

test("operações de zona não usam o perfil estático", () => {
  for (const forbidden of [
    "fixMatchdayEditorialItemsAtPosition(profile,",
    "fixMatchdayEditorialItemsInZone(profile,",
    "moveMatchdayEditorialItemsToFaixa(profile,",
    "moveMatchdayEditorialItemsToBank(profile,",
    "returnMatchdayEditorialItemsToAutomatic(profile,",
    "releaseMatchdayEditorialFixedPositions(profile,",
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      forbidden,
    );
  }
});

test("Mover para zona respeita a posição escolhida", () => {
  assert.ok(source.includes('Posição na zona'));
  assert.ok(
    source.includes('const [zonePosition, setZonePosition] = useState(1)'),
  );
  assert.ok(source.includes('const maxZoneStartPosition = Math.max('));
  assert.ok(source.includes('selectedIdentities.length'));
  assert.ok(
    source.includes(
      'Array.from({ length: maxZoneStartPosition }, (_, index) => index + 1)',
    ),
  );
  assert.ok(source.includes('effectiveZonePosition'));
  assert.ok(source.includes('placeMatchdayEditorialItemsInZoneWithoutCascade('));
  assert.equal(
    source.includes('fixMatchdayEditorialItemsInZone('),
    false,
  );
  assert.equal(source.includes('swapMatchdayEditorialItemsInZone('), true);
});
