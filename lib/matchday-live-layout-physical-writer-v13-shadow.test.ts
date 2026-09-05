import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260904120000_matchday_live_layout_physical_writer_v13_shadow.sql";
const fixturePath =
  "supabase/sql/test-matchday-live-layout-physical-writer-v13-shadow-pg17.sql";
const routePath =
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts";

const migration = readFileSync(migrationPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");
const route = readFileSync(routePath, "utf8");

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `secao inicial nao encontrada: ${startNeedle}`);

  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `secao final nao encontrada: ${endNeedle}`);

  return migration.slice(start, end);
}

const token = section(
  "create function public.matchday_editorial_profile_workspace_token_v13(",
  "revoke all on function\n  public.matchday_editorial_profile_workspace_token_v13",
);

const writer = section(
  "create function\njornada_private.apply_matchday_live_layout_physical_state_v13_shadow(",
  "revoke all on function\n  jornada_private.apply_matchday_live_layout_physical_state_v13_shadow",
);

test("migration v13 shadow e integralmente transacional e nao cria tabelas", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
  assert.doesNotMatch(migration, /create\s+table/i);
});

test("token v13 soma estado legacy e estado fisico direto com ordem deterministica", () => {
  assert.match(token, /matchday_editorial_profile_workspace_token_uncached/);

  for (const table of [
    "matchday_live_layout_zones",
    "matchday_live_layout_blocks",
    "matchday_live_layout_placements",
    "matchday_live_layout_bank_item_state_memory",
  ]) {
    assert.match(token, new RegExp(`public\\.${table}`));
  }

  for (const field of [
    "public_title",
    "visual_family",
    "block_type",
    "sort_order",
    "bank_item_id",
    "placement_type",
    "zone_id",
    "slot_position",
    "memory_kind",
    "recorded_at",
  ]) {
    assert.match(token, new RegExp(`'${field}'`));
  }

  assert.ok((token.match(/order by/g)?.length ?? 0) >= 5);
  assert.doesNotMatch(
    token,
    /legacy_zone_key|placement_zone_key|matchday_live_layout_zone_legacy_projection/,
  );
});

test("token v13 e novo, service-role only e nao substitui o token v12", () => {
  assert.match(
    migration,
    /revoke all on function[\s\S]*workspace_token_v13\(uuid, text\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function[\s\S]*workspace_token_v13\(uuid, text\)[\s\S]*to service_role/,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function\s+public\.matchday_editorial_profile_workspace_token\(/i,
  );
});

test("writer recebe apenas placements fisicos e conjuntos por bank_item_id", () => {
  for (const parameter of [
    "p_matchday_id uuid",
    "p_profile_key text",
    "p_expected_state_token text",
    "p_authoritative_placements jsonb",
    "p_explicit_bank_item_ids jsonb",
    "p_displaced_bank_item_ids jsonb",
    "p_worked_bank_item_ids jsonb",
    "p_faixa_arrival_bank_item_ids jsonb",
    "p_displaced_arrival_bank_item_ids jsonb",
  ]) {
    assert.match(writer, new RegExp(parameter));
  }

  assert.match(writer, /'bank_item_id'/);
  assert.match(writer, /'placement_type'/);
  assert.match(writer, /'zone_id'/);
  assert.match(writer, /'slot_position'/);
  assert.doesNotMatch(writer, /legacy_zone_key|placement_zone_key|EditorialProfileZoneKey/);
});

test("writer valida os cinco tipos e a capacidade fisica no DB", () => {
  for (const placementType of [
    "opening",
    "faixa",
    "selection",
    "video_highlight",
    "zone",
  ]) {
    assert.match(writer, new RegExp(`'${placementType}'`));
  }

  assert.match(
    migration,
    /when 'six_news' then 6[\s\S]*when 'five_news_balanced' then 5[\s\S]*when 'five_news_secondary' then 5/,
  );
  assert.match(
    writer,
    /zone_row\.id = placement_row\.zone_id[\s\S]*zone_row\.matchday_id = p_matchday_id/,
  );
  assert.match(writer, /block_row\.block_type = 'zone'/);
  assert.match(writer, /block_state\.block_count <> 1/);
  assert.match(writer, /slot_position > jornada_private[\s\S]*visual_family_capacity_v13/);
  assert.doesNotMatch(writer, /count\([^)]*zone[^)]*\)\s*(?:=|<>|!=)\s*5/i);
});

