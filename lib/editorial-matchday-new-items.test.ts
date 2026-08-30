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

function distribution(workedAt: string | null) {
  return buildMatchdayEditorialProfileDeskDistribution(
    EDITORIAL_PROFILES.liga_portugal_v1,
    [{ source_type: "editorial_article", source_id: "article-a", zone_key: "benfica", sort_order: 1 }],
    [{
      source_type: "editorial_article",
      source_id: "article-a",
      status: "active",
      automatic_eligible: true,
      editorially_worked_at: workedAt,
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

test("Novas deriva do estado persistente da linha canónica da jornada", () => {
  assert.equal(distribution(null).activeItems[0]?.isNew, true);
  assert.equal(distribution("2026-08-28T08:30:00.000Z").activeItems[0]?.isNew, false);
  assert.match(migration, /add column editorially_worked_at timestamptz/i);
  assert.match(migration, /update public\.matchday_editorial_bank_items[\s\S]*set editorially_worked_at = statement_timestamp\(\)/i);
  assert.match(migration, /old\.editorially_worked_at is not null[\s\S]*new\.editorially_worked_at := old\.editorially_worked_at/i);
  assert.match(migration, /new\.continuity_source_matchday_id is not null[\s\S]*new\.editorially_worked_at := statement_timestamp\(\)/i);
});

test("Apply marca apenas decisões explícitas e nunca reabre uma notícia trabalhada", () => {
  assert.match(migration, /p_worked_source_ids jsonb/i);
  assert.match(migration, /set editorially_worked_at = pg_catalog\.coalesce\([\s\S]*statement_timestamp\(\)/i);
  assert.match(migration, /bank_row\.editorially_worked_at is null/i);
  assert.match(client, /workedIdentities/u);
  assert.match(client, /workedSourceIds/u);
});

test("Apply v9 preserva o v8, que fecha duplicações públicas da Seleção", () => {
  assert.match(
    route,
    /rpc\/apply_matchday_editorial_profile_workspace_v10/u,
  );
  assert.match(
    migration,
    /from public\.apply_matchday_editorial_profile_workspace_v7/u,
  );
  assert.match(
    migration,
    /matchday-editorial-profile-workspace-v8-duplicate-public-placement/u,
  );
});

test("usar uma notícia como Destaque editorial também conta como decisão explícita", () => {
  const start = client.indexOf("function changeVideoHighlight");
  const end = client.indexOf("useEffect(() =>", start);
  const implementation = client.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(implementation, /highlightWorkedIdentity/u);
  assert.match(implementation, /withWorkedIdentities/u);
});

test("Novas reutiliza pesquisa, classificação, seleção e paginação das fontes", () => {
  assert.match(client, /type SourceViewKey = "new" \| "available" \| "faixa"/u);
  assert.match(client, /Novas \{newItems\.length\}/u);
  assert.match(client, /item\.isNew === true/u);
  assert.match(client, /exclusivePlacedIdentitySet/u);
  assert.match(client, /classifiedZoneKey/u);
  assert.match(client, /filteredNewItems\.slice\(/u);
  assert.doesNotMatch(client, /localStorage|sessionStorage/u);
});
