import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const adminPagePath = fileURLToPath(
  new URL("../app/admin/editorial/jornada/[matchdayId]/page.tsx", import.meta.url)
);
const apiRoutePath = fileURLToPath(
  new URL("../app/api/admin/gestor/route.ts", import.meta.url)
);
const publicPagePath = fileURLToPath(
  new URL("../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx", import.meta.url)
);

const adminPageSource = readFileSync(adminPagePath, "utf8");
const apiRouteSource = readFileSync(apiRoutePath, "utf8");
const publicPageSource = readFileSync(publicPagePath, "utf8");

function functionSource(name: string, nextName: string) {
  const start = apiRouteSource.indexOf(`async function ${name}`);
  const end = apiRouteSource.indexOf(`async function ${nextName}`, start);

  assert.notEqual(start, -1, `${name} deve existir`);
  assert.notEqual(end, -1, `${nextName} deve existir depois de ${name}`);
  return apiRouteSource.slice(start, end);
}

test("backoffice organiza as onze zonas pela ordem publica e mantem a edicao independente", () => {
  const zoneMarkers = [
    'id="manchete"',
    'id="ultimas-noticias"',
    'id="contexto"',
    'id="tres-noticias"',
    'id="video"',
    'id="noticia-ao-lado-video"',
    'id: "layout-4-noticias-ultimas"',
    'id: "layout-6-noticias"',
    'id: "layout-5-noticias-equilibrado"',
    'id: "layout-5-noticias-secundarias"',
    'id="faixa-noticias"'
  ];
  const zoneIndexes = zoneMarkers.map((marker) => adminPageSource.indexOf(marker));

  zoneIndexes.forEach((index, position) => {
    assert.notEqual(index, -1, `zona ${position + 1} deve existir`);
  });
  assert.deepEqual([...zoneIndexes].sort((first, second) => first - second), zoneIndexes);

  assert.match(adminPageSource, /href="#manchete">01 Manchete<\/a>/);
  assert.match(adminPageSource, /href="#ultimas-noticias">02 Últimas<\/a>/);
  assert.match(adminPageSource, /href="#contexto">03 Contexto<\/a>/);
  assert.match(adminPageSource, /href="#tres-noticias">04 3 notícias<\/a>/);
  assert.match(adminPageSource, /href="#video">05 Vídeo<\/a>/);
  assert.match(adminPageSource, /href="#noticia-ao-lado-video">06 Ao lado do vídeo<\/a>/);
  assert.match(adminPageSource, /href="#layout-4-noticias-ultimas"[^>]*>07 4 notícias \+ Últimas<\/a>/);
  assert.match(adminPageSource, /href="#layout-6-noticias"[^>]*>08 6 notícias<\/a>/);
  assert.match(adminPageSource, /href="#layout-5-noticias-equilibrado"[^>]*>09 5 notícias 1D\+1S\+3C<\/a>/);
  assert.match(adminPageSource, /href="#layout-5-noticias-secundarias"[^>]*>10 5 notícias 1D\+4S<\/a>/);
  assert.match(adminPageSource, /href="#faixa-noticias">11 Faixa de notícias<\/a>/);

  assert.match(
    adminPageSource,
    /\.editorial-admin-block-nav \{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*8px;/
  );
  assert.match(adminPageSource, /submitter\.textContent = "A guardar\.\.\.";/);
  assert.match(
    adminPageSource,
    /data-highlight-card=\{order\}[\s\S]*?open=\{feedbackScope === "destaques" && feedbackItem === itemKey\}/
  );
  assert.match(
    adminPageSource,
    /open=\{feedbackScope === "resumo-jornada" && feedbackItem === itemKey\}/
  );
  assert.match(
    adminPageSource,
    /open=\{feedbackScope === "ultimas-noticias" && feedbackItem === itemKey\}/
  );
  assert.match(adminPageSource, /id="faixa-noticias-editor"[\s\S]*?openOrder=\{horizontalNewsOpenOrder\}/);

  assert.doesNotMatch(adminPageSource, /Manchete viva da jornada/);
  assert.doesNotMatch(adminPageSource, /Bloco lateral \/ fonte viva/);
  assert.doesNotMatch(adminPageSource, /Zonas editoriais abaixo da manchete/);
  assert.doesNotMatch(adminPageSource, /Destaques da manchete/);
  assert.doesNotMatch(adminPageSource, /Zona editorial final/);

  assert.match(adminPageSource, /name="below_headline_mode"[\s\S]*?<option value="highlights">Ativos<\/option>[\s\S]*?<option value="roundup">Inativos<\/option>/);
  assert.match(adminPageSource, /name="complementary_mode"[\s\S]*?<option value="roundup_video">Ativo<\/option>[\s\S]*?<option value="none">Inativo<\/option>/);
  assert.match(adminPageSource, /name="complementary_status"[\s\S]*?<option value="published">Ativo<\/option>[\s\S]*?<option value="draft">Inativo<\/option>/);
  assert.doesNotMatch(adminPageSource, /syncComplementWithBelowMode/);
  assert.doesNotMatch(adminPageSource, /data-below-section/);
  assert.doesNotMatch(adminPageSource, /data-complementary-section/);
});

test("guardar Destaques nao altera o estado do Resumo de video", () => {
  const source = functionSource("saveMatchdayBelowHeadline", "setMatchdayBelowHeadlineMode");
  assert.match(source, /below_headline_mode: belowHeadlineMode/);
  assert.doesNotMatch(source, /complementary_mode/);
  assert.doesNotMatch(source, /complementary_roundup_item_id/);
});

test("guardar Complemento nao altera o estado nem a configuracao do Resumo de video", () => {
  const source = functionSource("saveMatchdayComplement", "saveMatchdayRoundupSettings");
  assert.match(source, /complementary_status: complementaryStatus/);
  assert.doesNotMatch(source, /complementary_mode/);
  assert.doesNotMatch(source, /roundup_video_heading/);
  assert.doesNotMatch(source, /complementary_roundup_item_id/);
});

test("Resumo de video tem uma acao propria e guarda apenas a sua configuracao", () => {
  const source = functionSource("saveMatchdayRoundupSettings", "saveMatchdayBelowHeadline");
  assert.match(source, /complementary_mode: complementaryMode/);
  assert.match(source, /complementary_roundup_item_id: complementaryRoundupItemId/);
  assert.match(source, /roundup_video_heading: roundupVideoHeading/);
  assert.match(source, /roundup_video_heading_color: roundupVideoHeadingColor/);
  assert.doesNotMatch(source, /complementary_status/);
  assert.doesNotMatch(source, /below_headline_mode/);
  assert.match(apiRouteSource, /actionType === "save_matchday_roundup_settings"/);
});


test("pagina publica controla as tres zonas de forma independente e permite simultaneidade", () => {
  assert.match(publicPageSource, /const effectiveRoundupItems = \([\s\S]*?useHierarchicalReferenceComposition[\s\S]*?\? context\.referenceRoundupItems[\s\S]*?: useReferenceRoundupItems[\s\S]*?\? context\.referenceRoundupItems[\s\S]*?: context\.roundupItems[\s\S]*?\)\.filter\(hasPublicMatchdayRoundupContent\);/);
  assert.match(publicPageSource, /const highlightsAreActive = editorial[\s\S]*?\? editorial\.below_headline_mode !== "roundup"[\s\S]*?: referenceHighlightItems\.length > 0;/);
  assert.match(publicPageSource, /const roundupIsActive = editorial[\s\S]*?\? complementaryMode === "roundup_video"[\s\S]*?: useReferenceRoundupItems;/);
  assert.match(publicPageSource, /const visibleHighlights = highlightsAreActive \? effectiveHighlights : \[\];/);
  assert.match(publicPageSource, /const visibleRoundupItems = roundupIsActive \? effectiveRoundupItems : \[\];/);
  assert.match(publicPageSource, /const complementaryIsActive = editorial[\s\S]*?editorial\.complementary_status === "published"[\s\S]*?: Boolean\(referenceComplement\);/);
  assert.doesNotMatch(publicPageSource, /usePublishedReferenceComposition[\s\S]*?\? useReferenceRoundupItems[\s\S]*?: complementaryMode === "roundup_video"/);
});
