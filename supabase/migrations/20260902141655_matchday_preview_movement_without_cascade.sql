begin;

-- V10 still owns the compatibility write and its historical completeness
-- guards. V11 adds the explicit authoritative preview as a final step in the
-- same transaction. The placement core then projects that exact result back
-- to compatibility, so no swap, cascade or classification-based destination
-- can survive the Apply boundary.
create function public.apply_matchday_editorial_profile_workspace_v11(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb,
  p_opening jsonb,
  p_page_controls jsonb,
  p_selection_bank_item_ids jsonb,
  p_video_module jsonb,
  p_worked_source_ids jsonb,
  p_authoritative_zone_items jsonb,
  p_authoritative_faixa_items jsonb,
  p_displaced_bank_item_ids jsonb
)
returns table(
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer,
  applied_opening_count integer,
  applied_selection_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_apply record;
  v_plan jsonb;
  v_desired jsonb;
  v_final_state_token text;
begin
  if p_matchday_id is null
    or p_authoritative_zone_items is null
    or pg_catalog.jsonb_typeof(p_authoritative_zone_items) <> 'array'
    or p_authoritative_faixa_items is null
    or pg_catalog.jsonb_typeof(p_authoritative_faixa_items) <> 'array'
    or p_displaced_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_displaced_bank_item_ids) <> 'array'
  then
    raise exception
      'matchday-editorial-profile-workspace-v11-invalid-input';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_authoritative_zone_items)
      as zone_row(value)
    where pg_catalog.jsonb_typeof(zone_row.value) <> 'object'
      or nullif(pg_catalog.btrim(zone_row.value ->> 'source_type'), '') is null
      or nullif(pg_catalog.btrim(zone_row.value ->> 'source_id'), '') is null
      or nullif(pg_catalog.btrim(zone_row.value ->> 'zone_key'), '') is null
      or pg_catalog.jsonb_typeof(zone_row.value -> 'sort_order') <> 'number'
      or (zone_row.value ->> 'sort_order') !~ '^[1-9][0-9]*$'
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_authoritative_faixa_items)
      as faixa_row(value)
    where pg_catalog.jsonb_typeof(faixa_row.value) <> 'object'
      or nullif(pg_catalog.btrim(faixa_row.value ->> 'source_type'), '') is null
      or nullif(pg_catalog.btrim(faixa_row.value ->> 'source_id'), '') is null
      or pg_catalog.jsonb_typeof(faixa_row.value -> 'sort_order') <> 'number'
      or (faixa_row.value ->> 'sort_order') !~ '^[1-9][0-9]*$'
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
      as displaced_row(value)
    where pg_catalog.jsonb_typeof(displaced_row.value) <> 'string'
      or (displaced_row.value #>> '{}')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v11-invalid-authoritative-plan';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
  ) <> (
    select pg_catalog.count(distinct pg_catalog.lower(
      pg_catalog.btrim(displaced_row.value #>> '{}')
    ))
    from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
      as displaced_row(value)
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v11-duplicate-displaced-source';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
      as displaced_row(value)
    left join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = p_matchday_id
     and bank_row.id::text = pg_catalog.lower(
       pg_catalog.btrim(displaced_row.value #>> '{}')
     )
     and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
    where bank_row.id is null
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v11-displaced-source-not-active';
  end if;

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v10(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    p_page_controls,
    p_selection_bank_item_ids,
    p_video_module,
    p_worked_source_ids
  );

  if exists (
    with requested_sources as materialized (
      select
        'editorial_article'::text as source_type,
        pg_catalog.lower(pg_catalog.btrim(opening_row.value #>> '{}'))
          as source_id,
        'opening'::text as placement_type,
        null::text as zone_key,
        case opening_row.slot_key
          when 'headline' then 1
          when 'highlight_1' then 2
          when 'highlight_2' then 3
          when 'highlight_3' then 4
          when 'context' then 5
          else null
        end as slot_position
      from pg_catalog.jsonb_each(p_opening) as opening_row(slot_key, value)
      where pg_catalog.jsonb_typeof(opening_row.value) = 'string'

      union all

      select
        pg_catalog.lower(pg_catalog.btrim(zone_row.value ->> 'source_type')),
        pg_catalog.lower(pg_catalog.btrim(zone_row.value ->> 'source_id')),
        'zone',
        pg_catalog.lower(pg_catalog.btrim(zone_row.value ->> 'zone_key')),
        (zone_row.value ->> 'sort_order')::integer
      from pg_catalog.jsonb_array_elements(p_authoritative_zone_items)
        as zone_row(value)

      union all

      select
        pg_catalog.lower(pg_catalog.btrim(faixa_row.value ->> 'source_type')),
        pg_catalog.lower(pg_catalog.btrim(faixa_row.value ->> 'source_id')),
        'faixa',
        null::text,
        (faixa_row.value ->> 'sort_order')::integer
      from pg_catalog.jsonb_array_elements(p_authoritative_faixa_items)
        as faixa_row(value)
    )
    select 1
    from requested_sources as requested
    left join lateral (
      select pg_catalog.count(*) as candidate_count
      from public.matchday_editorial_bank_items as bank_row
      where bank_row.matchday_id = p_matchday_id
        and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
          requested.source_type
        and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
          requested.source_id
    ) as candidate on true
    where requested.slot_position is null
      or candidate.candidate_count <> 1
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v11-bank-resolution-failed';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_authoritative_zone_items)
      as zone_row(value)
    left join lateral (
      select pg_catalog.count(*) as candidate_count
      from jornada_private.matchday_live_layout_zone_legacy_projection
        as projection_row
      where projection_row.matchday_id = p_matchday_id
        and projection_row.legacy_zone_key = pg_catalog.lower(
          pg_catalog.btrim(zone_row.value ->> 'zone_key')
        )
    ) as candidate on true
    where candidate.candidate_count <> 1
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v11-zone-resolution-failed';
  end if;

  with requested_sources as materialized (
    select
      'editorial_article'::text as source_type,
      pg_catalog.lower(pg_catalog.btrim(opening_row.value #>> '{}'))
        as source_id,
      'opening'::text as placement_type,
      null::text as zone_key,
      case opening_row.slot_key
        when 'headline' then 1
        when 'highlight_1' then 2
        when 'highlight_2' then 3
        when 'highlight_3' then 4
        when 'context' then 5
        else null
      end as slot_position
    from pg_catalog.jsonb_each(p_opening) as opening_row(slot_key, value)
    where pg_catalog.jsonb_typeof(opening_row.value) = 'string'

    union all

    select
      pg_catalog.lower(pg_catalog.btrim(zone_row.value ->> 'source_type')),
      pg_catalog.lower(pg_catalog.btrim(zone_row.value ->> 'source_id')),
      'zone',
      pg_catalog.lower(pg_catalog.btrim(zone_row.value ->> 'zone_key')),
      (zone_row.value ->> 'sort_order')::integer
    from pg_catalog.jsonb_array_elements(p_authoritative_zone_items)
      as zone_row(value)

    union all

    select
      pg_catalog.lower(pg_catalog.btrim(faixa_row.value ->> 'source_type')),
      pg_catalog.lower(pg_catalog.btrim(faixa_row.value ->> 'source_id')),
      'faixa',
      null::text,
      (faixa_row.value ->> 'sort_order')::integer
    from pg_catalog.jsonb_array_elements(p_authoritative_faixa_items)
      as faixa_row(value)
  ),
  desired as materialized (
    select
      bank_row.id as bank_item_id,
      requested.placement_type,
      projection_row.zone_id,
      requested.slot_position
    from requested_sources as requested
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = p_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
       requested.source_type
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
       requested.source_id
    left join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on requested.placement_type = 'zone'
     and projection_row.matchday_id = p_matchday_id
     and projection_row.legacy_zone_key = requested.zone_key

    union all

    select
      placement_row.bank_item_id,
      placement_row.placement_type,
      placement_row.zone_id,
      placement_row.slot_position
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type in ('selection', 'video_highlight')
  ),
  operations as materialized (
    select
      1 as action_order,
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
      ) as operation
    from desired as desired_row
    where not exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
        and placement_row.bank_item_id = desired_row.bank_item_id
        and placement_row.placement_type = desired_row.placement_type
        and placement_row.zone_id is not distinct from desired_row.zone_id
        and placement_row.slot_position = desired_row.slot_position
    )

    union all

    select
      0,
      placement_row.placement_type,
      placement_row.zone_id,
      placement_row.slot_position,
      null::uuid,
      pg_catalog.jsonb_build_object(
        'action', 'clear',
        'bank_item_id', null,
        'placement_type', placement_row.placement_type,
        'zone_id', placement_row.zone_id,
        'slot_position', placement_row.slot_position
      )
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
      and not exists (
        select 1
        from desired as desired_row
        where desired_row.placement_type = placement_row.placement_type
          and desired_row.zone_id is not distinct from placement_row.zone_id
          and desired_row.slot_position = placement_row.slot_position
      )
      and not exists (
        select 1
        from desired as desired_row
        where desired_row.bank_item_id = placement_row.bank_item_id
      )
  )
  select
    coalesce((
      select pg_catalog.jsonb_agg(
        operation_row.operation
        order by
          operation_row.action_order,
          operation_row.placement_type,
          operation_row.zone_id nulls first,
          operation_row.slot_position,
          operation_row.bank_item_id nulls first
      )
      from operations as operation_row
    ), '[]'::jsonb),
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'bank_item_id', desired_row.bank_item_id,
        'placement_type', desired_row.placement_type,
        'zone_id', desired_row.zone_id,
        'slot_position', desired_row.slot_position
      ))
      from desired as desired_row
    ), '[]'::jsonb)
  into v_plan, v_desired;

  perform jornada_private.apply_matchday_live_layout_placement_plan(
    p_matchday_id,
    v_plan,
    true
  );

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_desired) as desired_row(value)
    where not exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
        and placement_row.bank_item_id =
          (desired_row.value ->> 'bank_item_id')::uuid
        and placement_row.placement_type =
          desired_row.value ->> 'placement_type'
        and placement_row.zone_id is not distinct from
          nullif(desired_row.value ->> 'zone_id', '')::uuid
        and placement_row.slot_position =
          (desired_row.value ->> 'slot_position')::integer
    )
  ) or exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_desired) as desired_row(value)
        where placement_row.bank_item_id =
            (desired_row.value ->> 'bank_item_id')::uuid
          and placement_row.placement_type =
            desired_row.value ->> 'placement_type'
          and placement_row.zone_id is not distinct from
            nullif(desired_row.value ->> 'zone_id', '')::uuid
          and placement_row.slot_position =
            (desired_row.value ->> 'slot_position')::integer
      )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v11-preview-postcondition-failed';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
      as displaced_row(value)
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = p_matchday_id
     and bank_row.id::text = pg_catalog.lower(
       pg_catalog.btrim(displaced_row.value #>> '{}')
     )
    where exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
        and placement_row.bank_item_id = bank_row.id
    )
      or exists (
        select 1
        from public.matchday_editorial_profile_manual_overrides as override_row
        where override_row.matchday_id = p_matchday_id
          and override_row.profile_key = p_profile_key
          and override_row.placement_target = 'bank'
          and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
            pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
          and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
            pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
      )
      or not exists (
        select 1
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = p_matchday_id
          and memory_row.bank_item_id = bank_row.id
          and memory_row.memory_kind = 'displaced'
      )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v11-displaced-postcondition-failed';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
    group by placement_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v11-transversal-conflict';
  end if;

  select token_row.state_token
  into v_final_state_token
  from public.matchday_editorial_profile_workspace_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  return query
  select
    v_apply.revision,
    v_final_state_token,
    pg_catalog.jsonb_array_length(p_overrides),
    pg_catalog.jsonb_array_length(p_authoritative_zone_items),
    pg_catalog.jsonb_array_length(p_authoritative_faixa_items),
    (
      select pg_catalog.count(*)::integer
      from pg_catalog.jsonb_each(p_opening) as opening_row(slot_key, value)
      where pg_catalog.jsonb_typeof(opening_row.value) = 'string'
    ),
    pg_catalog.jsonb_array_length(p_selection_bank_item_ids);
end;
$function$;

revoke all on function public.apply_matchday_editorial_profile_workspace_v11(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
  jsonb,jsonb,jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.apply_matchday_editorial_profile_workspace_v11(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
  jsonb,jsonb,jsonb
) to service_role;

comment on function public.apply_matchday_editorial_profile_workspace_v11(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
  jsonb,jsonb,jsonb
) is
  'Atomically preserves the v10 compatibility contract and then applies the exact authoritative no-swap/no-cascade preview, projecting it back to legacy compatibility.';

commit;
