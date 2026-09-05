import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260902095825_matchday_faixa_bank_atomic_apply_fix.sql",
  "utf8",
);
const aggregateReaderMigration = readFileSync(
  "supabase/migrations/20260902110327_matchday_live_desk_aggregate_tracking_reader.sql",
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
const serializer = readFileSync(
  "lib/editorial-matchday-live-layout-physical-apply.ts",
  "utf8",
);

test("Faixa e Seleção são lidas da autoridade transversal", () => {
  assert.match(
    reader,
    /rpc\/read_matchday_live_desk_aggregate_tracking/u,
  );
  assert.doesNotMatch(reader, /matchday_horizontal_news\?/u);
  assert.match(
    aggregateReaderMigration,
    /project_matchday_live_layout_bank_item_states[\s\S]*matchday_live_layout_placements/u,
  );
  assert.match(reader, /placement\.placement_type === "video_highlight"/u);
  assert.match(reader, /placement\.placement_type === "selection"/u);
  assert.doesNotMatch(route, /matchday_live_layout_placements\?/u);
});

test("reader, preview e Apply físico transportam o Vídeo como placement independente", () => {
  assert.match(reader, /placement_type === "video_highlight"/u);
  assert.match(reader, /independentPlacementIdentities/u);
  assert.match(client, /physicalDeskPlacementsOfType\(physicalDesk, "video_highlight"\)/u);
  assert.match(client, /placementType: "video_highlight"/u);
  assert.doesNotMatch(client, /draftVideoHighlightIdentity/u);
  assert.match(serializer, /placementType: LiveLayoutWorkspacePlacementType/u);
  assert.match(serializer, /video_highlight/u);
  assert.match(route, /apply_matchday_live_layout_physical_v20/u);
  assert.doesNotMatch(route, /apply_matchday_live_layout_physical_workspace_v14/u);
  assert.doesNotMatch(route, /reconcileMatchdayEditorialProfileWorkspace/u);
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
