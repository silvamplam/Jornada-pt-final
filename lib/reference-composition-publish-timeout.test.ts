import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261016103000_reference_composition_publish_timeout.sql",
  "utf8",
);

test("timeout alargado fica confinado à RPC de publicação da composição", () => {
  assert.match(
    migration,
    /alter function\s+public\.publish_matchday_reference_composition\(uuid, uuid\)\s+set statement_timeout\s*=\s*'30s'/i,
  );

  assert.doesNotMatch(migration, /alter\s+role/i);
  assert.doesNotMatch(migration, /alter\s+database/i);
  assert.doesNotMatch(migration, /set\s+statement_timeout\s*=\s*'30s'\s*;/i);
});

test("migração não altera tabelas, índices nem lógica de continuidade", () => {
  assert.doesNotMatch(migration, /alter\s+table/i);
  assert.doesNotMatch(migration, /create\s+(unique\s+)?index/i);
  assert.doesNotMatch(migration, /create\s+or\s+replace\s+function/i);
  assert.doesNotMatch(migration, /materialize_matchday_live_layout_physical_handoff_v19/i);
  assert.doesNotMatch(migration, /assert_matchday_live_layout_physical_handoff_ready_v19/i);
});
