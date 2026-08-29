import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const route = readFileSync(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
  "utf8",
);
const operations = readFileSync(
  "lib/editorial-matchday-profile-desk-operations.ts",
  "utf8",
);
const reconcile = readFileSync(
  "lib/editorial-matchday-profile-reconcile.ts",
  "utf8",
);
const actualityMigration = readFileSync(
  "supabase/migrations/20260824010021_thematic_actuality_batch_circuit_safe.sql",
  "utf8",
);
const faixaMembershipMigration = readFileSync(
  "supabase/migrations/20260824014112_thematic_faixa_membership_by_actuality.sql",
  "utf8",
);

function body(source: string, name: string, nextName: string): string {
  const start = source.indexOf(`export function ${name}`);
  const end = source.indexOf(`export function ${nextName}`, start + 1);
  assert.ok(start >= 0, `${name} não encontrado`);
  assert.ok(end > start, `${nextName} não encontrado depois de ${name}`);
  return source.slice(start, end);
}

test("Zona separa troca interna de entrada externa com posição exata", () => {
  assert.match(client, /function placeInZone\(itemIdentity: string, zoneKey: EditorialProfileZoneKey, position: number\)/);
  assert.match(client, /function placeInZone[\s\S]*swapMatchdayEditorialItemsInZone/);
  assert.match(client, /function fixCurrentZonePosition[\s\S]*fixMatchdayEditorialItemsAtPosition/);
  assert.match(client, /fixMatchdayEditorialItemsInZone/);
  assert.doesNotMatch(client, /proteger na zona sem posição fixa/i);
  assert.match(route, /validateMatchdayEditorialProfileManualOverrides/);
});

test("troca interna fixa só origem e destino e nunca usa cascata", () => {
  const functionSource = body(
    operations,
    "swapMatchdayEditorialItemsInZone",
    "moveMatchdayEditorialItemsToBank",
  );
  assert.match(functionSource, /currentItem/);
  assert.match(functionSource, /targetItem/);
  assert.match(functionSource, /sortOrder: currentItem\.sortOrder/);
  assert.match(functionSource, /sortOrder: targetPosition/);
  assert.doesNotMatch(functionSource, /displacedQueue|targetSlot:\s*item\.sortOrder \+ selected\.length/);
});

test("libertar posição fixa distingue zona de Faixa", () => {
  const functionSource = body(
    operations,
    "releaseMatchdayEditorialFixedPositions",
    "returnMatchdayEditorialItemsToAutomatic",
  );
  assert.match(functionSource, /override\.placementTarget === "zone"[\s\S]*return \[\];/);
  assert.match(functionSource, /override\.placementTarget === "faixa"[\s\S]*sortOrder:\s*null/);
  assert.match(client, /function releasePosition\(itemIdentity: string\)[\s\S]*releaseMatchdayEditorialFixedPositions/);
});

test("Faixa sem slot usa atualidade global e só posições explícitas permanecem fixas", () => {
  assert.match(reconcile, /const faixaOverrides = overrides[\s\S]*placementTarget === "faixa"/);
  assert.match(reconcile, /const fixedFaixa = faixaOverrides[\s\S]*override\.sortOrder !== null/);
  assert.match(reconcile, /const actualityFaixaIdentities = new Set/);
  assert.match(reconcile, /const automaticFaixa = \[\.\.\.activeItems\][\s\S]*\.sort\(compareThematicItemsByActuality\)/);
  assert.match(reconcile, /actualityFaixaIdentities\.has\(identity\)[\s\S]*\? "faixa"/);
  assert.doesNotMatch(reconcile, /\[\.\.\.displaced, \.\.\.faixaBefore, \.\.\.automaticOverflow\]/);
  assert.match(reconcile, /for \(const override of fixedFaixa\)/);
  assert.match(reconcile, /faixaBase\.splice\(targetIndex, 0,/);
});

test("Latest não volta a tocar no banco quando a publicação canónica já está sincronizada", () => {
  assert.match(actualityMigration, /create or replace function public\.sync_matchday_zone_publication_to_bank/);
  assert.match(actualityMigration, /v_candidate_count = 1 and v_exact_count = 1/);
  assert.match(actualityMigration, /return v_existing_bank_id/);
  assert.match(actualityMigration, /return public\.upsert_matchday_editorial_bank_publication/);
});

test("normalização histórica da Faixa preserva slots manuais e ordena o resto por publicação", () => {
  assert.match(actualityMigration, /placement_target = 'faixa'/);
  assert.match(actualityMigration, /published_at desc nulls last/);
  assert.match(actualityMigration, /updated_at desc nulls last/);
  assert.match(actualityMigration, /fixed_positions/);
  assert.match(actualityMigration, /free_positions/);
});

test("migration da Faixa distingue pertença por atualidade de slot fixo", () => {
  assert.match(
    faixaMembershipMigration,
    /placement_target = 'faixa'[\s\S]*sort_order is null or sort_order > 0/,
  );
  assert.match(
    faixaMembershipMigration,
    /where placement_target = 'faixa'[\s\S]*sort_order is not null/,
  );
  assert.match(
    faixaMembershipMigration,
    /jsonb_typeof\(payload\.value -> 'sort_order'\) = 'null'/,
  );
  assert.doesNotMatch(
    route,
    /placementTarget === "faixa"[\s\S]{0,160}sortOrder === null/,
  );
});
