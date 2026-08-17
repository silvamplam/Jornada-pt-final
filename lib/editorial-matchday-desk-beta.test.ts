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

test("a Mesa Beta aplica o estado planeado apenas pela API isolada", () => {
  assert.equal(pageSource.includes("Modo de ensaio"), false);
  assert.equal(clientSource.includes("Modo de ensaio"), false);
  assert.ok(clientSource.includes("fetch("));
  assert.ok(clientSource.includes("/api/admin/editorial/jornada/"));
  assert.ok(clientSource.includes("buildMatchdayDeskApplyArticles(desired)"));
});

test("o Editorial atual apenas ganha uma porta para a Mesa Beta", () => {
  assert.ok(editorialSource.includes(`/organizar`));
  assert.ok(editorialSource.includes("Organizar Jornada — Beta"));
});

test("a Mesa lê artigos publicados, zonas vivas e o controlo de concorrência", () => {
  assert.ok(readerSource.includes("editorial_articles?select="));
  assert.ok(readerSource.includes("matchday_latest_news?select="));
  assert.ok(readerSource.includes("matchday_roundup_items?select="));
  assert.ok(readerSource.includes("matchday_horizontal_news?select="));
  assert.ok(readerSource.includes("matchday_live_layout_items?select="));
  assert.ok(readerSource.includes("matchday_highlights?select="));
  assert.ok(readerSource.includes("matchday_editorial_desk_control?select="));
  assert.ok(readerSource.includes("matchday_editorial_desk_state_token"));
  assert.equal(readerSource.includes("writeSupabaseAdmin"), false);
});

test("os filtros da Mesa correspondem às zonas editoriais reais", () => {
  for (const label of [
    "Todas",
    "Últimas",
    "Sem zona nas Últimas",
    "4 notícias",
    "6 notícias",
    "5 notícias principais",
    "5 notícias secundárias",
    "Faixa",
    "Vídeos",
    "Destaque da Jornada",
    "Sem colocação",
  ]) {
    assert.ok(clientSource.includes(label), `falta o filtro ${label}`);
  }

  assert.equal(clientSource.includes('["outside_latest", "Fora de Últimas"]'), false);
  assert.equal(clientSource.includes('["no_editorial", "Sem zona"]'), false);
  assert.equal(clientSource.includes('["layouts", "Layouts"]'), false);

  assert.match(
    clientSource,
    /filter === "latest_without_zone"\) return Boolean\(state\?\.inLatest\) && !state\?\.placementKey/,
  );

  assert.match(
    clientSource,
    /filter === "unplaced"\) return !state\?\.inLatest && !state\?\.placementKey/,
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
  assert.match(clientSource, /filter === "highlight"\) return group === "complement"/);

  assert.ok(readerSource.includes("matchday_roundup_items?select="));
  assert.ok(clientSource.includes("filteredVideos.map"));
  assert.ok(clientSource.includes("snapshot.videos"));
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
