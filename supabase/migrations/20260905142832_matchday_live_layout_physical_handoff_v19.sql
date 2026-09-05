begin;

-- LOTE 5 / v19
-- Dispatches continuity before materialization. A coherent physical source
-- uses only v17 + v18 and a non-destructive physical retirement. A genuinely
-- legacy source keeps the frozen v6 path. No physical failure falls back.

-- ============================================================
-- 1. FINAL, PRIVATE PHYSICAL HANDOFF CERTIFICATE
-- ============================================================

create table jornada_private.matchday_live_layout_physical_handoffs (
  id uuid primary key default gen_random_uuid(),
  topology_transition_id uuid not null,
  carryover_id uuid not null,
  source_matchday_id uuid not null,
  target_matchday_id uuid not null,
  source_composition_id uuid not null,
  profile_key text not null,
  source_archive_hash text not null,
  target_state_token text not null,
  completed_at timestamptz not null
    default pg_catalog.statement_timestamp(),

  constraint matchday_live_layout_physical_handoffs_pair_check
    check (source_matchday_id <> target_matchday_id),

  constraint matchday_live_layout_physical_handoffs_profile_check
    check (pg_catalog.btrim(profile_key) <> ''),

  constraint matchday_live_layout_physical_handoffs_topology_key
    unique (topology_transition_id),

  constraint matchday_live_layout_physical_handoffs_carryover_key
    unique (carryover_id),

  constraint matchday_live_layout_physical_handoffs_source_key
    unique (source_matchday_id),

  constraint matchday_live_layout_physical_handoffs_target_key
    unique (target_matchday_id),

  constraint matchday_live_layout_physical_handoffs_context_key
    unique (id, source_matchday_id, target_matchday_id),

  constraint matchday_live_layout_physical_handoffs_topology_fk
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

  constraint matchday_live_layout_physical_handoffs_carryover_fk
    foreign key (
      carryover_id,
      source_matchday_id,
      target_matchday_id
    )
    references jornada_private.matchday_live_layout_physical_carryovers (
      id,
      source_matchday_id,
      target_matchday_id
    )
    on delete restrict,

  constraint matchday_live_layout_physical_handoffs_composition_fk
    foreign key (source_composition_id)
    references public.matchday_reference_compositions(id)
    on delete restrict
);

create index matchday_live_layout_physical_handoffs_composition_idx
on jornada_private.matchday_live_layout_physical_handoffs(
  source_composition_id
);

alter table jornada_private.matchday_live_layout_physical_handoffs
  enable row level security;

revoke all on table
  jornada_private.matchday_live_layout_physical_handoffs
from public, anon, authenticated, service_role;

comment on table jornada_private.matchday_live_layout_physical_handoffs is
  'Private final certificate that v17 topology, v18 carryover, target activation and non-destructive source retirement completed atomically. Rows exist only for complete physical handoffs.';


-- ============================================================
-- 2. EXPLICIT SOURCE AUTHORITY DISPATCH
-- ============================================================

create function
jornada_private.matchday_live_layout_continuity_authority_v19(
  p_source_matchday_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_profile_key text;
begin
  if p_source_matchday_id is null then
    raise exception 'matchday-live-layout-handoff-v19-source-required';
  end if;

  select marker_row.profile_key
  into v_profile_key
  from jornada_private.matchday_live_layout_physical_cutovers as marker_row
  where marker_row.matchday_id = p_source_matchday_id;

  if found then
    -- Marker presence chooses physical before validation. A broken physical
    -- source raises here and can never be retried through legacy v6.
    perform
      jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
        p_source_matchday_id,
        v_profile_key
      );

    return 'physical';
  end if;

  -- Zones/blocks/projection alone are the legitimate pre-cutover shadow.
  -- Settings, physical certificates, or an unprojected zone are evidence of
  -- partial physical authority and therefore fail closed without fallback.
  if exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = p_source_matchday_id
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_topology_transitions
      as topology_row
    where topology_row.source_matchday_id = p_source_matchday_id
       or topology_row.target_matchday_id = p_source_matchday_id
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_carryovers
      as carryover_row
    where carryover_row.source_matchday_id = p_source_matchday_id
       or carryover_row.target_matchday_id = p_source_matchday_id
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_handoffs
      as handoff_row
    where handoff_row.source_matchday_id = p_source_matchday_id
       or handoff_row.target_matchday_id = p_source_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = p_source_matchday_id
      and not exists (
        select 1
        from jornada_private.matchday_live_layout_zone_legacy_projection
          as projection_row
        where projection_row.matchday_id = zone_row.matchday_id
          and projection_row.zone_id = zone_row.id
      )
  ) then
    raise exception
      'matchday-live-layout-handoff-v19-source-physical-incoherent';
  end if;

  return 'legacy';
end;
$function$;

revoke all on function
  jornada_private.matchday_live_layout_continuity_authority_v19(uuid)
from public, anon, authenticated, service_role;

comment on function
  jornada_private.matchday_live_layout_continuity_authority_v19(uuid)
is
  'Single marker-aware dispatcher: coherent cutover sources are physical; genuine pre-cutover shadow sources are legacy; partial physical evidence raises and never falls back.';


-- Source preservation excludes desk-control deliberately: physical retirement
-- changes only its operational ownership fields. Every physical/content row is
-- otherwise hashed before and after retirement and stored in the certificate.
create function
jornada_private.matchday_live_layout_physical_archive_hash_v19(
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
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_live_layout_zones as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'blocks', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_live_layout_blocks as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'settings', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.matchday_id)
      from public.matchday_live_layout_workspace_settings as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'cutover', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.matchday_id)
      from jornada_private.matchday_live_layout_physical_cutovers as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'projection', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.zone_id)
      from jornada_private.matchday_live_layout_zone_legacy_projection
        as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'assignment', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.matchday_id)
      from public.matchday_editorial_profile_assignments as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'bank', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_editorial_bank_items as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'placements', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_live_layout_placements as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'overrides', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_editorial_profile_manual_overrides as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'memory', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.bank_item_id)
      from public.matchday_live_layout_bank_item_state_memory as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'latest', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_latest_news as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'roundup', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_roundup_items as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'layout_items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_live_layout_items as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'editorials', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_editorials as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'highlights', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_highlights as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'horizontal', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_horizontal_news as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'zone_items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_editorial_profile_zone_items as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb),
    'state_items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.source_type, row_value.source_id)
      from public.matchday_editorial_profile_state_items as row_value
      where row_value.matchday_id = p_matchday_id
    ), '[]'::jsonb)
  )::text);
