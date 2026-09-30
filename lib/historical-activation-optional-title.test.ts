import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260930190226_historical_activation_optional_public_title.sql", "utf8");
const original = readFileSync("supabase/migrations/20260826120541_historical_composition_dynamic_publication_activation.sql", "utf8");

test("migration remove exclusivamente o guard de título vazio da definição instalada", () => {
  const guard = migration.match(/v_guard constant text := \$guard\$([^$]+)\$guard\$/)?.[1];
  assert.equal(guard, "or nullif(btrim(public_title), '') is null");
  assert.match(migration, /pg_catalog\.to_regprocedure\(\s*'public\.activate_matchday_reference_composition\(uuid,uuid,boolean\)'/);
  assert.match(migration, /v_definition := pg_catalog\.pg_get_functiondef\(v_function\)/);
  assert.deepEqual(migration.match(/^\s*execute[^;]+;/gm)?.map(line => line.trim()), ["execute pg_catalog.replace(v_definition, v_guard, '');"]);
  assert.doesNotMatch(migration, /\b(?:update|insert|delete|alter|drop|grant|revoke|create\s+(?:or\s+replace\s+)?function)\b/i);
  assert.equal(original.split(guard!).length - 1, 1);
  const candidate = original.replace(guard!, "");
  assert.equal(candidate.length, original.length - guard!.length);
  assert.match(candidate, /or char_length\(public_title\) > 120/);
  for (const error of original.match(/raise exception '[^']+'/g) ?? []) assert.ok(candidate.includes(error));
});

test("migration recusa função ausente ou guard alterado/duplicado em vez de reescrever outra versão", () => {
  assert.match(migration, /if v_function is null then\s*raise exception/);
  assert.match(migration, /pg_catalog\.length\(v_definition\)\s*- pg_catalog\.length\(pg_catalog\.replace\(v_definition, v_guard, ''\)\)/);
  assert.match(migration, /if v_occurrences <> 1 then\s*raise exception/);
  assert.ok(migration.indexOf("if v_occurrences <> 1") < migration.indexOf("execute pg_catalog.replace"));
});
