import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260908194740_matchday_historical_reopen_physical_handoff_authority_v20.sql";
const originalMigrationPath =
  "supabase/migrations/20260902053337_matchday_historical_republish_independence.sql";
const migration = readFileSync(migrationPath, "utf8");
const smoke = readFileSync(
  "supabase/sql/test-matchday-live-layout-physical-handoff-pg17.sql",
  "utf8",
);

function functionBody() {
  const start = migration.indexOf(
    "create or replace function public.reopen_matchday_reference_composition(",
  );
  assert.ok(start >= 0, "reopen function is absent");
  const end = migration.indexOf("$function$;", start);
  assert.ok(end > start, "reopen function terminator is absent");
  return migration.slice(start, end + "$function$;".length);
}

const reopen = functionBody();

test("migration is forward-only and replaces only the historical reopen RPC", () => {
  assert.match(migration, /^begin;/u);
  assert.match(migration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/u);
  assert.equal(
    (migration.match(/create or replace function/giu) ?? []).length,
    1,
  );
  assert.doesNotMatch(migration, /\b(?:create|alter|drop)\s+table\b/iu);

  const protectedChange = execFileSync(
    "git",
    ["diff", "--name-only", "--", originalMigrationPath],
    { encoding: "utf8" },
  ).trim();
  assert.equal(protectedChange, "");
});

test("published/current membership belongs to the requested matchday", () => {
  assert.match(
    reopen,
    /composition_row\.id = p_composition_id[\s\S]*composition_row\.matchday_id = p_matchday_id[\s\S]*composition_row\.status = 'published'[\s\S]*composition_row\.is_current = true/u,
  );
  assert.match(reopen, /composition_current_published_not_found/u);
});

test("retirement authority is an unmanaged desk plus a coherent durable handoff", () => {
  assert.match(
    reopen,
    /source_desk\.matchday_id = p_matchday_id[\s\S]*source_desk\.is_managed = false[\s\S]*carryover_source_composition_id is null[\s\S]*carryover_snapshot is null/u,
  );
  assert.match(
    reopen,
    /from jornada_private\.matchday_live_layout_physical_handoffs as handoff_row/u,
  );
  assert.match(
    reopen,
    /join jornada_private\.matchday_live_layout_physical_topology_transitions[\s\S]*topology_row\.id = handoff_row\.topology_transition_id[\s\S]*topology_row\.source_matchday_id = handoff_row\.source_matchday_id[\s\S]*topology_row\.target_matchday_id = handoff_row\.target_matchday_id/u,
  );
  assert.match(
    reopen,
    /join jornada_private\.matchday_live_layout_physical_carryovers[\s\S]*carryover_row\.id = handoff_row\.carryover_id[\s\S]*carryover_row\.source_composition_id =[\s\S]*handoff_row\.source_composition_id[\s\S]*carryover_row\.state_token_after = handoff_row\.target_state_token/u,
  );
  assert.match(
    reopen,
    /join public\.matchday_editorial_continuity_transitions[\s\S]*transition_row\.source_matchday_id = handoff_row\.source_matchday_id[\s\S]*transition_row\.target_matchday_id = handoff_row\.target_matchday_id[\s\S]*transition_row\.source_composition_id =[\s\S]*handoff_row\.source_composition_id/u,
  );
  assert.match(reopen, /handoff_row\.source_matchday_id = p_matchday_id/u);
  assert.match(reopen, /composition_historical_physical_handoff_not_found/u);
});

test("retirement no longer depends on archived rows, target live state, or a version literal", () => {
  assert.doesNotMatch(reopen, /continuity_version/u);
  assert.doesNotMatch(reopen, /matchday_live_layout_placements/u);
  assert.doesNotMatch(reopen, /matchday_live_layout_bank_item_state_memory/u);
  assert.doesNotMatch(reopen, /read_matchday_live_layout_workspace/u);
  assert.doesNotMatch(reopen, /target_desk/u);
  assert.doesNotMatch(
    reopen,
    /handoff_row\.source_composition_id\s*=\s*p_composition_id/u,
  );
});

