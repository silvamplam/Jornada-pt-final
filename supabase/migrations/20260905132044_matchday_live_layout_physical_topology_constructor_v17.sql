begin;

-- LOTE 3 / v17
-- Copy only the authoritative physical topology of a physical predecessor.
-- Content, Bank participation, placements and handoff activation deliberately
-- remain outside this constructor.

-- ============================================================
-- 1. PERMANENT PHYSICAL TRANSITION CERTIFICATE AND ZONE MAP
-- ============================================================

create table jornada_private.matchday_live_layout_physical_topology_transitions (
  id uuid primary key default gen_random_uuid(),
  source_matchday_id uuid not null,
  target_matchday_id uuid not null,
  profile_key text not null,
  source_cutover_at timestamptz not null,
  materialized_at timestamptz not null
    default pg_catalog.statement_timestamp(),

  constraint matchday_live_layout_physical_topology_transitions_source_fk
    foreign key (source_matchday_id)
    references public.matchdays(id)
    on delete restrict,

  constraint matchday_live_layout_physical_topology_transitions_target_fk
    foreign key (target_matchday_id)
    references public.matchdays(id)
    on delete restrict,

  constraint matchday_live_layout_physical_topology_transitions_pair_check
    check (source_matchday_id <> target_matchday_id),

  constraint matchday_live_layout_physical_topology_profile_check
    check (pg_catalog.btrim(profile_key) <> ''),

  constraint matchday_live_layout_physical_topology_transitions_source_key
    unique (source_matchday_id),

  constraint matchday_live_layout_physical_topology_transitions_target_key
    unique (target_matchday_id),

  constraint matchday_live_layout_physical_topology_transitions_context_key
    unique (id, source_matchday_id, target_matchday_id)
);

alter table
  jornada_private.matchday_live_layout_physical_topology_transitions
enable row level security;

revoke all on table
  jornada_private.matchday_live_layout_physical_topology_transitions
from public, anon, authenticated, service_role;

comment on table
  jornada_private.matchday_live_layout_physical_topology_transitions
is
  'Private certificate that a physical source topology was materialized once into a consecutive virgin target. It is independent from the later content/handoff transition.';


create table jornada_private.matchday_live_layout_physical_zone_maps (
  topology_transition_id uuid not null,
  source_matchday_id uuid not null,
  target_matchday_id uuid not null,
  source_zone_id uuid not null,
  target_zone_id uuid not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),

  constraint matchday_live_layout_physical_zone_maps_pkey
    primary key (topology_transition_id, source_zone_id),

  constraint matchday_live_layout_physical_zone_maps_target_zone_key
    unique (topology_transition_id, target_zone_id),

  constraint matchday_live_layout_physical_zone_maps_source_context_key
    unique (source_matchday_id, target_matchday_id, source_zone_id),

  constraint matchday_live_layout_physical_zone_maps_target_context_key
    unique (source_matchday_id, target_matchday_id, target_zone_id),

  constraint matchday_live_layout_physical_zone_maps_zone_identity_check
    check (source_zone_id <> target_zone_id),

  constraint matchday_live_layout_physical_zone_maps_transition_fk
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

  constraint matchday_live_layout_physical_zone_maps_source_zone_fk
    foreign key (source_zone_id, source_matchday_id)
    references public.matchday_live_layout_zones(id, matchday_id)
    on delete restrict
    deferrable initially deferred,

  constraint matchday_live_layout_physical_zone_maps_target_zone_fk
    foreign key (target_zone_id, target_matchday_id)
    references public.matchday_live_layout_zones(id, matchday_id)
    on delete restrict
    deferrable initially deferred
);

create index matchday_live_layout_physical_zone_maps_source_idx
on jornada_private.matchday_live_layout_physical_zone_maps(
  source_matchday_id,
  source_zone_id
);

create index matchday_live_layout_physical_zone_maps_target_idx
on jornada_private.matchday_live_layout_physical_zone_maps(
  target_matchday_id,
  target_zone_id
);

alter table jornada_private.matchday_live_layout_physical_zone_maps
  enable row level security;

revoke all on table
  jornada_private.matchday_live_layout_physical_zone_maps
