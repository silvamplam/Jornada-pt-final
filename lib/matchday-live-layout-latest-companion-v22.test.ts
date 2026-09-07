import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const path =
  "supabase/migrations/20260906234000_matchday_live_layout_latest_companion_v22.sql";

const migration = readFileSync(path, "utf8");

test("5B1-A cria autoridade física separada por zone_id", () => {
  assert.match(
    migration,
    /create table public\.matchday_live_layout_latest_companion/,
  );
  assert.match(
    migration,
    /foreign key \(zone_id, matchday_id\)[\s\S]*references public\.matchday_live_layout_zones\(id, matchday_id\)/,
  );
  assert.match(
    migration,
    /zone_row\.visual_family = 'four_news'/,
  );
  assert.doesNotMatch(
    migration,
    /alter table public\.matchday_live_layout_workspace_settings[\s\S]*add/i,
  );
});

test("host associado não pode deixar de ser four_news nem ser apagado implicitamente", () => {
  assert.match(
    migration,
    /before update of visual_family[\s\S]*matchday_live_layout_zones/,
  );
  assert.match(
    migration,
    /matchday-live-layout-latest-companion-v22-host-layout-required/,
  );
  assert.match(
    migration,
    /on delete no action[\s\S]*deferrable initially deferred/,
  );
});

test("OCC v22 acrescenta apenas a relação ao token físico existente", () => {
  assert.match(
    migration,
    /matchday_live_layout_workspace_token_v22/,
  );
  assert.match(
    migration,
    /matchday_editorial_profile_workspace_token_v13/,
  );
  assert.match(
    migration,
    /\|latest_companion=/,
  );
});

test("reader v22 estende v13 sem reimplementar o workspace", () => {
  const readerStart = migration.indexOf(
    "create function public.read_matchday_live_layout_workspace_v22",
  );
  const applyStart = migration.indexOf(
    "create function public.apply_matchday_live_layout_physical_v22",
  );

  assert.ok(readerStart >= 0 && applyStart > readerStart);

  const reader = migration.slice(readerStart, applyStart);

  assert.match(
    reader,
    /from public\.read_matchday_live_layout_workspace_v13/,
  );
  assert.match(reader, /latest_companion jsonb/);
  assert.match(reader, /'zone_id', companion_row\.zone_id/);
  assert.doesNotMatch(
    reader,
    /\b(?:insert|update|delete|merge|truncate)\b/i,
  );
});

test("Apply v22 reutiliza v20 e gere apenas a relação companion", () => {
  const start = migration.indexOf(
    "create function public.apply_matchday_live_layout_physical_v22",
  );
  const end = migration.indexOf(
    "-- ============================================================\n-- 5. ACL POSTCONDITIONS",
  );

  assert.ok(start >= 0 && end > start);

  const apply = migration.slice(start, end);

  assert.match(
    apply,
    /public\.apply_matchday_live_layout_physical_v20\(/,
  );
  assert.match(
    apply,
    /p_latest_companion_zone_id uuid/,
  );
  assert.match(
    apply,
    /zone_row\.visual_family = 'four_news'/,
  );
  assert.match(
    apply,
    /matchday-live-layout-latest-companion-v22-concurrent-write/,
  );
  assert.doesNotMatch(
    apply,
    /update public\.matchday_editorial_bank_items/i,
  );
});

test("5B1-A não altera selection nem classificação", () => {
  assert.doesNotMatch(migration, /placement_type\s*=\s*'selection'/i);
  assert.doesNotMatch(migration, /classification_key\s*=/i);
  assert.doesNotMatch(migration, /classification_source\s*=/i);
  assert.doesNotMatch(migration, /classified_at\s*=/i);
});