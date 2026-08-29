import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/admin/editorial/composicao/route.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260825145814_historical_composition_workspace.sql",
  "utf8",
);
const smoke = readFileSync(
  "supabase/steps/124-composicao-historica-workspace-atomico-smoke-rollback.sql",
  "utf8",
);

const applyPlan = route.slice(
  route.indexOf("async function applyHierarchicalDeskPlan"),
  route.indexOf("async function publishReferenceComposition"),
);

test("Guardar montagem executa uma única escrita através da RPC transacional", () => {
  assert.match(
    applyPlan,
    /writeSupabaseAdmin\("rpc\/apply_historical_composition_workspace_plan_v3"/,
  );
  assert.equal((applyPlan.match(/await writeSupabaseAdmin\(/g) ?? []).length, 1);
  assert.doesNotMatch(applyPlan, /method:\s*"DELETE"/);
  assert.doesNotMatch(applyPlan, /method:\s*"PATCH"/);
  assert.doesNotMatch(applyPlan, /assignBankItemToHierarchicalSlot\(/);
  assert.doesNotMatch(applyPlan, /assignBankItemToHierarchicalAuxiliary\(/);
});

test("a RPC bloqueia o draft e contém todas as mutações no mesmo corpo PL/pgSQL", () => {
  assert.match(
    migration,
    /create or replace function public\.apply_historical_composition_workspace_plan\(/i,
  );
  assert.match(migration, /language plpgsql\s+security invoker/i);
  assert.match(migration, /for update;/i);
  assert.match(migration, /delete from public\.matchday_hierarchical_composition_slots/i);
  assert.match(migration, /delete from public\.matchday_reference_composition_items/i);
  assert.match(migration, /insert into public\.matchday_hierarchical_composition_slots/i);
  assert.match(migration, /insert into public\.matchday_reference_composition_items/i);
  assert.match(migration, /update public\.matchday_reference_compositions/i);
  assert.match(migration, /raise exception 'historical_composition_workspace_changed'/i);
  assert.doesNotMatch(migration, /pg_catalog\.substring\([^\r\n]*\sfrom\s/i);
  assert.equal(
    (migration.match(/pg_catalog\.substring\(v_target, '\(\[0-9\]\+\)\$'\)/g) ?? []).length,
    2,
  );
  assert.match(
    migration,
    /revoke all on function public\.apply_historical_composition_workspace_plan[\s\S]*?grant execute[\s\S]*?to service_role/i,
  );
});

test("o smoke provoca falha intermédia e confirma rollback de remoções, inserts, Editorial e settings", () => {
  assert.match(smoke, /^begin;/i);
  assert.match(smoke, /perform public\.apply_historical_composition_workspace_plan/i);
  assert.match(smoke, /historical_composition_workspace_bank_item_invalid/i);
  assert.match(smoke, /a remoção anterior ao erro não foi revertida/i);
  assert.match(smoke, /uma atribuição parcial sobreviveu ao erro/i);
  assert.match(smoke, /settings parciais sobreviveram ao erro/i);
  assert.match(smoke, /o Editorial removido não foi restaurado/i);
  assert.match(smoke, /rollback;\s*$/i);
});