$function$;

revoke all on function
  jornada_private.matchday_live_layout_physical_archive_hash_v19(uuid)
from public, anon, authenticated, service_role;


-- ============================================================
-- 3. POST-CARRYOVER PHYSICAL CERTIFICATE VALIDATOR
-- ============================================================

create function
jornada_private.assert_matchday_live_layout_physical_handoff_ready_v19(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid,
  p_topology_transition_id uuid,
  p_carryover_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_profile_key text;
  v_carryover
    jornada_private.matchday_live_layout_physical_carryovers%rowtype;
  v_target_state_token text;
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null
    or p_topology_transition_id is null
    or p_carryover_id is null
    or p_source_matchday_id = p_target_matchday_id
  then
    raise exception 'matchday-live-layout-handoff-v19-invalid-envelope';
  end if;

  select topology_row.profile_key
  into v_profile_key
  from jornada_private.matchday_live_layout_physical_topology_transitions
    as topology_row
  where topology_row.id = p_topology_transition_id
    and topology_row.source_matchday_id = p_source_matchday_id
    and topology_row.target_matchday_id = p_target_matchday_id;

  if not found then
    raise exception 'matchday-live-layout-handoff-v19-topology-invalid';
  end if;

  select carryover_row.*
  into v_carryover
  from jornada_private.matchday_live_layout_physical_carryovers
    as carryover_row
  where carryover_row.id = p_carryover_id
    and carryover_row.topology_transition_id = p_topology_transition_id
    and carryover_row.source_matchday_id = p_source_matchday_id
    and carryover_row.target_matchday_id = p_target_matchday_id
    and carryover_row.source_composition_id = p_source_composition_id
    and carryover_row.profile_key = v_profile_key
    and carryover_row.state_token_after is not null;

  if not found then
    raise exception 'matchday-live-layout-handoff-v19-carryover-invalid';
  end if;

  if not exists (
    select 1
    from public.matchday_reference_compositions as composition_row
    where composition_row.id = p_source_composition_id
      and composition_row.matchday_id = p_source_matchday_id
      and composition_row.status = 'published'
  ) then
    raise exception 'matchday-live-layout-handoff-v19-composition-invalid';
  end if;

  perform
    jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
      p_source_matchday_id,
      v_profile_key
    );

  perform
    jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
      p_target_matchday_id,
      v_profile_key
    );

  -- Compatibility is validated only as downstream output. It never
  -- participates in topology identity, zone mapping or retirement proof.
  perform jornada_private.assert_matchday_live_layout_downstream_v14(
    p_source_matchday_id,
    v_profile_key
  );

  perform jornada_private.assert_matchday_live_layout_downstream_v14(
    p_target_matchday_id,
    v_profile_key
  );

  if (
    select pg_catalog.count(*)
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    where map_row.topology_transition_id = p_topology_transition_id
      and map_row.source_matchday_id = p_source_matchday_id
      and map_row.target_matchday_id = p_target_matchday_id
  ) <> (
    select pg_catalog.count(*)
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = p_source_matchday_id
  ) or (
    select pg_catalog.count(*)
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    where map_row.topology_transition_id = p_topology_transition_id
  ) <> (
    select pg_catalog.count(*)
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-handoff-v19-zone-map-incomplete';
  end if;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    join public.matchday_live_layout_zones as source_zone
      on source_zone.id = map_row.source_zone_id
     and source_zone.matchday_id = p_source_matchday_id
    join public.matchday_live_layout_zones as target_zone
      on target_zone.id = map_row.target_zone_id
     and target_zone.matchday_id = p_target_matchday_id
    where map_row.topology_transition_id = p_topology_transition_id
      and (
        target_zone.public_title is distinct from source_zone.public_title
        or target_zone.visual_family is distinct from source_zone.visual_family
      )
  ) or exists (
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
    actual as materialized (
      select block_type, zone_id, sort_order
      from public.matchday_live_layout_blocks
      where matchday_id = p_target_matchday_id
    ),
    differences as (
      (select * from desired except all select * from actual)
      union all
      (select * from actual except all select * from desired)
    )
    select 1 from differences
  ) or exists (
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
    raise exception 'matchday-live-layout-handoff-v19-topology-drift';
  end if;

  if (
    select pg_catalog.count(*)
    from jornada_private.matchday_live_layout_physical_bank_maps as map_row
    where map_row.carryover_id = p_carryover_id
      and map_row.source_matchday_id = p_source_matchday_id
      and map_row.target_matchday_id = p_target_matchday_id
  ) <> v_carryover.inherited_bank_count or (
    select pg_catalog.count(*)
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
  ) <> v_carryover.inherited_bank_count or (
    select pg_catalog.count(*)
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_target_matchday_id
  ) <> v_carryover.inherited_bank_count or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_bank_maps as map_row
    join public.matchday_editorial_bank_items as source_bank
      on source_bank.id = map_row.source_bank_item_id
     and source_bank.matchday_id = p_source_matchday_id
    left join public.matchday_editorial_bank_items as target_bank
      on target_bank.id = map_row.target_bank_item_id
     and target_bank.matchday_id = p_target_matchday_id
    where map_row.carryover_id = p_carryover_id
      and (
        target_bank.id is null
        or target_bank.id = source_bank.id
        or pg_catalog.lower(pg_catalog.btrim(target_bank.source_type))
             is distinct from
           pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
        or pg_catalog.lower(pg_catalog.btrim(target_bank.source_id))
             is distinct from
           pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
        or target_bank.status <> 'active'
        or pg_catalog.lower(pg_catalog.btrim(source_bank.status)) <> 'active'
        or target_bank.automatic_eligible
        or target_bank.label is distinct from source_bank.label
        or target_bank.label_color is distinct from source_bank.label_color
        or target_bank.title is distinct from source_bank.title
        or target_bank.subtitle is distinct from source_bank.subtitle
        or target_bank.image_url is distinct from source_bank.image_url
        or target_bank.link_url is distinct from source_bank.link_url
        or target_bank.source_slug is distinct from source_bank.source_slug
        or target_bank.origin_slot_type is distinct from
            source_bank.origin_slot_type
        or target_bank.sort_order is distinct from source_bank.sort_order
        or target_bank.editorially_worked_at is distinct from
            source_bank.editorially_worked_at
        or target_bank.classification_key is distinct from
            source_bank.classification_key
        or target_bank.classification_source is distinct from case
             when source_bank.classification_key is null then null
             else 'continuity_assisted' end
        or target_bank.continuity_source_matchday_id is distinct from
            p_source_matchday_id
        or target_bank.continuity_source_composition_id is distinct from
            p_source_composition_id
      )
  ) then
    raise exception 'matchday-live-layout-handoff-v19-bank-drift';
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
    raise exception 'matchday-live-layout-handoff-v19-archived-carried';
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_target_matchday_id
  ) <> v_carryover.inherited_placement_count or (
    select pg_catalog.count(*)
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_source_matchday_id
  ) <> v_carryover.inherited_placement_count or exists (
    with desired as materialized (
      select
        bank_map.target_bank_item_id as bank_item_id,
        source_placement.placement_type,
        case when source_placement.placement_type = 'zone'
          then zone_map.target_zone_id else null end as zone_id,
        source_placement.slot_position
      from public.matchday_live_layout_placements as source_placement
      join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
        on bank_map.carryover_id = p_carryover_id
       and bank_map.source_bank_item_id = source_placement.bank_item_id
      left join jornada_private.matchday_live_layout_physical_zone_maps
        as zone_map
        on zone_map.topology_transition_id = p_topology_transition_id
       and zone_map.source_zone_id = source_placement.zone_id
      where source_placement.matchday_id = p_source_matchday_id
    ),
    actual as materialized (
      select bank_item_id, placement_type, zone_id, slot_position
      from public.matchday_live_layout_placements
      where matchday_id = p_target_matchday_id
    ),
    differences as (
      (select * from desired except all select * from actual)
      union all
      (select * from actual except all select * from desired)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-handoff-v19-placement-drift';
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchday_editorial_profile_manual_overrides as override_row
    where override_row.matchday_id = p_target_matchday_id
      and override_row.profile_key = v_profile_key
      and override_row.placement_target = 'bank'
  ) <> v_carryover.inherited_explicit_bank_count or (
    select pg_catalog.count(*)
    from public.matchday_editorial_profile_manual_overrides as override_row
    where override_row.matchday_id = p_source_matchday_id
      and override_row.profile_key = v_profile_key
      and override_row.placement_target = 'bank'
  ) <> v_carryover.inherited_explicit_bank_count or exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as source_override
    join public.matchday_editorial_bank_items as source_bank
      on source_bank.matchday_id = p_source_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(source_bank.source_type)) =
         pg_catalog.lower(pg_catalog.btrim(source_override.source_type))
     and pg_catalog.lower(pg_catalog.btrim(source_bank.source_id)) =
         pg_catalog.lower(pg_catalog.btrim(source_override.source_id))
    join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
      on bank_map.carryover_id = p_carryover_id
     and bank_map.source_bank_item_id = source_bank.id
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.id = bank_map.target_bank_item_id
    left join public.matchday_editorial_profile_manual_overrides
      as target_override
      on target_override.matchday_id = p_target_matchday_id
     and target_override.profile_key = v_profile_key
     and pg_catalog.lower(pg_catalog.btrim(target_override.source_type)) =
         pg_catalog.lower(pg_catalog.btrim(target_bank.source_type))
     and pg_catalog.lower(pg_catalog.btrim(target_override.source_id)) =
         pg_catalog.lower(pg_catalog.btrim(target_bank.source_id))
     and target_override.placement_target = 'bank'
    where source_override.matchday_id = p_source_matchday_id
      and source_override.profile_key = v_profile_key
      and source_override.placement_target = 'bank'
      and target_override.id is null
  ) or (
    select pg_catalog.count(*)
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id = p_target_matchday_id
  ) <> v_carryover.inherited_memory_count or (
    select pg_catalog.count(*)
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id = p_source_matchday_id
  ) <> v_carryover.inherited_memory_count or exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as source_memory
    join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
      on bank_map.carryover_id = p_carryover_id
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
    raise exception 'matchday-live-layout-handoff-v19-editorial-state-drift';
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchday_latest_news as latest_row
    where latest_row.matchday_id = p_target_matchday_id
  ) <> v_carryover.inherited_latest_count or exists (
    with source_rows as materialized (
      select time_label, time_label_color, title, subtitle, link_url,
             image_url, article_id, sort_order, status
      from public.matchday_latest_news
      where matchday_id = p_source_matchday_id
    ),
    target_rows as materialized (
      select time_label, time_label_color, title, subtitle, link_url,
             image_url, article_id, sort_order, status
      from public.matchday_latest_news
      where matchday_id = p_target_matchday_id
    ),
    differences as (
      (select * from source_rows except all select * from target_rows)
      union all
      (select * from target_rows except all select * from source_rows)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-handoff-v19-latest-drift';
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchday_roundup_items as roundup_row
    where roundup_row.matchday_id = p_target_matchday_id
  ) <> v_carryover.inherited_roundup_count or exists (
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
  ) then
    raise exception 'matchday-live-layout-handoff-v19-roundup-drift';
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchday_live_layout_items as layout_row
    where layout_row.matchday_id = p_target_matchday_id
      and layout_row.slot_type !~ '^live_four_news:[1-4]$'
  ) <> v_carryover.inherited_functional_layout_item_count or exists (
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
  ) then
    raise exception 'matchday-live-layout-handoff-v19-functional-drift';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_state_items as state_row
    where state_row.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-handoff-v19-state-items-created';
  end if;

  select workspace_row.state_token
  into v_target_state_token
  from public.read_matchday_live_layout_workspace_v13(
    p_target_matchday_id,
    v_profile_key
  ) as workspace_row;

  if v_target_state_token is distinct from v_carryover.state_token_after then
    raise exception 'matchday-live-layout-handoff-v19-target-token-drift';
  end if;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_placement_shadow_sync_queue
      as queue_row
    where queue_row.backend_pid = pg_catalog.pg_backend_pid()
      and queue_row.transaction_id = pg_catalog.pg_current_xact_id()
      and queue_row.matchday_id in (
        p_source_matchday_id,
        p_target_matchday_id
      )
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_downstream_context
      as context_row
    where context_row.backend_pid = pg_catalog.pg_backend_pid()
      and context_row.transaction_id = pg_catalog.pg_current_xact_id()
      and context_row.matchday_id in (
        p_source_matchday_id,
        p_target_matchday_id
      )
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_carryover_context
      as context_row
    where context_row.backend_pid = pg_catalog.pg_backend_pid()
      and context_row.transaction_id = pg_catalog.pg_current_xact_id()
      and context_row.target_matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from jornada_private.matchday_editorial_bank_classification_authorizations
      as authorization_row
    where authorization_row.backend_pid = pg_catalog.pg_backend_pid()
      and authorization_row.transaction_id = pg_catalog.pg_current_xact_id()
      and authorization_row.bank_item_id in (
        select bank_row.id
        from public.matchday_editorial_bank_items as bank_row
        where bank_row.matchday_id = p_target_matchday_id
      )
  ) then
    raise exception 'matchday-live-layout-handoff-v19-context-leaked';
  end if;
