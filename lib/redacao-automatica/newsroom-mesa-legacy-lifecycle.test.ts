import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260926220638_restore_legacy_mesa_lifecycle_publications.sql",
  "utf8",
);

test("legacy publication evidence affects lifecycle only, not canonical article identity", () => {
  assert.match(migration, /create or replace function public\.newsroom_mesa_source_candidates_v1/);
  assert.match(migration, /legacy_publications as materialized/);
  assert.match(migration, /public\.newsroom_editorial_article_sources relation/);
  assert.match(
    migration,
    /or exists \(\s*select 1\s*from legacy_publications legacy[\s\S]*?legacy\.newsroom_article_id = article\.id::text/,
  );

  assert.doesNotMatch(migration, /create or replace function public\.newsroom_mesa_global_article_candidates_v1/);
  assert.doesNotMatch(migration, /create or replace function public\.newsroom_mesa_theme_summaries_v1/);
  assert.doesNotMatch(migration, /insert into public\.newsroom_editorial_article_sources/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.newsroom_editorial_article_sources/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\s+public\.newsroom_editorial_article_sources/i);
});