test("writer falha fechado para identidade, destinos e estados transversais", () => {
  for (const errorCode of [
    "duplicate-bank-item",
    "duplicate-target",
    "bank-item-not-active",
    "zone-invalid",
    "bank-placement-conflict",
    "displaced-placement-conflict",
    "displaced-bank-conflict",
    "faixa-not-contiguous",
    "concurrent-write",
  ]) {
    assert.match(writer, new RegExp(`physical-v13-${errorCode}`));
  }

  assert.match(writer, /desk_row\.is_managed = true/);
  assert.match(writer, /v_assignment_profile_key is distinct from p_profile_key/);
});

test("plano e diferencial e usa o core fisico com projection false", () => {
  assert.match(writer, /clear_operations as/);
  assert.match(writer, /place_operations as/);
  assert.match(
    writer,
    /desired_row\.bank_item_id = current_row\.bank_item_id[\s\S]*desired_row\.zone_id is not distinct from current_row\.zone_id[\s\S]*desired_row\.slot_position = current_row\.slot_position/,
  );
  assert.match(
    writer,
    /apply_matchday_live_layout_placement_plan\([\s\S]*p_matchday_id,[\s\S]*v_plan,[\s\S]*false[\s\S]*\)/,
  );
  assert.doesNotMatch(
    migration,
    /project_matchday_live_layout_placements_to_legacy/,
  );
  assert.doesNotMatch(
    writer,
    /apply_matchday_editorial_profile_workspace_v(?:10|11|12)|workspace_v11_pre_handoff/,
  );
});