end;
$function$;

revoke all on function
  jornada_private.assert_matchday_live_layout_physical_handoff_ready_v19(
    uuid, uuid, uuid, uuid, uuid
  )
from public, anon, authenticated, service_role;


-- ============================================================
-- 4. NON-DESTRUCTIVE PHYSICAL OWNERSHIP SWITCH
-- ============================================================

create function
jornada_private.retire_matchday_live_layout_physical_source_v19(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid,
  p_topology_transition_id uuid,
  p_carryover_id uuid,
  p_source_archive_hash text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform
    jornada_private.assert_matchday_live_layout_physical_handoff_ready_v19(
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id,
      p_topology_transition_id,
      p_carryover_id
    );

  if p_source_archive_hash is null
    or jornada_private.matchday_live_layout_physical_archive_hash_v19(
         p_source_matchday_id
       ) is distinct from p_source_archive_hash
  then
    raise exception 'matchday-live-layout-handoff-v19-source-archive-drift';
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
      and (
        target_desk.is_managed
        or target_desk.carryover_source_composition_id is not null
        or target_desk.carryover_snapshot is not null
      )
  ) then
    raise exception 'matchday-live-layout-handoff-v19-desk-precondition';
  end if;

  -- The partial unique index permits only one live matchday per season. The
  -- ownership writes therefore occur in this order, after all target proofs.
  -- The exclusive transaction barrier makes the internal both-off instant
  -- unobservable and rollback restores the source on any later failure.
  update public.matchday_editorial_desk_control as source_desk
  set is_managed = false,
      carryover_source_composition_id = null,
      carryover_snapshot = null,
      updated_at = pg_catalog.statement_timestamp()
  where source_desk.matchday_id = p_source_matchday_id
    and source_desk.is_managed;

  if not found then
    raise exception 'matchday-live-layout-handoff-v19-source-switch-failed';
  end if;

  insert into public.matchday_editorial_desk_control (
    matchday_id,
    is_managed,
    carryover_source_composition_id,
    carryover_snapshot,
    updated_at
  ) values (
    p_target_matchday_id,
    true,
    null,
    null,
    pg_catalog.statement_timestamp()
  )
  on conflict (matchday_id) do update
  set is_managed = true,
      carryover_source_composition_id = null,
      carryover_snapshot = null,
      updated_at = excluded.updated_at
  where not public.matchday_editorial_desk_control.is_managed
    and public.matchday_editorial_desk_control
          .carryover_source_composition_id is null
    and public.matchday_editorial_desk_control.carryover_snapshot is null;

  if not found then
    raise exception 'matchday-live-layout-handoff-v19-target-switch-failed';
  end if;

  if jornada_private.matchday_live_layout_physical_archive_hash_v19(
       p_source_matchday_id
     ) is distinct from p_source_archive_hash
  then
    raise exception 'matchday-live-layout-handoff-v19-source-retirement-mutated';
  end if;
