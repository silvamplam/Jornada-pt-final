import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const clientSource = source("app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialDeskClient.tsx");
const pageSource = source("app/admin/editorial/jornada/[matchdayId]/organizar/page.tsx");
const editorialSource = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
const readerSource = source("lib/editorial-matchday-desk.ts");
const modelSource = source("lib/editorial-matchday-desk-model.ts");

test("a Mesa Beta aplica o estado planeado apenas pela API isolada", () => {
  assert.equal(pageSource.includes("Modo de ensaio"), false);
  assert.equal(clientSource.includes("Modo de ensaio"), false);
  assert.ok(clientSource.includes("fetch("));
  assert.ok(clientSource.includes("/api/admin/editorial/jornada/"));
  assert.ok(clientSource.includes("buildMatchdayDeskApplyArticles(desired)"));
});

test("o Editorial mantém a porta para a Mesa e deixa de conter os controlos de organização", () => {
  assert.ok(editorialSource.includes(`/organizar`));
  assert.ok(editorialSource.includes("Organizar Jornada — Beta"));
  assert.doesNotMatch(editorialSource, /name="action_type" value="set_matchday_latest_zone_placement"/);
  assert.doesNotMatch(editorialSource, /name="action_type" value="move_matchday_live_public_zone"/);
  assert.match(pageSource, /name="action_type" value="set_matchday_latest_zone_placement"/);
  assert.match(pageSource, /name="action_type" value="move_matchday_live_public_zone"/);
});

test("a Mesa lê artigos publicados, zonas vivas e o controlo de concorrência", () => {
  assert.ok(readerSource.includes("editorial_articles?select="));
  assert.ok(readerSource.includes("matchday_latest_news?select="));
  assert.ok(readerSource.includes("matchday_roundup_items?select="));
  assert.ok(readerSource.includes("matchday_horizontal_news?select="));
  assert.ok(readerSource.includes("matchday_live_layout_items?select="));
  assert.ok(readerSource.includes("matchday_highlights?select="));
  assert.ok(readerSource.includes("matchday_editorial_desk_control?select="));
  assert.ok(readerSource.includes("latest_zone_placement"));
  assert.ok(readerSource.includes("live_public_zone_order"));
  assert.ok(readerSource.includes("matchday_editorial_desk_state_token"));
  assert.equal(readerSource.includes("writeSupabaseAdmin"), false);
});

test("os filtros da Mesa correspondem às zonas editoriais reais", () => {
  for (const label of [
    "Todas",
    "Últimas",
    "Sem zona nas Últimas",
    "Abertura",
    "4 notícias",
    "6 notícias",
    "5 notícias principais",
    "5 notícias secundárias",
    "Faixa",
    "Vídeo + Destaque",
    "Sem colocação",
  ]) {
    assert.ok(clientSource.includes(label), `falta o filtro ${label}`);
  }

  assert.equal(clientSource.includes('["outside_latest", "Fora de Últimas"]'), false);
  assert.equal(clientSource.includes('["no_editorial", "Sem zona"]'), false);
  assert.equal(clientSource.includes('["layouts", "Layouts"]'), false);
  assert.equal(clientSource.includes('["videos", "Vídeos"]'), false);
  assert.equal(clientSource.includes('["highlight", "Destaque da Jornada"]'), false);

  assert.match(
    clientSource,
    /filter === "latest_without_zone"\) return Boolean\(state\?\.inLatest\) && !state\?\.placementKey/,
  );

  assert.match(
    clientSource,
    /filter === "unplaced"\) return !state\?\.inLatest && !state\?\.placementKey/,
  );

  assert.match(
    clientSource,
    /filter === "opening"\) return isMatchdayDeskOpeningPlacementKey\(state\?\.placementKey\)/,
  );
  assert.match(clientSource, /filter === "four_news"\) return group === "four_news"/);
  assert.match(clientSource, /filter === "six_news"\) return group === "six_news"/);
  assert.match(
    clientSource,
    /filter === "five_news_balanced"\) return group === "five_news_balanced"/,
  );
  assert.match(
    clientSource,
    /filter === "five_news_secondary"\) return group === "five_news_secondary"/,
  );
  assert.match(clientSource, /filter === "video_highlight"\) return group === "complement"/);
  assert.match(clientSource, /filter !== "all" && filter !== "video_highlight"/);

  assert.ok(readerSource.includes("matchday_roundup_items?select="));
  assert.ok(clientSource.includes("filteredVideos.map"));
  assert.ok(clientSource.includes("snapshot.videos"));
});

