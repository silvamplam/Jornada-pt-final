import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260917084500_matchday_historical_inherited_revalidation.sql",
  "utf8",
);
const page = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);
const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);
const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);
const carryover = readFileSync(
  "supabase/migrations/20260905135209_matchday_live_layout_physical_carryover_v18.sql",
  "utf8",
);

test("revalidação tem estado próprio e não é copiada automaticamente para a jornada seguinte", () => {
  assert.match(migration, /add column if not exists continuity_revalidated_at timestamptz/);
  assert.match(migration, /continuity_revalidated_at is null[\s\S]*continuity_source_matchday_id is not null/);
  assert.match(carryover, /continuity_source_matchday_id,[\s\S]*continuity_source_composition_id,[\s\S]*editorially_worked_at/);
  assert.doesNotMatch(carryover, /continuity_revalidated_at/);
});

test("composição histórica lê proveniência e separa herdadas não revalidadas", () => {
  assert.match(page, /continuity_source_matchday_id,continuity_revalidated_at/);
  assert.match(page, /historicalEligible: isHistoricalBankItemEligible\(bankItem\)/);
  assert.match(client, /Herdadas de jornadas anteriores/);
  assert.match(client, /HERDADA/);
  assert.match(client, /REVALIDADA/);
  assert.match(client, /revalidate_inherited_bank_item/);
});

test("rota exige revalidação para recuperar notícia herdada que já saiu da composição", () => {
  assert.match(route, /function assertHistoricalRecoveryAllowed/);
  assert.match(route, /Revalida-a para esta jornada antes de a recuperar para a composição histórica/);
  assert.match(route, /existingCompositionBankItemIds\.has\(bankItem\.id\)/);
  assert.match(route, /actionType === "revalidate_inherited_bank_item"/);
  assert.match(route, /actionType === "remove_inherited_bank_item_revalidation"/);
});
