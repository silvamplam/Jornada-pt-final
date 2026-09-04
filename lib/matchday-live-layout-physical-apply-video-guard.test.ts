import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260904150000_matchday_live_layout_physical_apply_video_guard.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-layout-physical-apply-video-guard-pg17.sql";
const facadeMigrationPath =
  "supabase/migrations/20260904140000_matchday_live_layout_physical_apply_facade.sql";
const writerMigrationPath =
  "supabase/migrations/20260904120000_matchday_live_layout_physical_writer_v13_shadow.sql";

const migration = readFileSync(migrationPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");

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

const wrapper = section(
  "create function public.apply_matchday_live_layout_physical_workspace_v14(",
  "revoke all on function public.apply_matchday_live_layout_physical_workspace_v14(",
);

test("migration envolve a implementacao validada sem duplicar a facade", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
  assert.match(
    migration,
    /alter function public\.apply_matchday_live_layout_physical_workspace_v14\([\s\S]*?rename to apply_matchday_live_layout_physical_workspace_v14_core;/,
  );
  assert.match(
    migration,
    /alter function public\.apply_matchday_live_layout_physical_workspace_v14_core\([\s\S]*?set schema jornada_private;/,
  );
  assert.equal(
    occurrences(
      migration,
      /create function public\.apply_matchday_live_layout_physical_workspace_v14\(/,
    ),
    1,
  );
  assert.equal(occurrences(migration, /create function public\./), 1);
  assert.match(
    wrapper,
    /from jornada_private\.apply_matchday_live_layout_physical_workspace_v14_core\(/,
  );
});

test("guard corre sob a ordem de locks v14 e bloqueia a prova do roundup", () => {
  const advisoryLock = wrapper.indexOf(
    "acquire_matchday_live_layout_cutover_writer_lock()",
  );
  const matchdayLock = wrapper.indexOf("from public.matchdays as matchday_row");
  const roundupRead = wrapper.indexOf(
    "from public.matchday_roundup_items as roundup_row",
  );
  const roundupRowLock = wrapper.indexOf("for update;", roundupRead);
  const coreCall = wrapper.indexOf(
    "from jornada_private.apply_matchday_live_layout_physical_workspace_v14_core(",
  );

  assert.ok(advisoryLock >= 0);
  assert.ok(matchdayLock > advisoryLock);
  assert.ok(roundupRead > matchdayLock);
  assert.ok(roundupRowLock > roundupRead);
  assert.ok(coreCall > roundupRowLock);
  assert.match(wrapper, /from public\.matchdays[\s\S]*?for update;/);
  assert.match(
    wrapper,
    /from public\.matchday_roundup_items[\s\S]*?limit 1\s+for update;/,
  );
});

test("roundup tem de estar published e ter video_url nao vazio", () => {
  assert.match(
    wrapper,
    /lower\([\s\S]*?btrim\(coalesce\(roundup_row\.status, ''\)\)[\s\S]*?= 'published'/,
  );
  assert.match(
    wrapper,
    /nullif\(pg_catalog\.btrim\(roundup_row\.video_url\), ''\) is not null/,
  );
  assert.match(
    wrapper,
    /matchday-live-layout-physical-v14-video-required/,
  );
});

test("Destaque fisico e publishable e confirmado na projection downstream", () => {
  const precheck = wrapper.indexOf(
    "placement_row.placement_type = 'video_highlight'",
  );
  const coreCall = wrapper.indexOf(
    "from jornada_private.apply_matchday_live_layout_physical_workspace_v14_core(",
  );
  const postcheck = wrapper.indexOf(
    "editorial_row.complementary_mode = 'roundup_video'",
  );

  assert.ok(precheck >= 0);
  assert.ok(coreCall > precheck);
  assert.ok(postcheck > coreCall);
  assert.match(wrapper, /btrim\(bank_row\.status\)\) = 'active'/);
  assert.match(
    wrapper,
    /nullif\(pg_catalog\.btrim\(bank_row\.link_url\), ''\) is not null/,
  );
  assert.match(wrapper, /for update of bank_row;/);
  assert.match(wrapper, /complementary_status = 'published'/);
  assert.match(wrapper, /pg_catalog\.num_nonnulls\(/);
  assert.match(
    wrapper,
    /matchday-live-layout-physical-v14-highlight-required/,
  );
});

test("facade fica service-role-only e o core fica sem EXECUTE externo", () => {
  assert.match(
    wrapper,
    /language plpgsql\s+volatile\s+security definer\s+set search_path = ''/,
  );
  assert.match(
    migration,
    /revoke all on function\s+jornada_private\.apply_matchday_live_layout_physical_workspace_v14_core\([\s\S]*?from public, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function\s+jornada_private\.apply_matchday_live_layout_physical_workspace_v14_core/,
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
    /grant execute on function[\s\S]*?(?:physical_state_v13_shadow|jornada_private\.[^(]*core)/,
  );
});

test("fixture PG17 cobre falha atomica, sucesso e classificacao", () => {
  assert.match(fixture, /^\\set ON_ERROR_STOP on/);
  for (const evidence of [
    "inactive without roundup",
    "active without published roundup rejected",
    "draft roundup rejected",
    "published roundup without video rejected",
    "incoherent video highlight rejected",
    "published roundup and coherent highlight",
    "guard failure has zero partial DML",
    "successful downstream projection",
    "classification invariant",
    "fixture ends ROLLBACK",
  ]) {
    assert.match(fixture, new RegExp(evidence, "i"));
  }
  assert.match(fixture, /authoritative_hash\(\)/);
  assert.match(fixture, /matchday_live_layout_physical_cutovers/);
  assert.match(fixture, /matchday_live_layout_workspace_settings/);
  assert.match(fixture, /complementary_status = 'published'/);
  assert.match(fixture, /classification_hash\(\)/);
  assert.match(fixture, /rollback;\s*$/i);
});

test("apenas os tres ficheiros autorizados mudam e Agenda TV fica intacta", () => {
  for (const protectedPath of [facadeMigrationPath, writerMigrationPath]) {
    const diff = execFileSync(
      "git",
      ["diff", "--name-only", "--", protectedPath],
      { encoding: "utf8" },
    );
    assert.equal(diff.trim(), "");
  }

  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { encoding: "utf8" },
  );
  const changedPaths = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"));
  const authorizedOrOld = new Set([
    migrationPath,
    fixturePath,
    "lib/matchday-live-layout-physical-apply-video-guard.test.ts",
    "baseline-testes-20260829.txt",
    "jornada-codex-parcial.zip",
    "jornada-lote-7b-codex-parcial-20260902.zip",
  ]);
  const unexpected = changedPaths.filter((path) => (
    path !== "supabase/.temp/"
    && !path.startsWith("supabase/.temp/")
    && !authorizedOrOld.has(path)
  ));
  assert.deepEqual(unexpected, []);
  assert.deepEqual(
    changedPaths.filter((path) => /(?:^|\/)(?:agenda|tv)(?:\/|$)/i.test(path)),
    [],
  );
});