test("a Mesa apresenta uma Abertura lógica com os cinco slots reais e granulares", () => {
  assert.match(modelSource, /label: "ABERTURA DA JORNADA"/);
  for (const placementKey of ["headline", "highlight:1", "highlight:2", "highlight:3", "side_block"]) {
    assert.ok(modelSource.includes(`{ key: "${placementKey}"`), `falta o slot ${placementKey}`);
  }
  assert.ok(clientSource.includes(`value={\`slot::\${slot.key}\`}`));
  assert.match(clientSource, /renderFixedGroup\(MATCHDAY_DESK_OPENING_GROUP\)/);
  assert.match(clientSource, /MATCHDAY_DESK_MAP_GROUPS\.map\(renderFixedGroup\)/);
  assert.match(clientSource, /draggable/);
});

test("a Mesa agrupa Vídeos e Destaque sem criar destinos editoriais para vídeos", () => {
  assert.match(clientSource, /<h3>A Jornada em Vídeo \+ Destaque da Jornada<\/h3>/);
  assert.match(clientSource, /snapshot\.videos\.map\(\(video\) =>/);
  assert.ok(clientSource.includes("Sem vídeos publicados"));
  assert.match(clientSource, /ownerByPlacement\.get\("complement"\)/);
  assert.match(clientSource, /onDrop=\{\(\) => dropOnSlot\("complement"\)\}/);
  assert.match(clientSource, /renderPlacedArticle\(complementArticleId, "complement"\)/);
  assert.match(clientSource, /group\.key !== "complement"/);
  assert.doesNotMatch(clientSource, /value=\{?"videos"\}?/);
  assert.doesNotMatch(clientSource, /dropOnSlot\("videos"\)/);
  assert.match(clientSource, /MATCHDAY_DESK_GROUPS\.filter[\s\S]*<optgroup key=\{group\.key\}/);
  assert.match(modelSource, /key: "complement"[\s\S]*slots: \[\{ key: "complement"/);

  const mapIndex = clientSource.indexOf('className="desk-map"');
  const openingIndex = clientSource.indexOf("renderFixedGroup(MATCHDAY_DESK_OPENING_GROUP)", mapIndex);
  const remainingZonesIndex = clientSource.indexOf("MATCHDAY_DESK_MAP_GROUPS.map(renderFixedGroup)", openingIndex);
  const faixaIndex = clientSource.indexOf('aria-label="Faixa de notícias"', remainingZonesIndex);
  const videoComplementIndex = clientSource.indexOf("renderVideoComplementGroup()", faixaIndex);
  assert.ok(
    mapIndex >= 0
      && openingIndex > mapIndex
      && remainingZonesIndex > openingIndex
      && faixaIndex > remainingZonesIndex
      && videoComplementIndex > faixaIndex,
  );
});

test("a organização viva da Mesa fica isolada das tabelas de Composição", () => {
  for (const currentSource of [pageSource, clientSource, readerSource, modelSource]) {
    assert.doesNotMatch(
      currentSource,
      /matchday_reference_compositions|matchday_reference_composition_items|matchday_hierarchical_composition_slots/,
    );
  }
});

test("a interface inclui seleção em bloco, Últimas independente, ordenação e Sem colocação", () => {
  assert.ok(clientSource.includes("+ Últimas"));
  assert.ok(clientSource.includes("− Últimas"));
  assert.ok(clientSource.includes("Sem colocação total"));
  assert.ok(clientSource.includes("draggable"));
  assert.ok(clientSource.includes('"Aplicar alterações"'));
  assert.ok(clientSource.includes("Faixa de notícias"));
  assert.ok(clientSource.includes("● Pública"));
  assert.ok(clientSource.includes("○ Oculta"));
});
test("Colocar limpa a seleção e o destino depois de planear a colocação", () => {
  assert.ok(clientSource.includes("function commitPlacement("));
  assert.match(
    clientSource,
    /function commitPlacement[\s\S]*?setSelectedIds\(\[\]\);[\s\S]*?setDestination\(""\);/,
  );
  assert.equal(
    clientSource.split("commitPlacement(").length - 1,
    3,
  );
});
