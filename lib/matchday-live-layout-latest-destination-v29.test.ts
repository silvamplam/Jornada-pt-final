import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const path =
  "supabase/migrations/20260908204307_matchday_live_layout_latest_destination_authority_v29.sql";
const migration = readFileSync(path, "utf8");

function section(start: string, end: string): string {
  const startAt = migration.indexOf(start);
  const endAt = migration.indexOf(end, startAt + start.length);
  assert.ok(startAt >= 0 && endAt > startAt);
  return migration.slice(startAt, endAt);
}

const apply = section(
  "create function public.apply_matchday_live_layout_physical_v29(",
  "revoke all on function\n  public.apply_matchday_live_layout_physical_v29(",
);
const legacyFacade = section(
  "create function public.set_matchday_latest_zone_placement_v29(",
  "revoke all on function\n  public.set_matchday_latest_zone_placement_v29(",
);

test("v29 fecha os três pares válidos antes do Apply físico", () => {
  assert.match(apply, /v_latest_zone_placement in \('top', 'hidden'\)[\s\S]*p_latest_companion_zone_id is null/);
  assert.match(apply, /v_latest_zone_placement = 'four_news'[\s\S]*p_latest_companion_zone_id is not null/);
  assert.match(apply, /matchday-live-layout-latest-destination-v29-incomplete/);
  assert.match(apply, /public\.apply_matchday_live_layout_physical_v22\(/);
});

test("facade legacy nunca consegue criar four_news sem UUID", () => {
  assert.match(legacyFacade, /matchday_live_layout_physical_cutovers/);
  assert.match(legacyFacade, /p_latest_zone_placement not in \('top', 'hidden'\)/);
  assert.match(legacyFacade, /matchday-latest-destination-v29-zone-id-required/);
  assert.match(
    legacyFacade,
    /delete from public\.matchday_live_layout_latest_companion[\s\S]*public\.set_matchday_latest_zone_placement_v15\(/,
  );
  assert.match(
    legacyFacade,
    /v_companion_changed := found;[\s\S]*result_row\.changed or v_companion_changed/,
  );
});

test("v29 preserva storage, dados e handoff existentes", () => {
  assert.doesNotMatch(migration, /alter table|create table|drop table/i);
  assert.doesNotMatch(migration, /update\s+public\.|insert\s+into\s+public\./i);
  assert.doesNotMatch(migration, /matchday_live_layout_physical_handoffs|J05|J06/i);
  assert.doesNotMatch(migration, /visual_family|public_title|classification/i);
});

test("apenas os entrypoints v29 ficam executáveis pelo service_role", () => {
  for (const signature of [
    "apply_matchday_live_layout_physical_v29",
    "set_matchday_latest_zone_placement_v29",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function[\\s\\S]*public\\.${signature}`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function[\\s\\S]*public\\.${signature}`),
    );
  }
  assert.match(migration, /apply_matchday_live_layout_physical_v22[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /apply_matchday_live_layout_physical_v20[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /apply_matchday_live_layout_physical_workspace_v14[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /set_matchday_latest_zone_placement_v15\(uuid, text\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
});
