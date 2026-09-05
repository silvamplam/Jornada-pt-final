import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260904130000_matchday_live_layout_workspace_v13_reader.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-layout-workspace-v13-reader-pg17.sql";
const writerPath =
  "supabase/migrations/20260904120000_matchday_live_layout_physical_writer_v13_shadow.sql";
const routePath =
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts";

const migration = readFileSync(migrationPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");
const writer = readFileSync(writerPath, "utf8");
const route = readFileSync(routePath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `secao inicial nao encontrada: ${startNeedle}`);
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `secao final nao encontrada: ${endNeedle}`);
  return migration.slice(start, end);
}

const reader = section(
  "create function public.read_matchday_live_layout_workspace_v13(",
  "revoke all on function\n  public.read_matchday_live_layout_workspace_v13",
);

test("reader v13 e uma unica funcao SQL estavel e exclusivamente de leitura", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
  assert.match(reader, /language sql\s+stable\s+security definer\s+set search_path = ''/);
  assert.doesNotMatch(reader, /\b(?:insert|update|delete|merge|truncate)\b/i);
  assert.doesNotMatch(migration, /create\s+table/i);
  assert.doesNotMatch(migration, /drop\s+function|create\s+or\s+replace\s+function/i);
  assert.doesNotMatch(
    migration,
    /apply_matchday_editorial_profile_workspace_v12|apply_matchday_live_layout_physical_state_v13_shadow/,
  );
});

test("reader devolve token e todo o estado fisico sem projection inferida", () => {
  assert.match(reader, /matchday_editorial_profile_workspace_token_v13/);
  for (const table of [
    "matchday_live_layout_zones",
    "matchday_live_layout_blocks",
    "matchday_live_layout_placements",
    "matchday_editorial_bank_items",
    "matchday_live_layout_bank_item_state_memory",
    "matchday_live_layout_zone_legacy_projection",
  ]) {
    assert.match(reader, new RegExp(table));
  }
  for (const output of [
    "state_token",
    "zones",
    "blocks",
    "placements",
    "bank_items",
    "state_memory",
    "explicit_bank_item_ids",
    "displaced_bank_item_ids",
    "worked_bank_item_ids",
    "legacy_zone_projection",
  ]) {
    assert.match(reader, new RegExp(output));
  }
  assert.match(reader, /projection_row\.legacy_zone_key/);
  assert.doesNotMatch(reader, /zone_row\.public_title\s*=|block_row\.sort_order\s*=\s*projection/i);
});

test("reader e apenas service_role", () => {
  assert.match(
    migration,
    /revoke all on function[\s\S]*read_matchday_live_layout_workspace_v13\(uuid, text\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function[\s\S]*read_matchday_live_layout_workspace_v13\(uuid, text\)[\s\S]*to service_role/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function[\s\S]*read_matchday_live_layout_workspace_v13\(uuid, text\)[\s\S]*to (?:public|anon|authenticated)/,
  );
});

test("writer v13 permanece privado e route usa apenas a facade v20", () => {
  assert.match(
    writer,
    /revoke all on function[\s\S]*apply_matchday_live_layout_physical_state_v13_shadow[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    writer,
    /grant execute on function\s+jornada_private\.apply_matchday_live_layout_physical_state_v13_shadow/,
  );
  assert.match(route, /apply_matchday_live_layout_physical_v20/);
  assert.doesNotMatch(route, /apply_matchday_live_layout_physical_workspace_v14/);
  assert.doesNotMatch(route, /apply_matchday_editorial_profile_workspace_v12/);
  assert.doesNotMatch(route, /read_matchday_live_layout_workspace_v13|physical_state_v13_shadow/);
});

test("fixture PG17 cobre snapshot e termina sempre em rollback", () => {
  assert.match(fixture, /^\\set ON_ERROR_STOP on/);
  assert.match(fixture, /read_matchday_live_layout_workspace_v13/);
  assert.match(fixture, /sixth physical zone/i);
  assert.match(fixture, /legacy_zone_projection/);
  assert.match(fixture, /explicit_bank_item_ids/);
  assert.match(fixture, /displaced_bank_item_ids/);
  assert.match(fixture, /worked_bank_item_ids/);
  assert.match(fixture, /rollback;\s*$/);
});

test("ficheiros explicitamente fora de ambito nao foram alterados", () => {
  const protectedPaths = [
    routePath,
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
    "supabase/migrations/20260903204800_matchday_editorial_movement_contract_v12.sql",
    writerPath,
    "lib/public-matchday-thematic.ts",
    "lib/public-matchday-editorial-body.ts",
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  ];
  const protectedDiff = execFileSync(
    "git",
    ["diff", "--name-only", "--", ...protectedPaths],
    { encoding: "utf8" },
  );
  assert.equal(protectedDiff.trim(), "");

  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { encoding: "utf8" },
  );
  const agendaOrTvChanges = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"))
    .filter((path) => /(?:^|\/)(?:agenda|tv)(?:\/|$)/i.test(path));
  assert.deepEqual(agendaOrTvChanges, []);
});
