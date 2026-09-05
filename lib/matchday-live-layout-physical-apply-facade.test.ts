import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260904140000_matchday_live_layout_physical_apply_facade.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-layout-physical-apply-facade-pg17.sql";
const routePath =
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts";
const clientPath =
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx";
const writerPath =
  "supabase/migrations/20260904120000_matchday_live_layout_physical_writer_v13_shadow.sql";
const readerPath =
  "supabase/migrations/20260904130000_matchday_live_layout_workspace_v13_reader.sql";

const migration = readFileSync(migrationPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");
const route = readFileSync(routePath, "utf8");
const client = readFileSync(clientPath, "utf8");
const writer = readFileSync(writerPath, "utf8");

function occurrences(haystack: string, needle: RegExp): number {
  return [...haystack.matchAll(new RegExp(needle.source, `${needle.flags}g`))]
    .length;
}

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `secao inicial nao encontrada: ${startNeedle}`);
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `secao final nao encontrada: ${endNeedle}`);
  return migration.slice(start, end);
}

const facade = section(
  "create function public.apply_matchday_live_layout_physical_workspace_v14(",
  "revoke all on function public.apply_matchday_live_layout_physical_workspace_v14(",
);

test("migration cria uma unica facade transacional service-role-only", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
  assert.equal(
    occurrences(
      migration,
      /create function public\.apply_matchday_live_layout_physical_workspace_v14\(/,
    ),
    1,
  );
  assert.match(
    facade,
    /language plpgsql\s+volatile\s+security definer\s+set search_path = ''/,
  );
  assert.match(
    migration,
    /revoke all on function public\.apply_matchday_live_layout_physical_workspace_v14\([\s\S]*?from public, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.apply_matchday_live_layout_physical_workspace_v14\([\s\S]*?to service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.apply_matchday_live_layout_physical_workspace_v14\([\s\S]*?to (?:public|anon|authenticated);/,
  );
  assert.match(migration, /acl_row\.grantee = 0/);
});

test("OCC fisico e validado sob os dois locks antes do primeiro DML", () => {
  const advisory = facade.indexOf(
    "acquire_matchday_live_layout_cutover_writer_lock()",
  );
  const rowLock = facade.indexOf("for update;");
  const tokenRead = facade.indexOf(
    "from public.matchday_editorial_profile_workspace_token_v13(",
  );
  const staleCheck = facade.indexOf("physical-v14-concurrent-write");
  const firstDml = facade.indexOf(
    "-- FIRST DML: authority is marked only after the complete validation above.",
  );
  assert.ok(advisory >= 0);
  assert.ok(rowLock > advisory);
  assert.ok(tokenRead > rowLock);
  assert.ok(staleCheck > tokenRead);
  assert.ok(firstDml > staleCheck);
  assert.match(
    facade.slice(0, firstDml),
    /p_expected_physical_state_token\) !~[\s\S]*?'\^\[0-9a-f\]\{32\}\$'/,
  );
  assert.match(
    facade.slice(firstDml),
    /insert into jornada_private\.matchday_live_layout_physical_cutovers/,
  );
  assert.doesNotMatch(facade, /p_expected_revision|p_reconcile_state_token/);
});

test("marker e fences impedem recuperacao de autoridade legacy por Jornada", () => {
  assert.match(
    migration,
    /create table jornada_private\.matchday_live_layout_physical_cutovers/,
  );
  assert.match(
    migration,
    /matchday-live-layout-legacy-writer-after-physical-cutover/,
  );
  for (const writerName of [
    "apply_matchday_editorial_profile_workspace_v12",
    "apply_matchday_editorial_profile_workspace_v11",
    "apply_matchday_editorial_desk_state_v2",
  ]) {
    const writerWrapper = section(
      `create function public.${writerName}(`,
      `revoke all on function\n  public.${writerName}(`,
    );
    assert.match(
      writerWrapper,
      /assert_matchday_live_layout_legacy_writer_v14/,
    );
  }
  assert.match(
    migration,
    /create function jornada_private\.sync_matchday_live_layout_shadow\(/,
  );
  assert.match(
    migration,
    /legacy-topology-after-physical-cutover/,
  );
  assert.match(
    migration,
    /is_matchday_live_layout_downstream_v14/,
  );
});

test("settings, token e reader cobrem o estado fisico autoritativo", () => {
  assert.match(
    migration,
    /create table public\.matchday_live_layout_workspace_settings/,
  );
  for (const field of [
    "faixa_slot_count",
    "headline_title_color",
    "latest_zone_placement",
    "latest_zone_title",
    "video_module_active",
  ]) {
    assert.match(migration, new RegExp(field));
  }
  const token = section(
    "create or replace function public.matchday_editorial_profile_workspace_token_v13(",
    "revoke all on function\n  public.matchday_editorial_profile_workspace_token_v13",
  );
  assert.match(token, /workspace_settings/);
  assert.match(token, /physical_cutover/);
  assert.match(token, /matchday_live_layout_placements/);
  assert.match(token, /matchday_live_layout_bank_item_state_memory/);

  const reader = section(
    "create function public.read_matchday_live_layout_workspace_v13(",
    "revoke all on function\n  public.read_matchday_live_layout_workspace_v13",
  );
  assert.match(reader, /language sql\s+stable\s+security definer/);
  assert.doesNotMatch(reader, /\b(?:insert|update|delete|merge|truncate)\b/i);
  assert.match(reader, /workspace_settings/);
  assert.match(reader, /physical_cutover/);
});

test("facade aceita Faixa esparsa e preserva zonas adicionais", () => {
  assert.match(facade, /p_faixa_slot_count integer/);
  assert.match(
    facade,
    /placement_row\.slot_position > p_faixa_slot_count/,
  );
  assert.doesNotMatch(
    facade,
    /min_position\s*<>\s*1|max_position\s*<>\s*[^\n]*item_count/,
  );
  assert.doesNotMatch(facade, /jsonb_array_length\(p_zones\)\s*<>\s*5/);
  assert.doesNotMatch(facade, /delete from public\.matchday_live_layout_zones/);
  assert.doesNotMatch(facade, /insert into public\.matchday_live_layout_zones/);
  assert.match(facade, /set public_title = desired_row\.public_title/);
  assert.match(facade, /set sort_order = desired_row\.sort_order/);
});

test("projection legacy e estritamente downstream e ignora apenas zonas sem mapping", () => {
  const projector = section(
    "create function\njornada_private.project_matchday_live_layout_placements_downstream_v14(",
    "revoke all on function\n  jornada_private.project_matchday_live_layout_placements_downstream_v14",
  );
  assert.match(projector, /validate_matchday_live_layout_legacy_projection_v14/);
  assert.match(
    projector,
    /matchday_live_layout_zone_legacy_projection/,
  );
  assert.doesNotMatch(projector, /public_title\s*=|visual_family\s*=|classification_key\s*=/);
  assert.doesNotMatch(projector, /delete from public\.matchday_live_layout_placements/);
  assert.match(
    migration,
    /placement_row\.placement_type <> 'zone'[\s\S]*projection_row\.zone_id = placement_row\.zone_id/,
  );
  assert.match(
    facade,
    /project_matchday_live_layout_workspace_v14\([\s\S]*assert_matchday_live_layout_downstream_v14/,
  );
});

test("writes sao diferenciais e classificacao permanece observada", () => {
  assert.match(facade, /on conflict \(matchday_id\) do update[\s\S]*?is distinct from/);
  assert.match(facade, /zone_row\.public_title,[\s\S]*?is distinct from/);
  assert.match(facade, /v_placements_before/);
  assert.match(facade, /v_displaced_before/);
  assert.match(facade, /unchanged-clock-postcondition/);
  assert.match(facade, /classification_key/);
  assert.match(facade, /classification_source/);
  assert.match(facade, /automatic_eligible/);
  assert.match(facade, /classified_at/);
  assert.match(facade, /physical-v14-classification-changed/);
  assert.doesNotMatch(
    facade,
    /set\s+(?:classification_key|classification_source|automatic_eligible|classified_at)\s*=/i,
  );
});

test("core e writer v13 continuam privados", () => {
  assert.match(
    migration,
    /revoke all on function[\s\S]*apply_matchday_live_layout_physical_state_v13_shadow[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function\s+jornada_private\.[^(]*(?:core|physical_state_v13_shadow)/,
  );
  assert.match(
    migration,
    /has_function_privilege\([\s\S]*apply_matchday_live_layout_placement_plan\(uuid,jsonb,boolean\)[\s\S]*'EXECUTE'/,
  );
  assert.match(
    writer,
    /revoke all on function[\s\S]*apply_matchday_live_layout_physical_state_v13_shadow[\s\S]*from public, anon, authenticated, service_role/,
  );
});

test("fixture PG17 cobre o contrato e termina em ROLLBACK", () => {
  assert.match(fixture, /^\\set ON_ERROR_STOP on/);
  for (const evidence of [
    "stale token before DML",
    "late error total rollback",
    "no-op clocks and ids",
    "simple move",
    "swap",
    "bulk move",
    "intermediate zone vacancy",
    "final zone vacancy",
    "intermediate faixa vacancy",
    "final faixa vacancy",
    "faixa extent reload",
    "no compaction",
    "no redistribution",
    "faixa arrival clock",
    "displaced arrival clock",
    "explicit Bank",
    "Displaced",
    "worked",
    "Opening",
    "Selection",
    "Video highlight",
    "empty title rejected",
    "incompatible shrink rejected",
    "valid title and layout",
    "block reorder",
    "sixth zone preserved",
    "seventh zone preserved",
    "additional-zone placements",
    "legacy omits additional zones",
    "no invented projection",
    "invalid five-key mapping rejected",
    "topology trigger fenced",
    "v12 fenced",
    "v11 fenced",
    "desk v2 fenced",
    "classification invariant",
    "final token",
    "access control",
    "writer v13 private",
  ]) {
    assert.match(fixture, new RegExp(evidence, "i"));
  }
  assert.match(fixture, /rollback;\s*$/i);
});

test("o patch nao altera migrations anteriores, route, cliente ou Agenda TV", () => {
  const protectedPaths = [
    routePath,
    clientPath,
    writerPath,
    readerPath,
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

  const changedMigrations = execFileSync(
    "git",
    ["diff", "--name-only", "--", "supabase/migrations"],
    { encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean);
  assert.deepEqual(changedMigrations, []);

  assert.match(route, /apply_matchday_live_layout_physical_v20/);
  assert.doesNotMatch(route, /apply_matchday_live_layout_physical_workspace_v14/);
  assert.match(client, /editorial-matchday-live-layout-physical-apply/);

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
