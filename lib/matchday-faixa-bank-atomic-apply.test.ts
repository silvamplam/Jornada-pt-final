import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260902095825_matchday_faixa_bank_atomic_apply_fix.sql",
  "utf8",
);
const reader = readFileSync(
  "lib/editorial-matchday-profile-desk.ts",
  "utf8",
);
const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const route = readFileSync(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
  "utf8",
);

test("Faixa e Seleção são lidas da autoridade transversal", () => {
  assert.match(
    reader,
    /matchday_live_layout_placements\?select=bank_item_id,placement_type,zone_id,slot_position/u,
  );
  assert.doesNotMatch(reader, /matchday_horizontal_news\?/u);
  assert.match(
    route,
    /matchday_live_layout_placements\?select=id,bank_item_id,slot_position[\s\S]*placement_type=eq\.selection/u,
  );
});

test("reader, preview e POST reservam o Vídeo fora do circuito temático", () => {
  assert.match(reader, /placement_type === "video_highlight"/u);
  assert.match(reader, /independentPlacementIdentities/u);
  assert.match(client, /draftVideoHighlightIdentity/u);
  assert.match(client, /independentPlacementIdentities/u);
  assert.match(route, /independentPlacementIdentity/u);
  assert.match(
    route,
    /reconcileMatchdayEditorialProfileWorkspace\([\s\S]*independentPlacementIdentities/u,
  );
});

test("v7 conta Selection e o vídeo efetivo exatamente uma vez", () => {
  assert.match(
    migration,
    /create or replace function public\.apply_matchday_editorial_profile_workspace_v7/u,
  );
  assert.match(migration, /requested_placements\(source_type, source_id\) as materialized/u);
  assert.match(migration, /p_selection_bank_item_ids/u);
  assert.match(migration, /placement_type = 'video_highlight'/u);
  assert.match(migration, /highlight_action' = 'preserve'/u);
  assert.match(migration, /highlight_action' = 'replace'/u);
  assert.match(migration, /union all/u);
  assert.match(
    migration,
    /select \*[\s\S]*from public\.apply_matchday_editorial_profile_workspace_v6/u,
  );
  assert.match(
    migration,
    /matchday-editorial-profile-workspace-v7-continuity-placement-incomplete/u,
  );
  assert.match(
    migration,
    /revoke all on function public\.apply_matchday_editorial_profile_workspace_v7\([\s\S]*service_role/u,
  );
});
