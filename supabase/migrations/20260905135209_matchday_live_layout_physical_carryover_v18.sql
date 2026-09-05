begin;

-- LOTE 4 / v18
-- Materialize content and physical occupancy on top of an already certified
-- v17 topology. This function is deliberately not wired to handoff,
-- activation, recovery or retirement.

-- ============================================================
-- 1. PERSISTENT CONTENT CERTIFICATE AND BANK IDENTITY MAP
-- ============================================================

create table jornada_private.matchday_live_layout_physical_carryovers (
  id uuid primary key default gen_random_uuid(),
  topology_transition_id uuid not null,
  source_matchday_id uuid not null,
  target_matchday_id uuid not null,
  source_composition_id uuid not null,
  profile_key text not null,
  inherited_bank_count integer not null,
  inherited_placement_count integer not null,
  inherited_explicit_bank_count integer not null,
  inherited_memory_count integer not null,
  inherited_latest_count integer not null,
  inherited_roundup_count integer not null,
  inherited_functional_layout_item_count integer not null,
  state_token_before text not null,
  state_token_after text,
  materialized_at timestamptz not null
    default pg_catalog.statement_timestamp(),

  constraint matchday_live_layout_physical_carryovers_pair_check
    check (source_matchday_id <> target_matchday_id),

  constraint matchday_live_layout_physical_carryovers_profile_check
    check (pg_catalog.btrim(profile_key) <> ''),

  constraint matchday_live_layout_physical_carryovers_counts_check
    check (
      inherited_bank_count >= 0
      and inherited_placement_count >= 0
      and inherited_explicit_bank_count >= 0
      and inherited_memory_count >= 0
      and inherited_latest_count >= 0
      and inherited_roundup_count >= 0
      and inherited_functional_layout_item_count >= 0
    ),

  constraint matchday_live_layout_physical_carryovers_topology_key
    unique (topology_transition_id),

  constraint matchday_live_layout_physical_carryovers_source_key
    unique (source_matchday_id),

  constraint matchday_live_layout_physical_carryovers_target_key
    unique (target_matchday_id),

  constraint matchday_live_layout_physical_carryovers_context_key
    unique (id, source_matchday_id, target_matchday_id),

  constraint matchday_live_layout_physical_carryovers_target_context_key
    unique (id, target_matchday_id),

  constraint matchday_live_layout_physical_carryovers_topology_fk
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
    on delete restrict,

  constraint matchday_live_layout_physical_carryovers_composition_fk
    foreign key (source_composition_id)
    references public.matchday_reference_compositions(id)
    on delete restrict
);

create index matchday_live_layout_physical_carryovers_composition_idx
on jornada_private.matchday_live_layout_physical_carryovers(
  source_composition_id
);

alter table jornada_private.matchday_live_layout_physical_carryovers
  enable row level security;

revoke all on table
  jornada_private.matchday_live_layout_physical_carryovers
from public, anon, authenticated, service_role;

comment on table
  jornada_private.matchday_live_layout_physical_carryovers
is
  'Private certificate that every active source Bank participation and its eligible physical/editorial state was materialized once on an existing v17 target topology. It does not activate or retire either matchday.';


create table jornada_private.matchday_live_layout_physical_bank_maps (
  carryover_id uuid not null,
  source_matchday_id uuid not null,
  target_matchday_id uuid not null,
  source_bank_item_id uuid not null,
  target_bank_item_id uuid not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),

  constraint matchday_live_layout_physical_bank_maps_pkey
    primary key (carryover_id, source_bank_item_id),

  constraint matchday_live_layout_physical_bank_maps_target_key
    unique (carryover_id, target_bank_item_id),

  constraint matchday_live_layout_physical_bank_maps_source_context_key
    unique (source_matchday_id, target_matchday_id, source_bank_item_id),

  constraint matchday_live_layout_physical_bank_maps_target_context_key
    unique (source_matchday_id, target_matchday_id, target_bank_item_id),

  constraint matchday_live_layout_physical_bank_maps_identity_check
    check (source_bank_item_id <> target_bank_item_id),

  constraint matchday_live_layout_physical_bank_maps_carryover_fk
    foreign key (carryover_id, source_matchday_id, target_matchday_id)
    references jornada_private.matchday_live_layout_physical_carryovers (
      id,
      source_matchday_id,
      target_matchday_id
    )
    on delete restrict,

  constraint matchday_live_layout_physical_bank_maps_source_bank_fk
    foreign key (source_bank_item_id, source_matchday_id)
    references public.matchday_editorial_bank_items(id, matchday_id)
    on delete restrict
    deferrable initially deferred,

  constraint matchday_live_layout_physical_bank_maps_target_bank_fk
    foreign key (target_bank_item_id, target_matchday_id)
    references public.matchday_editorial_bank_items(id, matchday_id)
    on delete restrict
    deferrable initially deferred
);

create index matchday_live_layout_physical_bank_maps_source_idx
on jornada_private.matchday_live_layout_physical_bank_maps(
  source_matchday_id,
  source_bank_item_id
);

create index matchday_live_layout_physical_bank_maps_target_idx
on jornada_private.matchday_live_layout_physical_bank_maps(
  target_matchday_id,
  target_bank_item_id
);

alter table jornada_private.matchday_live_layout_physical_bank_maps
  enable row level security;

revoke all on table
  jornada_private.matchday_live_layout_physical_bank_maps
from public, anon, authenticated, service_role;

comment on table
  jornada_private.matchday_live_layout_physical_bank_maps
is
  'Complete persistent source Bank UUID to new target Bank UUID map for one physical carryover. Placements and state are remapped through this identity, never through URLs.';


-- ============================================================
-- 2. EXACT, NON-FORGEABLE CARRYOVER CONTEXT
--
-- This context has two narrow purposes while v18 is running:
--   * preserve source editorially_worked_at, including NULL/NOVA;
--   * make copied Latest and downstream compatibility rows inert with regard
--     to the ordinary publication-to-Bank synchronizer.
-- It cannot be opened by service_role and is removed before return.
-- ============================================================

create table jornada_private.matchday_live_layout_physical_carryover_context (
  backend_pid integer not null,
  transaction_id xid8 not null,
  target_matchday_id uuid not null,
  carryover_id uuid not null,
  primary key (backend_pid, transaction_id, target_matchday_id),
  constraint matchday_live_layout_physical_carryover_context_fk
    foreign key (carryover_id, target_matchday_id)
    references jornada_private.matchday_live_layout_physical_carryovers(
      id,
      target_matchday_id
    )
    on delete cascade
);

create index matchday_live_layout_physical_carryover_context_id_idx
on jornada_private.matchday_live_layout_physical_carryover_context(
  carryover_id
);

alter table jornada_private.matchday_live_layout_physical_carryover_context
  enable row level security;

revoke all on table
  jornada_private.matchday_live_layout_physical_carryover_context
from public, anon, authenticated, service_role;


create function jornada_private.is_matchday_live_layout_carryover_v18(
  p_matchday_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from jornada_private.matchday_live_layout_physical_carryover_context
      as context_row
    where context_row.backend_pid = pg_catalog.pg_backend_pid()
      and context_row.transaction_id = pg_catalog.pg_current_xact_id()
      and context_row.target_matchday_id = p_matchday_id
  );
$function$;

revoke all on function
  jornada_private.is_matchday_live_layout_carryover_v18(uuid)
from public, anon, authenticated, service_role;


