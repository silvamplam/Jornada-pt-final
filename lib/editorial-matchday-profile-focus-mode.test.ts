import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const desk = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

test("a Abertura permanece sticky e independente do modo foco", () => {
  assert.match(
    desk,
    /\.thematic-opening-panel\s*\{\s*position:\s*sticky;\s*top:\s*8px;/,
  );

  assert.match(
    desk,
    /className="thematic-panel thematic-opening-panel"\s+aria-label="Abertura editorial manual"/,
  );
});

test("o modo foco escolhe uma única zona sem criar nova lógica de colocação", () => {
  assert.match(
    desk,
    /const \[deskView, setDeskView\] = useState<"full" \| "focus">\("focus"\)/,
  );

  assert.match(
    desk,
    /const \[focusZone, setFocusZone\] = useState<EditorialProfileZoneKey>\(profile\.zones\[0\]\.key\)/,
  );

  assert.match(
    desk,
    /deskView === "full"[\s\S]*?className="thematic-zones"[\s\S]*?: \([\s\S]*?className="thematic-focus-stack"[\s\S]*?\{renderZonePanel\(focusZone\)\}/,
  );

  assert.match(
    desk,
    /onDrop=\{\(event\) => \{[\s\S]*?placeInZone\([\s\S]*?zone\.key,[\s\S]*?position,/,
  );
});

test("zona em foco e Faixa usam listas verticais", () => {
  assert.match(
    desk,
    /\.thematic-focus-stack \.thematic-zone-list\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\);/,
  );

  assert.match(
    desk,
    /\.thematic-faixa-focus \.thematic-faixa-grid\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\);/,
  );

  assert.match(
    desk,
    /className=\{`thematic-panel\$\{deskView === "focus" \? " thematic-faixa-focus" : ""\}`\}/,
  );
});

test("a Mesa completa continua disponível", () => {
  assert.match(
    desk,
    />\s*Foco de zona\s*<\/button>/,
  );

  assert.match(
    desk,
    />\s*Mesa completa\s*<\/button>/,
  );

  assert.match(
    desk,
    /setDeskView\("full"\)/,
  );
});

test("a Faixa em foco preenche duas colunas verticalmente por blocos de dez", () => {
  assert.match(
    desk,
    /visibleFaixa\.slice\(\s*batchIndex \* 10,\s*batchIndex \* 10 \+ 10,\s*\)/,
  );

  assert.match(
    desk,
    /const firstColumn =\s*batch\.slice\(0, 5\)/,
  );

  assert.match(
    desk,
    /const secondColumn =\s*batch\.slice\(5, 10\)/,
  );

  assert.match(
    desk,
    /data-column-count=\{\s*secondColumn\.length > 0\s*\? "2"\s*: "1"\s*\}/,
  );
});

test("os cartões do modo foco ficam mais compactos sem alterar a Mesa completa", () => {
  assert.match(
    desk,
    /\.thematic-focus-stack \.thematic-image,[\s\S]*?width:\s*44px;\s*height:\s*33px;/,
  );

  assert.match(
    desk,
    /\.thematic-focus-stack \.thematic-card,[\s\S]*?min-height:\s*46px;/,
  );

  assert.match(
    desk,
    /\.thematic-faixa-batch\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/,
  );

  assert.match(
    desk,
    /@media \(max-width: 820px\)[\s\S]*?\.thematic-faixa-grid, \.thematic-faixa-batch\s*\{\s*grid-template-columns:\s*1fr;/,
  );
});

test("o Foco mantém zona completa e Faixa navegável no mesmo workspace", () => {
  assert.match(
    desk,
    /\.thematic-focus-stack \.thematic-public-title,[\s\S]*?\.thematic-focus-stack \.thematic-layout-picker,[\s\S]*?\.thematic-focus-stack \.thematic-dropbar\s*\{\s*display:\s*none;/,
  );

  assert.match(
    desk,
    /\.thematic-faixa-focus \.thematic-faixa-grid\s*\{[\s\S]*?max-height:\s*min\(34vh, 320px\);[\s\S]*?overflow-y:\s*auto;/,
  );

  assert.match(
    desk,
    /\.thematic-focus-stack \.thematic-card,[\s\S]*?min-height:\s*46px;/,
  );

  assert.match(
    desk,
    /\.thematic-focus-stack \.thematic-image,[\s\S]*?width:\s*44px;\s*height:\s*33px;/,
  );
});

test("os controlos retirados do Foco continuam presentes na Mesa completa", () => {
  assert.match(
    desk,
    /className="thematic-public-title"/,
  );

  assert.match(
    desk,
    /className="thematic-layout-picker"/,
  );

  assert.match(
    desk,
    />\s*Mesa completa\s*<\/button>/,
  );
});

test("o Foco alinha dinamicamente a zona abaixo da Abertura sticky", () => {
  assert.match(
    desk,
    /function alignFocusWorkspace\(\)/,
  );

  assert.match(
    desk,
    /document\.querySelector<HTMLElement>\(\s*"\.thematic-opening-panel",\s*\)/,
  );

  assert.match(
    desk,
    /document\.querySelector<HTMLElement>\(\s*"\.thematic-focus-stack",\s*\)/,
  );

  assert.match(
    desk,
    /const openingBottom =\s*opening\.getBoundingClientRect\(\)\.bottom;/,
  );

  assert.match(
    desk,
    /const focusTop =\s*focus\.getBoundingClientRect\(\)\.top;/,
  );

  assert.match(
    desk,
    /useEffect\(\(\) => \{[\s\S]*?deskView !== "focus"[\s\S]*?alignFocusWorkspace\(\);[\s\S]*?\}, \[deskView, focusZone\]\);/,
  );
});

test("o alinhamento do Foco não cria um segundo sticky", () => {
  assert.doesNotMatch(
    desk,
    /\.thematic-focus-stack\s*\{[^}]*position:\s*sticky;/,
  );

  assert.match(
    desk,
    /\.thematic-opening-panel\s*\{\s*position:\s*sticky;/,
  );
});

test("a Faixa pode ser filtrada por várias zonas sem alterar o estado editorial", () => {
  assert.match(
    desk,
    /const \[faixaZoneFilters, setFaixaZoneFilters\] = useState</,
  );

  assert.match(
    desk,
    /const faixaZoneFilterSet = useMemo\(/,
  );

  assert.match(
    desk,
    /activeByIdentity\.get\(identity\(item\)\)\?\.classifiedZoneKey/,
  );

  assert.match(
    desk,
    /faixaZoneFilterSet\.size === 0/,
  );

  assert.match(
    desk,
    /faixaZoneFilterSet\.has\(classifiedZoneKey\)/,
  );

  assert.match(
    desk,
    /current\.includes\(zoneKey\)/,
  );

  assert.match(
    desk,
    /\[\.\.\.current, zoneKey\]/,
  );

  assert.match(
    desk,
    /aria-label="Filtrar Faixa por zona temática"/,
  );

  assert.match(
    desk,
    /profile\.zones\.map\(\(zone\) => \(/,
  );

  assert.match(
    desk,
    /checked=\{faixaZoneFilterSet\.has\(zone\.key\)\}/,
  );

  assert.match(
    desk,
    /toggleFaixaZoneFilter\(zone\.key\)/,
  );
});

test("pesquisa e zonas funcionam como filtros cumulativos da Faixa", () => {
  assert.match(
    desk,
    /const zoneMatches =/,
  );

  assert.match(
    desk,
    /const queryMatches =/,
  );

  assert.match(
    desk,
    /return zoneMatches && queryMatches;/,
  );
});

test("o filtro da Faixa não entra no estado editorial nem cria pending", () => {
  const currentDraftStart =
    desk.indexOf(
      "function currentDraft(): WorkspaceDraft",
    );

  const currentDraftEnd =
    desk.indexOf(
      "function commitDraft",
      currentDraftStart,
    );

  assert.ok(currentDraftStart >= 0);
  assert.ok(currentDraftEnd > currentDraftStart);

  const currentDraftBlock =
    desk.slice(
      currentDraftStart,
      currentDraftEnd,
    );

  assert.doesNotMatch(
    currentDraftBlock,
    /faixaZoneFilters/,
  );

  const pendingStart =
    desk.indexOf("const pending =");

  const pendingEnd =
    desk.indexOf(
      "const zoneByKey",
      pendingStart,
    );

  assert.ok(pendingStart >= 0);
  assert.ok(pendingEnd > pendingStart);

  const pendingBlock =
    desk.slice(
      pendingStart,
      pendingEnd,
    );

  assert.doesNotMatch(
    pendingBlock,
    /faixaZoneFilters/,
  );
});

test("a Faixa não tem limite de montagem quando a Mesa está em Foco de zona", () => {
  assert.match(
    desk,
    /const visibleFaixa =\s*deskView === "focus"\s*\?\s*filteredFaixa\s*:\s*filteredFaixa\.slice\(0, faixaVisibleCount\);/,
  );

  assert.match(
    desk,
    /deskView !== "focus" && visibleFaixa\.length < filteredFaixa\.length/,
  );

  assert.match(
    desk,
    /\.thematic-faixa-focus \.thematic-faixa-grid\s*\{[\s\S]*?overflow-y:\s*auto;/,
  );

  assert.match(
    desk,
    /visibleFaixa\.slice\(\s*batchIndex \* 10,\s*batchIndex \* 10 \+ 10,\s*\)/,
  );
});
