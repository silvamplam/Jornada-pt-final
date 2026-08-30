import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260830183000_thematic_workspace_apply_token_cache.sql",
  "utf8",
);

const route = readFileSync(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
  "utf8",
);

test("v10 preserva a v9 como única implementação do Apply editorial", () => {
  const start = migration.indexOf(
    "create or replace function\npublic.apply_matchday_editorial_profile_workspace_v10(",
  );

  assert.ok(start >= 0);

  const body = migration.slice(start);

  assert.equal(
    (
      body.match(
        /from public\.apply_matchday_editorial_profile_workspace_v9\(/g,
      ) ?? []
    ).length,
    1,
  );

  assert.doesNotMatch(
    migration,
    /create or replace function\s+public\.apply_matchday_editorial_profile_workspace_v[2-9]\(/,
  );
});

test("implementações uncached são completas e explícitas na migration", () => {
  assert.match(
    migration,
    /create or replace function\s+public\.matchday_editorial_profile_reconcile_token_uncached\(/,
  );

  assert.match(
    migration,
    /with classification as materialized/,
  );

  assert.match(
    migration,
    /create or replace function\s+public\.matchday_editorial_profile_workspace_token_uncached\(/,
  );

  assert.match(
    migration,
    /with workspace_sources as materialized/,
  );

  assert.match(
    migration,
    /from public\.matchday_editorial_profile_reconcile_token_uncached\(/,
  );

  assert.doesNotMatch(
    migration,
    /pg_get_functiondef|copy_current_token_implementations/,
  );
});

test("cache só existe durante a transação v10", () => {
  assert.match(
    migration,
    /current_setting\(\s*'jornada\.thematic_apply_token_cache_mode',\s*true\s*\)\s*=\s*'v10'/,
  );

  assert.match(
    migration,
    /set_config\(\s*'jornada\.thematic_apply_token_cache_mode',\s*'v10',\s*true\s*\)/,
  );

  assert.match(
    migration,
    /set_config\(\s*'jornada\.thematic_apply_token_cache_mode',\s*'off',\s*true\s*\)/,
  );
});

test("wrappers normais caem sempre nas versões completas quando cache está desligado", () => {
  assert.match(
    migration,
    /from public\.matchday_editorial_profile_reconcile_token_uncached\(/,
  );

  assert.match(
    migration,
    /from public\.matchday_editorial_profile_workspace_token_uncached\(/,
  );

  assert.equal(
    (
      migration.match(
        /jornada\.thematic_apply_token_cache_mode/g,
      ) ?? []
    ).length >= 4,
    true,
  );
});

test("token final é calculado sem cache depois da v9", () => {
  const start = migration.indexOf(
    "create or replace function\npublic.apply_matchday_editorial_profile_workspace_v10(",
  );

  const body = migration.slice(start);

  const v9Call = body.indexOf(
    "from public.apply_matchday_editorial_profile_workspace_v9(",
  );

  const cacheOff = body.indexOf(
    "'jornada.thematic_apply_token_cache_mode',\n    'off'",
  );

  const finalToken = body.indexOf(
    "from public.matchday_editorial_profile_workspace_token(",
  );

  assert.ok(v9Call >= 0);
  assert.ok(cacheOff > v9Call);
  assert.ok(finalToken > cacheOff);

  assert.equal(
    (
      body.match(
        /from public\.matchday_editorial_profile_workspace_token\(/g,
      ) ?? []
    ).length,
    1,
  );
});

test("otimização não aumenta timeout nem altera schema editorial", () => {
  assert.doesNotMatch(migration, /statement_timeout/i);
  assert.doesNotMatch(migration, /alter\s+table/i);
  assert.doesNotMatch(migration, /create\s+(unique\s+)?index/i);
});

test("rota administrativa usa apenas a v10", () => {
  assert.match(
    route,
    /rpc\/apply_matchday_editorial_profile_workspace_v10/,
  );

  assert.doesNotMatch(
    route,
    /rpc\/apply_matchday_editorial_profile_workspace_v9/,
  );
});
