begin;

-- A physical zone map is a permanent transition identity record. The target
-- matchday becomes mutable after a completed handoff, so the historical target
-- UUID must outlive the current public zone row without copying live content.

create table
  jornada_private.matchday_live_layout_physical_target_zone_identities (
    topology_transition_id uuid not null,
    source_matchday_id uuid not null,
    target_matchday_id uuid not null,
    target_zone_id uuid not null,
    created_at timestamptz not null
      default pg_catalog.statement_timestamp(),

    constraint matchday_live_layout_physical_target_zone_identities_pkey
      primary key (topology_transition_id, target_zone_id),

    constraint physical_target_zone_identities_context_key
      unique (
        topology_transition_id,
        source_matchday_id,
        target_matchday_id,
        target_zone_id
      ),

    constraint physical_target_zone_identities_transition_fk
      foreign key (
        topology_transition_id,
        source_matchday_id,
        target_matchday_id
      )
      references
        jornada_private.matchday_live_layout_physical_topology_transitions (
          id,
          source_matchday_id,
          target_matchday_id
        )
      on delete restrict
  );

alter table
  jornada_private.matchday_live_layout_physical_target_zone_identities
enable row level security;

revoke all on table
  jornada_private.matchday_live_layout_physical_target_zone_identities
from public, anon, authenticated, service_role;

comment on table
  jornada_private.matchday_live_layout_physical_target_zone_identities
is
  'Private immutable identity-only registry for target zone UUIDs created by physical topology transitions. It deliberately contains no live zone attributes and survives removal of the current target zone row.';


-- The persistent map is the sole authority for the historical identity
-- backfill. The current public zone rows are deliberately not copied.
insert into
  jornada_private.matchday_live_layout_physical_target_zone_identities (
    topology_transition_id,
    source_matchday_id,
    target_matchday_id,
    target_zone_id,
    created_at
  )
select
  map_row.topology_transition_id,
  map_row.source_matchday_id,
  map_row.target_matchday_id,
  map_row.target_zone_id,
  map_row.created_at
from jornada_private.matchday_live_layout_physical_zone_maps as map_row
order by map_row.topology_transition_id, map_row.target_zone_id;

do $backfill_postconditions$
begin
  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    group by
      map_row.topology_transition_id,
      map_row.source_matchday_id,
      map_row.target_matchday_id,
      map_row.target_zone_id
    having pg_catalog.count(*) <> 1
  ) then
    raise exception 'physical-target-zone-identity-duplicate';
  end if;

  if (
    select pg_catalog.count(*)
    from jornada_private.matchday_live_layout_physical_zone_maps
  ) <> (
    select pg_catalog.count(*)
    from jornada_private
      .matchday_live_layout_physical_target_zone_identities
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    left join jornada_private
      .matchday_live_layout_physical_target_zone_identities as identity_row
      on identity_row.topology_transition_id =
         map_row.topology_transition_id
     and identity_row.source_matchday_id = map_row.source_matchday_id
     and identity_row.target_matchday_id = map_row.target_matchday_id
     and identity_row.target_zone_id = map_row.target_zone_id
    where identity_row.target_zone_id is null
  ) or exists (
    select 1
    from jornada_private
      .matchday_live_layout_physical_target_zone_identities as identity_row
    left join jornada_private.matchday_live_layout_physical_zone_maps as map_row
      on map_row.topology_transition_id =
         identity_row.topology_transition_id
     and map_row.source_matchday_id = identity_row.source_matchday_id
     and map_row.target_matchday_id = identity_row.target_matchday_id
     and map_row.target_zone_id = identity_row.target_zone_id
    where map_row.target_zone_id is null
  ) then
    raise exception 'physical-target-zone-identity-backfill-incomplete';
  end if;
end;
$backfill_postconditions$;


-- Keep source zones protected by their live archive row. Only the target-side
-- dependency moves from mutable live state to immutable transition identity.
alter table jornada_private.matchday_live_layout_physical_zone_maps
  drop constraint matchday_live_layout_physical_zone_maps_target_zone_fk;