test("Banco explicito converge apenas overrides placement_target bank", () => {
  assert.match(
    writer,
    /delete from public\.matchday_editorial_profile_manual_overrides[\s\S]*placement_target = 'bank'/,
  );
  assert.match(
    writer,
    /insert into public\.matchday_editorial_profile_manual_overrides[\s\S]*'bank',[\s\S]*null,[\s\S]*null/,
  );
  assert.match(writer, /matchday-live-layout-physical-v13-bank-postcondition/);
  assert.doesNotMatch(writer, /zone_key\s*=\s*['"][a-z_]+/);
});

test("Desalojadas, Faixa e worked preservam os relogios do contrato v12", () => {
  assert.match(writer, /v_faixa_before/);
  assert.match(writer, /v_displaced_before/);
  assert.match(writer, /recorded_at = excluded\.recorded_at[\s\S]*memory_kind is distinct from 'displaced'/);
  assert.ok((writer.match(/interval '1 microsecond'/g)?.length ?? 0) >= 4);
  assert.match(writer, /editorially_worked_at = pg_catalog\.statement_timestamp\(\)/);
  assert.match(writer, /bank_row\.editorially_worked_at is null/);
  assert.match(writer, /unchanged-clock-postcondition/);
  assert.match(writer, /faixa-clock-postcondition/);
  assert.match(writer, /displaced-clock-postcondition/);
});

test("pos-condicoes provam igualdade autoritativa e limites sem preencher vagas", () => {
  assert.ok((writer.match(/\bexcept\b/g)?.length ?? 0) >= 6);
  assert.match(writer, /placement-postcondition/);
  assert.match(writer, /transversal-postcondition/);
  assert.match(writer, /target-postcondition/);
  assert.match(writer, /displaced-postcondition/);
  assert.match(writer, /bank-postcondition/);
  assert.match(writer, /faixa-postcondition/);
  assert.match(writer, /fixed-capacity-postcondition/);
  assert.match(writer, /zone-postcondition/);
  assert.doesNotMatch(writer, /generate_series|items\.length|autofill|exactly five/i);
});

test("classification permanece observada e nunca e escrita", () => {
  for (const field of [
    "classification_key",
    "classification_source",
    "classified_at",
    "automatic_eligible",
  ]) {
    assert.match(writer, new RegExp(`'${field}'`));
  }
  assert.match(writer, /matchday-live-layout-physical-v13-classification-changed/);
  assert.doesNotMatch(writer, /set\s+classification_(?:key|source)|set\s+classified_at/i);
});

test("writer shadow fica privado sem EXECUTE externo", () => {
  assert.match(writer, /security definer/);
  assert.match(writer, /set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function[\s\S]*apply_matchday_live_layout_physical_state_v13_shadow[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function\s+jornada_private\.apply_matchday_live_layout_physical_state_v13_shadow/,
  );
});

test("fixture cobre sexta zona sem projection e falhas criticas", () => {
  assert.match(fixture, /sixth_zone/);
  assert.match(fixture, /classification_key = 'benfica'/);
  assert.match(fixture, /classification_source = 'manual'/);
  assert.match(fixture, /apply_matchday_live_layout_physical_state_v13_shadow/);
  assert.match(fixture, /matchday_live_layout_zone_legacy_projection/);

  for (const expectedError of [
    "zone-invalid",
    "duplicate-target",
    "duplicate-bank-item",
    "bank-placement-conflict",
    "displaced-placement-conflict",
    "concurrent-write",
  ]) {
    assert.match(fixture, new RegExp(expectedError));
  }

  assert.match(fixture, /three-zone-cardinality/);
  assert.match(fixture, /slots-empty/);
});

test("v12 histórico não é refeito e a route corrente usa a facade física", () => {
  assert.doesNotMatch(
    migration,
    /create (?:or replace )?function\s+public\.apply_matchday_editorial_profile_workspace_v12/i,
  );
  assert.match(route, /apply_matchday_live_layout_physical_v20/);
  assert.doesNotMatch(route, /apply_matchday_live_layout_physical_workspace_v14/);
  assert.doesNotMatch(route, /apply_matchday_editorial_profile_workspace_v12/);
  assert.doesNotMatch(route, /workspace_token_v13|physical_state_v13_shadow/);
});

test("working tree preserva artefactos anteriores e limita o Passo 3 aos tres ficheiros novos", () => {
  const allowed = new Set([
    "({alt",
    "baseline-testes-20260829.txt",
    "jornada-codex-parcial.zip",
    "jornada-lote-7b-codex-parcial-20260902.zip",
    "supabase/.temp/",
    migrationPath,
    fixturePath,
    "lib/matchday-live-layout-physical-writer-v13-shadow.test.ts",
    "app/api/admin/editorial/artigos/route.ts",
    "app/api/admin/editorial/conteudos/route.ts",
    "app/api/admin/gestor/editorial-image/route.ts",
    "app/api/admin/gestor/route.ts",
    "lib/editorial-article-canonical-delete.test.ts",
    "lib/editorial-article-live-snapshot-postgrest.test.ts",
    "lib/editorial-article-live-snapshot-sync.test.ts",
    "lib/editorial-article-live-snapshot-sync.ts",
    "lib/editorial-content-snapshot-sync.ts",
    "lib/editorial-matchday-desk-resolution.test.ts",
    "lib/editorial-matchday-desk-resolution.ts",
    "lib/editorial-matchday-latest-four-projection.test.ts",
    "lib/editorial-matchday-latest-four-projection.ts",
    "lib/editorial-matchday-news-flow.test.ts",
    "lib/editorial-matchday-news-flow-runtime.test.ts",
    "lib/editorial-matchday-news-flow.ts",
    "lib/editorial-matchday-physical-placement.ts",
    "lib/matchday-live-layout-authoritative-cutover.test.ts",
    "lib/matchday-live-layout-physical-apply-facade.test.ts",
    "lib/matchday-live-layout-physical-apply-video-guard.test.ts",
    "lib/matchday-publication-physical-placement-boundary.test.ts",
    "lib/public-matchday-latest-zone-placement.test.ts",
    "supabase/migrations/20260905110018_matchday_publication_physical_placement_boundary_v15.sql",
    "supabase/sql/test-matchday-publication-physical-placement-boundary-pg17.sql",
  ]);
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=normal"],
    { encoding: "utf8" },
  );
  const unexpected = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"))
    .filter((path) => !allowed.has(path));

  assert.deepEqual(unexpected, []);
});
