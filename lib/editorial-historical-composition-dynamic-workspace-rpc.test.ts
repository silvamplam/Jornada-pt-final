import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);

const migration = readFileSync(
  "supabase/migrations/20260826074500_historical_composition_dynamic_workspace_rpc.sql",
  "utf8",
);

test("a route envia as zonas dinâmicas para uma única RPC v3", () => {
  assert.match(
    route,
    /dynamic_zones_json/,
  );

  assert.match(
    route,
    /rpc\/apply_historical_composition_workspace_plan_v3/,
  );

  assert.match(
    route,
    /p_dynamic_zones:\s*dynamicZones/,
  );
});

test("a RPC v2 mantém a montagem fixa e as zonas variáveis na mesma transação", () => {
  assert.match(
    migration,
    /apply_historical_composition_workspace_plan\(/,
  );

  assert.match(
    migration,
    /replace_historical_composition_dynamic_zones\(/,
  );

  assert.match(
    migration,
    /apply_historical_composition_workspace_plan_v2/,
  );

  assert.match(
    migration,
    /security invoker/i,
  );
});

test("as funções novas continuam exclusivas do service_role", () => {
  assert.match(
    migration,
    /from public,\s*anon,\s*authenticated/i,
  );

  assert.match(
    migration,
    /to service_role/i,
  );
});