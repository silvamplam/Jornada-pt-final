import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";
import { buildMatchdayEditorialProfileDeskDistribution } from "@/lib/editorial-matchday-profile-desk";

const migration = readFileSync(
  "supabase/migrations/20260828101705_thematic_editorial_new_workflow.sql",
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
const state = readFileSync(
  "lib/editorial-matchday-live-layout-desk-state.ts",
  "utf8",
);
const serializer = readFileSync(
  "lib/editorial-matchday-live-layout-physical-apply.ts",
  "utf8",
);

function distribution(editorialState: "NOVA" | "DESALOJADA" | null) {
  return buildMatchdayEditorialProfileDeskDistribution(
    EDITORIAL_PROFILES.liga_portugal_v1,
    [{ source_type: "editorial_article", source_id: "article-a", zone_key: "benfica", sort_order: 1 }],
    [{
      source_type: "editorial_article",
      source_id: "article-a",
      status: "active",
      automatic_eligible: true,
      editorially_worked_at: null,
      editorial_state: editorialState,
    }],
    [{
      id: "article-a",
      label: "BENFICA",
      title: "Notícia A",
      subtitle: null,
      image_url: null,
      published_at: "2026-08-28T08:00:00.000Z",
      updated_at: "2026-08-28T08:00:00.000Z",
    }],
    [{ source_type: "editorial_article", source_id: "article-a", classified_zone_key: "benfica", actuality_order: 1 }],
  );
}

test("Novas deriva apenas do estado editorial projetado", () => {
  assert.equal(distribution("NOVA").activeItems[0]?.isNew, true);
  assert.equal(distribution("DESALOJADA").activeItems[0]?.isNew, false);
  assert.equal(distribution(null).activeItems[0]?.isNew, false);
  assert.match(migration, /add column editorially_worked_at timestamptz/i);
  assert.match(migration, /update public\.matchday_editorial_bank_items[\s\S]*set editorially_worked_at = statement_timestamp\(\)/i);
  assert.match(migration, /old\.editorially_worked_at is not null[\s\S]*new\.editorially_worked_at := old\.editorially_worked_at/i);
  assert.match(migration, /new\.continuity_source_matchday_id is not null[\s\S]*new\.editorially_worked_at := statement_timestamp\(\)/i);
});

test("Apply físico transporta as decisões explícitas acumuladas no draft", () => {
  assert.match(migration, /p_worked_source_ids jsonb/i);
  assert.match(migration, /set editorially_worked_at = pg_catalog\.coalesce\([\s\S]*statement_timestamp\(\)/i);
  assert.match(migration, /bank_row\.editorially_worked_at is null/i);
  assert.match(state, /workedBankItemIds: uniqueSorted\(\[[\s\S]*\.\.\.workedBankItemIds/u);
  assert.match(serializer, /workedBankItemIds: physicalDesk\.current\.workedBankItemIds/u);
  assert.match(serializer, /p_worked_bank_item_ids: payload\.workedBankItemIds/u);
});

test("a rota usa o Apply físico transacional atual", () => {
  assert.match(
    route,
    /rpc\/apply_matchday_live_layout_physical_v29/u,
  );
  assert.doesNotMatch(route, /apply_matchday_editorial_profile_workspace/u);
});

test("usar uma notícia como Destaque editorial também conta como decisão explícita", () => {
  assert.match(client, /placementType: "video_highlight", zoneId: null, slotPosition: 1/u);
  assert.match(state, /return withPlacement\(state, bankItemId, target\)/u);
  assert.match(state, /commitSnapshot\(state,[\s\S]*bankItemId/u);
});

test("Novas integra o tracking simultâneo sem inferência por worked_at", () => {
  assert.match(client, /const trackingEntries = useMemo/u);
  assert.match(client, /editorialState:[\s\S]*"DESALOJADA"[\s\S]*"NOVA"/u);
  assert.match(client, /entry\.editorialState === "NOVA"/u);
  assert.match(client, /entry\.classifiedZoneKey === candidateClassFilter/u);
  assert.match(client, /selectMatchdayEditorialTrackingItems\([\s\S]*trackingEntries\.filter[\s\S]*"all"/u);
  assert.doesNotMatch(client, /item\.isNew === true/u);
  assert.doesNotMatch(client, /SourceViewKey|activeSourceView/u);
  assert.doesNotMatch(client, /localStorage|sessionStorage/u);
});
