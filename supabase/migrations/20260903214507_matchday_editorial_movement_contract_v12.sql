begin;

-- LOTE 7C2
-- Movement semantics are explicit editorial decisions:
-- same-surface Zone/Abertura/Faixa can swap; cross-surface replacement
-- displaces only the target; Faixa top-entry is continuous and does not
-- displace. This wrapper also preserves the event clocks used by Tracking.

create function public.apply_matchday_editorial_profile_workspace_v12(
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
  p_displaced_bank_item_ids jsonb,
  p_faixa_arrival_bank_item_ids jsonb,
  p_displaced_arrival_bank_item_ids jsonb
)
returns table (
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
  v_faixa_before jsonb := '[]'::jsonb;
  v_faixa_anchor timestamptz;
  v_displaced_anchor timestamptz;
  v_final_state_token text;
begin
  if p_matchday_id is null
    or p_displaced_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_displaced_bank_item_ids) <> 'array'
    or p_faixa_arrival_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_faixa_arrival_bank_item_ids) <> 'array'
    or p_displaced_arrival_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_displaced_arrival_bank_item_ids) <> 'array'
  then
    raise exception
      'matchday-editorial-profile-workspace-v12-invalid-input';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
      as raw_row(value)
    where pg_catalog.jsonb_typeof(raw_row.value) <> 'string'
      or (raw_row.value #>> '{}')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_faixa_arrival_bank_item_ids)
      as raw_row(value)
    where pg_catalog.jsonb_typeof(raw_row.value) <> 'string'
      or (raw_row.value #>> '{}')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_displaced_arrival_bank_item_ids)
      as raw_row(value)
    where pg_catalog.jsonb_typeof(raw_row.value) <> 'string'
      or (raw_row.value #>> '{}')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v12-invalid-events';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
  ) <> (
    select pg_catalog.count(distinct pg_catalog.lower(
      pg_catalog.btrim(raw_row.value #>> '{}')
    ))
    from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
      as raw_row(value)
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_array_elements(p_faixa_arrival_bank_item_ids)
  ) <> (
    select pg_catalog.count(distinct pg_catalog.lower(
      pg_catalog.btrim(raw_row.value #>> '{}')
    ))
    from pg_catalog.jsonb_array_elements(p_faixa_arrival_bank_item_ids)
      as raw_row(value)
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_array_elements(p_displaced_arrival_bank_item_ids)
  ) <> (
    select pg_catalog.count(distinct pg_catalog.lower(
      pg_catalog.btrim(raw_row.value #>> '{}')
    ))
    from pg_catalog.jsonb_array_elements(p_displaced_arrival_bank_item_ids)
      as raw_row(value)
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v12-duplicate-events';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_displaced_arrival_bank_item_ids)
      as arrival_row(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
        as displaced_row(value)
      where pg_catalog.lower(pg_catalog.btrim(
              displaced_row.value #>> '{}'
            )) =
            pg_catalog.lower(pg_catalog.btrim(
              arrival_row.value #>> '{}'
            ))
    )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v12-displaced-event-not-final';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_faixa_arrival_bank_item_ids)
      as faixa_row(value)
    join pg_catalog.jsonb_array_elements(p_displaced_arrival_bank_item_ids)
      as displaced_row(value)
      on pg_catalog.lower(pg_catalog.btrim(
           faixa_row.value #>> '{}'
         )) =
         pg_catalog.lower(pg_catalog.btrim(
           displaced_row.value #>> '{}'
         ))
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v12-event-conflict';
  end if;

  perform
    jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  if exists (
    with requested as (
      select pg_catalog.lower(pg_catalog.btrim(
               raw_row.value #>> '{}'
             )) as bank_item_id
      from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
        as raw_row(value)

      union

      select pg_catalog.lower(pg_catalog.btrim(
               raw_row.value #>> '{}'
             ))
      from pg_catalog.jsonb_array_elements(p_faixa_arrival_bank_item_ids)
        as raw_row(value)

      union

      select pg_catalog.lower(pg_catalog.btrim(
               raw_row.value #>> '{}'
             ))
      from pg_catalog.jsonb_array_elements(p_displaced_arrival_bank_item_ids)
        as raw_row(value)
    )
    select 1
    from requested as requested_row
    left join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = p_matchday_id
     and bank_row.id::text = requested_row.bank_item_id
     and pg_catalog.lower(
           pg_catalog.btrim(coalesce(bank_row.status, ''))
         ) = 'active'
    where bank_row.id is null
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v12-event-source-not-active';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'bank_item_id', placement_row.bank_item_id,
        'created_at', placement_row.created_at
      )
      order by placement_row.bank_item_id
    ),
    '[]'::jsonb
  )
  into v_faixa_before
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
    and placement_row.placement_type = 'faixa';

  select *
  into v_apply
  from jornada_private.apply_matchday_editorial_profile_workspace_v11_pre_handoff(
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
    p_worked_source_ids,
    p_authoritative_zone_items,
    p_authoritative_faixa_items,
    '[]'::jsonb
  );

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
        from public.matchday_editorial_profile_manual_overrides
          as override_row
        where override_row.matchday_id = p_matchday_id
          and override_row.profile_key = p_profile_key
          and override_row.placement_target = 'bank'
          and pg_catalog.lower(
                pg_catalog.btrim(override_row.source_type)
              ) = pg_catalog.lower(
                pg_catalog.btrim(bank_row.source_type)
              )
          and pg_catalog.lower(
                pg_catalog.btrim(override_row.source_id)
              ) = pg_catalog.lower(
                pg_catalog.btrim(bank_row.source_id)
              )
      )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v12-displaced-placement-conflict';
  end if;

  insert into public.matchday_live_layout_bank_item_state_memory
    as memory_row (
      matchday_id,
      bank_item_id,
      memory_kind,
      recorded_at
    )
  select
    p_matchday_id,
    pg_catalog.lower(
      pg_catalog.btrim(displaced_row.value #>> '{}')
    )::uuid,
    'displaced',
    pg_catalog.statement_timestamp()
  from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
    as displaced_row(value)
  on conflict (matchday_id, bank_item_id)
  do update
  set memory_kind = 'displaced',
      recorded_at = coalesce(
        case
          when memory_row.memory_kind = 'displaced'
            then memory_row.recorded_at
        end,
        excluded.recorded_at
      );

  with previous as materialized (
    select
      (raw_row.value ->> 'bank_item_id')::uuid as bank_item_id,
      (raw_row.value ->> 'created_at')::timestamptz as created_at
    from pg_catalog.jsonb_array_elements(v_faixa_before)
      as raw_row(value)
  )
  update public.matchday_live_layout_placements as placement_row
  set created_at = previous.created_at
  from previous
  where placement_row.matchday_id = p_matchday_id
    and placement_row.placement_type = 'faixa'
    and placement_row.bank_item_id = previous.bank_item_id
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_faixa_arrival_bank_item_ids)
        as arrival_row(value)
      where pg_catalog.lower(pg_catalog.btrim(
              arrival_row.value #>> '{}'
            )) = placement_row.bank_item_id::text
    );

  v_faixa_anchor := pg_catalog.clock_timestamp();

  with arrivals as materialized (
    select
      pg_catalog.lower(pg_catalog.btrim(
        raw_row.value #>> '{}'
      ))::uuid as bank_item_id,
      raw_row.ordinality
    from pg_catalog.jsonb_array_elements(
      p_faixa_arrival_bank_item_ids
    ) with ordinality as raw_row(value, ordinality)
  )
  update public.matchday_live_layout_placements as placement_row
  set created_at =
      v_faixa_anchor
      - ((arrivals.ordinality - 1) * interval '1 microsecond')
  from arrivals
  where placement_row.matchday_id = p_matchday_id
    and placement_row.placement_type = 'faixa'
    and placement_row.bank_item_id = arrivals.bank_item_id;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_faixa_arrival_bank_item_ids)
      as arrival_row(value)
    where not exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
        and placement_row.placement_type = 'faixa'
        and placement_row.bank_item_id =
          pg_catalog.lower(pg_catalog.btrim(
            arrival_row.value #>> '{}'
          ))::uuid
    )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v12-faixa-event-not-final';
  end if;

  if exists (
    select 1
    from (
      select
        pg_catalog.count(*) as item_count,
        pg_catalog.min(placement_row.slot_position) as min_position,
        pg_catalog.max(placement_row.slot_position) as max_position
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
        and placement_row.placement_type = 'faixa'
    ) as faixa_state
    where faixa_state.item_count > 0
      and (
        faixa_state.min_position <> 1
        or faixa_state.max_position <> faixa_state.item_count
      )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v12-faixa-not-contiguous';
  end if;

  v_displaced_anchor := pg_catalog.clock_timestamp();

  with arrivals as materialized (
    select
      pg_catalog.lower(pg_catalog.btrim(
        raw_row.value #>> '{}'
      ))::uuid as bank_item_id,
      raw_row.ordinality
    from pg_catalog.jsonb_array_elements(
      p_displaced_arrival_bank_item_ids
    ) with ordinality as raw_row(value, ordinality)
  )
  update public.matchday_live_layout_bank_item_state_memory as memory_row
  set memory_kind = 'displaced',
      recorded_at =
        v_displaced_anchor
        - ((arrivals.ordinality - 1) * interval '1 microsecond')
  from arrivals
  where memory_row.matchday_id = p_matchday_id
    and memory_row.bank_item_id = arrivals.bank_item_id;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_displaced_bank_item_ids)
      as displaced_row(value)
    where not exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory
        as memory_row
      where memory_row.matchday_id = p_matchday_id
        and memory_row.bank_item_id =
          pg_catalog.lower(pg_catalog.btrim(
            displaced_row.value #>> '{}'
          ))::uuid
        and memory_row.memory_kind = 'displaced'
    )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v12-displaced-memory-incomplete';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    join public.matchday_live_layout_placements as placement_row
      on placement_row.matchday_id = memory_row.matchday_id
     and placement_row.bank_item_id = memory_row.bank_item_id
    where memory_row.matchday_id = p_matchday_id
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v12-memory-placement-conflict';
  end if;

  select token_row.state_token
  into v_final_state_token
  from public.matchday_editorial_profile_workspace_token_uncached(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  return query
  select
    v_apply.revision,
    v_final_state_token,
    v_apply.applied_override_count,
    v_apply.applied_zone_item_count,
    v_apply.applied_faixa_count,
    v_apply.applied_opening_count,
    v_apply.applied_selection_count;
end;
$function$;

revoke all on function
  public.apply_matchday_editorial_profile_workspace_v12(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
    jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.apply_matchday_editorial_profile_workspace_v12(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
    jsonb,jsonb,jsonb,jsonb,jsonb
  )
to service_role;

comment on function
  public.apply_matchday_editorial_profile_workspace_v12(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
    jsonb,jsonb,jsonb,jsonb,jsonb
  )
is
  'Serializes movement Apply against handoff, delegates the v11 authoritative placement contract, keeps Faixa continuous, preserves prior Faixa arrival clocks on reordering, and records explicit newest-first Faixa/Desalojadas arrivals.';

notify pgrst, 'reload schema';

commit;