end;
$function$;

revoke all on function
  jornada_private.retire_matchday_live_layout_physical_source_v19(
    uuid, uuid, uuid, uuid, uuid, text
  )
from public, anon, authenticated, service_role;


create function
jornada_private.assert_matchday_live_layout_physical_handoff_complete_v19(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_handoff
    jornada_private.matchday_live_layout_physical_handoffs%rowtype;
  v_current_token text;
begin
  select handoff_row.*
  into v_handoff
  from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
  where handoff_row.source_matchday_id = p_source_matchday_id
    and handoff_row.target_matchday_id = p_target_matchday_id
    and handoff_row.source_composition_id = p_source_composition_id;

  if not found then
    raise exception 'matchday-live-layout-handoff-v19-certificate-missing';
  end if;

  perform
    jornada_private.assert_matchday_live_layout_physical_handoff_ready_v19(
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id,
      v_handoff.topology_transition_id,
      v_handoff.carryover_id
    );

  if not exists (
    select 1
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = p_source_matchday_id
      and transition_row.target_matchday_id = p_target_matchday_id
      and transition_row.source_composition_id = p_source_composition_id
      and transition_row.continuity_version = 19
  ) then
    raise exception 'matchday-live-layout-handoff-v19-public-certificate-invalid';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_desk_control as source_desk
    where source_desk.matchday_id = p_source_matchday_id
      and (
        source_desk.is_managed
        or source_desk.carryover_source_composition_id is not null
        or source_desk.carryover_snapshot is not null
      )
  ) or not exists (
    select 1
    from public.matchday_editorial_desk_control as target_desk
    where target_desk.matchday_id = p_target_matchday_id
      and target_desk.is_managed
      and target_desk.carryover_source_composition_id is null
      and target_desk.carryover_snapshot is null
  ) then
    raise exception 'matchday-live-layout-handoff-v19-desk-postcondition';
  end if;

  if jornada_private.matchday_live_layout_physical_archive_hash_v19(
       p_source_matchday_id
     ) is distinct from v_handoff.source_archive_hash
  then
    raise exception 'matchday-live-layout-handoff-v19-source-archive-changed';
  end if;

  select workspace_row.state_token
  into v_current_token
  from public.read_matchday_live_layout_workspace_v13(
    p_target_matchday_id,
    v_handoff.profile_key
  ) as workspace_row;

  if v_current_token is distinct from v_handoff.target_state_token then
    raise exception 'matchday-live-layout-handoff-v19-final-token-drift';
  end if;