from public, anon, authenticated, service_role;

comment on table
  jornada_private.matchday_live_layout_physical_zone_maps
is
  'Complete persistent source_zone_id to target_zone_id map for one physical topology transition. Legacy zone keys are intentionally absent.';


-- ============================================================
-- 2. STRICT SOURCE VALIDATOR
-- ============================================================

create function
jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
  p_matchday_id uuid,
  p_profile_key text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_zone_count integer;
  v_settings public.matchday_live_layout_workspace_settings%rowtype;
begin
  if p_matchday_id is null or p_profile_key is null then
    raise exception 'matchday-live-layout-topology-v17-source-invalid-input';
  end if;

  if not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as marker_row
    where marker_row.matchday_id = p_matchday_id
      and marker_row.profile_key = p_profile_key
  ) then
    raise exception 'matchday-live-layout-topology-v17-source-not-physical';
  end if;

  select settings_row.*
  into v_settings
  from public.matchday_live_layout_workspace_settings as settings_row
  where settings_row.matchday_id = p_matchday_id;

  if not found then
    raise exception
      'matchday-live-layout-topology-v17-source-authority-incoherent';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_profile_assignments as assignment_row
    where assignment_row.matchday_id = p_matchday_id
      and assignment_row.profile_key = p_profile_key
  ) then
    raise exception 'matchday-live-layout-topology-v17-source-profile-invalid';
  end if;

  select pg_catalog.count(*)::integer
  into v_zone_count
  from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id = p_matchday_id;

  if v_zone_count = 0 then
    raise exception 'matchday-live-layout-topology-v17-source-zones-missing';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = p_matchday_id
      and (
        nullif(pg_catalog.btrim(zone_row.public_title), '') is null
        or pg_catalog.char_length(pg_catalog.btrim(zone_row.public_title)) > 120
        or zone_row.visual_family not in (
          'six_news',
          'five_news_balanced',
          'five_news_secondary'
        )
      )
  ) then
    raise exception 'matchday-live-layout-topology-v17-source-zone-invalid';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id = p_matchday_id
      and (
        block_row.block_type not in ('zone', 'latest', 'video')
        or block_row.sort_order <= 0
        or block_row.sort_order > 1000000000
        or not (
          (block_row.block_type = 'zone' and block_row.zone_id is not null)
          or (
            block_row.block_type in ('latest', 'video')
            and block_row.zone_id is null
          )
        )
      )
  ) or exists (
    select 1
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id = p_matchday_id
    group by block_row.sort_order
    having pg_catalog.count(*) <> 1
  ) or exists (
    select 1
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = p_matchday_id
      and (
        select pg_catalog.count(*)
        from public.matchday_live_layout_blocks as block_row
        where block_row.matchday_id = p_matchday_id
          and block_row.block_type = 'zone'
          and block_row.zone_id = zone_row.id
      ) <> 1
  ) or (
    select pg_catalog.count(*)
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id = p_matchday_id
      and block_row.block_type = 'latest'
  ) <> 1 or (
    select pg_catalog.count(*)
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id = p_matchday_id
      and block_row.block_type = 'video'
  ) > 1 then
    raise exception 'matchday-live-layout-topology-v17-source-blocks-invalid';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_blocks as block_row
    left join public.matchday_live_layout_zones as zone_row
      on zone_row.id = block_row.zone_id
     and zone_row.matchday_id = block_row.matchday_id
    where block_row.matchday_id = p_matchday_id
      and block_row.block_type = 'zone'
      and zone_row.id is null
  ) then
    raise exception 'matchday-live-layout-topology-v17-source-block-zone-invalid';
  end if;

  perform jornada_private.validate_matchday_live_layout_legacy_projection_v14(
    p_matchday_id,
    p_profile_key
  );

  -- Existing placements are not copied, but an incoherent physical source is
  -- never accepted as a topology certificate.
  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    left join public.matchday_live_layout_zones as zone_row
      on zone_row.id = placement_row.zone_id
     and zone_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_matchday_id
      and (
        (
          placement_row.placement_type = 'zone'
          and (
            zone_row.id is null
            or placement_row.slot_position > jornada_private
                .matchday_live_layout_visual_family_capacity_v13(
                  zone_row.visual_family
                )
          )
        )
        or (
          placement_row.placement_type = 'faixa'
          and placement_row.slot_position > v_settings.faixa_slot_count
        )
        or (
          placement_row.placement_type = 'video_highlight'
          and (
            not v_settings.video_module_active
            or not exists (
              select 1
              from public.matchday_live_layout_blocks as video_block
              where video_block.matchday_id = p_matchday_id
                and video_block.block_type = 'video'
            )
          )
        )
      )
  ) or exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
    group by placement_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-topology-v17-source-placement-invalid';
  end if;
