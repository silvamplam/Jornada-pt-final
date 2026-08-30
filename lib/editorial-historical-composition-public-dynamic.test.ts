import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const flexible = readFileSync(
  "components/public/PublicFlexibleZoneLayout.tsx",
  "utf8",
);

const thematic = readFileSync(
  "components/public/PublicThematicZoneLayout.tsx",
  "utf8",
);

const publicMatchday = readFileSync(
  "lib/public-matchday.ts",
  "utf8",
);

const publicPage = readFileSync(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  "utf8",
);

const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

test("Mesa viva e composição histórica usam o mesmo renderer das três famílias", () => {
  assert.match(
    flexible,
    /six_news/,
  );
  assert.match(
    flexible,
    /FIVE_NEWS_BALANCED_SLOT_KEYS/,
  );
  assert.match(
    flexible,
    /five_news_secondary/,
  );
  assert.match(
    thematic,
    /PublicFlexibleZoneLayout/,
  );
  assert.match(
    publicPage,
    /PublicFlexibleZoneLayout/,
  );
});

test("a página pública lê snapshots das zonas históricas e a posição do vídeo", () => {
  assert.match(
    publicPage,
    /matchday_historical_composition_zones/,
  );
  assert.match(
    publicPage,
    /matchday_historical_composition_zone_items/,
  );
  assert.match(
    publicMatchday,
    /hierarchical_video_position/,
  );
  assert.match(
    publicPage,
    /hierarchical_video_position/,
  );
});

test("em modo dinâmico o topo legacy fica só com Abertura e o corpo é variável", () => {
  assert.match(
    publicPage,
    /useHistoricalDynamicZones\s*\?\s*\["opening"\]/,
  );
  assert.match(
    publicPage,
    /historicalDynamicBodyBlocks/,
  );
  assert.match(
    publicPage,
    /composeHistoricalPublicEditorialBody/,
  );
  assert.match(
    publicPage,
    /PublicHierarchicalPosteriorMoments/,
  );
});

test("a publicação dinâmica exige Abertura e cada zona completa, sem exigir os 15 slots legacy", () => {
  assert.match(
    route,
    /validateHistoricalDynamicPublication/,
  );
  assert.match(
    route,
    /Completa os 4 lugares da Abertura/,
  );
  assert.match(
    route,
    /Completa a zona editorial/,
  );
  assert.match(
    route,
    /if \(!dynamicPublication\.enabled\)/,
  );
});

test("qualquer alteração de zonas grava também a posição do Vídeo + Destaque", () => {
  assert.match(
    client,
    /if \(settingsChanged \|\| dynamicZonesChanged\)/,
  );
  assert.match(
    client,
    /settings_json/,
  );
});
