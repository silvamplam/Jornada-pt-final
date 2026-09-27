begin;

-- ============================================================
-- LOTE 5A2-B / V21
--
-- Forward-only alignment between the physical TypeScript model
-- and PostgreSQL:
--   * four_news is a persistable physical layout with capacity 4;
--   * a physical zone public title may be the empty string;
--   * NULL/non-string titles remain invalid;
--   * the 120-character limit remains unchanged.
--
-- No classification, placement or legacy identity rule changes.
-- ============================================================
create or replace function jornada_private.matchday_live_layout_layout_capacity_v20(
  p_layout_id text
)
returns integer
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $function$
  select case p_layout_id
    when 'six_news' then 6
    when 'five_news_balanced' then 5
    when 'five_news_secondary' then 5
    when 'four_news' then 4
    else null
  end;
$function$;

create or replace function
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

  if exists (
    select 1
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = p_matchday_id
      and (
        pg_catalog.char_length(pg_catalog.btrim(zone_row.public_title)) > 120
        or jornada_private.matchday_live_layout_layout_capacity_v20(
             zone_row.visual_family
           ) is null
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

  -- No legacy projection cardinality is consulted. V18 and the marker-first
  -- v19 dispatcher call this validator and therefore inherit this boundary.
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
            or placement_row.slot_position >
               jornada_private.matchday_live_layout_layout_capacity_v20(
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
declare
  v_assignment_profile_key text;
  v_current_state_token text;
  v_final_state_token text;
  v_plan jsonb := '[]'::jsonb;
  v_faixa_before jsonb := '[]'::jsonb;
  v_blocks_before jsonb := '[]'::jsonb;
  v_classification_before text;
  v_faixa_anchor timestamptz;
  v_displaced_anchor timestamptz;
  v_block_offset integer := 1100000000;
  v_had_cutover boolean;
  v_had_settings boolean;
begin
  -- Envelope validation is read-only and precedes every lock and DML.
  if p_matchday_id is null
    or p_profile_key is null
    or pg_catalog.btrim(p_profile_key) = ''
    or p_expected_physical_state_token is null
    or pg_catalog.btrim(p_expected_physical_state_token) = ''
    or pg_catalog.btrim(p_expected_physical_state_token) !~
       '^[0-9a-f]{32}$'
    or p_zones is null
    or pg_catalog.jsonb_typeof(p_zones) <> 'array'
    or p_blocks is null
    or pg_catalog.jsonb_typeof(p_blocks) <> 'array'
    or p_placements is null
    or pg_catalog.jsonb_typeof(p_placements) <> 'array'
    or p_faixa_slot_count is null
    or p_faixa_slot_count < 0
    or p_explicit_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_explicit_bank_item_ids) <> 'array'
    or p_displaced_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_displaced_bank_item_ids) <> 'array'
    or p_worked_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_worked_bank_item_ids) <> 'array'
    or p_faixa_arrival_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_faixa_arrival_bank_item_ids) <> 'array'
    or p_displaced_arrival_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_displaced_arrival_bank_item_ids) <> 'array'
    or p_presentation is null
    or pg_catalog.jsonb_typeof(p_presentation) <> 'object'
  then
    raise exception 'matchday-live-layout-physical-v20-invalid-input';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zones) as raw_row(payload)
    where pg_catalog.jsonb_typeof(raw_row.payload) <> 'object'
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(raw_row.payload) as key_row(key_name)
      ) <> 3
      or not raw_row.payload ?& array[
        'id', 'public_title', 'visual_family'
      ]
  ) then
    raise exception 'matchday-live-layout-physical-v20-zone-shape-invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_blocks) as raw_row(payload)
    where pg_catalog.jsonb_typeof(raw_row.payload) <> 'object'
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(raw_row.payload) as key_row(key_name)
      ) <> 4
      or not raw_row.payload ?& array[
        'id', 'block_type', 'zone_id', 'sort_order'
      ]
  ) then
    raise exception 'matchday-live-layout-physical-v20-block-shape-invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_placements) as raw_row(payload)
    where pg_catalog.jsonb_typeof(raw_row.payload) <> 'object'
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(raw_row.payload) as key_row(key_name)
      ) <> 4
      or not raw_row.payload ?& array[
        'bank_item_id', 'placement_type', 'zone_id', 'slot_position'
      ]
  ) then
    raise exception 'matchday-live-layout-physical-v20-placement-shape-invalid';
  end if;

  if not p_presentation ?& array[
    'headline_title_color',
    'latest_zone_placement',
    'latest_zone_title',
    'video_module_active'
  ] or (
    p_presentation - array[
      'headline_title_color',
      'latest_zone_placement',
      'latest_zone_title',
      'video_module_active'
    ]::text[]
  ) <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(
      p_presentation -> 'headline_title_color'
    ) not in ('null', 'string')
    or (
      pg_catalog.jsonb_typeof(
        p_presentation -> 'headline_title_color'
      ) = 'string'
      and pg_catalog.btrim(
        p_presentation ->> 'headline_title_color'
      ) !~ '^#[0-9A-Fa-f]{6}$'
    )
    or pg_catalog.jsonb_typeof(
      p_presentation -> 'latest_zone_placement'
    ) <> 'string'
    or p_presentation ->> 'latest_zone_placement' not in (
      'top', 'four_news', 'hidden'
    )
    or pg_catalog.jsonb_typeof(
      p_presentation -> 'latest_zone_title'
    ) <> 'string'
    or pg_catalog.char_length(
      pg_catalog.btrim(p_presentation ->> 'latest_zone_title')
    ) > 120
    or pg_catalog.jsonb_typeof(
      p_presentation -> 'video_module_active'
    ) <> 'boolean'
  then
    raise exception 'matchday-live-layout-physical-v20-presentation-invalid';
  end if;

  if exists (
    select 1
    from (
      select p_explicit_bank_item_ids as payload
      union all select p_displaced_bank_item_ids
      union all select p_worked_bank_item_ids
      union all select p_faixa_arrival_bank_item_ids
      union all select p_displaced_arrival_bank_item_ids
    ) as list_row
    cross join lateral pg_catalog.jsonb_array_elements(list_row.payload)
      as raw_row(value)
    where pg_catalog.jsonb_typeof(raw_row.value) <> 'string'
      or pg_catalog.btrim(raw_row.value #>> '{}') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'matchday-live-layout-physical-v20-bank-list-invalid';
  end if;

  -- Identical lock order to the existing physical writers.
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-live-layout-physical-v20-matchday-not-found';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_matchday_id
      and desk_row.is_managed = true
  ) then
    raise exception 'matchday-live-layout-physical-v20-matchday-not-live';
  end if;

  select assignment_row.profile_key
  into v_assignment_profile_key
  from public.matchday_editorial_profile_assignments as assignment_row
  where assignment_row.matchday_id = p_matchday_id;

  if v_assignment_profile_key is distinct from p_profile_key then
    raise exception 'matchday-live-layout-physical-v20-profile-mismatch';
  end if;

  select token_row.state_token
  into v_current_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  if v_current_state_token is distinct from
     p_expected_physical_state_token
  then
    raise exception 'matchday-live-layout-physical-v20-concurrent-write';
  end if;

  select exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as cutover_row
    where cutover_row.matchday_id = p_matchday_id
  ) into v_had_cutover;

  select exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = p_matchday_id
  ) into v_had_settings;

  if v_had_cutover is distinct from v_had_settings then
    raise exception 'matchday-live-layout-physical-v20-authority-state-corrupt';
  end if;

  if v_had_cutover and exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as cutover_row
    where cutover_row.matchday_id = p_matchday_id
      and cutover_row.profile_key is distinct from p_profile_key
  ) then
    raise exception 'matchday-live-layout-physical-v20-cutover-profile-mismatch';
  end if;

  perform jornada_private.validate_matchday_live_layout_legacy_projection_v14(
    p_matchday_id,
    p_profile_key
  );

  -- Final zones may be empty, but every row has a real UUID, title and a
  -- centrally known layout. No classification field participates.
  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
      as zone_row
    where zone_row.zone_id is null
      or zone_row.public_title is null
      or pg_catalog.char_length(zone_row.public_title) > 120
      or jornada_private.matchday_live_layout_layout_capacity_v20(
           zone_row.visual_family
         ) is null
  ) then
    raise exception 'matchday-live-layout-physical-v20-zone-value-invalid';
  end if;

  if (
    select pg_catalog.count(*)
    from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
  ) <> (
    select pg_catalog.count(distinct zone_row.zone_id)
    from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
      as zone_row
  ) then
    raise exception 'matchday-live-layout-physical-v20-zone-duplicate';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
      as desired_row
    join public.matchday_live_layout_zones as current_row
      on current_row.id = desired_row.zone_id
    where current_row.matchday_id <> p_matchday_id
  ) then
    raise exception 'matchday-live-layout-physical-v20-zone-owned-by-other-matchday';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
    where block_row.block_id is null
      or block_row.block_type not in ('zone', 'latest', 'video')
      or block_row.sort_order is null
      or block_row.sort_order <= 0
      or block_row.sort_order > 1000000000
      or not (
        (block_row.block_type = 'zone' and block_row.zone_id is not null)
        or (
          block_row.block_type in ('latest', 'video')
          and block_row.zone_id is null
        )
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-block-value-invalid';
  end if;

  if (
    select pg_catalog.count(*)
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
  ) <> (
    select pg_catalog.count(distinct block_row.block_id)
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
    group by block_row.sort_order
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-physical-v20-block-duplicate';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as desired_row
    join public.matchday_live_layout_blocks as current_row
      on current_row.id = desired_row.block_id
    where current_row.matchday_id <> p_matchday_id
  ) then
    raise exception 'matchday-live-layout-physical-v20-block-owned-by-other-matchday';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as desired_row
    join public.matchday_live_layout_blocks as current_row
      on current_row.id = desired_row.block_id
     and current_row.matchday_id = p_matchday_id
    where current_row.block_type is distinct from desired_row.block_type
      or current_row.zone_id is distinct from desired_row.zone_id
  ) then
    raise exception 'matchday-live-layout-physical-v20-block-identity-mismatch';
  end if;

  -- Retained zones retain their associated physical block identity. A new
  -- block is valid only for a new zone; deleting a zone deletes its old block.
  if exists (
    select 1
    from public.matchday_live_layout_blocks as current_block
    join public.matchday_live_layout_zones as current_zone
      on current_zone.id = current_block.zone_id
     and current_zone.matchday_id = current_block.matchday_id
    where current_block.matchday_id = p_matchday_id
      and current_block.block_type = 'zone'
      and exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
          as desired_zone
        where desired_zone.zone_id = current_zone.id
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
          as desired_block
        where desired_block.block_id = current_block.id
          and desired_block.block_type = 'zone'
          and desired_block.zone_id = current_zone.id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-retained-zone-block-changed';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
      as zone_row
    where (
      select pg_catalog.count(*)
      from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
        as block_row
      where block_row.block_type = 'zone'
        and block_row.zone_id = zone_row.zone_id
    ) <> 1
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
    where block_row.block_type = 'zone'
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
          as zone_row
        where zone_row.zone_id = block_row.zone_id
      )
  ) or (
    select pg_catalog.count(*)
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
    where block_row.block_type = 'latest'
  ) <> 1 or (
    select pg_catalog.count(*)
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
    where block_row.block_type = 'video'
  ) > 1 then
    raise exception 'matchday-live-layout-physical-v20-block-topology-invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_placements) as raw_row(payload)
    where pg_catalog.jsonb_typeof(raw_row.payload -> 'bank_item_id') <> 'string'
      or pg_catalog.btrim(raw_row.payload ->> 'bank_item_id') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(raw_row.payload -> 'placement_type') <>
         'string'
      or pg_catalog.lower(
           pg_catalog.btrim(raw_row.payload ->> 'placement_type')
         ) not in ('opening', 'faixa', 'selection', 'video_highlight', 'zone')
      or pg_catalog.jsonb_typeof(raw_row.payload -> 'slot_position') <>
         'number'
      or raw_row.payload ->> 'slot_position' !~ '^[0-9]+$'
      or (raw_row.payload ->> 'slot_position')::numeric > 2147483647
      or not (
        (
          pg_catalog.lower(
            pg_catalog.btrim(raw_row.payload ->> 'placement_type')
          ) = 'zone'
          and pg_catalog.jsonb_typeof(raw_row.payload -> 'zone_id') =
              'string'
          and pg_catalog.btrim(raw_row.payload ->> 'zone_id') ~*
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
        or (
          pg_catalog.lower(
            pg_catalog.btrim(raw_row.payload ->> 'placement_type')
          ) <> 'zone'
          and pg_catalog.jsonb_typeof(raw_row.payload -> 'zone_id') = 'null'
        )
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-placement-value-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    where placement_row.bank_item_id is null
      or placement_row.slot_position is null
      or placement_row.slot_position <= 0
      or not (
        (
          placement_row.placement_type = 'opening'
          and placement_row.zone_id is null
          and placement_row.slot_position between 1 and 5
        )
        or (
          placement_row.placement_type = 'faixa'
          and placement_row.zone_id is null
          and placement_row.slot_position <= p_faixa_slot_count
        )
        or (
          placement_row.placement_type = 'selection'
          and placement_row.zone_id is null
          and placement_row.slot_position between 1 and 4
        )
        or (
          placement_row.placement_type = 'video_highlight'
          and placement_row.zone_id is null
          and placement_row.slot_position = 1
        )
        or (
          placement_row.placement_type = 'zone'
          and placement_row.zone_id is not null
        )
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-placement-target-invalid';
  end if;

  if (
    select pg_catalog.count(*)
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    )
  ) <> (
    select pg_catalog.count(distinct placement_row.bank_item_id)
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    group by
      placement_row.placement_type,
      placement_row.zone_id,
      placement_row.slot_position
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-physical-v20-placement-duplicate';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    left join jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
      as zone_row
      on zone_row.zone_id = placement_row.zone_id
    where placement_row.placement_type = 'zone'
      and (
        zone_row.zone_id is null
        or placement_row.slot_position >
           jornada_private.matchday_live_layout_layout_capacity_v20(
             zone_row.visual_family
           )
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-zone-capacity-invalid';
  end if;

  -- A newly introduced zone is a topology-only operation and must be born
  -- empty. A later Apply may explicitly place content there.
  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
      as desired_zone
    join jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
      on placement_row.placement_type = 'zone'
     and placement_row.zone_id = desired_zone.zone_id
    where not exists (
      select 1
      from public.matchday_live_layout_zones as current_zone
      where current_zone.id = desired_zone.zone_id
        and current_zone.matchday_id = p_matchday_id
    )
  ) then
    raise exception 'matchday-live-layout-physical-v20-new-zone-not-empty';
  end if;

  if not (p_presentation ->> 'video_module_active')::boolean
    and exists (
      select 1
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_placements
      ) as placement_row
      where placement_row.placement_type = 'video_highlight'
    )
  then
    raise exception 'matchday-live-layout-physical-v20-video-state-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    where placement_row.placement_type = 'video_highlight'
  ) and not exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
    where block_row.block_type = 'video'
  ) then
    raise exception 'matchday-live-layout-physical-v20-video-block-missing';
  end if;

  if exists (
    select 1
    from (
      select p_explicit_bank_item_ids as payload
      union all select p_displaced_bank_item_ids
      union all select p_worked_bank_item_ids
      union all select p_faixa_arrival_bank_item_ids
      union all select p_displaced_arrival_bank_item_ids
    ) as list_row
    cross join lateral (
      select
        pg_catalog.count(*) as item_count,
        pg_catalog.count(distinct normalized_row.bank_item_id) as unique_count
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        list_row.payload
      ) as normalized_row
    ) as count_row
    where count_row.item_count <> count_row.unique_count
  ) then
    raise exception 'matchday-live-layout-physical-v20-bank-list-duplicate';
  end if;

  if exists (
    with requested as materialized (
      select placement_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_placements
      ) as placement_row
      union
      select list_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_explicit_bank_item_ids
      ) as list_row
      union
      select list_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_displaced_bank_item_ids
      ) as list_row
      union
      select list_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_worked_bank_item_ids
      ) as list_row
      union
      select list_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_faixa_arrival_bank_item_ids
      ) as list_row
      union
      select list_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_displaced_arrival_bank_item_ids
      ) as list_row
    )
    select 1
    from requested as requested_row
    left join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = requested_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(coalesce(bank_row.status, ''))) =
         'active'
    where bank_row.id is null
  ) then
    raise exception 'matchday-live-layout-physical-v20-bank-item-not-active';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as explicit_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = explicit_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) <>
          'editorial_article'
  ) then
    raise exception 'matchday-live-layout-physical-v20-explicit-bank-unsupported';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as state_row
    join jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
      on placement_row.bank_item_id = state_row.bank_item_id
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_bank_item_ids
    ) as state_row
    join jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
      on placement_row.bank_item_id = state_row.bank_item_id
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as explicit_row
    join jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_bank_item_ids
    ) as displaced_row
      on displaced_row.bank_item_id = explicit_row.bank_item_id
  ) then
    raise exception 'matchday-live-layout-physical-v20-state-conflict';
  end if;

  -- General final-state completeness is retained from v14.
  if exists (
    select 1
    from public.matchday_live_layout_placements as current_row
    where current_row.matchday_id = p_matchday_id
      and (
        current_row.placement_type <> 'zone'
        or exists (
          select 1
          from jornada_private.normalize_matchday_live_layout_zones_v14(
            p_zones
          ) as retained_zone
          where retained_zone.zone_id = current_row.zone_id
        )
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
          p_placements
        ) as desired_row
        where desired_row.bank_item_id = current_row.bank_item_id
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_explicit_bank_item_ids
        ) as explicit_row
        where explicit_row.bank_item_id = current_row.bank_item_id
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_displaced_bank_item_ids
        ) as displaced_row
        where displaced_row.bank_item_id = current_row.bank_item_id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-removed-item-state-missing';
  end if;

  -- Deleted-zone items have a stricter server-side contract. If no final
  -- public destination exists they must be DESALOJADA, never explicit Bank.
  if exists (
    select 1
    from public.matchday_live_layout_placements as current_row
    where current_row.matchday_id = p_matchday_id
      and current_row.placement_type = 'zone'
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
          as desired_zone
        where desired_zone.zone_id = current_row.zone_id
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
          p_placements
        ) as desired_placement
        where desired_placement.bank_item_id = current_row.bank_item_id
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_displaced_bank_item_ids
        ) as displaced_row
        where displaced_row.bank_item_id = current_row.bank_item_id
      )
  ) then
    raise exception
      'matchday-live-layout-physical-v20-deleted-zone-items-not-displaced';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as current_row
    where current_row.matchday_id = p_matchday_id
      and current_row.placement_type = 'zone'
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
          as desired_zone
        where desired_zone.zone_id = current_row.zone_id
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
          p_placements
        ) as desired_placement
        where desired_placement.bank_item_id = current_row.bank_item_id
      )
      and not exists (
        select 1
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = p_matchday_id
          and memory_row.bank_item_id = current_row.bank_item_id
          and memory_row.memory_kind = 'displaced'
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_displaced_arrival_bank_item_ids
        ) as arrival_row
        where arrival_row.bank_item_id = current_row.bank_item_id
      )
  ) then
    raise exception
      'matchday-live-layout-physical-v20-deleted-zone-displaced-arrival-missing';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_matchday_id
      and bank_row.editorially_worked_at is not null
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_worked_bank_item_ids
        ) as worked_row
        where worked_row.bank_item_id = bank_row.id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-worked-regression';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_faixa_arrival_bank_item_ids
    ) as faixa_row
    join jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_arrival_bank_item_ids
    ) as displaced_row
      on displaced_row.bank_item_id = faixa_row.bank_item_id
  ) then
    raise exception 'matchday-live-layout-physical-v20-event-conflict';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_faixa_arrival_bank_item_ids
    ) as arrival_row
    where not exists (
      select 1
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_placements
      ) as desired_row
      where desired_row.bank_item_id = arrival_row.bank_item_id
        and desired_row.placement_type = 'faixa'
    )
      or exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = p_matchday_id
          and current_row.bank_item_id = arrival_row.bank_item_id
          and current_row.placement_type = 'faixa'
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-faixa-event-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as desired_row
    where desired_row.placement_type = 'faixa'
      and not exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = p_matchday_id
          and current_row.bank_item_id = desired_row.bank_item_id
          and current_row.placement_type = 'faixa'
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_faixa_arrival_bank_item_ids
        ) as arrival_row
        where arrival_row.bank_item_id = desired_row.bank_item_id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-faixa-event-incomplete';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_arrival_bank_item_ids
    ) as arrival_row
    where not exists (
      select 1
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_displaced_bank_item_ids
      ) as displaced_row
      where displaced_row.bank_item_id = arrival_row.bank_item_id
    )
      or exists (
        select 1
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = p_matchday_id
          and memory_row.bank_item_id = arrival_row.bank_item_id
          and memory_row.memory_kind = 'displaced'
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-displaced-event-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_bank_item_ids
    ) as displaced_row
    where not exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id = p_matchday_id
        and memory_row.bank_item_id = displaced_row.bank_item_id
        and memory_row.memory_kind = 'displaced'
    )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_displaced_arrival_bank_item_ids
        ) as arrival_row
        where arrival_row.bank_item_id = displaced_row.bank_item_id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-displaced-event-incomplete';
  end if;

  -- Only data actually consumed by a legacy surface must satisfy its legacy
  -- identity requirements. Unmapped zones are never rejected here.
  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where placement_row.placement_type in (
      'opening', 'faixa', 'video_highlight'
    )
      and nullif(pg_catalog.btrim(bank_row.link_url), '') is null
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where placement_row.placement_type = 'selection'
      and (
        nullif(pg_catalog.btrim(bank_row.source_type), '') is null
        or nullif(pg_catalog.btrim(bank_row.source_id), '') is null
      )
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on projection_row.matchday_id = p_matchday_id
     and projection_row.zone_id = placement_row.zone_id
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where placement_row.placement_type = 'zone'
      and (
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) <>
          'editorial_article'
        or nullif(pg_catalog.btrim(bank_row.source_id), '') is null
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-downstream-input-invalid';
  end if;

  -- Before-images used to preserve event clocks and block timestamps.
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'bank_item_id', placement_row.bank_item_id,
        'created_at', placement_row.created_at
      ) order by placement_row.bank_item_id
    ),
    '[]'::jsonb
  )
  into v_faixa_before
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
    and placement_row.placement_type = 'faixa';

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(block_row) order by block_row.id),
    '[]'::jsonb
  )
  into v_blocks_before
  from public.matchday_live_layout_blocks as block_row
  where block_row.matchday_id = p_matchday_id;

  select pg_catalog.md5(coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', bank_row.id,
        'automatic_eligible', bank_row.automatic_eligible,
        'classification_key', bank_row.classification_key,
        'classification_source', bank_row.classification_source,
        'classified_at', bank_row.classified_at
      ) order by bank_row.id
    ),
    '[]'::jsonb
  )::text)
  into v_classification_before
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_matchday_id;

  if exists (
    select 1
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id = p_matchday_id
      and block_row.sort_order > 1000000000
  ) then
    raise exception
      'matchday-live-layout-physical-v20-current-block-order-invalid';
  end if;

  -- FIRST DML. Every topology, displacement and classification validation is
  -- complete; any later error rolls the whole function statement back.
  insert into jornada_private.matchday_live_layout_physical_cutovers (
    matchday_id,
    profile_key
  ) values (
    p_matchday_id,
    p_profile_key
  )
  on conflict (matchday_id) do nothing;

  insert into public.matchday_live_layout_workspace_settings as settings_row (
    matchday_id,
    faixa_slot_count,
    headline_title_color,
    latest_zone_placement,
    latest_zone_title,
    video_module_active
  ) values (
    p_matchday_id,
    p_faixa_slot_count,
    case
      when pg_catalog.jsonb_typeof(
        p_presentation -> 'headline_title_color'
      ) = 'null' then null
      else pg_catalog.upper(pg_catalog.btrim(
        p_presentation ->> 'headline_title_color'
      ))
    end,
    p_presentation ->> 'latest_zone_placement',
    pg_catalog.btrim(p_presentation ->> 'latest_zone_title'),
    (p_presentation ->> 'video_module_active')::boolean
  )
  on conflict (matchday_id) do update
  set faixa_slot_count = excluded.faixa_slot_count,
      headline_title_color = excluded.headline_title_color,
      latest_zone_placement = excluded.latest_zone_placement,
      latest_zone_title = excluded.latest_zone_title,
      video_module_active = excluded.video_module_active,
      updated_at = pg_catalog.statement_timestamp()
  where (
    settings_row.faixa_slot_count,
    settings_row.headline_title_color,
    settings_row.latest_zone_placement,
    settings_row.latest_zone_title,
    settings_row.video_module_active
  ) is distinct from (
    excluded.faixa_slot_count,
    excluded.headline_title_color,
    excluded.latest_zone_placement,
    excluded.latest_zone_title,
    excluded.video_module_active
  );

  insert into public.matchday_live_layout_zones (
    id,
    matchday_id,
    public_title,
    visual_family
  )
  select
    desired_row.zone_id,
    p_matchday_id,
    desired_row.public_title,
    desired_row.visual_family
  from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
    as desired_row
  where not exists (
    select 1
    from public.matchday_live_layout_zones as current_row
    where current_row.id = desired_row.zone_id
  )
  order by desired_row.zone_id;

  update public.matchday_live_layout_zones as zone_row
  set public_title = desired_row.public_title,
      visual_family = desired_row.visual_family,
      updated_at = pg_catalog.statement_timestamp()
  from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
    as desired_row
  where zone_row.matchday_id = p_matchday_id
    and zone_row.id = desired_row.zone_id
    and (
      zone_row.public_title,
      zone_row.visual_family
    ) is distinct from (
      desired_row.public_title,
      desired_row.visual_family
    );

  -- Remove deleted-zone placements explicitly before their FK cascade. This
  -- makes displacement observable and keeps delete semantics independent of
  -- ON DELETE behavior.
  delete from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
    and placement_row.placement_type = 'zone'
    and not exists (
      select 1
      from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
        as desired_zone
      where desired_zone.zone_id = placement_row.zone_id
    );

  -- All existing block rows first move into a collision-free range. Exact
  -- final orders are then assigned while original clocks remain available in
  -- v_blocks_before.
  if exists (
    with desired as materialized (
      select
        desired_row.block_id as id,
        desired_row.block_type,
        desired_row.zone_id,
        desired_row.sort_order
      from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
        as desired_row
    ),
    current_state as materialized (
      select block_row.id, block_row.block_type, block_row.zone_id,
             block_row.sort_order
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id = p_matchday_id
    ),
    differences as (
      (select * from current_state except select * from desired)
      union all
      (select * from desired except select * from current_state)
    )
    select 1 from differences
  ) then
    update public.matchday_live_layout_blocks as block_row
    set sort_order = block_row.sort_order + v_block_offset
    where block_row.matchday_id = p_matchday_id;

    delete from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id = p_matchday_id
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
          as desired_row
        where desired_row.block_id = block_row.id
      );

    insert into public.matchday_live_layout_blocks (
      id,
      matchday_id,
      block_type,
      zone_id,
      sort_order
    )
    select
      desired_row.block_id,
      p_matchday_id,
      desired_row.block_type,
      desired_row.zone_id,
      desired_row.sort_order
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as desired_row
    where not exists (
      select 1
      from public.matchday_live_layout_blocks as current_row
      where current_row.id = desired_row.block_id
    )
    order by desired_row.sort_order, desired_row.block_id;

    with previous as materialized (
      select previous_row.id, previous_row.sort_order
      from pg_catalog.jsonb_to_recordset(v_blocks_before) as previous_row(
        id uuid,
        matchday_id uuid,
        block_type text,
        zone_id uuid,
        sort_order integer,
        created_at timestamptz,
        updated_at timestamptz
      )
    )
    update public.matchday_live_layout_blocks as block_row
    set sort_order = desired_row.sort_order,
        updated_at = case
          when previous.sort_order is distinct from desired_row.sort_order
            then pg_catalog.statement_timestamp()
          else block_row.updated_at
        end
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as desired_row
    left join previous on previous.id = desired_row.block_id
    where block_row.matchday_id = p_matchday_id
      and block_row.id = desired_row.block_id;
  end if;

  delete from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id = p_matchday_id
    and not exists (
      select 1
      from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
        as desired_row
      where desired_row.zone_id = zone_row.id
    );

  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    p_matchday_id
  );

  begin
    delete from public.matchday_editorial_profile_manual_overrides
      as override_row
    where override_row.matchday_id = p_matchday_id
      and override_row.profile_key = p_profile_key
      and (
        override_row.placement_target is distinct from 'bank'
        or not exists (
          select 1
          from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
            p_explicit_bank_item_ids
          ) as explicit_row
          join public.matchday_editorial_bank_items as bank_row
            on bank_row.id = explicit_row.bank_item_id
           and bank_row.matchday_id = p_matchday_id
          where pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
                pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
            and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
                pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
        )
      );

    update public.matchday_editorial_profile_manual_overrides as override_row
    set placement_target = 'bank',
        zone_key = null,
        sort_order = null,
        updated_at = pg_catalog.statement_timestamp()
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as explicit_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = explicit_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where override_row.matchday_id = p_matchday_id
      and override_row.profile_key = p_profile_key
      and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
          pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
      and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
          pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
      and (
        override_row.placement_target is distinct from 'bank'
        or override_row.zone_key is not null
        or override_row.sort_order is not null
      );

    insert into public.matchday_editorial_profile_manual_overrides (
      matchday_id,
      profile_key,
      source_type,
      source_id,
      placement_target,
      zone_key,
      sort_order
    )
    select
      p_matchday_id,
      p_profile_key,
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)),
      'bank',
      null,
      null
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as explicit_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = explicit_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where not exists (
      select 1
      from public.matchday_editorial_profile_manual_overrides as override_row
      where override_row.matchday_id = p_matchday_id
        and override_row.profile_key = p_profile_key
        and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
            pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
        and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
            pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
    )
    order by explicit_row.operation_order;

    with desired as materialized (
      select *
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_placements
      )
    ),
    clear_operations as (
      select
        0 as phase,
        current_row.placement_type,
        current_row.zone_id,
        current_row.slot_position,
        current_row.bank_item_id,
        pg_catalog.jsonb_build_object(
          'action', 'clear',
          'bank_item_id', null,
          'placement_type', current_row.placement_type,
          'zone_id', current_row.zone_id,
          'slot_position', current_row.slot_position
        ) as payload
      from public.matchday_live_layout_placements as current_row
      where current_row.matchday_id = p_matchday_id
        and not exists (
          select 1
          from desired as desired_row
          where desired_row.bank_item_id = current_row.bank_item_id
            and desired_row.placement_type = current_row.placement_type
            and desired_row.zone_id is not distinct from current_row.zone_id
            and desired_row.slot_position = current_row.slot_position
        )
        and not exists (
          select 1
          from desired as desired_row
          where desired_row.bank_item_id = current_row.bank_item_id
        )
        and not exists (
          select 1
          from desired as desired_row
          where desired_row.placement_type = current_row.placement_type
            and desired_row.zone_id is not distinct from current_row.zone_id
            and desired_row.slot_position = current_row.slot_position
        )
    ),
    place_operations as (
      select
        1 as phase,
        desired_row.placement_type,
        desired_row.zone_id,
        desired_row.slot_position,
        desired_row.bank_item_id,
        pg_catalog.jsonb_build_object(
          'action', 'place',
          'bank_item_id', desired_row.bank_item_id,
          'placement_type', desired_row.placement_type,
          'zone_id', desired_row.zone_id,
          'slot_position', desired_row.slot_position
        ) as payload
      from desired as desired_row
      where not exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = p_matchday_id
          and current_row.bank_item_id = desired_row.bank_item_id
          and current_row.placement_type = desired_row.placement_type
          and current_row.zone_id is not distinct from desired_row.zone_id
          and current_row.slot_position = desired_row.slot_position
      )
    ),
    operations as (
      select * from clear_operations
      union all
      select * from place_operations
    )
    select coalesce(
      pg_catalog.jsonb_agg(
        operation_row.payload
        order by
          operation_row.phase,
          operation_row.placement_type,
          operation_row.zone_id nulls first,
          operation_row.slot_position,
          operation_row.bank_item_id
      ),
      '[]'::jsonb
    )
    into v_plan
    from operations as operation_row;

    perform jornada_private.apply_matchday_live_layout_placement_plan(
      p_matchday_id,
      v_plan,
      false
    );

    -- Re-entry into Faixa preserves its prior clock unless explicitly marked
    -- as a new arrival.
    with previous as materialized (
      select previous_row.bank_item_id, previous_row.created_at
      from pg_catalog.jsonb_to_recordset(v_faixa_before) as previous_row(
        bank_item_id uuid,
        created_at timestamptz
      )
    )
    update public.matchday_live_layout_placements as placement_row
    set created_at = previous.created_at
    from previous
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'faixa'
      and placement_row.bank_item_id = previous.bank_item_id
      and placement_row.created_at is distinct from previous.created_at
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_faixa_arrival_bank_item_ids
        ) as arrival_row
        where arrival_row.bank_item_id = placement_row.bank_item_id
      );

    v_faixa_anchor := pg_catalog.clock_timestamp();

    update public.matchday_live_layout_placements as placement_row
    set created_at = v_faixa_anchor
        - ((arrival_row.operation_order - 1) * interval '1 microsecond')
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_faixa_arrival_bank_item_ids
    ) as arrival_row
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'faixa'
      and placement_row.bank_item_id = arrival_row.bank_item_id;

    delete from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id = p_matchday_id
      and (
        exists (
          select 1
          from public.matchday_live_layout_placements as placement_row
          where placement_row.matchday_id = p_matchday_id
            and placement_row.bank_item_id = memory_row.bank_item_id
        )
        or exists (
          select 1
          from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
            p_explicit_bank_item_ids
          ) as explicit_row
          where explicit_row.bank_item_id = memory_row.bank_item_id
        )
        or (
          memory_row.memory_kind = 'displaced'
          and not exists (
            select 1
            from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
              p_displaced_bank_item_ids
            ) as displaced_row
            where displaced_row.bank_item_id = memory_row.bank_item_id
          )
        )
      );

    insert into public.matchday_live_layout_bank_item_state_memory
      as memory_row (
        matchday_id,
        bank_item_id,
        memory_kind,
        recorded_at
      )
    select
      p_matchday_id,
      displaced_row.bank_item_id,
      'displaced',
      pg_catalog.statement_timestamp()
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_bank_item_ids
    ) as displaced_row
    on conflict (matchday_id, bank_item_id)
    do update
    set memory_kind = 'displaced',
        recorded_at = excluded.recorded_at
    where memory_row.memory_kind is distinct from 'displaced';

    v_displaced_anchor := pg_catalog.clock_timestamp();

    update public.matchday_live_layout_bank_item_state_memory as memory_row
    set memory_kind = 'displaced',
        recorded_at = v_displaced_anchor
          - ((arrival_row.operation_order - 1) * interval '1 microsecond')
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_arrival_bank_item_ids
    ) as arrival_row
    where memory_row.matchday_id = p_matchday_id
      and memory_row.bank_item_id = arrival_row.bank_item_id;

    update public.matchday_editorial_bank_items as bank_row
    set editorially_worked_at = pg_catalog.statement_timestamp()
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_worked_bank_item_ids
    ) as worked_row
    where bank_row.matchday_id = p_matchday_id
      and bank_row.id = worked_row.bank_item_id
      and bank_row.editorially_worked_at is null;

    perform
      jornada_private.project_matchday_live_layout_workspace_best_effort_v20(
        p_matchday_id,
        p_profile_key
      );
  exception when others then
    perform jornada_private.end_matchday_live_layout_downstream_v14(
      p_matchday_id
    );
    raise;
  end;

  perform jornada_private.end_matchday_live_layout_downstream_v14(
    p_matchday_id
  );

  -- Exact physical postconditions. Empty zones and missing slot positions are
  -- valid occupancy, so only persisted rows participate.
  if exists (
    with desired as materialized (
      select desired_row.zone_id as id, desired_row.public_title,
             desired_row.visual_family
      from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
        as desired_row
    ),
    current_state as materialized (
      select zone_row.id, zone_row.public_title, zone_row.visual_family
      from public.matchday_live_layout_zones as zone_row
      where zone_row.matchday_id = p_matchday_id
    ),
    differences as (
      (select * from current_state except select * from desired)
      union all
      (select * from desired except select * from current_state)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-physical-v20-zone-postcondition';
  end if;

  if exists (
    with desired as materialized (
      select desired_row.block_id as id, desired_row.block_type,
             desired_row.zone_id, desired_row.sort_order
      from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
        as desired_row
    ),
    current_state as materialized (
      select block_row.id, block_row.block_type, block_row.zone_id,
             block_row.sort_order
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id = p_matchday_id
    ),
    differences as (
      (select * from current_state except select * from desired)
      union all
      (select * from desired except select * from current_state)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-physical-v20-block-postcondition';
  end if;

  if exists (
    with desired as materialized (
      select placement_row.bank_item_id, placement_row.placement_type,
             placement_row.zone_id, placement_row.slot_position
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_placements
      ) as placement_row
    ),
    current_state as materialized (
      select placement_row.bank_item_id, placement_row.placement_type,
             placement_row.zone_id, placement_row.slot_position
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
    ),
    differences as (
      (select * from current_state except select * from desired)
      union all
      (select * from desired except select * from current_state)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-physical-v20-placement-postcondition';
  end if;

  if not exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = p_matchday_id
      and settings_row.faixa_slot_count = p_faixa_slot_count
      and settings_row.headline_title_color is not distinct from case
        when pg_catalog.jsonb_typeof(
          p_presentation -> 'headline_title_color'
        ) = 'null' then null
        else pg_catalog.upper(pg_catalog.btrim(
          p_presentation ->> 'headline_title_color'
        ))
      end
      and settings_row.latest_zone_placement =
          p_presentation ->> 'latest_zone_placement'
      and settings_row.latest_zone_title =
          pg_catalog.btrim(p_presentation ->> 'latest_zone_title')
      and settings_row.video_module_active =
          (p_presentation ->> 'video_module_active')::boolean
  ) then
    raise exception 'matchday-live-layout-physical-v20-settings-postcondition';
  end if;

  if exists (
    with desired as materialized (
      select displaced_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_displaced_bank_item_ids
      ) as displaced_row
    ),
    current_state as materialized (
      select memory_row.bank_item_id
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id = p_matchday_id
        and memory_row.memory_kind = 'displaced'
    ),
    differences as (
      (select * from current_state except select * from desired)
      union all
      (select * from desired except select * from current_state)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-physical-v20-displaced-postcondition';
  end if;

  if exists (
    with desired as materialized (
      select explicit_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_explicit_bank_item_ids
      ) as explicit_row
    ),
    current_state as materialized (
      select bank_row.id as bank_item_id
      from public.matchday_editorial_profile_manual_overrides as override_row
      join public.matchday_editorial_bank_items as bank_row
        on bank_row.matchday_id = p_matchday_id
       and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
           pg_catalog.lower(pg_catalog.btrim(override_row.source_type))
       and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
           pg_catalog.lower(pg_catalog.btrim(override_row.source_id))
      where override_row.matchday_id = p_matchday_id
        and override_row.profile_key = p_profile_key
        and override_row.placement_target = 'bank'
    ),
    differences as (
      (select * from current_state except select * from desired)
      union all
      (select * from desired except select * from current_state)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-physical-v20-bank-postcondition';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    left join public.matchday_live_layout_zones as zone_row
      on zone_row.id = placement_row.zone_id
     and zone_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'zone'
      and (
        zone_row.id is null
        or placement_row.slot_position >
           jornada_private.matchday_live_layout_layout_capacity_v20(
             zone_row.visual_family
           )
      )
  ) then
    raise exception 'matchday-live-layout-physical-v20-capacity-postcondition';
  end if;

  if v_classification_before is distinct from (
    select pg_catalog.md5(coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', bank_row.id,
          'automatic_eligible', bank_row.automatic_eligible,
          'classification_key', bank_row.classification_key,
          'classification_source', bank_row.classification_source,
          'classified_at', bank_row.classified_at
        ) order by bank_row.id
      ),
      '[]'::jsonb
    )::text)
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_matchday_id
  ) then
    raise exception 'matchday-live-layout-physical-v20-classification-changed';
  end if;

  perform jornada_private.assert_matchday_live_layout_downstream_v14(
    p_matchday_id,
    p_profile_key
  );

  perform
    jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
      p_matchday_id,
      p_profile_key
    );

  select token_row.state_token
  into v_final_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  return query
  select
    v_final_state_token,
    pg_catalog.jsonb_array_length(p_zones),
    pg_catalog.jsonb_array_length(p_blocks),
    pg_catalog.jsonb_array_length(p_placements),
    pg_catalog.jsonb_array_length(p_explicit_bank_item_ids),
    pg_catalog.jsonb_array_length(p_displaced_bank_item_ids),
    pg_catalog.jsonb_array_length(p_worked_bank_item_ids);
end;
$function$;

commit;