test("an existing draft of the same presentation mode is returned idempotently", () => {
  assert.match(
    reopen,
    /draft_row\.matchday_id = p_matchday_id[\s\S]*draft_row\.presentation_mode = v_source\.presentation_mode[\s\S]*draft_row\.status = 'draft'[\s\S]*return v_existing_draft_id/u,
  );
});

test("the independent draft preserves parent properties and every child family", () => {
  for (const parentField of [
    "internal_name",
    "use_roundup_items",
    "presentation_mode",
    "hierarchical_editorial_title",
    "hierarchical_editorial_text",
    "hierarchical_editorial_author",
    "hierarchical_editorial_excerpt",
    "hierarchical_headline_title_color",
    "hierarchical_zone_1_title",
    "hierarchical_zone_2_title",
    "hierarchical_block_order",
    "hierarchical_editorial_source_type",
    "hierarchical_editorial_source_id",
    "hierarchical_video_position",
  ]) {
    assert.match(reopen, new RegExp(`v_source\\.${parentField}`));
  }

  assert.match(reopen, /from public\.matchday_reference_composition_items/u);
  assert.match(reopen, /from public\.matchday_hierarchical_composition_slots/u);
  assert.match(reopen, /from public\.matchday_historical_composition_zones/u);
  assert.match(
    reopen,
    /from public\.matchday_historical_composition_zone_items/u,
  );
  assert.match(
    reopen,
    /v_item\.media_kind_snapshot[\s\S]*v_item\.media_embed_url_snapshot[\s\S]*v_item\.media_video_url_snapshot/u,
  );
  assert.match(
    reopen,
    /v_slot\.media_kind_snapshot[\s\S]*v_slot\.media_embed_url_snapshot[\s\S]*v_slot\.media_video_url_snapshot/u,
  );
});

test("reopen writes only the new source draft and leaves physical authorities untouched", () => {
  assert.doesNotMatch(
    reopen,
    /(?:insert into|update|delete from)\s+(?:public|jornada_private)\.(?:matchday_editorial_desk_control|matchday_editorial_continuity_transitions|matchday_live_layout_physical_handoffs|matchday_live_layout_physical_topology_transitions|matchday_live_layout_physical_carryovers|matchday_live_layout_placements|matchday_live_layout_bank_item_state_memory)/iu,
  );
  assert.doesNotMatch(reopen, /update public\.matchday_reference_compositions/iu);
});

test("RPC remains security-definer and executable only by service_role", () => {
  assert.match(reopen, /security definer[\s\S]*set search_path = ''/u);
  assert.match(
    migration,
    /revoke all on function[\s\S]*reopen_matchday_reference_composition\(uuid, uuid\)[\s\S]*from public, anon, authenticated, service_role/u,
  );
  assert.match(
    migration,
    /grant execute on function[\s\S]*reopen_matchday_reference_composition\(uuid, uuid\)[\s\S]*to service_role/u,
  );
});

test("implementation is generic and contains no J05 identity", () => {
  assert.doesNotMatch(
    migration,
    /96b4049f-ac1b-4961-b91c-6f34fae592ce|110bd7e1-cb3d-4910-a828-415154304fd7|efee4411-b5ed-4b7b-a916-0d1d24e8d6d5/iu,
  );
});

test("PG17 smoke exercises the current-republish reopen and every guard", () => {
  assert.match(
    smoke,
    /current_composition\.id <> handoff_row\.source_composition_id/u,
  );
  assert.match(
    smoke,
    /from public\.matchday_live_layout_placements as placement_row[\s\S]*from public\.matchday_live_layout_bank_item_state_memory as memory_row[\s\S]*historical reopen fixture lacks republished current or archived state/u,
  );
  assert.match(
    smoke,
    /v_idempotent_draft_id = v_draft_id[\s\S]*presentation_mode = 'hierarchical'/u,
  );
  assert.match(
    smoke,
    /historical reopen did not copy children and media snapshots/u,
  );
  assert.match(smoke, /non-current composition reopened/u);
  assert.match(smoke, /draft composition reopened/u);
  assert.match(smoke, /incoherent matchday\/composition reopened/u);
  assert.match(smoke, /managed source reopened/u);
  assert.match(smoke, /source without handoff reopened/u);
  assert.match(
    smoke,
    /historical reopen changed physical archive, handoff, transition or target/u,
  );
  assert.match(smoke, /rollback;\s*$/u);
});