alter table jornada_private.matchday_live_layout_physical_zone_maps
  add constraint matchday_live_layout_physical_zone_maps_target_zone_fk
  foreign key (
    topology_transition_id,
    source_matchday_id,
    target_matchday_id,
    target_zone_id
  )
  references
    jornada_private.matchday_live_layout_physical_target_zone_identities (
      topology_transition_id,
      source_matchday_id,
      target_matchday_id,
      target_zone_id
    )
  on delete restrict
  deferrable initially deferred;


-- Clone the already-proven v17 implementation behind the same private API.
-- The deferred target identity FK permits the implementation to create its map
-- first; this wrapper persists every generated target UUID before the statement
-- can complete and verifies exact one-to-one coverage. The original function
-- OID is preserved by CREATE OR REPLACE so already-cached callers cannot keep
-- invoking the unwrapped implementation after this migration commits.
do $clone_v17$
declare
  v_definition text;
  v_cloned_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'jornada_private.materialize_matchday_live_layout_physical_topology_v17(uuid,uuid)'::regprocedure
  )
  into v_definition;

  v_cloned_definition := pg_catalog.replace(
    v_definition,
    'CREATE OR REPLACE FUNCTION jornada_private.materialize_matchday_live_layout_physical_topology_v17(',
    'CREATE FUNCTION jornada_private.materialize_matchday_live_layout_physical_topology_v17_impl('
  );

  if v_cloned_definition is not distinct from v_definition then
    raise exception 'physical-target-zone-identity-v17-clone-failed';
  end if;

  execute v_cloned_definition;
end;
$clone_v17$;

revoke all on function
  jornada_private.materialize_matchday_live_layout_physical_topology_v17_impl(
    uuid,
    uuid
  )
from public, anon, authenticated, service_role;

