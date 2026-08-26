import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260826164500_thematic_workspace_continuity_sources.sql",
  "utf8",
);

const route = readFileSync(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
  "utf8",
);

test("workspace sources separa elegibilidade editorial de classificaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica", () => {
  assert.match(
    migration,
    /create or replace function public\.matchday_editorial_profile_workspace_sources/,
  );
  assert.match(
    migration,
    /bank_row\.automatic_eligible/,
  );
  assert.match(
    migration,
    /matchday_editorial_continuity_transitions/,
  );
  assert.match(
    migration,
    /source_matchday_id/,
  );
  assert.match(
    migration,
    /source_composition_id/,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.matchday_editorial_profile_classification_plan/,
  );
});

test("Apply base passa a aceitar fontes de workspace sem transformar propostas em placements", () => {
  assert.match(
    migration,
    /v_count <> 3/,
  );
  assert.match(
    migration,
    /v_source_count <> 2/,
  );
  assert.match(
    migration,
    /v_new_exact constant text := \$new\$    \) > 1/,
  );
});

test("continuidade continua fail-closed e exige exatamente uma colocaÃƒÂ§ÃƒÂ£o", () => {
  assert.match(
    migration,
    /where source_row\.is_continuity/,
  );
  assert.match(
    migration,
    /\) <> 1/,
  );
  assert.match(
    migration,
    /workspace-v7-continuity-placement-incomplete/,
  );
});

test("token inclui fontes utilizÃƒÂ¡veis e artigos herdados", () => {
  assert.match(
    migration,
    /'workspace_sources'/,
  );
  assert.match(
    migration,
    /'workspace_articles'/,
  );
});

test("endpoint administrativo usa apenas o Apply v7", () => {
  assert.match(
    route,
    /rpc\/apply_matchday_editorial_profile_workspace_v7/,
  );
  assert.match(
    route,
    /profile-workspace-v7-/,
  );
});
test("workspace sources exige classificaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica ou transiÃƒÂ§ÃƒÂ£o de continuidade vÃƒÂ¡lida", () => {
  assert.match(
    migration,
    /automatic_eligible[\s\S]*matchday_editorial_profile_classification_plan/,
  );
  assert.match(
    migration,
    /matchday_editorial_continuity_transitions/,
  );
  assert.match(
    migration,
    /target_matchday_id = p_matchday_id/,
  );
});