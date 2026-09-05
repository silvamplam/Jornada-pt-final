import assert from "node:assert/strict";
import {
  readdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  EDITORIAL_PROFILES,
  EDITORIAL_VISUAL_FAMILY_DEFINITIONS,
  editorialProfileDefaultZoneLayouts,
  editorialProfileWithZoneLayouts,
} from "@/lib/editorial-profiles";

const profile =
  EDITORIAL_PROFILES.liga_portugal_v1;

function migrationSource(): string {
  const directory = path.join(
    process.cwd(),
    "supabase",
    "migrations",
  );

  const name = readdirSync(directory).find(
    (candidate) =>
      candidate.endsWith(
        "_matchday_editorial_profile_flexible_layouts_latest_order.sql",
      ),
  );

  assert.ok(name);

  return readFileSync(
    path.join(directory, name),
    "utf8",
  );
}

test(
  "capacidade pertence ao layout, não à zona semântica",
  () => {
    assert.equal(
      EDITORIAL_VISUAL_FAMILY_DEFINITIONS
        .six_news.slots.length,
      6,
    );

    assert.equal(
      EDITORIAL_VISUAL_FAMILY_DEFINITIONS
        .five_news_balanced.slots.length,
      5,
    );

    assert.equal(
      EDITORIAL_VISUAL_FAMILY_DEFINITIONS
        .five_news_secondary.slots.length,
      5,
    );

    const defaults =
      editorialProfileDefaultZoneLayouts(
        profile,
      );

    const sportingSix =
      editorialProfileWithZoneLayouts(
        profile,
        {
          ...defaults,
          sporting: "six_news",
        },
      );

    const benficaFive =
      editorialProfileWithZoneLayouts(
        profile,
        {
          ...defaults,
          benfica: "five_news_secondary",
        },
      );

    assert.equal(
      sportingSix.zones.find(
        (zone) => zone.key === "sporting",
      )?.capacity,
      6,
    );

    assert.equal(
      benficaFive.zones.find(
        (zone) => zone.key === "benfica",
      )?.capacity,
      5,
    );
  },
);

test(
  "defaults preservam a Mesa temática atual",
  () => {
    assert.deepEqual(
      editorialProfileDefaultZoneLayouts(
        profile,
      ),
      {
        benfica: "six_news",
        sporting: "five_news_balanced",
        fc_porto: "five_news_balanced",
        other_liga_clubs: "six_news",
        outside_liga_other:
          "five_news_secondary",
      },
    );
  },
);

test(
  "migration cria estado próprio para layouts e seis blocos",
  () => {
    const migration = migrationSource();

    assert.match(
      migration,
      /thematic_zone_layouts/,
    );

    assert.match(
      migration,
      /thematic_block_order/,
    );

    assert.match(
      migration,
      /thematic_zone_order \|\| array\['latest'\]/,
    );

    assert.match(
      migration,
      /cardinality\(thematic_block_order\) = 6/,
    );
  },
);

test(
  "função-base aceita envelope físico seis em todas as zonas",
  () => {
    const migration = migrationSource();

    const start = migration.indexOf(
      "create or replace function public.apply_matchday_editorial_profile_reconcile(",
    );

    const end = migration.indexOf(
      "create or replace function\n  public.apply_matchday_editorial_profile_workspace_v2(",
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const reconcile =
      migration.slice(start, end);

    assert.doesNotMatch(
      reconcile,
      /when 'sporting' then 5/,
    );

    assert.doesNotMatch(
      reconcile,
      /when 'fc_porto' then 5/,
    );

    assert.doesNotMatch(
      reconcile,
      /when 'outside_liga_other' then 5/,
    );

    assert.match(
      reconcile,
      /when 'sporting' then 6/,
    );

    assert.match(
      reconcile,
      /when 'fc_porto' then 6/,
    );

    assert.match(
      reconcile,
      /when 'outside_liga_other' then 6/,
    );
  },
);

test(
  "workspace V2 valida capacidade pelo layout sem tocar no Legacy",
  () => {
    const migration = migrationSource();

    const start = migration.indexOf(
      "public.apply_matchday_editorial_profile_workspace_v2(",
    );

    assert.ok(start >= 0);

    const v2 = migration.slice(start);

    assert.match(
      v2,
      /manual-position-exceeds-layout/,
    );

    assert.match(
      v2,
      /zone-item-exceeds-layout/,
    );

    assert.match(
      v2,
      /public\.apply_matchday_editorial_profile_workspace\(/,
    );

    assert.doesNotMatch(
      v2,
      /apply_matchday_editorial_desk_state/,
    );

    assert.doesNotMatch(
      v2,
      /live_public_zone_order/,
    );
  },
);

test(
  "migration não substitui o wrapper reconcile_v2 das 23:00",
  () => {
    const migration = migrationSource();

    assert.doesNotMatch(
      migration,
      /create or replace function public\.apply_matchday_editorial_profile_reconcile_v2/,
    );

    assert.doesNotMatch(
      migration,
      /create function public\.apply_matchday_editorial_profile_reconcile_v2/,
    );
  },
);
