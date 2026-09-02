import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const correction = readFileSync(
  "supabase/migrations/20260902130518_matchday_explicit_bank_displaced_semantics.sql",
  "utf8",
);
const activation = readFileSync(
  "supabase/migrations/20260901201455_matchday_live_layout_authoritative_activation.sql",
  "utf8",
);
const reader = readFileSync("lib/editorial-matchday-profile-desk.ts", "utf8");
const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const pgTest = readFileSync(
  "supabase/sql/test-matchday-explicit-bank-displaced-semantics-pg17.sql",
  "utf8",
);
const faixaApplyTest = readFileSync(
  "supabase/sql/test-matchday-faixa-bank-atomic-apply-pg17.sql",
  "utf8",
);

test("a causa é corrigida no trigger de memória sem alterar o placement core", () => {
  assert.match(
    correction,
    /create or replace function\s+jornada_private\.reconcile_matchday_live_layout_bank_item_state_memory\(\)/u,
  );
  assert.match(
    correction,
    /where assignment_row\.matchday_id = affected_row\.matchday_id[\s\S]*override_row\.placement_target = 'bank'/u,
  );
  assert.match(
    correction,
    /create function\s+jornada_private\.clear_matchday_live_layout_memory_for_explicit_bank\(\)/u,
  );
  assert.match(correction, /referencing new table as new_override_rows/u);
  assert.doesNotMatch(correction, /create or replace function\s+jornada_private\.apply_matchday_live_layout_placement_plan/u);
});

test("o repair é genérico, idempotente e limitado a Banco explícito sem placement", () => {
  const repairStart = correction.indexOf(
    "delete from public.matchday_live_layout_bank_item_state_memory as memory_row\nusing",
  );
  const repairEnd = correction.indexOf(
    "drop function public.read_matchday_live_desk_aggregate_tracking",
    repairStart,
  );
  const repair = correction.slice(repairStart, repairEnd);

  assert.ok(repairStart >= 0 && repairEnd > repairStart);
  assert.match(repair, /matchday_editorial_bank_items/u);
  assert.match(repair, /matchday_editorial_profile_assignments/u);
  assert.match(repair, /matchday_editorial_profile_manual_overrides/u);
  assert.match(repair, /override_row\.placement_target = 'bank'/u);
  assert.match(repair, /not exists \([\s\S]*matchday_live_layout_placements/u);
  assert.doesNotMatch(repair, /96b4049f|99fa0ad4|J05/iu);
});

test("o reader separa Banco do tracking e diagnostica Banco mais placement", () => {
  assert.match(correction, /is_explicit_bank boolean/u);
  assert.match(correction, /bank_placement_conflict boolean/u);
  assert.match(
    correction,
    /when explicit_bank\.bank_item_id is not null[\s\S]*then null::text/u,
  );
  assert.match(reader, /if \(row\.bank_placement_conflict\)[\s\S]*explicit_bank_placement_conflict/u);
  assert.match(reader, /if \(row\.is_explicit_bank\)[\s\S]*continue;/u);
});

test("o Apply mantém a ordem override antes do reconcile autoritativo", () => {
  const preCutoverCall = activation.indexOf(
    "jornada_private.apply_matchday_editorial_profile_workspace_v9_pre_cutover",
    activation.indexOf("create function public.apply_matchday_editorial_profile_workspace_v9"),
  );
  const authoritativeReconcile = activation.indexOf(
    "jornada_private.reconcile_matchday_live_layout_from_legacy_adapter",
    preCutoverCall,
  );

  assert.ok(preCutoverCall >= 0);
  assert.ok(authoritativeReconcile > preCutoverCall);
  assert.match(faixaApplyTest, /explicit Faixa to Banco left governing state memory/u);
  assert.match(faixaApplyTest, /real replacement did not create displaced memory/u);
});

test("a UI mantém Tracking e Banco independentes, inclusive nos contadores", () => {
  assert.match(client, /Todas \{trackableItems\.length\}/u);
  assert.match(client, /\{zone\.label\} \{trackableItems\.filter/u);
  assert.match(client, /Banco \{explicitBankEntries\.length\}/u);
  assert.match(client, /aria-label="Filtrar Banco por classe contextual"/u);
  assert.match(client, /Todas \{explicitBankEntries\.length\}/u);
  assert.match(client, /selectMatchdayEditorialExplicitBankItems/u);
  assert.doesNotMatch(client, /data-tracking-state=[^\n]*BANCO/u);
  const bankStart = client.indexOf('aria-label="Banco editorial"');
  const bankEnd = client.indexOf('<div className="thematic-tracking-rows">', bankStart);
  const bank = client.slice(bankStart, bankEnd);
  assert.ok(bankStart >= 0 && bankEnd > bankStart);
  assert.doesNotMatch(bank, /<header>/u);
  assert.doesNotMatch(bank, /disponíveis/u);
  assert.match(bank, /className="thematic-bank-class-filters"[\s\S]*Selecionar Banco/u);
});

test("a fixture PG17 distingue movimentos explícitos de displacement real", () => {
  for (const contract of [
    "GENERIC BASELINE REPAIR",
    "EXPLICIT MOVEMENT TO BANK",
    "BANK TO PLACEMENT",
    "REAL DISPLACEMENT",
    "NEW AND LEGACY",
    "FAIL CLOSED AND UNIQUE",
    "CLASSIFICATION AND ACCESS",
  ]) {
    assert.match(pgTest, new RegExp(contract));
  }
  assert.match(pgTest, /apply_matchday_live_layout_movement/u);
  assert.match(pgTest, /classification_before/u);
  assert.match(pgTest, /classification_after/u);
});