create or replace function public.preserve_matchday_editorial_worked_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if jornada_private.is_matchday_live_layout_carryover_v18(new.matchday_id)
  then
    -- The private carryover copies the historical first-work instant exactly.
    -- NULL is intentionally preserved because it is the observable NOVA
    -- contract, not missing initialization.
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.editorially_worked_at is not null
  then
    new.editorially_worked_at := old.editorially_worked_at;
  elsif new.editorially_worked_at is null
    and new.continuity_source_matchday_id is not null
    and new.continuity_source_composition_id is not null
  then
    new.editorially_worked_at := pg_catalog.statement_timestamp();
  end if;

  return new;
end;
$function$;

revoke all on function public.preserve_matchday_editorial_worked_state()
from public, anon, authenticated, service_role;


create or replace function public.sync_matchday_zone_row_to_bank()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if jornada_private.is_matchday_live_layout_carryover_v18(new.matchday_id)
  then
    return new;
  end if;

  if tg_table_name = 'matchday_latest_news' then
    if tg_op = 'UPDATE'
      and (
        new.id,
        new.matchday_id,
        new.time_label,
        new.title,
        new.link_url,
        new.image_url,
        new.status,
        new.created_at,
        new.subtitle,
        new.article_id,
        new.time_label_color
      ) is not distinct from (
        old.id,
        old.matchday_id,
        old.time_label,
        old.title,
        old.link_url,
        old.image_url,
        old.status,
        old.created_at,
        old.subtitle,
        old.article_id,
        old.time_label_color
      )
    then
      return new;
    end if;

    if pg_catalog.lower(pg_catalog.btrim(coalesce(new.status, ''))) =
       'published'
    then
      perform public.sync_matchday_zone_publication_to_bank(
        new.matchday_id,
        new.link_url
      );
    end if;
  elsif tg_table_name = 'matchday_highlights' then
    if pg_catalog.lower(pg_catalog.btrim(coalesce(new.status, ''))) =
       'published'
    then
      perform public.sync_matchday_zone_publication_to_bank(
        new.matchday_id,
        new.link_url
      );
    end if;
  elsif tg_table_name = 'matchday_horizontal_news' then
    if pg_catalog.lower(pg_catalog.btrim(coalesce(new.status, ''))) =
       'published'
    then
      perform public.sync_matchday_zone_publication_to_bank(
        new.matchday_id,
        new.link_url
      );
    end if;
  elsif tg_table_name = 'matchday_editorials' then
    perform public.sync_matchday_zone_publication_to_bank(
      new.matchday_id,
      new.headline_link_url
    );

    if pg_catalog.lower(
         pg_catalog.btrim(coalesce(new.complementary_status, ''))
       ) = 'published'
    then
      perform public.sync_matchday_zone_publication_to_bank(
        new.matchday_id,
        new.complementary_link_url
      );
    end if;

    if pg_catalog.lower(
         pg_catalog.btrim(coalesce(new.side_block_status, ''))
       ) = 'published'
    then
      perform public.sync_matchday_zone_publication_to_bank(
        new.matchday_id,
        new.side_block_link_url
      );
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_matchday_zone_row_to_bank()
from public, anon, authenticated;

grant execute on function public.sync_matchday_zone_row_to_bank()
to service_role;

comment on function public.sync_matchday_zone_row_to_bank() is
  'Synchronizes ordinary publication surfaces to contextual Bank participation. Exact private v18 carryover writes are inert because Bank was already materialized from its persistent source identity map.';


-- ============================================================
-- 3. IMMUTABLE SOURCE SNAPSHOT HASH AND STRICT VALIDATOR
-- ============================================================

create function jornada_private.matchday_live_layout_carryover_source_hash_v18(
  p_matchday_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.md5(pg_catalog.jsonb_build_object(
    'zones', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(zone_row)
        order by zone_row.id)
      from public.matchday_live_layout_zones as zone_row
      where zone_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'blocks', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(block_row)
        order by block_row.id)
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'settings', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(settings_row)
        order by settings_row.matchday_id)
      from public.matchday_live_layout_workspace_settings as settings_row
      where settings_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'physical_cutover', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cutover_row)
        order by cutover_row.matchday_id)
      from jornada_private.matchday_live_layout_physical_cutovers
        as cutover_row
      where cutover_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'zone_projection', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(projection_row)
        order by projection_row.legacy_zone_key)
      from jornada_private.matchday_live_layout_zone_legacy_projection
        as projection_row
      where projection_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'assignment', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(assignment_row)
        order by assignment_row.matchday_id)
      from public.matchday_editorial_profile_assignments as assignment_row
      where assignment_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'bank', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(bank_row)
        order by bank_row.id)
      from public.matchday_editorial_bank_items as bank_row
      where bank_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'placements', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(placement_row)
        order by placement_row.id)
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'overrides', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(override_row)
        order by override_row.id)
      from public.matchday_editorial_profile_manual_overrides as override_row
      where override_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'memory', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(memory_row)
        order by memory_row.bank_item_id)
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'latest', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(latest_row)
        order by latest_row.id)
      from public.matchday_latest_news as latest_row
      where latest_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'roundup', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(roundup_row)
        order by roundup_row.id)
      from public.matchday_roundup_items as roundup_row
      where roundup_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'layout_items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(layout_row)
        order by layout_row.id)
      from public.matchday_live_layout_items as layout_row
      where layout_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'highlights', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(highlight_row)
        order by highlight_row.id)
      from public.matchday_highlights as highlight_row
      where highlight_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'horizontal', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(horizontal_row)
        order by horizontal_row.id)
      from public.matchday_horizontal_news as horizontal_row
      where horizontal_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'zone_items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(zone_item_row)
        order by zone_item_row.id)
      from public.matchday_editorial_profile_zone_items as zone_item_row
      where zone_item_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'automatic_state', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(state_row)
        order by state_row.source_type, state_row.source_id)
      from public.matchday_editorial_profile_state_items as state_row
      where state_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'desk_control', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(desk_row)
        order by desk_row.matchday_id)
      from public.matchday_editorial_desk_control as desk_row
      where desk_row.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'editorial', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(editorial_row)
        order by editorial_row.id)
      from public.matchday_editorials as editorial_row
      where editorial_row.matchday_id = p_matchday_id
    ), '[]'::jsonb)
  )::text);
$function$;

revoke all on function
  jornada_private.matchday_live_layout_carryover_source_hash_v18(uuid)
from public, anon, authenticated, service_role;


