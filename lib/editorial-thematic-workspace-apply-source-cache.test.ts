import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260830184500_thematic_workspace_apply_source_cache.sql",
  "utf8",
);

test("workspace sources uncached preserva a implementação autoritativa completa", () => {
  assert.match(
    migration,
    /create or replace function\s+public\.matchday_editorial_profile_workspace_sources_uncached\(/,
  );

  assert.match(
    migration,
    /with classification as materialized/,
  );

  assert.match(
    migration,
    /matchday_editorial_continuity_transitions/,
  );

  assert.match(
    migration,
    /automatic_eligible/,
  );
});

test("wrapper só usa cache no modo transacional v10", () => {
  assert.match(
    migration,
    /thematic_apply_token_cache_mode[\s\S]*=\s*'v10'/,
  );

  assert.match(
    migration,
    /thematic_workspace_sources_cache_matchday/,
  );

  assert.match(
    migration,
    /thematic_workspace_sources_cache/,
  );

  assert.match(
    migration,
    /jsonb_to_recordset/,
  );
});

test("fora da v10 workspace sources usa sempre a implementação completa", () => {
  assert.match(
    migration,
    /return query[\s\S]*from public\.matchday_editorial_profile_workspace_sources_uncached\(/,
  );
});

test("v10 limpa o cache antes e depois do Apply", () => {
  const start = migration.indexOf(
    "create or replace function\npublic.apply_matchday_editorial_profile_workspace_v10(",
  );

  assert.ok(start >= 0);

  const body = migration.slice(start);

  assert.equal(
    (
      body.match(
        /'jornada\.thematic_workspace_sources_cache'/g,
      ) ?? []
    ).length,
    2,
  );

  assert.equal(
    (
      body.match(
        /'jornada\.thematic_workspace_sources_cache_matchday'/g,
      ) ?? []
    ).length,
    2,
  );

  assert.match(
    body,
    /from public\.apply_matchday_editorial_profile_workspace_v9\(/,
  );
});

test("token final continua a ser calculado depois de desligar todos os caches", () => {
  const start = migration.indexOf(
    "create or replace function\npublic.apply_matchday_editorial_profile_workspace_v10(",
  );

  const body = migration.slice(start);

  const v9 = body.indexOf(
    "from public.apply_matchday_editorial_profile_workspace_v9(",
  );

  const off = body.indexOf(
    "'jornada.thematic_apply_token_cache_mode',\n    'off'",
  );

  const finalToken = body.indexOf(
    "from public.matchday_editorial_profile_workspace_token(",
  );

  assert.ok(v9 >= 0);
  assert.ok(off > v9);
  assert.ok(finalToken > off);
});

test("otimização não aumenta timeout nem altera tabelas", () => {
  assert.doesNotMatch(migration, /statement_timeout/i);
  assert.doesNotMatch(migration, /alter\s+table/i);
  assert.doesNotMatch(migration, /create\s+(unique\s+)?index/i);
});
