import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260828101705_thematic_editorial_new_workflow.sql",
  "utf8",
);

test("MILAN e Rafael Leão não viram FC Porto por uma referência secundária no body", () => {
  assert.match(migration, /create or replace function public\.matchday_editorial_profile_classification_plan/i);
  assert.match(
    migration,
    /concat_ws\(\s*' ',\s*article_row\.title,\s*article_row\.subtitle\s*\)\s*\) as normalized_headline/i,
  );
  assert.doesNotMatch(
    migration,
    /concat_ws\(\s*' ',\s*article_row\.title,\s*article_row\.subtitle,\s*article_row\.body/i,
  );
  assert.match(migration, /candidate_row\.normalized_headline ~[\s\S]*as mentions_fc_porto/i);
});

test("evidência estrutural continua prioritária e o fallback incerto fica fora da Liga", () => {
  const structural = migration.indexOf(
    "when candidate_row.structural_zone_key =",
  );
  const textual = migration.indexOf(
    "candidate_row.mentions_benfica::integer",
  );
  assert.ok(structural >= 0 && textual > structural);
  assert.match(migration, /else 'outside_liga_other'/i);
});

test("prefixo estrutural antes de | continua a identificar o clube principal", () => {
  assert.match(
    migration,
    /end as label_prefix[\s\S]*select candidate_row\.label_prefix/u,
  );
});