create function
jornada_private.assert_matchday_live_layout_physical_carryover_v18(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid,
  p_topology_transition_id uuid,
  p_profile_key text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null
    or p_topology_transition_id is null
    or p_profile_key is null
    or p_source_matchday_id = p_target_matchday_id
  then
    raise exception 'matchday-live-layout-carryover-v18-invalid-envelope';
  end if;

  if not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_topology_transitions
      as transition_row
    where transition_row.id = p_topology_transition_id
      and transition_row.source_matchday_id = p_source_matchday_id
      and transition_row.target_matchday_id = p_target_matchday_id
      and transition_row.profile_key = p_profile_key
  ) then
    raise exception 'matchday-live-layout-carryover-v18-topology-invalid';
  end if;

  if not exists (
    select 1
    from public.matchday_reference_compositions as composition_row
    where composition_row.id = p_source_composition_id
      and composition_row.matchday_id = p_source_matchday_id
      and composition_row.status = 'published'
      and composition_row.is_current = true
  ) then
    raise exception 'matchday-live-layout-carryover-v18-composition-invalid';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_source_matchday_id
      and desk_row.is_managed = true
  ) then
    raise exception 'matchday-live-layout-carryover-v18-source-not-live';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_target_matchday_id
      and (
        desk_row.is_managed
        or desk_row.carryover_source_composition_id is not null
        or desk_row.carryover_snapshot is not null
      )
  ) then
    raise exception 'matchday-live-layout-carryover-v18-target-desk-conflict';
  end if;

  perform
    jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
      p_source_matchday_id,
      p_profile_key
    );

  perform
    jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
      p_target_matchday_id,
      p_profile_key
    );

  perform jornada_private.assert_matchday_live_layout_downstream_v14(
    p_source_matchday_id,
    p_profile_key
  );

  if not exists (
    select 1
    from public.matchday_editorial_profile_assignments as assignment_row
    where assignment_row.matchday_id = p_target_matchday_id
      and assignment_row.profile_key = p_profile_key
  ) then
    raise exception 'matchday-live-layout-carryover-v18-target-profile-invalid';
  end if;

  -- The v17 map is complete in both directions and is the only accepted
  -- physical zone remapping mechanism.
  if (
    select pg_catalog.count(*)
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    where map_row.topology_transition_id = p_topology_transition_id
      and map_row.source_matchday_id = p_source_matchday_id
      and map_row.target_matchday_id = p_target_matchday_id
  ) <> (
    select pg_catalog.count(*)
    from public.matchday_live_layout_zones as source_zone
    where source_zone.matchday_id = p_source_matchday_id
  ) or (
    select pg_catalog.count(*)
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    where map_row.topology_transition_id = p_topology_transition_id
      and map_row.source_matchday_id = p_source_matchday_id
      and map_row.target_matchday_id = p_target_matchday_id
  ) <> (
    select pg_catalog.count(*)
    from public.matchday_live_layout_zones as target_zone
    where target_zone.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-carryover-v18-zone-map-incomplete';
  end if;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    join public.matchday_live_layout_zones as source_zone
      on source_zone.id = map_row.source_zone_id
     and source_zone.matchday_id = map_row.source_matchday_id
    join public.matchday_live_layout_zones as target_zone
      on target_zone.id = map_row.target_zone_id
     and target_zone.matchday_id = map_row.target_matchday_id
    where map_row.topology_transition_id = p_topology_transition_id
      and (
        target_zone.public_title is distinct from source_zone.public_title
        or target_zone.visual_family is distinct from source_zone.visual_family
      )
  ) then
    raise exception 'matchday-live-layout-carryover-v18-zone-map-drift';
  end if;

  if exists (
    with desired as materialized (
      select
        source_block.block_type,
        case when source_block.block_type = 'zone'
          then map_row.target_zone_id else null end as zone_id,
        source_block.sort_order
      from public.matchday_live_layout_blocks as source_block
      left join jornada_private.matchday_live_layout_physical_zone_maps
        as map_row
        on map_row.topology_transition_id = p_topology_transition_id
       and map_row.source_zone_id = source_block.zone_id
      where source_block.matchday_id = p_source_matchday_id
    ),
    current_state as materialized (
      select target_block.block_type, target_block.zone_id,
             target_block.sort_order
      from public.matchday_live_layout_blocks as target_block
      where target_block.matchday_id = p_target_matchday_id
    ),
    differences as (
      (select * from desired except select * from current_state)
      union all
      (select * from current_state except select * from desired)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-carryover-v18-block-map-drift';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_workspace_settings as source_settings
    cross join public.matchday_live_layout_workspace_settings as target_settings
    where source_settings.matchday_id = p_source_matchday_id
      and target_settings.matchday_id = p_target_matchday_id
      and row(
        source_settings.faixa_slot_count,
        source_settings.headline_title_color,
        source_settings.latest_zone_placement,
        source_settings.latest_zone_title,
        source_settings.latest_zone_mode,
        source_settings.latest_zone_title_color,
        source_settings.video_module_active
      ) is distinct from row(
        target_settings.faixa_slot_count,
        target_settings.headline_title_color,
        target_settings.latest_zone_placement,
        target_settings.latest_zone_title,
        target_settings.latest_zone_mode,
        target_settings.latest_zone_title_color,
        target_settings.video_module_active
      )
  ) then
    raise exception 'matchday-live-layout-carryover-v18-settings-drift';
  end if;

  if exists (
    with desired as materialized (
      select source_projection.legacy_zone_key, map_row.target_zone_id as zone_id
      from jornada_private.matchday_live_layout_zone_legacy_projection
        as source_projection
      join jornada_private.matchday_live_layout_physical_zone_maps as map_row
        on map_row.topology_transition_id = p_topology_transition_id
       and map_row.source_zone_id = source_projection.zone_id
      where source_projection.matchday_id = p_source_matchday_id
    ),
    current_state as materialized (
      select target_projection.legacy_zone_key, target_projection.zone_id
      from jornada_private.matchday_live_layout_zone_legacy_projection
        as target_projection
      where target_projection.matchday_id = p_target_matchday_id
    ),
    differences as (
      (select * from desired except select * from current_state)
      union all
      (select * from current_state except select * from desired)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-carryover-v18-projection-drift';
  end if;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_carryovers as row_value
    where row_value.topology_transition_id = p_topology_transition_id
       or row_value.source_matchday_id = p_source_matchday_id
       or row_value.target_matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-carryover-v18-already-materialized';
  end if;

  -- A v17 target may contain only topology, its marker/settings/assignment and
  -- the five-key compatibility map. Content and positional legacy rows are
  -- never repaired or completed by v18.
  if exists (
    select 1 from public.matchday_editorial_bank_items
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_live_layout_placements
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_live_layout_bank_item_state_memory
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_editorial_profile_manual_overrides
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_editorial_profile_state_items
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_editorial_profile_reconcile_control
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_editorial_profile_zone_items
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_editorials
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_highlights
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_horizontal_news
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_latest_news
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_roundup_items
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_live_layout_items
    where matchday_id = p_target_matchday_id
  ) or exists (
    select 1 from public.matchday_editorial_continuity_transitions
    where source_matchday_id = p_source_matchday_id
       or target_matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-carryover-v18-target-not-virgin';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
      and (
        nullif(pg_catalog.btrim(bank_row.source_type), '') is null
        or nullif(pg_catalog.btrim(bank_row.source_id), '') is null
      )
  ) or exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
    group by
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
    having pg_catalog.count(*) <> 1
  ) then
    raise exception 'matchday-live-layout-carryover-v18-source-bank-invalid';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_source_matchday_id
      and (
        pg_catalog.num_nonnulls(
          bank_row.classification_key,
          bank_row.classification_source,
          bank_row.classified_at
        ) not in (0, 3)
        or (
          bank_row.classification_key is not null
          and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) <>
              'editorial_article'
        )
      )
  ) then
    raise exception
      'matchday-live-layout-carryover-v18-source-classification-invalid';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    left join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_source_matchday_id
      and (
        bank_row.id is null
        or pg_catalog.lower(pg_catalog.btrim(bank_row.status)) <> 'active'
      )
  ) then
    raise exception 'matchday-live-layout-carryover-v18-placement-inactive';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    left join jornada_private.matchday_live_layout_physical_zone_maps as map_row
      on map_row.topology_transition_id = p_topology_transition_id
     and map_row.source_zone_id = placement_row.zone_id
    where placement_row.matchday_id = p_source_matchday_id
      and placement_row.placement_type = 'zone'
      and map_row.target_zone_id is null
  ) then
    raise exception 'matchday-live-layout-carryover-v18-placement-zone-unmapped';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as override_row
    left join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = override_row.matchday_id
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
         pg_catalog.lower(pg_catalog.btrim(override_row.source_type))
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
         pg_catalog.lower(pg_catalog.btrim(override_row.source_id))
     and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
    where override_row.matchday_id = p_source_matchday_id
      and override_row.profile_key = p_profile_key
      and override_row.placement_target = 'bank'
      and bank_row.id is null
  ) then
    raise exception 'matchday-live-layout-carryover-v18-explicit-bank-inactive';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    join public.matchday_editorial_profile_manual_overrides as override_row
      on override_row.matchday_id = bank_row.matchday_id
     and override_row.profile_key = p_profile_key
     and override_row.placement_target = 'bank'
     and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
         pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
     and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
         pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
    where bank_row.matchday_id = p_source_matchday_id
      and (
        exists (
          select 1 from public.matchday_live_layout_placements as placement_row
          where placement_row.matchday_id = bank_row.matchday_id
            and placement_row.bank_item_id = bank_row.id
        )
        or exists (
          select 1
          from public.matchday_live_layout_bank_item_state_memory as memory_row
          where memory_row.matchday_id = bank_row.matchday_id
            and memory_row.bank_item_id = bank_row.id
        )
      )
  ) then
    raise exception 'matchday-live-layout-carryover-v18-explicit-bank-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    left join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = memory_row.bank_item_id
     and bank_row.matchday_id = memory_row.matchday_id
    where memory_row.matchday_id = p_source_matchday_id
      and (
        bank_row.id is null
        or pg_catalog.lower(pg_catalog.btrim(bank_row.status)) <> 'active'
        or exists (
          select 1 from public.matchday_live_layout_placements as placement_row
          where placement_row.matchday_id = memory_row.matchday_id
            and placement_row.bank_item_id = memory_row.bank_item_id
        )
      )
  ) then
    raise exception 'matchday-live-layout-carryover-v18-memory-conflict';
  end if;

  -- A published canonical Latest row would ordinarily sync to Bank. Require
  -- its canonical identity already to be the active source participation so
  -- that the private trigger bypass cannot hide inconsistent provenance.
  if exists (
    select 1
    from public.matchday_latest_news as latest_row
    join lateral (
      select article_row.id
      from public.editorial_articles as article_row
      where article_row.slug = pg_catalog.substr(
              pg_catalog.regexp_replace(
                pg_catalog.split_part(
                  pg_catalog.split_part(
                    coalesce(pg_catalog.btrim(latest_row.link_url), ''),
                    '?', 1
                  ),
                  '#', 1
                ),
                '/$', ''
              )
              , pg_catalog.char_length('/noticias/') + 1
            )
        and article_row.status = 'published'
        and (
          article_row.matchday_id is null
          or article_row.matchday_id = p_source_matchday_id
        )
      order by
        case when article_row.matchday_id = p_source_matchday_id then 0 else 1 end,
        article_row.published_at desc nulls last,
        article_row.updated_at desc nulls last,
        article_row.id
      limit 1
    ) as canonical_row on true
    left join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = p_source_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
         'editorial_article'
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
         pg_catalog.lower(canonical_row.id::text)
     and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
    where latest_row.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(latest_row.status)) = 'published'
      and pg_catalog.regexp_replace(
            pg_catalog.split_part(
              pg_catalog.split_part(
                coalesce(pg_catalog.btrim(latest_row.link_url), ''), '?', 1
              ), '#', 1
            ), '/$', ''
          ) like '/noticias/%'
      and bank_row.id is null
  ) then
    raise exception 'matchday-live-layout-carryover-v18-latest-provenance-invalid';
  end if;

  if exists (
    select 1
    from public.matchday_latest_news as latest_row
    join lateral (
      select content_row.id
      from public.editorial_contents as content_row
      where content_row.slug = pg_catalog.substr(
              pg_catalog.regexp_replace(
                pg_catalog.split_part(
                  pg_catalog.split_part(
                    coalesce(pg_catalog.btrim(latest_row.link_url), ''),
                    '?', 1
                  ),
                  '#', 1
                ),
                '/$', ''
              ),
              pg_catalog.char_length('/conteudos/') + 1
            )
        and content_row.status = 'published'
        and (
          content_row.matchday_id is null
          or content_row.matchday_id = p_source_matchday_id
        )
      order by
        case when content_row.matchday_id = p_source_matchday_id then 0 else 1 end,
        content_row.published_at desc nulls last,
        content_row.updated_at desc nulls last,
        content_row.id
      limit 1
    ) as canonical_row on true
    left join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = p_source_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
         'editorial_content'
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
         pg_catalog.lower(canonical_row.id::text)
     and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
    where latest_row.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(latest_row.status)) = 'published'
      and pg_catalog.regexp_replace(
            pg_catalog.split_part(
              pg_catalog.split_part(
                coalesce(pg_catalog.btrim(latest_row.link_url), ''), '?', 1
              ), '#', 1
            ), '/$', ''
          ) like '/conteudos/%'
      and bank_row.id is null
  ) then
    raise exception 'matchday-live-layout-carryover-v18-latest-provenance-invalid';
  end if;

  if exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_source_matchday_id
      and editorial_row.complementary_roundup_item_id is not null
      and not exists (
        select 1
        from public.matchday_roundup_items as roundup_row
        where roundup_row.id = editorial_row.complementary_roundup_item_id
          and roundup_row.matchday_id = p_source_matchday_id
      )
  ) then
    raise exception 'matchday-live-layout-carryover-v18-roundup-reference-invalid';
  end if;