end;
$function$;

revoke all on function
  jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
    uuid,
    text
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
    uuid,
    text
  )
is
  'Validates a marker-backed physical source, including settings, assignment, arbitrary zone topology, compatibility subset and structurally valid existing placements. It never falls back to legacy shadow topology.';


-- ============================================================
-- 3. PHYSICAL-ONLY TOPOLOGY CONSTRUCTOR
-- ============================================================

create function
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
  v_source_season_id uuid;
  v_target_season_id uuid;
  v_source_number integer;
  v_target_number integer;
  v_profile_key text;
  v_source_cutover_at timestamptz;
  v_transition_id uuid := gen_random_uuid();
  v_zone_count integer;
  v_block_count integer;
  v_projection_count integer;
  v_state_token text;
  v_source_classification_before text;
  v_target_classification_before text;
  v_source_classification_after text;
  v_target_classification_after text;
  v_source_placement_before text;
  v_source_placement_after text;
  v_source_state_items_before text;
  v_target_state_items_before text;
  v_source_state_items_after text;
  v_target_state_items_after text;
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_matchday_id = p_target_matchday_id
  then
    raise exception 'matchday-live-layout-topology-v17-invalid-envelope';
  end if;

  -- Same writer barrier as v14/v15/v16, followed by deterministic matchday
  -- row locks. Source movement and concurrent target construction cannot pass
  -- the snapshot boundary while this transaction is materializing topology.
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as lock_row
  where lock_row.id in (p_source_matchday_id, p_target_matchday_id)
  order by lock_row.id
  for update;

  select
    source_row.season_id,
    target_row.season_id,
    source_row.number,
    target_row.number
  into
    v_source_season_id,
    v_target_season_id,
    v_source_number,
    v_target_number
  from public.matchdays as source_row
  cross join public.matchdays as target_row
  where source_row.id = p_source_matchday_id
    and target_row.id = p_target_matchday_id;

  if not found then
    raise exception 'matchday-live-layout-topology-v17-matchday-not-found';
  end if;

  if v_source_season_id is distinct from v_target_season_id then
    raise exception 'matchday-live-layout-topology-v17-season-mismatch';
  end if;

  if v_target_number <> v_source_number + 1 then
    raise exception 'matchday-live-layout-topology-v17-target-not-consecutive';
  end if;

  select marker_row.profile_key, marker_row.cutover_at
  into v_profile_key, v_source_cutover_at
  from jornada_private.matchday_live_layout_physical_cutovers as marker_row
  where marker_row.matchday_id = p_source_matchday_id;

  if not found then
    -- Zones/blocks/projection alone can be legitimate pre-cutover shadow.
    -- Settings or a topology certificate without the marker cannot.
    if exists (
      select 1
      from public.matchday_live_layout_workspace_settings as settings_row
      where settings_row.matchday_id = p_source_matchday_id
    ) or exists (
      select 1
      from jornada_private.matchday_live_layout_physical_topology_transitions
        as transition_row
      where transition_row.target_matchday_id = p_source_matchday_id
    ) then
      raise exception
        'matchday-live-layout-topology-v17-source-authority-incoherent';
    end if;

    raise exception 'matchday-live-layout-topology-v17-source-not-physical';
  end if;

  perform
    jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
      p_source_matchday_id,
      v_profile_key
    );

  -- A contextual assignment may legitimately be prepared in advance, but a
  -- conflicting one is not repaired by this physical constructor.
  if exists (
    select 1
    from public.matchday_editorial_profile_assignments as assignment_row
    where assignment_row.matchday_id = p_target_matchday_id
      and assignment_row.profile_key is distinct from v_profile_key
  ) then
    raise exception 'matchday-live-layout-topology-v17-target-profile-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_target_matchday_id
      and desk_row.is_managed = true
  ) then
    raise exception 'matchday-live-layout-topology-v17-target-already-live';
  end if;

  -- Physical state, old positional state, compatibility occupation and content
  -- participation all make a Lote-3 retry ambiguous. A false desk-control row
  -- and a matching contextual assignment are the only allowed prepared rows.
  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_workspace_settings as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_zones as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_blocks as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_placements as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_zone_legacy_projection
      as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_topology_transitions
      as row_value
    where row_value.source_matchday_id = p_source_matchday_id
       or row_value.target_matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_continuity_transitions as row_value
    where row_value.source_matchday_id = p_source_matchday_id
       or row_value.target_matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_bank_items as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_profile_state_items as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_profile_zone_items as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorials as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_highlights as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_horizontal_news as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_latest_news as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_roundup_items as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_items as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-topology-v17-target-not-virgin';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.concat_ws('|', bank_row.id, bank_row.classification_key,
      bank_row.classification_source, bank_row.classified_at),
    ',' order by bank_row.id
  ), ''))
  into v_source_classification_before
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_source_matchday_id;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.concat_ws('|', bank_row.id, bank_row.classification_key,
      bank_row.classification_source, bank_row.classified_at),
    ',' order by bank_row.id
  ), ''))
  into v_target_classification_before
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_target_matchday_id;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.concat_ws('|', placement_row.id, placement_row.bank_item_id,
      placement_row.placement_type, placement_row.zone_id,
      placement_row.slot_position, placement_row.created_at,
      placement_row.updated_at),
    ',' order by placement_row.id
  ), ''))
  into v_source_placement_before
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_source_matchday_id;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(state_row)::text,
    ',' order by state_row.source_type, state_row.source_id
  ), ''))
  into v_source_state_items_before
  from public.matchday_editorial_profile_state_items as state_row
  where state_row.matchday_id = p_source_matchday_id;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(state_row)::text,
    ',' order by state_row.source_type, state_row.source_id
  ), ''))
  into v_target_state_items_before
  from public.matchday_editorial_profile_state_items as state_row
  where state_row.matchday_id = p_target_matchday_id;

  -- The certificate is the first DML and is protected by one-source/one-target
  -- uniqueness. Every subsequent failure rolls it back with the whole build.
  insert into
    jornada_private.matchday_live_layout_physical_topology_transitions (
      id,
      source_matchday_id,
      target_matchday_id,
      profile_key,
      source_cutover_at
    )
  values (
    v_transition_id,
    p_source_matchday_id,
    p_target_matchday_id,
    v_profile_key,
    v_source_cutover_at
  );

  -- Persist every physical identity before inserting target zones. The target
  -- zone FK is deferred, so this map is usable by every later statement in the
  -- same transaction and is checked in full at commit.
  insert into jornada_private.matchday_live_layout_physical_zone_maps (
    topology_transition_id,
    source_matchday_id,
    target_matchday_id,
    source_zone_id,
    target_zone_id
  )
  select
    v_transition_id,
    p_source_matchday_id,
    p_target_matchday_id,
    source_zone.id,
    gen_random_uuid()
  from public.matchday_live_layout_zones as source_zone
  where source_zone.matchday_id = p_source_matchday_id
  order by source_zone.id;

  insert into public.matchday_live_layout_zones (
    id,
    matchday_id,
    public_title,
    visual_family
  )
  select
    zone_map.target_zone_id,
    p_target_matchday_id,
    source_zone.public_title,
    source_zone.visual_family
  from jornada_private.matchday_live_layout_physical_zone_maps as zone_map
  join public.matchday_live_layout_zones as source_zone
    on source_zone.id = zone_map.source_zone_id
   and source_zone.matchday_id = zone_map.source_matchday_id
  where zone_map.topology_transition_id = v_transition_id
  order by source_zone.id;

  insert into public.matchday_live_layout_blocks (
    id,
    matchday_id,
    block_type,
    zone_id,
    sort_order
  )
  select
    gen_random_uuid(),
    p_target_matchday_id,
    source_block.block_type,
    case
      when source_block.block_type = 'zone' then zone_map.target_zone_id
      else null
    end,
    source_block.sort_order
  from public.matchday_live_layout_blocks as source_block
  left join jornada_private.matchday_live_layout_physical_zone_maps as zone_map
    on zone_map.topology_transition_id = v_transition_id
   and zone_map.source_zone_id = source_block.zone_id
  where source_block.matchday_id = p_source_matchday_id
  order by source_block.sort_order, source_block.id;

  insert into public.matchday_live_layout_workspace_settings (
    matchday_id,
    faixa_slot_count,
    headline_title_color,
    latest_zone_placement,
    latest_zone_title,
    video_module_active,
    latest_zone_mode,
    latest_zone_title_color
  )
  select
    p_target_matchday_id,
    source_settings.faixa_slot_count,
    source_settings.headline_title_color,
    source_settings.latest_zone_placement,
    source_settings.latest_zone_title,
    source_settings.video_module_active,
    source_settings.latest_zone_mode,
    source_settings.latest_zone_title_color
  from public.matchday_live_layout_workspace_settings as source_settings
  where source_settings.matchday_id = p_source_matchday_id;

  -- Marker comes only after zones, blocks and settings are complete. All work
  -- is still transaction-local, so no observer can see partial authority.
  insert into jornada_private.matchday_live_layout_physical_cutovers (
    matchday_id,
    profile_key,
    cutover_at
  )
  values (
    p_target_matchday_id,
    v_profile_key,
    pg_catalog.statement_timestamp()
  );

  -- The compatibility mapping is the first legacy-shaped write and therefore
  -- runs only after physical authority exists, under the existing downstream
  -- context. Its trigger cannot enqueue legacy-to-physical reverse sync.
  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    p_target_matchday_id
  );

  begin
    insert into jornada_private.matchday_live_layout_zone_legacy_projection (
      matchday_id,
      legacy_zone_key,
      zone_id
    )
    select
      p_target_matchday_id,
      source_projection.legacy_zone_key,
      zone_map.target_zone_id
    from jornada_private.matchday_live_layout_zone_legacy_projection
      as source_projection
    join jornada_private.matchday_live_layout_physical_zone_maps as zone_map
      on zone_map.topology_transition_id = v_transition_id
     and zone_map.source_zone_id = source_projection.zone_id
    where source_projection.matchday_id = p_source_matchday_id
    order by source_projection.legacy_zone_key;
  exception when others then
    perform jornada_private.end_matchday_live_layout_downstream_v14(
      p_target_matchday_id
    );
    raise;
  end;

  perform jornada_private.end_matchday_live_layout_downstream_v14(
    p_target_matchday_id
  );

  if exists (
    select 1
    from jornada_private.matchday_live_layout_placement_shadow_sync_queue
      as queue_row
    where queue_row.backend_pid = pg_catalog.pg_backend_pid()
      and queue_row.transaction_id = pg_catalog.pg_current_xact_id()
      and queue_row.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-topology-v17-reverse-sync-enqueued';
  end if;

  -- A missing contextual assignment is created only after the marker, so the
  -- v16 assignment trigger cannot create automatic legacy state_items.
  insert into public.matchday_editorial_profile_assignments (
    matchday_id,
    profile_key
  )
  values (
    p_target_matchday_id,
    v_profile_key
  )
  on conflict (matchday_id) do nothing;

  perform jornada_private.validate_matchday_live_layout_legacy_projection_v14(
    p_target_matchday_id,
    v_profile_key
  );

  select pg_catalog.count(*)::integer
  into v_zone_count
  from jornada_private.matchday_live_layout_physical_zone_maps as zone_map
  where zone_map.topology_transition_id = v_transition_id;

  select pg_catalog.count(*)::integer
  into v_block_count
  from public.matchday_live_layout_blocks as block_row
  where block_row.matchday_id = p_target_matchday_id;

  select pg_catalog.count(*)::integer
  into v_projection_count
  from jornada_private.matchday_live_layout_zone_legacy_projection
    as projection_row
  where projection_row.matchday_id = p_target_matchday_id;

  if v_zone_count <> (
    select pg_catalog.count(*)
    from public.matchday_live_layout_zones as source_zone
    where source_zone.matchday_id = p_source_matchday_id
  ) or v_zone_count <> (
    select pg_catalog.count(*)
    from public.matchday_live_layout_zones as target_zone
    where target_zone.matchday_id = p_target_matchday_id
  ) or v_block_count <> (
    select pg_catalog.count(*)
    from public.matchday_live_layout_blocks as source_block
    where source_block.matchday_id = p_source_matchday_id
  ) then
    raise exception 'matchday-live-layout-topology-v17-copy-postcondition';
  end if;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as zone_map
    join public.matchday_live_layout_zones as source_zone
      on source_zone.id = zone_map.source_zone_id
     and source_zone.matchday_id = zone_map.source_matchday_id
    join public.matchday_live_layout_zones as target_zone
      on target_zone.id = zone_map.target_zone_id
     and target_zone.matchday_id = zone_map.target_matchday_id
    where zone_map.topology_transition_id = v_transition_id
      and row(source_zone.public_title, source_zone.visual_family)
          is distinct from
          row(target_zone.public_title, target_zone.visual_family)
  ) or exists (
    select 1
    from public.matchday_live_layout_blocks as source_block
    left join public.matchday_live_layout_blocks as target_block
      on target_block.matchday_id = p_target_matchday_id
     and target_block.block_type = source_block.block_type
     and target_block.sort_order = source_block.sort_order
    left join jornada_private.matchday_live_layout_physical_zone_maps as zone_map
      on zone_map.topology_transition_id = v_transition_id
     and zone_map.source_zone_id = source_block.zone_id
    where source_block.matchday_id = p_source_matchday_id
      and (
        target_block.id is null
        or target_block.id = source_block.id
        or target_block.zone_id is distinct from case
          when source_block.block_type = 'zone' then zone_map.target_zone_id
          else null
        end
      )
  ) then
    raise exception 'matchday-live-layout-topology-v17-shape-postcondition';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-topology-v17-content-postcondition';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.concat_ws('|', bank_row.id, bank_row.classification_key,
      bank_row.classification_source, bank_row.classified_at),
    ',' order by bank_row.id
  ), ''))
  into v_source_classification_after
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_source_matchday_id;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.concat_ws('|', bank_row.id, bank_row.classification_key,
      bank_row.classification_source, bank_row.classified_at),
    ',' order by bank_row.id
  ), ''))
  into v_target_classification_after
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_target_matchday_id;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.concat_ws('|', placement_row.id, placement_row.bank_item_id,
      placement_row.placement_type, placement_row.zone_id,
      placement_row.slot_position, placement_row.created_at,
      placement_row.updated_at),
    ',' order by placement_row.id
  ), ''))
  into v_source_placement_after
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_source_matchday_id;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(state_row)::text,
    ',' order by state_row.source_type, state_row.source_id
  ), ''))
  into v_source_state_items_after
  from public.matchday_editorial_profile_state_items as state_row
  where state_row.matchday_id = p_source_matchday_id;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(state_row)::text,
    ',' order by state_row.source_type, state_row.source_id
  ), ''))
  into v_target_state_items_after
  from public.matchday_editorial_profile_state_items as state_row
  where state_row.matchday_id = p_target_matchday_id;

  if row(
    v_source_classification_after,
    v_target_classification_after,
    v_source_placement_after,
    v_source_state_items_after,
    v_target_state_items_after
  ) is distinct from row(
    v_source_classification_before,
    v_target_classification_before,
    v_source_placement_before,
    v_source_state_items_before,
    v_target_state_items_before
  ) then
    raise exception 'matchday-live-layout-topology-v17-authority-postcondition';
  end if;

  select token_row.state_token
  into v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    p_target_matchday_id,
    v_profile_key
  ) as token_row;

  if v_state_token is null or v_state_token !~ '^[0-9a-f]{32}$' then
    raise exception 'matchday-live-layout-topology-v17-token-postcondition';
  end if;

  return query
  select
    v_transition_id,
    p_source_matchday_id,
    p_target_matchday_id,
    v_profile_key,
    v_zone_count,
    v_block_count,
    v_projection_count,
    v_state_token;
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
  'Private physical-only constructor: validates a physical predecessor, requires a consecutive virgin target, creates new zone/block UUIDs plus a persistent physical zone map, copies all physical settings, creates only mapped legacy compatibility projections and establishes target physical authority. It never copies content or placements and never falls back to legacy.';


