import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260912173257_allow_mesa_v2_source_package_manifest_v5.sql",
  "utf8",
);

test("migration forward conserva v2/v4 e fecha versões desconhecidas", () => {
  assert.match(migration, /when manifest ->> 'version' = '5' then/);
  assert.match(migration, /when manifest ->> 'version' in \('2', '4'\) then/);
  assert.match(migration, /Historical predicate preserved verbatim/);
  assert.match(migration, /else false/);
  assert.doesNotMatch(migration, /drop table|delete from|update\s+public\.newsroom_editorial_source_packages/i);
});

test("manifesto v5 exige contrato Mesa, IDs estáveis e arrays coerentes", () => {
  assert.match(migration, /p_manifest ->> 'provenanceContract' is distinct from 'mesa-v2'/);
  assert.match(migration, /p_manifest ->> 'packageId' is distinct from p_id::text/);
  assert.match(migration, /p_manifest ->> 'year' is distinct from p_package_year/);
  assert.match(migration, /p_manifest ->> 'month' is distinct from p_package_month/);
  assert.match(migration, /jsonb_typeof\(p_manifest -> 'entries'\) is distinct from 'array'/);
  assert.match(migration, /jsonb_typeof\(p_manifest -> 'outputs'\) is distinct from 'array'/);
  assert.match(migration, /v_provenance_source_id = any\(v_provenance_source_ids\)/);
  assert.match(migration, /v_output_id = any\(v_output_ids\)/);
});

test("grupo 1 e source scope do v5 são explicitamente técnicos", () => {
  assert.match(migration, /v_article_position is distinct from 1/);
  assert.match(migration, /v_plan ->> 'sourceScope' is distinct from 'workspace'/);
  assert.match(migration, /v_plan \? 'origin'/);
  assert.match(migration, /workspaceContractVersion/);
});