end;
$function$;

revoke all on function
  jornada_private.assert_matchday_live_layout_physical_carryover_v18(
    uuid,
    uuid,
    uuid,
    uuid,
    text
  )
from public, anon, authenticated, service_role;


-- ============================================================
-- 4. PRIVATE PHYSICAL CONTENT MATERIALIZER
-- ============================================================

create function
jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid,
  p_topology_transition_id uuid
)
returns table (
  carryover_id uuid,
  topology_transition_id uuid,
  source_matchday_id uuid,
  target_matchday_id uuid,
  source_composition_id uuid,
  inherited_bank_count integer,
  inherited_placement_count integer,
  inherited_explicit_bank_count integer,
  inherited_memory_count integer,
  inherited_latest_count integer,
  inherited_roundup_count integer,
  inherited_functional_layout_item_count integer,
  state_token text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_profile_key text;
  v_carryover_id uuid := gen_random_uuid();
  v_bank_count integer;
  v_placement_count integer;
  v_explicit_bank_count integer;
  v_memory_count integer;
  v_latest_count integer;
  v_roundup_count integer;
  v_functional_layout_item_count integer;
  v_state_token_before text;
  v_state_token_after text;
  v_source_hash_before text;
  v_source_hash_after text;
  v_source_classification_before text;
  v_source_classification_after text;
  v_target_bank_ids uuid[] := '{}'::uuid[];
  v_plan jsonb := '[]'::jsonb;
  v_roundup_map jsonb := '{}'::jsonb;
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null
    or p_topology_transition_id is null
    or p_source_matchday_id = p_target_matchday_id
  then
    raise exception 'matchday-live-layout-carryover-v18-invalid-envelope';
  end if;

  -- Existing exclusive handoff barrier. All ordinary v14/v15/v16 writers and
  -- every fenced content surface acquire the shared side of the same key.
  perform jornada_private.acquire_matchday_live_desk_handoff_lock();

  perform 1
  from public.matchdays as lock_row
  where lock_row.id in (p_source_matchday_id, p_target_matchday_id)
  order by lock_row.id
  for update;

  if (
    select pg_catalog.count(*)
    from public.matchdays as matchday_row
    where matchday_row.id in (p_source_matchday_id, p_target_matchday_id)
  ) <> 2 then
    raise exception 'matchday-live-layout-carryover-v18-matchday-not-found';
  end if;

  select transition_row.profile_key
  into v_profile_key
  from jornada_private.matchday_live_layout_physical_topology_transitions
    as transition_row
  where transition_row.id = p_topology_transition_id
    and transition_row.source_matchday_id = p_source_matchday_id
    and transition_row.target_matchday_id = p_target_matchday_id;

  if not found then
    raise exception 'matchday-live-layout-carryover-v18-topology-invalid';
  end if;

  perform
    jornada_private.assert_matchday_live_layout_physical_carryover_v18(
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id,
      p_topology_transition_id,
      v_profile_key
    );

  v_source_hash_before :=
    jornada_private.matchday_live_layout_carryover_source_hash_v18(
      p_source_matchday_id
    );

  select pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', bank_row.id,
      'classification_key', bank_row.classification_key,
      'classification_source', bank_row.classification_source,
      'classified_at', bank_row.classified_at
    ) order by bank_row.id
  ), '[]'::jsonb)::text)
  into v_source_classification_before
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_source_matchday_id;

  select workspace_row.state_token
  into v_state_token_before
  from public.read_matchday_live_layout_workspace_v13(
    p_target_matchday_id,
    v_profile_key
  ) as workspace_row;

  if v_state_token_before is null then
    raise exception 'matchday-live-layout-carryover-v18-target-token-invalid';
  end if;

  select pg_catalog.count(*)::integer
  into v_bank_count
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_source_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active';

  select pg_catalog.count(*)::integer
  into v_placement_count
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_source_matchday_id;

  select pg_catalog.count(*)::integer
  into v_explicit_bank_count
  from public.matchday_editorial_profile_manual_overrides as override_row
  where override_row.matchday_id = p_source_matchday_id
    and override_row.profile_key = v_profile_key
    and override_row.placement_target = 'bank';

  select pg_catalog.count(*)::integer
  into v_memory_count
  from public.matchday_live_layout_bank_item_state_memory as memory_row
  where memory_row.matchday_id = p_source_matchday_id;

  select pg_catalog.count(*)::integer
  into v_latest_count
  from public.matchday_latest_news as latest_row
  where latest_row.matchday_id = p_source_matchday_id;

  select pg_catalog.count(*)::integer
  into v_roundup_count
  from public.matchday_roundup_items as roundup_row
  where roundup_row.matchday_id = p_source_matchday_id;

  select pg_catalog.count(*)::integer
  into v_functional_layout_item_count
  from public.matchday_live_layout_items as layout_row
  where layout_row.matchday_id = p_source_matchday_id
    and layout_row.slot_type !~ '^live_four_news:[1-4]$';

  insert into jornada_private.matchday_live_layout_physical_carryovers (
    id,
    topology_transition_id,
    source_matchday_id,
    target_matchday_id,
    source_composition_id,
    profile_key,
    inherited_bank_count,
    inherited_placement_count,
    inherited_explicit_bank_count,
    inherited_memory_count,
    inherited_latest_count,
    inherited_roundup_count,
    inherited_functional_layout_item_count,
    state_token_before
  ) values (
    v_carryover_id,
    p_topology_transition_id,
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id,
    v_profile_key,
    v_bank_count,
    v_placement_count,
    v_explicit_bank_count,
    v_memory_count,
    v_latest_count,
    v_roundup_count,
    v_functional_layout_item_count,
    v_state_token_before
  );

  insert into
    jornada_private.matchday_live_layout_physical_carryover_context (
      backend_pid,
      transaction_id,
      target_matchday_id,
      carryover_id
    )
  values (
    pg_catalog.pg_backend_pid(),
    pg_catalog.pg_current_xact_id(),
    p_target_matchday_id,
    v_carryover_id
  );

  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    p_target_matchday_id
  );

  begin
    insert into jornada_private.matchday_live_layout_physical_bank_maps (
      carryover_id,
      source_matchday_id,
      target_matchday_id,
      source_bank_item_id,
      target_bank_item_id
    )
    select
      v_carryover_id,
      p_source_matchday_id,
      p_target_matchday_id,
      source_bank.id,
      gen_random_uuid()
    from public.matchday_editorial_bank_items as source_bank
    where source_bank.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(source_bank.status)) = 'active'
    order by source_bank.id;

    select coalesce(
      pg_catalog.array_agg(map_row.target_bank_item_id
        order by map_row.target_bank_item_id),
      '{}'::uuid[]
    )
    into v_target_bank_ids
    from jornada_private.matchday_live_layout_physical_bank_maps as map_row
    where map_row.carryover_id = v_carryover_id;

    perform
      jornada_private.authorize_matchday_editorial_bank_classification_writes(
        v_target_bank_ids
      );

    insert into public.matchday_editorial_bank_items (
      id,
      matchday_id,
      label,
      label_color,
      title,
      subtitle,
      image_url,
      link_url,
      source_type,
      source_id,
      source_slug,
      origin_slot_type,
      sort_order,
      status,
      automatic_eligible,
      continuity_source_matchday_id,
      continuity_source_composition_id,
      editorially_worked_at,
      classification_key,
      classification_source,
      classified_at,
      created_at,
      updated_at
    )
    select
      map_row.target_bank_item_id,
      p_target_matchday_id,
      source_bank.label,
      source_bank.label_color,
      source_bank.title,
      source_bank.subtitle,
      source_bank.image_url,
      source_bank.link_url,
      pg_catalog.lower(pg_catalog.btrim(source_bank.source_type)),
      pg_catalog.lower(pg_catalog.btrim(source_bank.source_id)),
      source_bank.source_slug,
      source_bank.origin_slot_type,
      source_bank.sort_order,
      'active',
      false,
      p_source_matchday_id,
      p_source_composition_id,
      source_bank.editorially_worked_at,
      source_bank.classification_key,
      case when source_bank.classification_key is null
        then null else 'continuity_assisted' end,
      case when source_bank.classification_key is null
        then null else pg_catalog.statement_timestamp() end,
      pg_catalog.statement_timestamp(),
      pg_catalog.statement_timestamp()
    from jornada_private.matchday_live_layout_physical_bank_maps as map_row
    join public.matchday_editorial_bank_items as source_bank
      on source_bank.id = map_row.source_bank_item_id
     and source_bank.matchday_id = map_row.source_matchday_id
    where map_row.carryover_id = v_carryover_id
    order by source_bank.id;

    perform
      jornada_private.revoke_matchday_editorial_bank_classification_writes(
        v_target_bank_ids
      );

    -- Only explicit Banco is an independent editorial decision here. Legacy
    -- zone/Faixa overrides are rebuilt from physical placements downstream.
    insert into public.matchday_editorial_profile_manual_overrides (
      matchday_id,
      profile_key,
      source_type,
      source_id,
      placement_target,
      zone_key,
      sort_order,
      created_at,
      updated_at
    )
    select
      p_target_matchday_id,
      v_profile_key,
      target_bank.source_type,
      target_bank.source_id,
      'bank',
      null,
      null,
      pg_catalog.statement_timestamp(),
      pg_catalog.statement_timestamp()
    from public.matchday_editorial_profile_manual_overrides as source_override
    join public.matchday_editorial_bank_items as source_bank
      on source_bank.matchday_id = source_override.matchday_id
     and pg_catalog.lower(pg_catalog.btrim(source_bank.source_type)) =
         pg_catalog.lower(pg_catalog.btrim(source_override.source_type))
     and pg_catalog.lower(pg_catalog.btrim(source_bank.source_id)) =
         pg_catalog.lower(pg_catalog.btrim(source_override.source_id))
    join jornada_private.matchday_live_layout_physical_bank_maps as map_row
      on map_row.carryover_id = v_carryover_id
     and map_row.source_bank_item_id = source_bank.id
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.id = map_row.target_bank_item_id
     and target_bank.matchday_id = map_row.target_matchday_id
    where source_override.matchday_id = p_source_matchday_id
      and source_override.profile_key = v_profile_key
      and source_override.placement_target = 'bank'
    order by source_bank.id;

    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'action', 'place',
        'bank_item_id', bank_map.target_bank_item_id,
        'placement_type', source_placement.placement_type,
        'zone_id', case when source_placement.placement_type = 'zone'
          then zone_map.target_zone_id else null end,
        'slot_position', source_placement.slot_position
      ) order by
        source_placement.placement_type,
        zone_map.target_zone_id nulls first,
        source_placement.slot_position,
        bank_map.target_bank_item_id
    ), '[]'::jsonb)
    into v_plan
    from public.matchday_live_layout_placements as source_placement
    join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
      on bank_map.carryover_id = v_carryover_id
     and bank_map.source_bank_item_id = source_placement.bank_item_id
    left join jornada_private.matchday_live_layout_physical_zone_maps
      as zone_map
      on zone_map.topology_transition_id = p_topology_transition_id
     and zone_map.source_zone_id = source_placement.zone_id
    where source_placement.matchday_id = p_source_matchday_id;

    if pg_catalog.jsonb_array_length(v_plan) > 0 then
      perform jornada_private.apply_matchday_live_layout_placement_plan(
        p_target_matchday_id,
        v_plan,
        false
      );
    end if;

    insert into public.matchday_live_layout_bank_item_state_memory (
      matchday_id,
      bank_item_id,
      memory_kind,
      recorded_at
    )
    select
      p_target_matchday_id,
      bank_map.target_bank_item_id,
      source_memory.memory_kind,
      source_memory.recorded_at
    from public.matchday_live_layout_bank_item_state_memory as source_memory
    join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
      on bank_map.carryover_id = v_carryover_id
     and bank_map.source_bank_item_id = source_memory.bank_item_id
    where source_memory.matchday_id = p_source_matchday_id
    order by bank_map.target_bank_item_id;

    insert into public.matchday_latest_news (
      id,
      matchday_id,
      time_label,
      time_label_color,
      title,
      subtitle,
      link_url,
      image_url,
      article_id,
      sort_order,
      status,
      created_at,
      updated_at
    )
    select
      gen_random_uuid(),
      p_target_matchday_id,
      source_row.time_label,
      source_row.time_label_color,
      source_row.title,
      source_row.subtitle,
      source_row.link_url,
      source_row.image_url,
      source_row.article_id,
      source_row.sort_order,
      source_row.status,
      pg_catalog.statement_timestamp(),
      pg_catalog.statement_timestamp()
    from public.matchday_latest_news as source_row
    where source_row.matchday_id = p_source_matchday_id
    order by source_row.sort_order, source_row.id;

    select coalesce(pg_catalog.jsonb_object_agg(
      source_row.id::text,
      gen_random_uuid()
    ), '{}'::jsonb)
    into v_roundup_map
    from public.matchday_roundup_items as source_row
    where source_row.matchday_id = p_source_matchday_id;

    insert into public.matchday_roundup_items (
      id,
      matchday_id,
      label,
      title,
      subtitle,
      image_url,
      video_url,
      duration,
      type,
      sort_order,
      status,
      match_id,
      youtube_video_id,
      youtube_channel_id,
      is_embeddable,
      source_candidate_id,
      created_at,
      updated_at
    )
    select
      (v_roundup_map ->> source_row.id::text)::uuid,
      p_target_matchday_id,
      source_row.label,
      source_row.title,
      source_row.subtitle,
      source_row.image_url,
      source_row.video_url,
      source_row.duration,
      source_row.type,
      source_row.sort_order,
      source_row.status,
      source_row.match_id,
      source_row.youtube_video_id,
      source_row.youtube_channel_id,
      source_row.is_embeddable,
      source_row.source_candidate_id,
      pg_catalog.statement_timestamp(),
      pg_catalog.statement_timestamp()
    from public.matchday_roundup_items as source_row
    where source_row.matchday_id = p_source_matchday_id
    order by source_row.sort_order, source_row.id;

    -- These non-selection rows are functional composition snapshots consumed
    -- by current admin/history readers. They carry no slot occupancy. The four
    -- selection rows are excluded and rebuilt exclusively from placements.
    insert into public.matchday_live_layout_items (
      id,
      matchday_id,
      slot_type,
      article_id,
      label,
      title,
      subtitle,
      image_url,
      link_url,
      source_type,
      source_id,
      created_at,
      updated_at
    )
    select
      gen_random_uuid(),
      p_target_matchday_id,
      source_row.slot_type,
      source_row.article_id,
      source_row.label,
      source_row.title,
      source_row.subtitle,
      source_row.image_url,
      source_row.link_url,
      source_row.source_type,
      source_row.source_id,
      pg_catalog.statement_timestamp(),
      pg_catalog.statement_timestamp()
    from public.matchday_live_layout_items as source_row
    where source_row.matchday_id = p_source_matchday_id
      and source_row.slot_type !~ '^live_four_news:[1-4]$'
    order by source_row.slot_type, source_row.id;

    perform
      jornada_private.project_matchday_live_layout_placements_downstream_v14(
        p_target_matchday_id,
        v_profile_key
      );

    -- Settings are projected from physical authority. Remaining fields are
    -- presentation/functional compatibility retained by the 7B contract.
    update public.matchday_editorials as target_row
    set title_color = settings_row.headline_title_color,
        latest_zone_placement = settings_row.latest_zone_placement,
        latest_zone_title = nullif(settings_row.latest_zone_title, ''),
        latest_zone_mode = settings_row.latest_zone_mode,
        latest_zone_title_color = settings_row.latest_zone_title_color,
        complementary_mode = case when settings_row.video_module_active
          then 'roundup_video' else 'none' end,
        updated_at = pg_catalog.statement_timestamp()
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = p_target_matchday_id
      and target_row.matchday_id = p_target_matchday_id;

    update public.matchday_editorials as target_row
    set below_headline_mode = source_row.below_headline_mode,
        complementary_roundup_item_id = case
          when source_row.complementary_roundup_item_id is null then null
          else (
            v_roundup_map ->> source_row.complementary_roundup_item_id::text
          )::uuid
        end,
        complementary_text_color = source_row.complementary_text_color,
        roundup_video_heading = source_row.roundup_video_heading,
        roundup_video_heading_color = source_row.roundup_video_heading_color,
        below_headline_heading = source_row.below_headline_heading,
        below_headline_heading_color = source_row.below_headline_heading_color,
        below_headline_subtitle = source_row.below_headline_subtitle,
        side_block_type = case when target_row.side_block_status = 'published'
          then source_row.side_block_type else target_row.side_block_type end,
        side_block_title_color = source_row.side_block_title_color,
        side_block_author = source_row.side_block_author,
        updated_at = pg_catalog.statement_timestamp()
    from public.matchday_editorials as source_row
    where source_row.matchday_id = p_source_matchday_id
      and target_row.matchday_id = p_target_matchday_id;

    perform jornada_private.assert_matchday_live_layout_downstream_v14(
      p_target_matchday_id,
      v_profile_key
    );

  exception when others then
    perform
      jornada_private.revoke_matchday_editorial_bank_classification_writes(
        v_target_bank_ids
      );

    delete from
      jornada_private.matchday_live_layout_physical_carryover_context
        as context_row
    where context_row.backend_pid = pg_catalog.pg_backend_pid()
      and context_row.transaction_id = pg_catalog.pg_current_xact_id()
      and context_row.target_matchday_id = p_target_matchday_id;

    perform jornada_private.end_matchday_live_layout_downstream_v14(
      p_target_matchday_id
    );
    raise;
  end;

  delete from jornada_private.matchday_live_layout_physical_carryover_context
    as context_row
  where context_row.backend_pid = pg_catalog.pg_backend_pid()
    and context_row.transaction_id = pg_catalog.pg_current_xact_id()
    and context_row.target_matchday_id = p_target_matchday_id;

  perform jornada_private.end_matchday_live_layout_downstream_v14(
    p_target_matchday_id
  );

  select workspace_row.state_token
  into v_state_token_after
  from public.read_matchday_live_layout_workspace_v13(
    p_target_matchday_id,
    v_profile_key
  ) as workspace_row;

  if v_state_token_after is null then
    raise exception 'matchday-live-layout-carryover-v18-target-token-invalid';
  end if;

  -- Complete, exact Bank/map proof. No URL lookup participates in placement
  -- or state identity after this point.
  if (
    select pg_catalog.count(*)
    from jornada_private.matchday_live_layout_physical_bank_maps as map_row
    where map_row.carryover_id = v_carryover_id
  ) <> v_bank_count or (
    select pg_catalog.count(*)
    from public.matchday_editorial_bank_items as target_bank
    where target_bank.matchday_id = p_target_matchday_id
  ) <> v_bank_count or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_bank_maps as map_row
    join public.matchday_editorial_bank_items as source_bank
      on source_bank.id = map_row.source_bank_item_id
     and source_bank.matchday_id = map_row.source_matchday_id
    left join public.matchday_editorial_bank_items as target_bank
      on target_bank.id = map_row.target_bank_item_id
     and target_bank.matchday_id = map_row.target_matchday_id
    where map_row.carryover_id = v_carryover_id
      and (
        target_bank.id is null
        or target_bank.id = source_bank.id
        or pg_catalog.lower(pg_catalog.btrim(target_bank.source_type))
            is distinct from
           pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
        or pg_catalog.lower(pg_catalog.btrim(target_bank.source_id))
            is distinct from
           pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
        or target_bank.label is distinct from source_bank.label
        or target_bank.label_color is distinct from source_bank.label_color
        or target_bank.title is distinct from source_bank.title
        or target_bank.subtitle is distinct from source_bank.subtitle
        or target_bank.image_url is distinct from source_bank.image_url
        or target_bank.link_url is distinct from source_bank.link_url
        or target_bank.source_slug is distinct from source_bank.source_slug
        or target_bank.origin_slot_type is distinct from source_bank.origin_slot_type
        or target_bank.sort_order is distinct from source_bank.sort_order
        or target_bank.status <> 'active'
        or target_bank.automatic_eligible
        or target_bank.continuity_source_matchday_id is distinct from
            p_source_matchday_id
        or target_bank.continuity_source_composition_id is distinct from
            p_source_composition_id
        or target_bank.editorially_worked_at is distinct from
            source_bank.editorially_worked_at
        or target_bank.classification_key is distinct from
            source_bank.classification_key
        or target_bank.classification_source is distinct from case
             when source_bank.classification_key is null then null
             else 'continuity_assisted' end
        or (source_bank.classification_key is null and
            target_bank.classified_at is not null)
        or (source_bank.classification_key is not null and
            target_bank.classified_at is null)
      )
  ) then
    raise exception 'matchday-live-layout-carryover-v18-bank-incomplete';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as source_bank
    where source_bank.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(source_bank.status)) <> 'active'
      and exists (
        select 1
        from public.matchday_editorial_bank_items as target_bank
        where target_bank.matchday_id = p_target_matchday_id
          and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
              pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
          and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
              pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
      )
  ) then
    raise exception 'matchday-live-layout-carryover-v18-archived-carried';
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchday_live_layout_placements as target_placement
    where target_placement.matchday_id = p_target_matchday_id
  ) <> v_placement_count or exists (
    with desired as materialized (
      select
        bank_map.target_bank_item_id as bank_item_id,
        source_placement.placement_type,
        case when source_placement.placement_type = 'zone'
          then zone_map.target_zone_id else null end as zone_id,
        source_placement.slot_position
      from public.matchday_live_layout_placements as source_placement
      join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
        on bank_map.carryover_id = v_carryover_id
       and bank_map.source_bank_item_id = source_placement.bank_item_id
      left join jornada_private.matchday_live_layout_physical_zone_maps
        as zone_map
        on zone_map.topology_transition_id = p_topology_transition_id
       and zone_map.source_zone_id = source_placement.zone_id
      where source_placement.matchday_id = p_source_matchday_id
    ),
    current_state as materialized (
      select target_placement.bank_item_id,
             target_placement.placement_type,
             target_placement.zone_id,
             target_placement.slot_position
      from public.matchday_live_layout_placements as target_placement
      where target_placement.matchday_id = p_target_matchday_id
    ),
    differences as (
      (select * from desired except select * from current_state)
      union all
      (select * from current_state except select * from desired)
    )
    select 1 from differences
  ) or exists (
    select 1
    from public.matchday_live_layout_placements as source_placement
    join public.matchday_live_layout_placements as target_placement
      on target_placement.id = source_placement.id
    where source_placement.matchday_id = p_source_matchday_id
      and target_placement.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-carryover-v18-placement-incomplete';
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchday_editorial_profile_manual_overrides as override_row
    where override_row.matchday_id = p_target_matchday_id
      and override_row.profile_key = v_profile_key
      and override_row.placement_target = 'bank'
  ) <> v_explicit_bank_count or (
    select pg_catalog.count(*)
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id = p_target_matchday_id
  ) <> v_memory_count then
    raise exception 'matchday-live-layout-carryover-v18-state-incomplete';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as source_override
    join public.matchday_editorial_bank_items as source_bank
      on source_bank.matchday_id = source_override.matchday_id
     and pg_catalog.lower(pg_catalog.btrim(source_bank.source_type)) =
         pg_catalog.lower(pg_catalog.btrim(source_override.source_type))
     and pg_catalog.lower(pg_catalog.btrim(source_bank.source_id)) =
         pg_catalog.lower(pg_catalog.btrim(source_override.source_id))
    join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
      on bank_map.carryover_id = v_carryover_id
     and bank_map.source_bank_item_id = source_bank.id
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.id = bank_map.target_bank_item_id
    left join public.matchday_editorial_profile_manual_overrides
      as target_override
      on target_override.matchday_id = p_target_matchday_id
     and target_override.profile_key = v_profile_key
     and target_override.source_type = target_bank.source_type
     and target_override.source_id = target_bank.source_id
     and target_override.placement_target = 'bank'
    where source_override.matchday_id = p_source_matchday_id
      and source_override.profile_key = v_profile_key
      and source_override.placement_target = 'bank'
      and target_override.id is null
  ) then
    raise exception 'matchday-live-layout-carryover-v18-explicit-bank-incomplete';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as source_memory
    join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
      on bank_map.carryover_id = v_carryover_id
     and bank_map.source_bank_item_id = source_memory.bank_item_id
    left join public.matchday_live_layout_bank_item_state_memory as target_memory
      on target_memory.matchday_id = p_target_matchday_id
     and target_memory.bank_item_id = bank_map.target_bank_item_id
    where source_memory.matchday_id = p_source_matchday_id
      and (
        target_memory.bank_item_id is null
        or target_memory.memory_kind is distinct from source_memory.memory_kind
        or target_memory.recorded_at is distinct from source_memory.recorded_at
      )
  ) then
    raise exception 'matchday-live-layout-carryover-v18-memory-incomplete';
  end if;

  if exists (
    with source_rows as materialized (
      select time_label, time_label_color, title, subtitle, link_url, image_url,
             article_id, sort_order, status
      from public.matchday_latest_news
      where matchday_id = p_source_matchday_id
    ),
    target_rows as materialized (
      select time_label, time_label_color, title, subtitle, link_url, image_url,
             article_id, sort_order, status
      from public.matchday_latest_news
      where matchday_id = p_target_matchday_id
    ),
    differences as (
      (select * from source_rows except all select * from target_rows)
      union all
      (select * from target_rows except all select * from source_rows)
    )
    select 1 from differences
  ) or exists (
    with source_rows as materialized (
      select label, title, subtitle, image_url, video_url, duration, type,
             sort_order, status, match_id, youtube_video_id,
             youtube_channel_id, is_embeddable, source_candidate_id
      from public.matchday_roundup_items
      where matchday_id = p_source_matchday_id
    ),
    target_rows as materialized (
      select label, title, subtitle, image_url, video_url, duration, type,
             sort_order, status, match_id, youtube_video_id,
             youtube_channel_id, is_embeddable, source_candidate_id
      from public.matchday_roundup_items
      where matchday_id = p_target_matchday_id
    ),
    differences as (
      (select * from source_rows except all select * from target_rows)
      union all
      (select * from target_rows except all select * from source_rows)
    )
    select 1 from differences
  ) or exists (
    with source_rows as materialized (
      select slot_type, article_id, label, title, subtitle, image_url,
             link_url, source_type, source_id
      from public.matchday_live_layout_items
      where matchday_id = p_source_matchday_id
        and slot_type !~ '^live_four_news:[1-4]$'
    ),
    target_rows as materialized (
      select slot_type, article_id, label, title, subtitle, image_url,
             link_url, source_type, source_id
      from public.matchday_live_layout_items
      where matchday_id = p_target_matchday_id
        and slot_type !~ '^live_four_news:[1-4]$'
    ),
    differences as (
      (select * from source_rows except all select * from target_rows)
      union all
      (select * from target_rows except all select * from source_rows)
    )
    select 1 from differences
  ) or exists (
    select 1
    from public.matchday_latest_news as source_row
    join public.matchday_latest_news as target_row
      on target_row.id = source_row.id
    where source_row.matchday_id = p_source_matchday_id
      and target_row.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_roundup_items as source_row
    join public.matchday_roundup_items as target_row
      on target_row.id = source_row.id
    where source_row.matchday_id = p_source_matchday_id
      and target_row.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_items as source_row
    join public.matchday_live_layout_items as target_row
      on target_row.id = source_row.id
    where source_row.matchday_id = p_source_matchday_id
      and target_row.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-carryover-v18-functional-incomplete';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_state_items as state_row
    where state_row.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-carryover-v18-state-items-created';
  end if;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_placement_shadow_sync_queue
      as queue_row
    where queue_row.backend_pid = pg_catalog.pg_backend_pid()
      and queue_row.transaction_id = pg_catalog.pg_current_xact_id()
      and queue_row.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-carryover-v18-reverse-sync-enqueued';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as source_desk
    where source_desk.matchday_id = p_source_matchday_id
      and source_desk.is_managed
  ) or exists (
    select 1
    from public.matchday_editorial_desk_control as target_desk
    where target_desk.matchday_id = p_target_matchday_id
      and target_desk.is_managed
  ) then
    raise exception 'matchday-live-layout-carryover-v18-lifecycle-changed';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', bank_row.id,
      'classification_key', bank_row.classification_key,
      'classification_source', bank_row.classification_source,
      'classified_at', bank_row.classified_at
    ) order by bank_row.id
  ), '[]'::jsonb)::text)
  into v_source_classification_after
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_source_matchday_id;

  v_source_hash_after :=
    jornada_private.matchday_live_layout_carryover_source_hash_v18(
      p_source_matchday_id
    );

  if v_source_hash_after is distinct from v_source_hash_before
    or v_source_classification_after is distinct from
       v_source_classification_before
  then
    raise exception 'matchday-live-layout-carryover-v18-source-changed';
  end if;

  if v_bank_count > 0
    and v_state_token_after is not distinct from v_state_token_before
  then
    raise exception 'matchday-live-layout-carryover-v18-token-unchanged';
  end if;

  update jornada_private.matchday_live_layout_physical_carryovers
  set state_token_after = v_state_token_after
  where id = v_carryover_id;

  return query
  select
    v_carryover_id,
    p_topology_transition_id,
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id,
    v_bank_count,
    v_placement_count,
    v_explicit_bank_count,
    v_memory_count,
    v_latest_count,
    v_roundup_count,
    v_functional_layout_item_count,
    v_state_token_after;
