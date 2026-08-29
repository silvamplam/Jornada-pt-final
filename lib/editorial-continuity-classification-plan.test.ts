import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildMatchdayEditorialProfileDeskDistribution,
  type MatchdayEditorialProfileActiveBankRow,
  type MatchdayEditorialProfileArticleRow,
  type MatchdayEditorialProfileClassificationRow,
  type MatchdayEditorialProfileContinuityClassificationRow,
  type MatchdayEditorialProfileStateRow,
} from "@/lib/editorial-matchday-profile-desk";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

const profile = EDITORIAL_PROFILES.liga_portugal_v1;

const migration = readFileSync(
  "supabase/migrations/20260827094809_matchday_editorial_profile_continuity_classification.sql",
  "utf8",
);

function article(id: string): MatchdayEditorialProfileArticleRow {
  return {
    id,
    slug: `article-${id}`,
    status: "published",
    label: "SPORTING",
    title: "Notícia herdada",
    subtitle: "Subtítulo",
    image_url: null,
    published_at: "2026-08-26T12:00:00.000Z",
    updated_at: "2026-08-26T12:00:00.000Z",
  };
}

test("proveniência de continuidade fica separada da elegibilidade automática", () => {
  assert.match(
    migration,
    /create or replace function public\.matchday_editorial_profile_continuity_classification_plan/i,
  );
  assert.match(migration, /matchday_editorial_continuity_transitions/i);
  assert.match(migration, /bank_row\.automatic_eligible = false/i);
  assert.match(migration, /matchday_editorial_profile_classification_plan/i);

  assert.doesNotMatch(
    migration,
    /create or replace function public\.matchday_editorial_profile_classification_plan/i,
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.matchday_editorial_bank_items/i,
  );
});

test("notícia herdada mantém zona natural sem ganhar ordem automática na nova jornada", () => {
  const sourceId = "00000000-0000-4000-8000-000000000101";

  const stateRows: MatchdayEditorialProfileStateRow[] = [];
  const bankRows: MatchdayEditorialProfileActiveBankRow[] = [{
    source_type: "editorial_article",
    source_id: sourceId,
    status: "active",
    automatic_eligible: false,
  }];
  const classificationRows: MatchdayEditorialProfileClassificationRow[] = [];
  const continuityClassificationRows:
    MatchdayEditorialProfileContinuityClassificationRow[] = [{
      source_type: "editorial_article",
      source_id: sourceId,
      classified_zone_key: "sporting",
    }];

  const result = buildMatchdayEditorialProfileDeskDistribution(
    profile,
    stateRows,
    bankRows,
    [article(sourceId)],
    classificationRows,
    continuityClassificationRows,
  );

  const item = result.activeItems.find(
    (candidate) => candidate.sourceId === sourceId,
  );

  assert.ok(item);
  assert.equal(item.classifiedZoneKey, "sporting");
  assert.equal(item.circuitOrder, null);
  assert.equal(
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === "missing_classification",
    ),
    false,
  );
});

test("notícia própria mantém classificação e ordem automática já existentes", () => {
  const sourceId = "00000000-0000-4000-8000-000000000102";

  const stateRows: MatchdayEditorialProfileStateRow[] = [{
    source_type: "editorial_article",
    source_id: sourceId,
    zone_key: "benfica",
    sort_order: 1,
  }];
  const bankRows: MatchdayEditorialProfileActiveBankRow[] = [{
    source_type: "editorial_article",
    source_id: sourceId,
    status: "active",
    automatic_eligible: true,
  }];
  const classificationRows: MatchdayEditorialProfileClassificationRow[] = [{
    source_type: "editorial_article",
    source_id: sourceId,
    classified_zone_key: "benfica",
    actuality_order: 1,
  }];

  const result = buildMatchdayEditorialProfileDeskDistribution(
    profile,
    stateRows,
    bankRows,
    [article(sourceId)],
    classificationRows,
    [],
  );

  const item = result.activeItems.find(
    (candidate) => candidate.sourceId === sourceId,
  );

  assert.ok(item);
  assert.equal(item.classifiedZoneKey, "benfica");
  assert.equal(item.circuitOrder, 1);
  assert.deepEqual(
    result.zones[0].items.map((candidate) => candidate.sourceId),
    [sourceId],
  );
});
