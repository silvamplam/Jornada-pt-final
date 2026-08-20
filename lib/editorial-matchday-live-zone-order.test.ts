import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MATCHDAY_LIVE_PUBLIC_ZONE_ORDER,
  MATCHDAY_LIVE_PUBLIC_ZONE_LABELS,
  moveMatchdayLivePublicZone,
  normalizeMatchdayLivePublicZoneOrder,
} from "./editorial-matchday-live-zone-order";

function source(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
    "utf8",
  );
}

const adminPage = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
const deskPage = source("app/admin/editorial/jornada/[matchdayId]/organizar/page.tsx");
const gestorRoute = source("app/api/admin/gestor/route.ts");
const publicLoader = source("lib/public-matchday.ts");
const publicPage = source(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
);
const migration = source(
  "supabase/migrations/20260819193000_matchday_live_public_zone_order.sql",
);

test("a ordem viva tem cinco zonas móveis e fallback determinístico", () => {
  assert.deepEqual(DEFAULT_MATCHDAY_LIVE_PUBLIC_ZONE_ORDER, [
    "video",
    "four_news",
    "six_news",
    "five_news_balanced",
    "five_news_secondary",
  ]);

  assert.deepEqual(normalizeMatchdayLivePublicZoneOrder(null), [
    ...DEFAULT_MATCHDAY_LIVE_PUBLIC_ZONE_ORDER,
  ]);
  assert.deepEqual(
    normalizeMatchdayLivePublicZoneOrder([
      "video",
      "video",
      "six_news",
      "five_news_balanced",
      "five_news_secondary",
    ]),
    [...DEFAULT_MATCHDAY_LIVE_PUBLIC_ZONE_ORDER],
  );

  assert.deepEqual(
    moveMatchdayLivePublicZone(
      DEFAULT_MATCHDAY_LIVE_PUBLIC_ZONE_ORDER,
      "six_news",
      "up",
    ),
    [
      "video",
      "six_news",
      "four_news",
      "five_news_balanced",
      "five_news_secondary",
    ],
  );
  assert.equal(
    MATCHDAY_LIVE_PUBLIC_ZONE_LABELS.video,
    "A Jornada em Vídeo + Destaque da Jornada",
  );
  assert.equal(
    MATCHDAY_LIVE_PUBLIC_ZONE_LABELS.five_news_balanced,
    "5 notícias — 1 destaque + 1 secundária + 3 complementares",
  );
  assert.equal(
    MATCHDAY_LIVE_PUBLIC_ZONE_LABELS.five_news_secondary,
    "5 notícias — 1 destaque + 4 secundárias",
  );
});

test("o controlo passou do Editorial para a Mesa e mantém Abertura e Faixa fixas", () => {
  assert.doesNotMatch(adminPage, /id="ordem-pagina-viva"/);
  assert.doesNotMatch(adminPage, /name="action_type" value="move_matchday_live_public_zone"/);
  assert.match(deskPage, /id="organizacao-pagina-viva"/);
  assert.match(deskPage, /Ordem da página viva/);
  assert.match(deskPage, /Abertura · Manchete \+ 3 notícias \+ Contexto/);
  assert.match(deskPage, /Faixa de notícias/);
  assert.match(deskPage, /name="action_type" value="move_matchday_live_public_zone"/);
  assert.match(deskPage, /name="direction"[\s\S]*value="up"/);
  assert.match(deskPage, /name="direction"[\s\S]*value="down"/);
  assert.doesNotMatch(deskPage, /matchday_reference_compositions?select=.*live_public_zone_order/);

  const openingIndex = deskPage.indexOf("Abertura · Manchete + 3 notícias + Contexto");
  const movableZonesIndex = deskPage.indexOf("snapshot.livePublicZoneOrder.map", openingIndex);
  const faixaIndex = deskPage.indexOf("Faixa de notícias", movableZonesIndex);
  assert.ok(openingIndex >= 0 && movableZonesIndex > openingIndex && faixaIndex > movableZonesIndex);
});

test("a API grava a ordem apenas no controlo vivo da Jornada", () => {
  assert.match(gestorRoute, /moveMatchdayLivePublicZoneOrder/);
  assert.match(gestorRoute, /matchday_editorial_desk_control\?select=matchday_id,live_public_zone_order/);
  assert.match(gestorRoute, /live_public_zone_order: nextOrder/);
  assert.match(gestorRoute, /actionType === "move_matchday_live_public_zone"/);
  assert.doesNotMatch(
    gestorRoute,
    /move_matchday_live_public_zone[sS]{0,500}syncCurrentPublishedReferenceCompositionNewsFlow/,
  );
});

test("a página pública lê a ordem viva e intercala os cinco blocos", () => {
  assert.match(publicLoader, /liveZoneOrder: MatchdayLivePublicZoneKey\[\]/);
  assert.match(publicLoader, /live_public_zone_order/);
  assert.match(
    publicPage,
    /context\.editorialDeskControl\.liveZoneOrder\.map\(renderLivePublicZone\)/,
  );
  assert.match(publicPage, /zone === "video"/);
  assert.match(publicPage, /zone === "four_news"/);
  assert.match(publicPage, /zone === "six_news"/);
  assert.match(publicPage, /zone === "five_news_balanced"/);
  assert.match(publicPage, /liveBeyondMatchdayNews.length !== 5/);

  const orderedIndex = publicPage.indexOf(
    "context.editorialDeskControl.liveZoneOrder.map(renderLivePublicZone)",
  );
  const faixaIndex = publicPage.indexOf("<PublicHorizontalNewsStrip", orderedIndex);
  assert.ok(orderedIndex >= 0 && faixaIndex > orderedIndex);
});

test("a migration guarda a ordem no estado vivo e não toca na Composição", () => {
  assert.match(
    migration,
    /alter table public.matchday_editorial_desk_control/,
  );
  assert.match(migration, /live_public_zone_order text\[\]/);
  assert.match(migration, /cardinality\(live_public_zone_order\) = 5/);
  assert.doesNotMatch(
    migration,
    /matchday_reference_compositions|matchday_reference_composition_items/,
  );
});