end;
$function$;

revoke all on function
  jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
    uuid,
    uuid,
    uuid,
    uuid
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
    uuid,
    uuid,
    uuid,
    uuid
  )
is
  'Private physical content carryover over a completed v17 topology. Copies every active Bank participation, exact physical placement/state, Latest, roundup and functional non-selection snapshots atomically; never activates target, retires source, chooses fallback topology or remaps zones through legacy keys.';


-- ============================================================
-- 5. LEAST-PRIVILEGE POSTCONDITIONS
-- ============================================================

do $postconditions$
begin
  if pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.materialize_matchday_live_layout_physical_carryover_v18(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'jornada_private.materialize_matchday_live_layout_physical_carryover_v18(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'jornada_private.materialize_matchday_live_layout_physical_carryover_v18(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'matchday-live-layout-carryover-v18-private-execute-invalid';
  end if;

  if pg_catalog.has_table_privilege(
    'service_role',
    'jornada_private.matchday_live_layout_physical_carryovers',
    'SELECT'
  ) or pg_catalog.has_table_privilege(
    'service_role',
    'jornada_private.matchday_live_layout_physical_bank_maps',
    'SELECT'
  ) or pg_catalog.has_table_privilege(
    'service_role',
    'jornada_private.matchday_live_layout_physical_carryover_context',
    'SELECT'
  ) then
    raise exception 'matchday-live-layout-carryover-v18-private-read-invalid';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
