import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const operations = readFileSync(
  "lib/editorial-matchday-profile-desk-operations.ts",
  "utf8",
);

const reconcile = readFileSync(
  "lib/editorial-matchday-profile-reconcile.ts",
  "utf8",
);

const desk = readFileSync(
  "lib/editorial-matchday-profile-desk.ts",
  "utf8",
);

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

const migration = readFileSync(
  "supabase/migrations/20260829160000_thematic_positional_order_without_actuality.sql",
  "utf8",
);

test("Mesa deixa de ordenar zonas e Faixa por publishedAt ou updatedAt", () => {
  assert.doesNotMatch(
    operations,
    /compareThematicItemsByActuality/,
  );

  assert.doesNotMatch(
    reconcile,
    /compareThematicItemsByActuality/,
  );

  assert.doesNotMatch(
    operations,
    /compareTimestampDescNullLast/,
  );

  assert.match(
    operations,
    /compareThematicItemsByCircuitOrder/,
  );
});

test("ordem automática interna usa circuitOrder", () => {
  assert.match(
    desk,
    /circuitOrder/,
  );

  assert.match(
    operations,
    /left\.circuitOrder/,
  );

  assert.match(
    operations,
    /right\.circuitOrder/,
  );

  assert.doesNotMatch(
    operations,
    /publishedAt[\s\S]{0,160}rightTime/,
  );
});

test("Faixa editorial usa posição explícita, entrada no topo e swap", () => {
  assert.doesNotMatch(
    client,
    /atualidade decide a ordem/,
  );

  assert.doesNotMatch(
    client,
    /placeInFaixa\([^)]*,\s*null\)/,
  );

  assert.match(
    client,
    /placeMatchdayEditorialItemAtFaixaTop/,
  );

  assert.match(
    client,
    /swapMatchdayEditorialItemsInFaixa/,
  );

  assert.match(
    client,
    /replaceMatchdayEditorialItemInFaixa/,
  );
});

test("migration conserva a classificação e troca apenas o critério de ordem", () => {
  assert.match(
    migration,
    /rename to matchday_editorial_profile_classification_plan_actuality_v1/,
  );

  assert.match(
    migration,
    /matchday_editorial_profile_state_items as state_row/,
  );

  assert.match(
    migration,
    /state_row\.created_at/,
  );

  assert.match(
    migration,
    /entered_row\.entered_at asc nulls last/,
  );

  assert.match(
    migration,
    /matchday_editorial_profile_classification_plan_actuality_v1/,
  );

  assert.match(
    migration,
    /matchday_editorial_profile_distribution_plan/,
  );

  assert.match(
    migration,
    /partition by classified_row\.classified_zone_key[\s\S]*as zone_order/,
  );

  assert.doesNotMatch(
    migration,
    /editorially_worked_at/,
  );

  assert.doesNotMatch(
    migration,
    /published_at desc|updated_at desc/,
  );
});

test("Últimas fica fora desta alteração estrutural", () => {
  assert.doesNotMatch(
    migration,
    /live_four_news|latest_four|latest_news/,
  );
});
