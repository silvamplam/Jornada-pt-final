import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path: string) {
  return fs.readFileSync(path, "utf8");
}

const correctiveMigration =
  "supabase/migrations/20260818175500_matchday_editorial_continuity_live_snapshot.sql";

test("o handoff nasce da p?gina viva e n?o da composi??o hier?rquica", () => {
  const migration = source(correctiveMigration);

  assert.match(
    migration,
    /build_matchday_live_carryover_snapshot/,
  );

  assert.match(
    migration,
    /from public\.matchday_editorials e/,
  );

  assert.match(
    migration,
    /from public\.matchday_highlights h/,
  );

  assert.match(
    migration,
    /from public\.matchday_live_layout_items l/,
  );

  assert.doesNotMatch(
    migration,
    /from public\.matchday_hierarchical_composition_slots/,
  );
});

test("a composi??o publicada fecha apenas a Jornada de origem", () => {
  const migration = source(correctiveMigration);

  assert.match(
    migration,
    /is_managed = false/,
  );

  assert.match(
    migration,
    /next_matchday\.season_id = v_matchday\.season_id/,
  );

  assert.match(
    migration,
    /next_matchday\.number > v_matchday\.number/,
  );
});

test("o snapshot n?o transfere artigos para a Jornada seguinte", () => {
  const migration = source(correctiveMigration);

  assert.match(
    migration,
    /'article_id', null/,
  );

  assert.doesNotMatch(
    migration,
    /insert into public\.editorial_articles/,
  );

  assert.doesNotMatch(
    migration,
    /insert into public\.matchday_latest_news/,
  );
});

test("o conte?do real da nova Jornada substitui o herdado", () => {
  const page = source(
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  );

  assert.match(
    page,
    /currentHighlightByOrder\.get\(position\) \?\?\s*carryoverHighlightByOrder\.get\(position\)/,
  );

  assert.match(
    page,
    /liveLayoutItemBySlotType\.get\(position\.transferSlotType\)[\s\S]*carryoverLiveLayoutItemBySlotType\.get/,
  );
});

test("a leitura p?blica aceita apenas o snapshot vivo v2", () => {
  const publicMatchday = source("lib/public-matchday.ts");

  assert.match(
    publicMatchday,
    /snapshot\.version !== 2/,
  );

  assert.match(
    publicMatchday,
    /live_layout_items/,
  );

  assert.match(
    publicMatchday,
    /highlights/,
  );
});
