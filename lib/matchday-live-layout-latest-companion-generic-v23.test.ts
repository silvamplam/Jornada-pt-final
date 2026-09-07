import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const path =
  "supabase/migrations/20260907143000_matchday_live_layout_latest_companion_generic_v23.sql";

const migration = readFileSync(path, "utf8");

test("V23 remove apenas os guards que acoplam companion a layout", () => {
  assert.match(
    migration,
    /drop trigger if exists[\s\S]*matchday_live_layout_latest_companion_row_guard/,
  );

  assert.match(
    migration,
    /drop trigger if exists[\s\S]*matchday_live_layout_latest_companion_host_guard/,
  );

  assert.match(
    migration,
    /drop function if exists[\s\S]*assert_matchday_live_layout_latest_companion_row_v22/,
  );

  assert.match(
    migration,
    /drop function if exists[\s\S]*prevent_matchday_live_layout_latest_companion_host_change_v22/,
  );
});

test("V23 mantém a FK contextual como autoridade da relação", () => {
  assert.match(
    migration,
    /matchday_live_layout_latest_companion_zone_context_fk/,
  );

  assert.match(
    migration,
    /layout-independent|independent of zone layout/i,
  );
});

test("Apply v22 continua backward-compatible mas aceita qualquer zona existente", () => {
  const start = migration.indexOf(
    "create or replace function public.apply_matchday_live_layout_physical_v22",
  );

  const end = migration.indexOf(
    "-- ============================================================\n-- 3. POSTCONDITIONS",
  );

  assert.ok(start >= 0 && end > start);

  const apply = migration.slice(start, end);

  assert.match(
    apply,
    /zone_row\.zone_id = p_latest_companion_zone_id/,
  );

  assert.doesNotMatch(
    apply,
    /zone_row\.visual_family\s*=\s*'four_news'/,
  );

  assert.match(
    apply,
    /public\.apply_matchday_live_layout_physical_v20\(/,
  );

  assert.match(
    apply,
    /p_latest_companion_zone_id uuid/,
  );
});

test("V23 não recalcula classificação nem migra selection", () => {
  assert.doesNotMatch(
    migration,
    /update\s+public\.matchday_editorial_bank_items/i,
  );

  assert.doesNotMatch(
    migration,
    /classification_key\s*=/i,
  );

  assert.doesNotMatch(
    migration,
    /classification_source\s*=/i,
  );

  assert.doesNotMatch(
    migration,
    /placement_type\s*=\s*'selection'/i,
  );
});

test("V23 preserva ACL fechada e valida ausência dos guards", () => {
  assert.match(
    migration,
    /matchday-live-layout-latest-companion-v23-layout-guard-still-present/,
  );

  assert.match(
    migration,
    /matchday-live-layout-latest-companion-v23-context-fk-missing/,
  );

  assert.match(
    migration,
    /grant execute on function[\s\S]*to service_role/,
  );

  assert.match(
    migration,
    /matchday-live-layout-latest-companion-v23-table-acl-invalid/,
  );
});