end;
$function$;

revoke all on function
  jornada_private.assert_matchday_live_layout_physical_handoff_complete_v19(
    uuid, uuid, uuid
  )
from public, anon, authenticated, service_role;


-- ============================================================
-- 5. SHARED PHYSICAL NORMAL/RECOVERY CORE
-- ============================================================

create function
jornada_private.materialize_matchday_live_layout_physical_handoff_v19(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid,
  p_operation text default 'normal'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_operation text := pg_catalog.lower(pg_catalog.btrim(p_operation));
  v_source_season_id uuid;
  v_target_season_id uuid;
  v_source_number integer;
  v_target_number integer;
  v_profile_key text;
  v_topology record;
  v_carryover record;
  v_topology_id uuid;
  v_carryover_id uuid;
  v_source_archive_hash text;
  v_target_state_token text;
  v_existing_handoff
    jornada_private.matchday_live_layout_physical_handoffs%rowtype;
  v_outcome text;
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null
    or p_source_matchday_id = p_target_matchday_id
    or v_operation not in ('normal', 'recovery')
  then
    raise exception 'matchday-live-layout-handoff-v19-invalid-envelope';
  end if;

  -- One exclusive acquisition for the orchestration. v17/v18 re-enter the
  -- same transaction-scoped advisory lock; PostgreSQL advisory locks are
  -- session-reentrant. No second lock family is introduced.
  perform jornada_private.acquire_matchday_live_desk_handoff_lock();
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

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
    raise exception 'matchday-live-layout-handoff-v19-matchday-not-found';
  end if;

  if jornada_private.matchday_live_layout_continuity_authority_v19(
       p_source_matchday_id
     ) <> 'physical'
  then
    raise exception 'matchday-live-layout-handoff-v19-source-not-physical';
  end if;

  select source_row.season_id, source_row.number,
         target_row.season_id, target_row.number
  into v_source_season_id, v_source_number,
       v_target_season_id, v_target_number
  from public.matchdays as source_row
  cross join public.matchdays as target_row
  where source_row.id = p_source_matchday_id
    and target_row.id = p_target_matchday_id;

  if v_source_season_id is distinct from v_target_season_id
    or v_target_number <> v_source_number + 1
  then
    raise exception 'matchday-live-layout-handoff-v19-target-not-consecutive';
  end if;

  select marker_row.profile_key
  into v_profile_key
  from jornada_private.matchday_live_layout_physical_cutovers as marker_row
  where marker_row.matchday_id = p_source_matchday_id;

  select handoff_row.*
  into v_existing_handoff
  from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
  where handoff_row.source_matchday_id = p_source_matchday_id
     or handoff_row.target_matchday_id = p_target_matchday_id
  for update;

  if found then
    if v_existing_handoff.source_matchday_id <> p_source_matchday_id
      or v_existing_handoff.target_matchday_id <> p_target_matchday_id
      or v_existing_handoff.source_composition_id <>
         p_source_composition_id
    then
      raise exception 'matchday-live-layout-handoff-v19-certificate-conflict';
    end if;

    if v_operation = 'normal' then
      raise exception 'matchday-live-layout-handoff-v19-already-complete';
    end if;

    perform
      jornada_private.assert_matchday_live_layout_physical_handoff_complete_v19(
        p_source_matchday_id,
        p_target_matchday_id,
        p_source_composition_id
      );

    select carryover_row.*
    into v_carryover
    from jornada_private.matchday_live_layout_physical_carryovers
      as carryover_row
    where carryover_row.id = v_existing_handoff.carryover_id;

    return pg_catalog.jsonb_build_object(
      'operation', 'recovery',
      'outcome', 'already_complete',
      'publishedCompositionId', p_source_composition_id,
      'sourceMatchdayId', p_source_matchday_id,
      'nextMatchdayId', p_target_matchday_id,
      'topologyTransitionId',
        v_existing_handoff.topology_transition_id,
      'carryoverId', v_existing_handoff.carryover_id,
      'handoffId', v_existing_handoff.id,
      'carryoverApplied', true,
      'materialized', true,
      'sourceRetired', true,
      'targetActivated', true,
      'inheritedBankCount', v_carryover.inherited_bank_count,
      'inheritedZoneCount', (
        select pg_catalog.count(*)
        from jornada_private.matchday_live_layout_physical_zone_maps
          as map_row
        where map_row.topology_transition_id =
              v_existing_handoff.topology_transition_id
      ),
      'inheritedPlacementCount',
        v_carryover.inherited_placement_count,
      'inheritedLatestCount', v_carryover.inherited_latest_count,
      'inheritedRoundupCount', v_carryover.inherited_roundup_count,
      'stateToken', v_existing_handoff.target_state_token
    );
  end if;

  if exists (
    select 1
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = p_source_matchday_id
       or transition_row.target_matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-handoff-v19-transition-conflict';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as source_desk
    where source_desk.matchday_id = p_source_matchday_id
      and source_desk.is_managed
  ) then
    raise exception 'matchday-live-layout-handoff-v19-source-not-live';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_desk_control as target_desk
    where target_desk.matchday_id = p_target_matchday_id
      and (
        target_desk.is_managed
        or target_desk.carryover_source_composition_id is not null
        or target_desk.carryover_snapshot is not null
      )
  ) then
    raise exception 'matchday-live-layout-handoff-v19-target-desk-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_reference_compositions as target_composition
    where target_composition.matchday_id = p_target_matchday_id
      and target_composition.status = 'published'
      and target_composition.is_current
  ) then
    raise exception 'matchday-live-layout-handoff-v19-target-published';
  end if;

  if v_operation = 'normal' then
    if exists (
      select 1
      from jornada_private.matchday_live_layout_physical_topology_transitions
        as topology_row
      where topology_row.source_matchday_id = p_source_matchday_id
         or topology_row.target_matchday_id = p_target_matchday_id
    ) or exists (
      select 1
      from jornada_private.matchday_live_layout_physical_carryovers
        as carryover_row
      where carryover_row.source_matchday_id = p_source_matchday_id
         or carryover_row.target_matchday_id = p_target_matchday_id
    ) then
      raise exception 'matchday-live-layout-handoff-v19-normal-not-virgin';
    end if;

    p_source_composition_id :=
      public.activate_matchday_reference_composition(
        p_source_matchday_id,
        p_source_composition_id,
        true
      );

    select *
    into v_topology
    from jornada_private.materialize_matchday_live_layout_physical_topology_v17(
      p_source_matchday_id,
      p_target_matchday_id
    );

    v_topology_id := v_topology.topology_transition_id;

    select *
    into v_carryover
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id,
      v_topology_id
    );

    v_carryover_id := v_carryover.carryover_id;
    v_outcome := 'materialized';
  else
    if not exists (
      select 1
      from public.matchday_reference_compositions as composition_row
      where composition_row.id = p_source_composition_id
        and composition_row.matchday_id = p_source_matchday_id
        and composition_row.status = 'published'
        and composition_row.is_current
    ) then
      raise exception 'matchday-live-layout-handoff-v19-recovery-composition-invalid';
    end if;

    select topology_row.id
    into v_topology_id
    from jornada_private.matchday_live_layout_physical_topology_transitions
      as topology_row
    where topology_row.source_matchday_id = p_source_matchday_id
      and topology_row.target_matchday_id = p_target_matchday_id
      and topology_row.profile_key = v_profile_key;

    if not found then
      raise exception 'matchday-live-layout-handoff-v19-recovery-topology-missing';
    end if;

    select carryover_row.*
    into v_carryover
    from jornada_private.matchday_live_layout_physical_carryovers
      as carryover_row
    where carryover_row.source_matchday_id = p_source_matchday_id
      and carryover_row.target_matchday_id = p_target_matchday_id;

    if found then
      if v_carryover.topology_transition_id <> v_topology_id
        or v_carryover.source_composition_id <> p_source_composition_id
      then
        raise exception 'matchday-live-layout-handoff-v19-recovery-carryover-conflict';
      end if;
      v_carryover_id := v_carryover.id;
      v_outcome := 'resumed_after_carryover';
    else
      select *
      into v_carryover
      from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
        p_source_matchday_id,
        p_target_matchday_id,
        p_source_composition_id,
        v_topology_id
      );
      v_carryover_id := v_carryover.carryover_id;
      v_outcome := 'resumed_after_topology';
    end if;
  end if;

  perform
    jornada_private.assert_matchday_live_layout_physical_handoff_ready_v19(
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id,
      v_topology_id,
      v_carryover_id
    );

  v_source_archive_hash :=
    jornada_private.matchday_live_layout_physical_archive_hash_v19(
      p_source_matchday_id
    );

  perform jornada_private.retire_matchday_live_layout_physical_source_v19(
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id,
    v_topology_id,
    v_carryover_id,
    v_source_archive_hash
  );

  insert into public.matchday_editorial_continuity_transitions (
    source_matchday_id,
    target_matchday_id,
    source_composition_id,
    continuity_version,
    initialized_at,
    updated_at
  ) values (
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id,
    19,
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  );

  select workspace_row.state_token
  into v_target_state_token
  from public.read_matchday_live_layout_workspace_v13(
    p_target_matchday_id,
    v_profile_key
  ) as workspace_row;

  insert into jornada_private.matchday_live_layout_physical_handoffs (
    topology_transition_id,
    carryover_id,
    source_matchday_id,
    target_matchday_id,
    source_composition_id,
    profile_key,
    source_archive_hash,
    target_state_token
  ) values (
    v_topology_id,
    v_carryover_id,
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id,
    v_profile_key,
    v_source_archive_hash,
    v_target_state_token
  )
  returning id into v_existing_handoff.id;

  perform
    jornada_private.assert_matchday_live_layout_physical_handoff_complete_v19(
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id
    );

  select carryover_row.*
  into v_carryover
  from jornada_private.matchday_live_layout_physical_carryovers
    as carryover_row
  where carryover_row.id = v_carryover_id;

  return pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'outcome', v_outcome,
    'publishedCompositionId', p_source_composition_id,
    'sourceMatchdayId', p_source_matchday_id,
    'nextMatchdayId', p_target_matchday_id,
    'topologyTransitionId', v_topology_id,
    'carryoverId', v_carryover_id,
    'handoffId', v_existing_handoff.id,
    'carryoverApplied', true,
    'materialized', true,
    'sourceRetired', true,
    'targetActivated', true,
    'inheritedBankCount', v_carryover.inherited_bank_count,
    'inheritedZoneCount', (
      select pg_catalog.count(*)
      from jornada_private.matchday_live_layout_physical_zone_maps as map_row
      where map_row.topology_transition_id = v_topology_id
    ),
    'inheritedPlacementCount', v_carryover.inherited_placement_count,
    'inheritedLatestCount', v_carryover.inherited_latest_count,
    'inheritedRoundupCount', v_carryover.inherited_roundup_count,
    'stateToken', v_target_state_token
  );