create or replace function
jornada_private.materialize_matchday_live_layout_physical_topology_v17(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid
)
returns table (
  topology_transition_id uuid,
  source_matchday_id uuid,
  target_matchday_id uuid,
  profile_key text,
  zone_count integer,
  block_count integer,
  legacy_projection_count integer,
  state_token text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_result record;
begin
  select impl_row.*
  into v_result
  from jornada_private
    .materialize_matchday_live_layout_physical_topology_v17_impl(
      p_source_matchday_id,
      p_target_matchday_id
    ) as impl_row;

  if not found then
    raise exception 'matchday-live-layout-topology-v17-result-missing';
  end if;

  insert into
    jornada_private.matchday_live_layout_physical_target_zone_identities (
      topology_transition_id,
      source_matchday_id,
      target_matchday_id,
      target_zone_id,
      created_at
    )
  select
    map_row.topology_transition_id,
    map_row.source_matchday_id,
    map_row.target_matchday_id,
    map_row.target_zone_id,
    map_row.created_at
  from jornada_private.matchday_live_layout_physical_zone_maps as map_row
  where map_row.topology_transition_id = v_result.topology_transition_id
    and map_row.source_matchday_id = p_source_matchday_id
    and map_row.target_matchday_id = p_target_matchday_id
  order by map_row.target_zone_id;

  if (
    select pg_catalog.count(*)
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    where map_row.topology_transition_id = v_result.topology_transition_id
  ) <> (
    select pg_catalog.count(*)
    from jornada_private
      .matchday_live_layout_physical_target_zone_identities as identity_row
    where identity_row.topology_transition_id =
          v_result.topology_transition_id
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    left join jornada_private
      .matchday_live_layout_physical_target_zone_identities as identity_row
      on identity_row.topology_transition_id =
         map_row.topology_transition_id
     and identity_row.source_matchday_id = map_row.source_matchday_id
     and identity_row.target_matchday_id = map_row.target_matchday_id
     and identity_row.target_zone_id = map_row.target_zone_id
    where map_row.topology_transition_id = v_result.topology_transition_id
      and identity_row.target_zone_id is null
  ) then
    raise exception
      'physical-target-zone-identity-materialization-incomplete';
  end if;

  return query
  select
    v_result.topology_transition_id::uuid,
    v_result.source_matchday_id::uuid,
    v_result.target_matchday_id::uuid,
    v_result.profile_key::text,
    v_result.zone_count::integer,
    v_result.block_count::integer,
    v_result.legacy_projection_count::integer,
    v_result.state_token::text;
end;
$function$;

revoke all on function
  jornada_private.materialize_matchday_live_layout_physical_topology_v17(
    uuid,
    uuid
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.materialize_matchday_live_layout_physical_topology_v17(
    uuid,
    uuid
  )
is
  'Private physical topology constructor preserving the v17 contract and atomically registering every generated target zone UUID as an immutable transition endpoint identity.';


-- Clone the current v20 implementation behind its private API. The wrapper
-- acquires the same writer/matchday locks before checking the requested zone
-- deletion, closing the race with concurrent outgoing topology construction.
-- It never mutates a historical map and delegates the existing displaced,
-- block ordering, placement, downstream and postcondition logic unchanged.
-- CREATE OR REPLACE retains the original OID for already-cached v20 callers.
do $clone_v20$
declare
  v_definition text;
  v_cloned_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'jornada_private.apply_matchday_live_layout_physical_workspace_v20_core(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  )
  into v_definition;

  v_cloned_definition := pg_catalog.replace(
    v_definition,
    'CREATE OR REPLACE FUNCTION jornada_private.apply_matchday_live_layout_physical_workspace_v20_core(',
    'CREATE FUNCTION jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl('
  );

  if v_cloned_definition is not distinct from v_definition then
    raise exception 'physical-target-zone-identity-v20-clone-failed';
  end if;

  execute v_cloned_definition;
end;
$clone_v20$;

revoke all on function
  jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(
    uuid,text,text,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

create or replace function
jornada_private.apply_matchday_live_layout_physical_workspace_v20_core(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_physical_state_token text,
  p_zones jsonb,
  p_blocks jsonb,
  p_placements jsonb,
  p_faixa_slot_count integer,
  p_explicit_bank_item_ids jsonb,
  p_displaced_bank_item_ids jsonb,
  p_worked_bank_item_ids jsonb,
  p_faixa_arrival_bank_item_ids jsonb,
  p_displaced_arrival_bank_item_ids jsonb,
  p_presentation jsonb
)
returns table (
  state_token text,
  applied_zone_count integer,
  applied_block_count integer,
  applied_placement_count integer,
  explicit_bank_item_count integer,
  displaced_bank_item_count integer,
  worked_bank_item_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  -- Invalid envelopes and malformed zone arrays retain the implementation's
  -- established errors. Valid zone input is serialized with topology writers
  -- before the read-only outgoing-source guard runs.
  if p_matchday_id is not null
    and p_zones is not null
    and pg_catalog.jsonb_typeof(p_zones) = 'array'
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_zones) as raw_row(payload)
      where pg_catalog.jsonb_typeof(raw_row.payload) <> 'object'
        or (
          select pg_catalog.count(*)
          from pg_catalog.jsonb_object_keys(raw_row.payload)
            as key_row(key_name)
        ) <> 3
        or not raw_row.payload ?& array[
          'id', 'public_title', 'visual_family'
        ]
        or pg_catalog.jsonb_typeof(raw_row.payload -> 'id') <> 'string'
        or pg_catalog.btrim(raw_row.payload ->> 'id') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  then
    perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

    perform 1
    from public.matchdays as matchday_row
    where matchday_row.id = p_matchday_id
    for update;

    if exists (
      select 1
      from public.matchday_live_layout_zones as current_zone
      join jornada_private.matchday_live_layout_physical_zone_maps as map_row
        on map_row.source_matchday_id = current_zone.matchday_id
       and map_row.source_zone_id = current_zone.id
      where current_zone.matchday_id = p_matchday_id
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_zones) as desired_zone(payload)
          where pg_catalog.btrim(desired_zone.payload ->> 'id')::uuid =
                current_zone.id
        )
    ) then
      raise exception
        'matchday-live-layout-physical-v20-zone-source-topology-locked';
    end if;
  end if;

  return query
  select impl_row.*
  from jornada_private
    .apply_matchday_live_layout_physical_workspace_v20_core_impl(
      p_matchday_id,
      p_profile_key,
      p_expected_physical_state_token,
      p_zones,
      p_blocks,
      p_placements,
      p_faixa_slot_count,
      p_explicit_bank_item_ids,
      p_displaced_bank_item_ids,
      p_worked_bank_item_ids,
      p_faixa_arrival_bank_item_ids,
      p_displaced_arrival_bank_item_ids,
      p_presentation
    ) as impl_row;
end;
$function$;

revoke all on function
  jornada_private.apply_matchday_live_layout_physical_workspace_v20_core(
    uuid,text,text,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.apply_matchday_live_layout_physical_workspace_v20_core(
    uuid,text,text,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
is
  'Atomic physical workspace core preserving target map identities while rejecting deletion of zones already used as source endpoints by an outgoing physical topology.';


do $postconditions$
declare
  v_source_reference regclass;
  v_target_reference regclass;
  v_target_deferrable boolean;
  v_target_deferred boolean;
begin
  select constraint_row.confrelid::regclass
  into v_source_reference
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid =
        'jornada_private.matchday_live_layout_physical_zone_maps'::regclass
    and constraint_row.conname =
        'matchday_live_layout_physical_zone_maps_source_zone_fk';

  select
    constraint_row.confrelid::regclass,
    constraint_row.condeferrable,
    constraint_row.condeferred
  into
    v_target_reference,
    v_target_deferrable,
    v_target_deferred
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid =
        'jornada_private.matchday_live_layout_physical_zone_maps'::regclass
    and constraint_row.conname =
        'matchday_live_layout_physical_zone_maps_target_zone_fk';

  if v_source_reference is distinct from
       'public.matchday_live_layout_zones'::regclass
    or v_target_reference is distinct from
       'jornada_private.matchday_live_layout_physical_target_zone_identities'::regclass
    or not v_target_deferrable
    or not v_target_deferred
  then
    raise exception 'physical-target-zone-identity-fk-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    left join jornada_private
      .matchday_live_layout_physical_target_zone_identities as identity_row
      on identity_row.topology_transition_id =
         map_row.topology_transition_id
     and identity_row.source_matchday_id = map_row.source_matchday_id
     and identity_row.target_matchday_id = map_row.target_matchday_id
     and identity_row.target_zone_id = map_row.target_zone_id
    where identity_row.target_zone_id is null
  ) then
    raise exception 'physical-target-zone-identity-postcondition';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role',
       'jornada_private.matchday_live_layout_physical_target_zone_identities',
       'SELECT'
     )
    or pg_catalog.has_table_privilege(
       'service_role',
       'jornada_private.matchday_live_layout_physical_target_zone_identities',
       'INSERT'
     )
    or pg_catalog.has_table_privilege(
       'service_role',
       'jornada_private.matchday_live_layout_physical_target_zone_identities',
       'UPDATE'
     )
    or pg_catalog.has_table_privilege(
       'service_role',
       'jornada_private.matchday_live_layout_physical_target_zone_identities',
       'DELETE'
     )
    or pg_catalog.has_function_privilege(
      'service_role',
      'jornada_private.materialize_matchday_live_layout_physical_topology_v17(uuid,uuid)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'jornada_private.materialize_matchday_live_layout_physical_topology_v17_impl(uuid,uuid)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'jornada_private.apply_matchday_live_layout_physical_workspace_v20_core(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    )
  then
    raise exception 'physical-target-zone-identity-acl-invalid';
  end if;
end;
$postconditions$;

commit;
