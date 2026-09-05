import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildMatchdayEditorialProfileDeskDistribution,
  type MatchdayEditorialProfileActiveBankRow,
  type MatchdayEditorialProfileArticleRow,
  type MatchdayEditorialProfileClassificationRow,
} from "@/lib/editorial-matchday-profile-desk";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

const migration = readFileSync(fileURLToPath(new URL(
  "../supabase/migrations/20260905123608_matchday_contextual_classification_physical_boundary_v16.sql",
  import.meta.url,
)), "utf8");

function functionBody(name: string, nextHeading: string): string {
  const start = migration.indexOf(name);
  const end = migration.indexOf(nextHeading, start);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextHeading} must follow ${name}`);
  return migration.slice(start, end);
}

test("v16 confines automatic positional distribution to pre-cutover matchdays", () => {
  const plan = functionBody(
    "create or replace function public.matchday_editorial_profile_distribution_plan(",
    "-- 2. LEGACY DISTRIBUTION WRITER",
  );
  const writer = functionBody(
    "create or replace function public.refresh_matchday_editorial_profile_distribution(",
    "-- 3. BANK AND ASSIGNMENT TRIGGERS",
  );
  const triggers = functionBody(
    "public.refresh_matchday_editorial_profile_distribution_from_bank()",
    "-- 4. PHYSICAL OCC",
  );

  assert.match(plan, /matchday_live_layout_physical_cutovers/u);
  assert.match(plan, /where legacy_authority\.enabled/u);
  assert.match(plan, /values\s*\('benfica'::text, 6\)/u);

  const lock = writer.indexOf("acquire_matchday_live_layout_cutover_writer_lock");
  const marker = writer.indexOf("matchday_live_layout_physical_cutovers");
  const stateWrite = writer.indexOf("insert into public.matchday_editorial_profile_state_items");
  assert.ok(lock > -1 && marker > lock && stateWrite > marker);
  assert.match(writer, /then\s+return 0;/u);
  assert.match(writer, /grant execute on function[\s\S]*to service_role/u);

  assert.ok((triggers.match(/matchday_live_layout_physical_cutovers/g) ?? []).length >= 2);
  assert.match(triggers, /refresh_matchday_editorial_profile_distribution_from_assignment/u);
  assert.doesNotMatch(triggers, /matchday_live_layout_placements\s+as/u);
});

test("v16 physical OCC and tracking ignore residual automatic state", () => {
  const token = functionBody(
    "create or replace function public.matchday_editorial_profile_workspace_token_v13(",
    "-- The administrative desk still uses",
  );
  const deskToken = functionBody(
    "public.matchday_editorial_profile_workspace_token(",
    "-- 5. ADMIN/TRACKING READER",
  );
  const reader = functionBody(
    "create or replace function public.read_matchday_live_desk_aggregate_tracking(",
    "-- 6. CONTRACT AND PRIVILEGE POSTCONDITIONS",
  );

  assert.match(token, /when authority\.is_physical then ''/u);
  assert.match(token, /'assignment'/u);
  assert.match(token, /'explicit_bank'/u);
  assert.match(token, /'zones'/u);
  assert.match(token, /'blocks'/u);
  assert.match(token, /'placements'/u);
  assert.match(token, /'state_memory'/u);
  assert.match(token, /'workspace_settings'/u);
  assert.match(token, /'latest_zone_mode'/u);
  assert.match(token, /'latest_zone_title_color'/u);
  assert.match(token, /'physical_cutover'/u);
  assert.doesNotMatch(token, /matchday_editorial_profile_state_items/u);
  assert.doesNotMatch(token, /matchday_editorial_profile_zone_items/u);

  assert.match(deskToken, /matchday_live_layout_physical_cutovers/u);
  assert.match(deskToken, /matchday_editorial_profile_workspace_token_v13/u);
  assert.match(deskToken, /matchday_editorial_profile_workspace_token_uncached/u);

  assert.match(reader, /with physical_authority as materialized/u);
  assert.match(reader, /on not physical_authority\.enabled/u);
  assert.match(reader, /where not physical_authority\.enabled/u);
  assert.match(reader, /projected_row\.classification_key/u);
  assert.match(reader, /matchday_live_layout_placements/u);
});

test("v16 preserves Bank classification contracts and residual rows", () => {
  assert.doesNotMatch(
    migration,
    /create or replace function\s+(?:public\.)?materialize_matchday_editorial_bank_contextual_classification/iu,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function\s+jornada_private\.refresh_matchday_editorial_bank_automatic_classifications/iu,
  );
  assert.doesNotMatch(
    migration,
    /delete from public\.matchday_editorial_profile_state_items/iu,
  );
  assert.doesNotMatch(migration, /drop table[\s\S]*matchday_editorial_profile_state_items/iu);
  assert.doesNotMatch(migration, /assert_matchday_live_layout_projection_write_v14/iu);
});

test("physical desk can present contextual classification without legacy state", () => {
  const articleId = "00000000-0000-4000-8000-000000000091";
  const bankRows: MatchdayEditorialProfileActiveBankRow[] = [{
    id: "00000000-0000-4000-8000-000000000092",
    source_type: "editorial_article",
    source_id: articleId,
    status: "active",
    automatic_eligible: true,
    editorial_state: "NOVA",
  }];
  const articleRows: MatchdayEditorialProfileArticleRow[] = [{
    id: articleId,
    slug: "classified-without-legacy-state",
    status: "published",
    label: "Teste",
    title: "Classificacao fisicamente independente",
    subtitle: null,
    image_url: null,
    published_at: "2026-09-05T10:00:00.000Z",
    updated_at: "2026-09-05T10:00:00.000Z",
  }];
  const classificationRows: MatchdayEditorialProfileClassificationRow[] = [{
    source_type: "editorial_article",
    source_id: articleId,
    classified_zone_key: "sporting",
    actuality_order: 1,
  }];

  const result = buildMatchdayEditorialProfileDeskDistribution(
    EDITORIAL_PROFILES.liga_portugal_v1,
    [],
    bankRows,
    articleRows,
    classificationRows,
    undefined,
    { expectLegacyAutomaticState: false },
  );

  assert.equal(result.activeItems[0]?.classifiedZoneKey, "sporting");
  assert.equal(
    result.diagnostics.some(({ code }) => code === "active_bank_without_state"),
    false,
  );
  assert.equal(result.inactiveHistoricalCount, 0);
});
