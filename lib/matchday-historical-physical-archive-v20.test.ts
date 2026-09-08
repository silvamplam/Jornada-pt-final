import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260908173933_matchday_historical_physical_archive_v20.sql";
const v19MigrationPath =
  "supabase/migrations/20260905142832_matchday_live_layout_physical_handoff_v19.sql";
const v19HistoricalFixPath =
  "supabase/migrations/20260908142701_historical_republish_v19_certificate_archive_integrity.sql";
const smokePath =
  "supabase/sql/test-matchday-live-layout-physical-handoff-pg17.sql";

const migration = readFileSync(migrationPath, "utf8");
const v19Migration = readFileSync(v19MigrationPath, "utf8");
const smoke = readFileSync(smokePath, "utf8");

function section(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `inicio ausente: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `fim ausente: ${endNeedle}`);
  return source.slice(start, end);
}

const components = section(
  migration,
  "create function\njornada_private.matchday_historical_physical_archive_components_v20(",
  "revoke all on function\n  jornada_private.matchday_historical_physical_archive_components_v20(uuid)",
);
const eligibility = section(
  migration,
  "create function\njornada_private.matchday_historical_physical_archive_backfill_eligible_v20(",
  "revoke all on function\n  jornada_private.matchday_historical_physical_archive_backfill_eligible_v20(",
);
const certifier = section(
  migration,
  "create function\njornada_private.certify_matchday_historical_physical_archive_v20(",
  "revoke all on function\n  jornada_private.certify_matchday_historical_physical_archive_v20(uuid, text)",
);
const strictValidator = section(
  migration,
  "create function\njornada_private.assert_matchday_live_layout_historical_physical_archive_v20(",
  "revoke all on function\n  jornada_private\n    .assert_matchday_live_layout_historical_physical_archive_v20(",
);
const dispatcher = section(
  migration,
  "create function\njornada_private.assert_matchday_live_layout_historical_republish_v20(",
  "revoke all on function\n  jornada_private.assert_matchday_live_layout_historical_republish_v20(",
);
const patchBlock = section(migration, "do $patch$", "do $postconditions$");

test("v20 e forward-only e preserva integralmente o contrato v19", () => {
  assert.match(migration, /^begin;/u);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/u);
  assert.ok(migrationPath > v19HistoricalFixPath);
  assert.equal((migration.match(/^begin;/gmu) ?? []).length, 1);
  assert.equal((migration.match(/^commit;/gmu) ?? []).length, 1);

  const protectedChanges = execFileSync(
    "git",
    ["diff", "--name-only", "--", v19MigrationPath, v19HistoricalFixPath],
    { encoding: "utf8" },
  ).trim();
  assert.equal(protectedChanges, "");
  assert.match(v19Migration, /source_archive_hash text not null/u);
  assert.doesNotMatch(migration, /update\s+jornada_private\.matchday_live_layout_physical_handoffs/iu);
});

test("os 18 componentes v19 ficam classificados sem esconder superficies", () => {
  const v19Hash = section(
    v19Migration,
    "jornada_private.matchday_live_layout_physical_archive_hash_v19(",
    "revoke all on function\n  jornada_private.matchday_live_layout_physical_archive_hash_v19(uuid)",
  );
  const v19Components = [
    "zones",
    "blocks",
    "settings",
    "cutover",
    "projection",
    "assignment",
    "bank",
    "placements",
    "overrides",
    "memory",
    "latest",
    "roundup",
    "layout_items",
    "editorials",
    "highlights",
    "horizontal",
    "zone_items",
    "state_items",
  ];
  const immutablePhysical = [
    "zones",
    "blocks",
    "settings",
    "cutover",
    "assignment",
    "placements",
    "overrides",
    "memory",
  ];
  const evolvingEditorialOrCompatibility = [
    "projection",
    "bank",
    "latest",
    "roundup",
    "layout_items",
    "editorials",
    "highlights",
    "horizontal",
    "zone_items",
    "state_items",
  ];
  assert.deepEqual(
    [...v19Hash.matchAll(/'([a-z_]+)', coalesce/gu)].map((match) => match[1]),
    v19Components,
  );
  assert.deepEqual(
    [...immutablePhysical, ...evolvingEditorialOrCompatibility].sort(),
    [...v19Components].sort(),
  );

  for (const immutable of [
    "zones",
    "blocks",
    "settings",
    "cutover",
    "assignment",
    "placements",
    "explicit_bank",
    "memory",
  ]) {
    assert.match(components, new RegExp(`'${immutable}'`));
  }

  for (const evolvingOrDerived of [
    "matchday_live_layout_zone_legacy_projection",
    "matchday_editorial_bank_items",
    "matchday_latest_news",
    "matchday_roundup_items",
    "matchday_live_layout_items",
    "matchday_editorials",
    "matchday_highlights",
    "matchday_horizontal_news",
    "matchday_editorial_profile_zone_items",
    "matchday_editorial_profile_state_items",
  ]) {
    assert.doesNotMatch(components, new RegExp(evolvingOrDerived));
  }
});

test("hash fisico usa whitelist sem linhas inteiras nem timestamps tecnicos", () => {
  assert.doesNotMatch(components, /to_jsonb\s*\(/u);
  assert.doesNotMatch(components, /created_at|updated_at|recorded_at/u);
  assert.match(components, /'cutover_at', cutover_row\.cutover_at/u);
  assert.match(components, /override_row\.placement_target = 'bank'/u);

  for (const physicalColumn of [
    "visual_family",
    "block_type",
    "sort_order",
    "faixa_slot_count",
    "headline_title_color",
    "latest_zone_placement",
    "video_module_active",
    "profile_key",
    "bank_item_id",
    "placement_type",
    "zone_id",
    "slot_position",
    "memory_kind",
  ]) {
    assert.match(components, new RegExp(physicalColumn));
  }
});

test("certificado v20 liga-se ao v19 e guarda hashes por componente", () => {
  assert.match(
    migration,
    /create table\s+jornada_private\.matchday_historical_physical_archive_certificates_v20/u,
  );
  for (const authority of [
    "matchday_live_layout_physical_handoffs",
    "matchday_live_layout_physical_topology_transitions",
    "matchday_live_layout_physical_carryovers",
    "matchday_reference_compositions",
  ]) {
    assert.match(migration, new RegExp(`references(?:[\\s\\S]{0,120})${authority}`));
  }
  assert.match(migration, /v19_source_archive_hash text not null/u);
  assert.match(migration, /physical_core_hash text not null/u);
  for (const hash of [
    "zones_hash",
    "blocks_hash",
    "settings_hash",
    "cutover_hash",
    "assignment_hash",
    "placements_hash",
    "explicit_bank_hash",
    "memory_hash",
  ]) {
    assert.match(migration, new RegExp(`${hash} text not null`));
  }
  assert.equal((migration.match(/on delete restrict/gmu) ?? []).length, 4);
});

test("backfill exige prova independente e nunca certifica apenas o estado atual", () => {
  for (const proof of [
    "matchday_live_layout_physical_topology_transitions",
    "matchday_live_layout_physical_zone_maps",
    "matchday_live_layout_physical_carryovers",
    "matchday_editorial_continuity_transitions",
    "matchday_reference_compositions",
    "matchday_editorial_desk_control",
    "assert_matchday_live_layout_physical_topology_source_v17",
    "inherited_placement_count",
    "inherited_explicit_bank_count",
    "inherited_memory_count",
    "completed_at",
  ]) {
    assert.match(eligibility, new RegExp(proof));
  }
  assert.doesNotMatch(
    eligibility,
    /matchday_historical_physical_archive_hash_v20/u,
  );
  assert.match(
    certifier,
    /p_certification_basis = 'atomic_handoff'[\s\S]*matchday_live_layout_physical_archive_hash_v19/u,
  );
  assert.match(migration, /'audited_backfill'/u);
  assert.doesNotMatch(
    migration,
    /96b4049f-ac1b-4961-b91c-6f34fae592ce|110bd7e1-cb3d-4910-a828-415154304fd7/iu,
  );
});

test("novos handoffs recebem certificado atomico e runtime nao fabrica certificados", () => {
  assert.match(
    migration,
    /after insert on jornada_private\.matchday_live_layout_physical_handoffs/u,
  );
  assert.match(migration, /new\.id,\s*\n\s*'atomic_handoff'/u);
  assert.doesNotMatch(dispatcher, /certify_matchday|insert into|update|delete from/iu);
  assert.match(
    dispatcher,
    /assert_matchday_live_layout_historical_physical_archive_v20/u,
  );
  assert.match(
    dispatcher,
    /assert_matchday_live_layout_historical_republish_v19/u,
  );
});

test("validador v20 prova cadeia e componentes sem ler estado vivo do target", () => {
  for (const authority of [
    "matchday_historical_physical_archive_certificates_v20",
    "matchday_live_layout_physical_handoffs",
    "matchday_live_layout_physical_topology_transitions",
    "matchday_live_layout_physical_carryovers",
    "matchday_editorial_continuity_transitions",
    "matchday_editorial_desk_control",
  ]) {
    assert.match(strictValidator, new RegExp(authority));
  }

  for (const component of [
    "zones-changed",
    "blocks-changed",
    "settings-changed",
    "cutover-changed",
    "assignment-changed",
    "placements-changed",
    "explicit-bank-changed",
    "memory-changed",
  ]) {
    assert.match(strictValidator, new RegExp(component));
  }

  for (const forbiddenTargetRead of [
    "read_matchday_live_layout_workspace",
    "target_state_token is distinct from",
    "target_settings",
    "target_zone",
    "target_placement",
    "target_bank",
    "target_latest",
  ]) {
    assert.doesNotMatch(strictValidator, new RegExp(forbiddenTargetRead, "i"));
  }
});

test("draft historico permanece fora do arquivo fisico original", () => {
  assert.doesNotMatch(
    components,
    /matchday_reference_compositions|matchday_reference_composition_items|matchday_historical_composition/u,
  );
  assert.match(
    strictValidator,
    /handoff_row\.source_composition_id = p_source_composition_id/u,
  );
  assert.match(
    strictValidator,
    /transition_row\.source_composition_id = p_source_composition_id/u,
  );
  assert.match(
    strictValidator,
    /composition_row\.status = 'published'/u,
  );
});

test("publish troca apenas os dois asserts historicos e preserva handoff e recovery", () => {
  assert.match(patchBlock, /v_occurrences <> 2/u);
  assert.match(
    patchBlock,
    /assert_matchday_live_layout_historical_republish_v19/u,
  );
  assert.match(
    patchBlock,
    /assert_matchday_live_layout_historical_republish_v20/u,
  );
  assert.match(patchBlock, /pg_catalog\.replace\(v_definition, v_old_name, v_new_name\)/u);

  for (const protectedFunction of [
    "materialize_matchday_live_layout_physical_handoff_v19",
    "assert_matchday_live_layout_physical_handoff_complete_v19",
    "recover_matchday_live_layout_continuity",
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`create(?: or replace)? function\\s+(?:public|jornada_private)\\.${protectedFunction}\\(`),
    );
  }
});

test("certificado e helpers privados nao sao expostos ao service_role", () => {
  assert.match(
    migration,
    /alter table\s+jornada_private\.matchday_historical_physical_archive_certificates_v20\s+enable row level security/u,
  );
  assert.match(
    migration,
    /revoke all on table\s+jornada_private\.matchday_historical_physical_archive_certificates_v20\s+from public, anon, authenticated, service_role;/u,
  );
  for (const helper of [
    "matchday_historical_physical_archive_components_v20",
    "matchday_historical_physical_archive_hash_v20",
    "matchday_historical_physical_archive_backfill_eligible_v20",
    "certify_matchday_historical_physical_archive_v20",
    "assert_matchday_live_layout_historical_physical_archive_v20",
    "assert_matchday_live_layout_historical_republish_v20",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function[\\s\\S]{0,160}${helper}`),
    );
  }
  assert.doesNotMatch(
    migration,
    /grant execute on function\s+jornada_private\./iu,
  );
});

test("smoke cobre evolucao editorial, corrupcao fisica e rollback", () => {
  for (const evolving of [
    "matchday_editorial_bank_items",
    "matchday_latest_news",
    "matchday_highlights",
    "matchday_roundup_items",
  ]) {
    assert.match(smoke, new RegExp(`update public\\.${evolving}`));
  }
  assert.match(
    smoke,
    /v20 accepts evolved Bank Latest Highlights and Roundup/u,
  );
  assert.match(smoke, /historical-v20-zones-changed/u);
  assert.match(smoke, /historical-v20-settings-changed/u);
  assert.match(smoke, /historical-v20-placements-changed/u);
  assert.match(smoke, /strict v20 validation fabricated a runtime certificate/u);
  assert.match(smoke, /rollback;\s*$/u);
});