end;
$function$;

revoke all on function
  jornada_private.materialize_matchday_live_layout_physical_handoff_v19(
    uuid, uuid, uuid, text
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.materialize_matchday_live_layout_physical_handoff_v19(
    uuid, uuid, uuid, text
  )
is
  'Private shared physical normal/recovery core. Under the existing exclusive handoff barrier it composes v17 and v18, validates their certificates, atomically switches live ownership without deleting source archive state, and writes the final v19 certificate last.';


-- ============================================================
-- 6. FREEZE THE EXISTING 7B/V6 ENTRYPOINTS AS LEGACY-ONLY
-- ============================================================

alter function
  public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
rename to publish_matchday_continuity_legacy_v6;

alter function public.publish_matchday_continuity_legacy_v6(uuid, uuid)
set schema jornada_private;

revoke all on function
  jornada_private.publish_matchday_continuity_legacy_v6(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function
  jornada_private.publish_matchday_continuity_legacy_v6(uuid, uuid)
is
  'Frozen 7B/v6 handoff wrapper. v19 invokes it only after the explicit dispatcher proves that the source is genuinely pre-cutover legacy.';


alter function
  public.recover_matchday_live_layout_continuity(uuid, uuid, uuid)
rename to recover_matchday_continuity_legacy_v6;

alter function public.recover_matchday_continuity_legacy_v6(
  uuid, uuid, uuid
)
set schema jornada_private;

revoke all on function
  jornada_private.recover_matchday_continuity_legacy_v6(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

comment on function
  jornada_private.recover_matchday_continuity_legacy_v6(uuid, uuid, uuid)
is
  'Frozen 7B/v6 recovery wrapper. v19 invokes it only for a genuinely pre-cutover legacy source.';


-- ============================================================
-- 7. PUBLIC DISPATCHERS KEEP THE HISTORICAL API
-- ============================================================

create function
public.publish_matchday_reference_composition_with_continuity(
  p_matchday_id uuid,
  p_composition_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_season_id uuid;
  v_source_number integer;
  v_next_matchday_id uuid;
  v_authority text;
begin
  if p_matchday_id is null or p_composition_id is null then
    raise exception 'composition_invalid';
  end if;

  perform jornada_private.acquire_matchday_live_desk_handoff_lock();
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  select matchday_row.season_id, matchday_row.number
  into v_source_season_id, v_source_number
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id;

  if not found then
    raise exception 'composition_matchday_not_found';
  end if;

  select target_row.id
  into v_next_matchday_id
  from public.matchdays as target_row
  where target_row.season_id = v_source_season_id
    and target_row.number = v_source_number + 1;

  if not found then
    raise exception 'composition_next_matchday_not_found';
  end if;

  perform 1
  from public.matchdays as lock_row
  where lock_row.id in (p_matchday_id, v_next_matchday_id)
  order by lock_row.id
  for update;

  -- Dispatch happens before either materializer is entered. Exceptions from
  -- physical validation/materialization are never caught as legacy fallback.
  v_authority :=
    jornada_private.matchday_live_layout_continuity_authority_v19(
      p_matchday_id
    );

  if v_authority = 'physical' then
    return
      jornada_private.materialize_matchday_live_layout_physical_handoff_v19(
        p_matchday_id,
        v_next_matchday_id,
        p_composition_id,
        'normal'
      );
  end if;

  return jornada_private.publish_matchday_continuity_legacy_v6(
    p_matchday_id,
    p_composition_id
  );
end;
$function$;

revoke all on function
  public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
to service_role;

comment on function
  public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
is
  'Marker-aware continuity dispatcher. Coherent physical sources use private v19; genuine legacy sources use frozen 7B/v6; partial physical evidence fails closed before materialization.';


create function public.recover_matchday_live_layout_continuity(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_authority text;
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null
  then
    raise exception 'matchday-live-continuity-recovery-invalid-envelope';
  end if;

  perform jornada_private.acquire_matchday_live_desk_handoff_lock();
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  perform 1
  from public.matchdays as lock_row
  where lock_row.id in (p_source_matchday_id, p_target_matchday_id)
  order by lock_row.id
  for update;

  v_authority :=
    jornada_private.matchday_live_layout_continuity_authority_v19(
      p_source_matchday_id
    );

  if v_authority = 'physical' then
    return
      jornada_private.materialize_matchday_live_layout_physical_handoff_v19(
        p_source_matchday_id,
        p_target_matchday_id,
        p_source_composition_id,
        'recovery'
      ) || pg_catalog.jsonb_build_object('recovered', true);
  end if;

  return jornada_private.recover_matchday_continuity_legacy_v6(
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id
  );
end;
$function$;

revoke all on function public.recover_matchday_live_layout_continuity(
  uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.recover_matchday_live_layout_continuity(
  uuid, uuid, uuid
) to service_role;

comment on function public.recover_matchday_live_layout_continuity(
  uuid, uuid, uuid
) is
  'Marker-aware recovery dispatcher. Physical recovery accepts only v17 topology-only, v17+v18 carryover-complete, or fully certified v19 states; all hybrids fail closed. Legacy manifest recovery is preserved only for a genuine legacy source.';


-- ============================================================
-- 8. REAL PUBLICATION ENTRYPOINT, INCLUDING SAFE REPUBLICATION
-- ============================================================

create or replace function public.publish_matchday_reference_composition(
  p_matchday_id uuid,
  p_composition_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_season_id uuid;
  v_source_number integer;
  v_next_matchday_id uuid;
  v_source_is_managed boolean;
  v_transition public.matchday_editorial_continuity_transitions%rowtype;
  v_has_transition boolean := false;
  v_transition_before jsonb;
  v_transition_after jsonb;
  v_source_archive_before text;
  v_source_archive_after text;
  v_published_id uuid;
  v_first_publication jsonb;
begin
  if p_matchday_id is null or p_composition_id is null then
    raise exception 'composition_invalid';
  end if;

  perform jornada_private.acquire_matchday_live_desk_handoff_lock();
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  select matchday_row.season_id, matchday_row.number
  into v_source_season_id, v_source_number
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id;

  if not found then
    raise exception 'composition_matchday_not_found';
  end if;

  select target_row.id
  into v_next_matchday_id
  from public.matchdays as target_row
  where target_row.season_id = v_source_season_id
    and target_row.number = v_source_number + 1;

  perform 1
  from public.matchdays as lock_row
  where lock_row.id = p_matchday_id
     or lock_row.id = v_next_matchday_id
  order by lock_row.id
  for update;

  select transition_row.*
  into v_transition
  from public.matchday_editorial_continuity_transitions as transition_row
  where transition_row.source_matchday_id = p_matchday_id
  for key share;

  v_has_transition := found;

  select source_desk.is_managed
  into v_source_is_managed
  from public.matchday_editorial_desk_control as source_desk
  where source_desk.matchday_id = p_matchday_id
  for update;

  if not found then
    raise exception 'composition_source_matchday_control_missing';
  end if;

  if v_has_transition then
    if v_next_matchday_id is null
      or v_transition.target_matchday_id <> v_next_matchday_id
      or v_transition.continuity_version not in (6, 19)
    then
      raise exception 'composition_historical_transition_invalid';
    end if;

    if v_source_is_managed then
      raise exception 'composition_historical_source_still_live';
    end if;

    v_transition_before := pg_catalog.to_jsonb(v_transition);

    if v_transition.continuity_version = 19 then
      if jornada_private.matchday_live_layout_continuity_authority_v19(
           p_matchday_id
         ) <> 'physical'
      then
        raise exception 'composition_historical_physical_authority_invalid';
      end if;

      perform
        jornada_private.assert_matchday_live_layout_physical_handoff_complete_v19(
          p_matchday_id,
          v_next_matchday_id,
          v_transition.source_composition_id
        );

      v_source_archive_before :=
        jornada_private.matchday_live_layout_physical_archive_hash_v19(
          p_matchday_id
        );
    else
      if jornada_private.matchday_live_layout_continuity_authority_v19(
           p_matchday_id
         ) <> 'legacy'
      then
        raise exception 'composition_historical_legacy_authority_invalid';
      end if;

      if not exists (
        select 1
        from jornada_private.matchday_live_layout_cutover_control as control_row
        where control_row.scope = 'live_layout'
          and control_row.authority_mode = 'authoritative'
      ) then
        raise exception 'composition_historical_authority_not_active';
      end if;

      if exists (
        select 1
        from public.matchday_live_layout_placements as source_placement
        where source_placement.matchday_id = p_matchday_id
      ) or exists (
        select 1
        from public.matchday_live_layout_bank_item_state_memory as source_memory
        where source_memory.matchday_id = p_matchday_id
      ) then
        raise exception 'composition_historical_source_not_retired';
      end if;
    end if;

    v_published_id := public.activate_matchday_reference_composition(
      p_matchday_id,
      p_composition_id,
      true
    );

    select pg_catalog.to_jsonb(transition_row)
    into v_transition_after
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = p_matchday_id;

    if v_transition_after is distinct from v_transition_before then
      raise exception 'composition_historical_transition_changed';
    end if;

    if v_transition.continuity_version = 19 then
      perform
        jornada_private.assert_matchday_live_layout_physical_handoff_complete_v19(
          p_matchday_id,
          v_next_matchday_id,
          v_transition.source_composition_id
        );

      v_source_archive_after :=
        jornada_private.matchday_live_layout_physical_archive_hash_v19(
          p_matchday_id
        );

      if v_source_archive_after is distinct from v_source_archive_before then
        raise exception 'composition_historical_physical_archive_changed';
      end if;
    elsif exists (
      select 1
      from public.matchday_editorial_desk_control as source_desk
      where source_desk.matchday_id = p_matchday_id
        and source_desk.is_managed
    ) or exists (
      select 1
      from public.matchday_live_layout_placements as source_placement
      where source_placement.matchday_id = p_matchday_id
    ) or exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as source_memory
      where source_memory.matchday_id = p_matchday_id
    ) then
      raise exception 'composition_historical_republish_postcondition_failed';
    end if;

    return pg_catalog.jsonb_build_object(
      'publicationKind', 'historical_republish',
      'publishedCompositionId', v_published_id,
      'sourceMatchdayId', p_matchday_id,
      'nextMatchdayId', v_transition.target_matchday_id,
      'carryoverApplied', false,
      'materialized', false,
      'sourceRetired', true,
      'transitionPreserved', true,
      'continuityVersion', v_transition.continuity_version
    );
  end if;

  if not v_source_is_managed then
    raise exception 'composition_first_publication_source_not_live';
  end if;

  v_first_publication :=
    public.publish_matchday_reference_composition_with_continuity(
      p_matchday_id,
      p_composition_id
    );

  return v_first_publication || pg_catalog.jsonb_build_object(
    'publicationKind', 'first_publication'
  );
end;
$function$;

revoke all on function
  public.publish_matchday_reference_composition(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.publish_matchday_reference_composition(uuid, uuid)
to service_role;


-- ============================================================
-- 9. LEAST-PRIVILEGE POSTCONDITIONS
-- ============================================================

do $postconditions$
begin
  if pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.materialize_matchday_live_layout_physical_handoff_v19(uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.retire_matchday_live_layout_physical_source_v19(uuid,uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.publish_matchday_continuity_legacy_v6(uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.recover_matchday_continuity_legacy_v6(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'matchday-live-layout-handoff-v19-private-execute-invalid';
  end if;

  if pg_catalog.has_table_privilege(
    'service_role',
    'jornada_private.matchday_live_layout_physical_handoffs',
    'SELECT'
  ) then
    raise exception 'matchday-live-layout-handoff-v19-private-read-invalid';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.publish_matchday_reference_composition_with_continuity(uuid,uuid)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.recover_matchday_live_layout_continuity(uuid,uuid,uuid)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.publish_matchday_reference_composition(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'matchday-live-layout-handoff-v19-public-execute-invalid';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