-- ============================================================
-- 4. COMPLETE CURRENT SETTINGS IN THE EXISTING PHYSICAL READER
-- ============================================================

create or replace function public.read_matchday_live_layout_workspace_v13(
  p_matchday_id uuid,
  p_profile_key text
)
returns table (
  state_token text,
  zones jsonb,
  blocks jsonb,
  placements jsonb,
  bank_items jsonb,
  state_memory jsonb,
  explicit_bank_item_ids jsonb,
  displaced_bank_item_ids jsonb,
  worked_bank_item_ids jsonb,
  legacy_zone_projection jsonb,
  workspace_settings jsonb,
  physical_cutover jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    base_row.state_token,
    base_row.zones,
    base_row.blocks,
    base_row.placements,
    base_row.bank_items,
    base_row.state_memory,
    base_row.explicit_bank_item_ids,
    base_row.displaced_bank_item_ids,
    base_row.worked_bank_item_ids,
    base_row.legacy_zone_projection,
    coalesce(
      (
        select pg_catalog.jsonb_build_object(
          'matchday_id', settings_row.matchday_id,
          'faixa_slot_count', settings_row.faixa_slot_count,
          'headline_title_color', settings_row.headline_title_color,
          'latest_zone_placement', settings_row.latest_zone_placement,
          'latest_zone_title', settings_row.latest_zone_title,
          'latest_zone_mode', settings_row.latest_zone_mode,
          'latest_zone_title_color', settings_row.latest_zone_title_color,
          'video_module_active', settings_row.video_module_active,
          'created_at', settings_row.created_at,
          'updated_at', settings_row.updated_at
        )
        from public.matchday_live_layout_workspace_settings as settings_row
        where settings_row.matchday_id = p_matchday_id
      ),
      'null'::jsonb
    ) as workspace_settings,
    coalesce(
      (
        select pg_catalog.jsonb_build_object(
          'matchday_id', cutover_row.matchday_id,
          'profile_key', cutover_row.profile_key,
          'cutover_at', cutover_row.cutover_at
        )
        from jornada_private.matchday_live_layout_physical_cutovers
          as cutover_row
        where cutover_row.matchday_id = p_matchday_id
      ),
      'null'::jsonb
    ) as physical_cutover
  from jornada_private.read_live_layout_workspace_v13_pre_facade(
    p_matchday_id,
    p_profile_key
  ) as base_row;
$function$;

revoke all on function
  public.read_matchday_live_layout_workspace_v13(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.read_matchday_live_layout_workspace_v13(uuid, text)
to service_role;

comment on function
  public.read_matchday_live_layout_workspace_v13(uuid, text)
is
  'Coherent read-only physical workspace snapshot. Settings include the v15 Latest mode and title color; physical authority and the existing v16 OCC token remain unchanged.';


-- ============================================================
-- 5. PRIVILEGE POSTCONDITIONS
-- ============================================================

do $postconditions$
begin
  if pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.materialize_matchday_live_layout_physical_topology_v17(uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.assert_matchday_live_layout_physical_topology_source_v17(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'matchday-live-layout-topology-v17-private-execute-invalid';
  end if;

  if pg_catalog.has_table_privilege(
    'service_role',
    'jornada_private.matchday_live_layout_physical_topology_transitions',
    'SELECT'
  ) or pg_catalog.has_table_privilege(
    'service_role',
    'jornada_private.matchday_live_layout_physical_zone_maps',
    'SELECT'
  ) then
    raise exception 'matchday-live-layout-topology-v17-private-read-invalid';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.read_matchday_live_layout_workspace_v13(uuid,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.read_matchday_live_layout_workspace_v13(uuid,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.read_matchday_live_layout_workspace_v13(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'matchday-live-layout-topology-v17-reader-acl-invalid';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
