begin;

-- LOTE 7E - PASSO 3
-- Native physical OCC and shadow writer. This contract is deliberately not
-- wired to the administrative route and does not update compatibility state.

create function
jornada_private.matchday_live_layout_visual_family_capacity_v13(
  p_visual_family text
)
returns integer
language sql
immutable
strict
security invoker
set search_path = ''
as $function$
  select case p_visual_family
    when 'six_news' then 6
    when 'five_news_balanced' then 5
    when 'five_news_secondary' then 5
    else null
  end;
$function$;

revoke all on function
  jornada_private.matchday_live_layout_visual_family_capacity_v13(text)
from public, anon, authenticated, service_role;


create function
jornada_private.normalize_matchday_live_layout_physical_placements_v13(
  p_placements jsonb
)
returns table (
  operation_order bigint,
  bank_item_id uuid,
  placement_type text,
  zone_id uuid,
  slot_position integer
)
language sql
immutable
security invoker
set search_path = ''
as $function$
  select
    raw_row.ordinality,
    case
      when pg_catalog.jsonb_typeof(raw_row.payload -> 'bank_item_id') = 'string'
       and pg_catalog.btrim(raw_row.payload ->> 'bank_item_id') ~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then pg_catalog.btrim(raw_row.payload ->> 'bank_item_id')::uuid
      else null
    end,
    pg_catalog.lower(pg_catalog.btrim(raw_row.payload ->> 'placement_type')),
    case
      when pg_catalog.jsonb_typeof(raw_row.payload -> 'zone_id') = 'string'
       and pg_catalog.btrim(raw_row.payload ->> 'zone_id') ~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then pg_catalog.btrim(raw_row.payload ->> 'zone_id')::uuid
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(raw_row.payload -> 'slot_position') = 'number'
       and raw_row.payload ->> 'slot_position' ~ '^[0-9]+$'
       and (raw_row.payload ->> 'slot_position')::numeric <= 2147483647
      then (raw_row.payload ->> 'slot_position')::integer
      else null
    end
  from pg_catalog.jsonb_array_elements(
    case
      when pg_catalog.jsonb_typeof(p_placements) = 'array' then p_placements
      else '[]'::jsonb
    end
  ) with ordinality as raw_row(payload, ordinality);
$function$;

revoke all on function
  jornada_private.normalize_matchday_live_layout_physical_placements_v13(jsonb)
from public, anon, authenticated, service_role;


create function
jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
  p_bank_item_ids jsonb
)
returns table (
  operation_order bigint,
  bank_item_id uuid
)
language sql
immutable
security invoker
set search_path = ''
as $function$
  select
    raw_row.ordinality,
    case
      when pg_catalog.jsonb_typeof(raw_row.value) = 'string'
       and pg_catalog.btrim(raw_row.value #>> '{}') ~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then pg_catalog.btrim(raw_row.value #>> '{}')::uuid
      else null
    end
  from pg_catalog.jsonb_array_elements(
    case
      when pg_catalog.jsonb_typeof(p_bank_item_ids) = 'array'
        then p_bank_item_ids
      else '[]'::jsonb
    end
  ) with ordinality as raw_row(value, ordinality);
$function$;

revoke all on function
  jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(jsonb)
from public, anon, authenticated, service_role;


create function public.matchday_editorial_profile_workspace_token_v13(
  p_matchday_id uuid,
  p_profile_key text
)
returns table(state_token text)
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'legacy_workspace', coalesce(
        (
          select legacy_row.state_token
          from public.matchday_editorial_profile_workspace_token_uncached(
            p_matchday_id,
            p_profile_key
          ) as legacy_row
        ),
        ''
      ),
      'bank', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', bank_row.id,
              'source_type', bank_row.source_type,
              'source_id', bank_row.source_id,
              'status', bank_row.status,
              'automatic_eligible', bank_row.automatic_eligible,
              'editorially_worked_at', bank_row.editorially_worked_at,
              'classification_key', bank_row.classification_key,
              'classification_source', bank_row.classification_source,
              'classified_at', bank_row.classified_at,
              'continuity_source_matchday_id',
                bank_row.continuity_source_matchday_id,
              'continuity_source_composition_id',
                bank_row.continuity_source_composition_id
            )
            order by bank_row.id
          )
          from public.matchday_editorial_bank_items as bank_row
          where bank_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'zones', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', zone_row.id,
              'public_title', zone_row.public_title,
              'visual_family', zone_row.visual_family
            )
            order by zone_row.id
          )
          from public.matchday_live_layout_zones as zone_row
          where zone_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'blocks', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', block_row.id,
              'block_type', block_row.block_type,
              'zone_id', block_row.zone_id,
              'sort_order', block_row.sort_order
            )
            order by block_row.sort_order, block_row.id
          )
          from public.matchday_live_layout_blocks as block_row
          where block_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'placements', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', placement_row.id,
              'bank_item_id', placement_row.bank_item_id,
              'placement_type', placement_row.placement_type,
              'zone_id', placement_row.zone_id,
              'slot_position', placement_row.slot_position,
              'created_at', placement_row.created_at,
              'updated_at', placement_row.updated_at
            )
            order by
              placement_row.placement_type,
              placement_row.zone_id nulls first,
              placement_row.slot_position,
              placement_row.bank_item_id,
              placement_row.id
          )
          from public.matchday_live_layout_placements as placement_row
          where placement_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'state_memory', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'bank_item_id', memory_row.bank_item_id,
              'memory_kind', memory_row.memory_kind,
              'recorded_at', memory_row.recorded_at
            )
            order by memory_row.bank_item_id
          )
          from public.matchday_live_layout_bank_item_state_memory
            as memory_row
          where memory_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      )
    )::text
  ) as state_token;
$function$;

revoke all on function
  public.matchday_editorial_profile_workspace_token_v13(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.matchday_editorial_profile_workspace_token_v13(uuid, text)
to service_role;

comment on function
  public.matchday_editorial_profile_workspace_token_v13(uuid, text)
is
  'Deterministic OCC token for the legacy workspace inputs plus authoritative physical zones, blocks, placements, Bank state and displaced memory.';


create function
jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_state_token text,
  p_authoritative_placements jsonb,
  p_explicit_bank_item_ids jsonb,
  p_displaced_bank_item_ids jsonb,
  p_worked_bank_item_ids jsonb,
  p_faixa_arrival_bank_item_ids jsonb,
  p_displaced_arrival_bank_item_ids jsonb
)
returns table (
  state_token text,
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
  v_placements_before jsonb := '[]'::jsonb;
  v_faixa_before jsonb := '[]'::jsonb;
  v_displaced_before jsonb := '[]'::jsonb;
  v_classification_before text;
  v_faixa_anchor timestamptz;
  v_displaced_anchor timestamptz;
begin
  if p_matchday_id is null
    or p_profile_key is null
    or pg_catalog.btrim(p_profile_key) = ''
    or p_expected_state_token is null
    or pg_catalog.btrim(p_expected_state_token) = ''
    or p_authoritative_placements is null
    or pg_catalog.jsonb_typeof(p_authoritative_placements) <> 'array'
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
  then
    raise exception 'matchday-live-layout-physical-v13-invalid-input';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_authoritative_placements)
      as raw_row(payload)
    where pg_catalog.jsonb_typeof(raw_row.payload) <> 'object'
  ) then
    raise exception 'matchday-live-layout-physical-v13-invalid-placement';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_authoritative_placements)
      as raw_row(payload)
    where (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_object_keys(raw_row.payload) as key_row(key_name)
    ) <> 4
      or not raw_row.payload ? 'bank_item_id'
      or not raw_row.payload ? 'placement_type'
      or not raw_row.payload ? 'zone_id'
      or not raw_row.payload ? 'slot_position'
  ) then
    raise exception 'matchday-live-layout-physical-v13-invalid-placement-shape';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_authoritative_placements)
      as raw_row(payload)
    where pg_catalog.jsonb_typeof(raw_row.payload -> 'bank_item_id') <> 'string'
      or pg_catalog.btrim(raw_row.payload ->> 'bank_item_id') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(raw_row.payload -> 'placement_type') <> 'string'
      or pg_catalog.lower(
           pg_catalog.btrim(raw_row.payload ->> 'placement_type')
         ) not in ('opening', 'faixa', 'selection', 'video_highlight', 'zone')
      or pg_catalog.jsonb_typeof(raw_row.payload -> 'slot_position') <> 'number'
      or raw_row.payload ->> 'slot_position' !~ '^[0-9]+$'
      or (raw_row.payload ->> 'slot_position')::numeric > 2147483647
      or not (
        (
          pg_catalog.lower(
            pg_catalog.btrim(raw_row.payload ->> 'placement_type')
          ) = 'zone'
          and pg_catalog.jsonb_typeof(raw_row.payload -> 'zone_id') = 'string'
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
    raise exception 'matchday-live-layout-physical-v13-invalid-placement-value';
  end if;

  if exists (
    select 1
    from (
      select p_explicit_bank_item_ids as payload
      union all
      select p_displaced_bank_item_ids
      union all
      select p_worked_bank_item_ids
      union all
      select p_faixa_arrival_bank_item_ids
      union all
      select p_displaced_arrival_bank_item_ids
    ) as list_row
    cross join lateral pg_catalog.jsonb_array_elements(list_row.payload)
      as raw_row(value)
    where pg_catalog.jsonb_typeof(raw_row.value) <> 'string'
      or pg_catalog.btrim(raw_row.value #>> '{}') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'matchday-live-layout-physical-v13-invalid-bank-item-list';
  end if;

  if exists (
    select 1
    from (
      select p_explicit_bank_item_ids as payload
      union all
      select p_displaced_bank_item_ids
      union all
      select p_worked_bank_item_ids
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
    raise exception 'matchday-live-layout-physical-v13-duplicate-state-list';
  end if;

  if exists (
    select 1
    from (
      select p_faixa_arrival_bank_item_ids as payload
      union all
      select p_displaced_arrival_bank_item_ids
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
    raise exception 'matchday-live-layout-physical-v13-duplicate-events';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-live-layout-physical-v13-matchday-not-found';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_matchday_id
      and desk_row.is_managed = true
  ) then
    raise exception 'matchday-live-layout-physical-v13-matchday-not-live';
  end if;

  select assignment_row.profile_key
  into v_assignment_profile_key
  from public.matchday_editorial_profile_assignments as assignment_row
  where assignment_row.matchday_id = p_matchday_id;

  if v_assignment_profile_key is distinct from p_profile_key then
    raise exception 'matchday-live-layout-physical-v13-profile-mismatch';
  end if;

  select token_row.state_token
  into v_current_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  if v_current_state_token is distinct from p_expected_state_token then
    raise exception 'matchday-live-layout-physical-v13-concurrent-write';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_authoritative_placements
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
    raise exception 'matchday-live-layout-physical-v13-invalid-placement-target';
  end if;

  if (
    select pg_catalog.count(*)
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_authoritative_placements
    ) as placement_row
  ) <> (
    select pg_catalog.count(distinct placement_row.bank_item_id)
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_authoritative_placements
    ) as placement_row
  ) then
    raise exception 'matchday-live-layout-physical-v13-duplicate-bank-item';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_authoritative_placements
    ) as placement_row
    group by
      placement_row.placement_type,
      placement_row.zone_id,
      placement_row.slot_position
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-physical-v13-duplicate-target';
  end if;

  if exists (
    with requested as materialized (
      select placement_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_authoritative_placements
      ) as placement_row

      union

      select bank_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_explicit_bank_item_ids
      ) as bank_row

      union

      select displaced_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_displaced_bank_item_ids
      ) as displaced_row

      union

      select worked_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_worked_bank_item_ids
      ) as worked_row

      union

      select arrival_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_faixa_arrival_bank_item_ids
      ) as arrival_row

      union

      select arrival_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_displaced_arrival_bank_item_ids
      ) as arrival_row
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
    raise exception 'matchday-live-layout-physical-v13-bank-item-not-active';
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
    raise exception
      'matchday-live-layout-physical-v13-explicit-bank-source-unsupported';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_authoritative_placements
    ) as placement_row
    left join public.matchday_live_layout_zones as zone_row
      on zone_row.id = placement_row.zone_id
     and zone_row.matchday_id = p_matchday_id
    left join lateral (
      select pg_catalog.count(*) as block_count
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id = p_matchday_id
        and block_row.block_type = 'zone'
        and block_row.zone_id = placement_row.zone_id
    ) as block_state on true
    where placement_row.placement_type = 'zone'
      and (
        zone_row.id is null
        or block_state.block_count <> 1
        or jornada_private
             .matchday_live_layout_visual_family_capacity_v13(
               zone_row.visual_family
             ) is null
        or placement_row.slot_position > jornada_private
             .matchday_live_layout_visual_family_capacity_v13(
               zone_row.visual_family
             )
      )
  ) then
    raise exception 'matchday-live-layout-physical-v13-zone-invalid';
  end if;

  if exists (
    select 1
    from (
      select
        pg_catalog.count(*) as item_count,
        pg_catalog.min(placement_row.slot_position) as min_position,
        pg_catalog.max(placement_row.slot_position) as max_position
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_authoritative_placements
      ) as placement_row
      where placement_row.placement_type = 'faixa'
    ) as faixa_state
    where faixa_state.item_count > 0
      and (
        faixa_state.min_position <> 1
        or faixa_state.max_position <> faixa_state.item_count
      )
  ) then
    raise exception 'matchday-live-layout-physical-v13-faixa-not-contiguous';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as explicit_row
    join jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_authoritative_placements
    ) as placement_row
      on placement_row.bank_item_id = explicit_row.bank_item_id
  ) then
    raise exception 'matchday-live-layout-physical-v13-bank-placement-conflict';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_bank_item_ids
    ) as displaced_row
    join jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_authoritative_placements
    ) as placement_row
      on placement_row.bank_item_id = displaced_row.bank_item_id
  ) then
    raise exception 'matchday-live-layout-physical-v13-displaced-placement-conflict';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_bank_item_ids
    ) as displaced_row
    join jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as explicit_row
      on explicit_row.bank_item_id = displaced_row.bank_item_id
  ) then
    raise exception 'matchday-live-layout-physical-v13-displaced-bank-conflict';
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
    raise exception 'matchday-live-layout-physical-v13-event-conflict';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_faixa_arrival_bank_item_ids
    ) as arrival_row
    where not exists (
      select 1
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_authoritative_placements
      ) as placement_row
      where placement_row.bank_item_id = arrival_row.bank_item_id
        and placement_row.placement_type = 'faixa'
    )
      or exists (
        select 1
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = p_matchday_id
          and placement_row.bank_item_id = arrival_row.bank_item_id
          and placement_row.placement_type = 'faixa'
      )
  ) then
    raise exception 'matchday-live-layout-physical-v13-faixa-event-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_authoritative_placements
    ) as placement_row
    where placement_row.placement_type = 'faixa'
      and not exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = p_matchday_id
          and current_row.bank_item_id = placement_row.bank_item_id
          and current_row.placement_type = 'faixa'
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_faixa_arrival_bank_item_ids
        ) as arrival_row
        where arrival_row.bank_item_id = placement_row.bank_item_id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v13-faixa-event-incomplete';
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
    raise exception 'matchday-live-layout-physical-v13-displaced-event-invalid';
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
    raise exception
      'matchday-live-layout-physical-v13-displaced-event-incomplete';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', placement_row.id,
        'bank_item_id', placement_row.bank_item_id,
        'placement_type', placement_row.placement_type,
        'zone_id', placement_row.zone_id,
        'slot_position', placement_row.slot_position,
        'created_at', placement_row.created_at,
        'updated_at', placement_row.updated_at
      )
      order by placement_row.id
    ),
    '[]'::jsonb
  )
  into v_placements_before
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id;

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

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'bank_item_id', memory_row.bank_item_id,
        'recorded_at', memory_row.recorded_at
      )
      order by memory_row.bank_item_id
    ),
    '[]'::jsonb
  )
  into v_displaced_before
  from public.matchday_live_layout_bank_item_state_memory as memory_row
  where memory_row.matchday_id = p_matchday_id
    and memory_row.memory_kind = 'displaced';

  select pg_catalog.md5(coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', bank_row.id,
        'automatic_eligible', bank_row.automatic_eligible,
        'classification_key', bank_row.classification_key,
        'classification_source', bank_row.classification_source,
        'classified_at', bank_row.classified_at
      )
      order by bank_row.id
    ),
    '[]'::jsonb
  )::text)
  into v_classification_before
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_matchday_id;

  delete from public.matchday_editorial_profile_manual_overrides
    as override_row
  where override_row.matchday_id = p_matchday_id
    and override_row.profile_key = p_profile_key
    and override_row.placement_target = 'bank'
    and not exists (
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
      p_authoritative_placements
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

  with previous as materialized (
    select
      previous_row.bank_item_id,
      previous_row.created_at
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

  if exists (
    with desired as materialized (
      select
        placement_row.bank_item_id,
        placement_row.placement_type,
        placement_row.zone_id,
        placement_row.slot_position
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_authoritative_placements
      ) as placement_row
    ),
    current_state as materialized (
      select
        placement_row.bank_item_id,
        placement_row.placement_type,
        placement_row.zone_id,
        placement_row.slot_position
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
    ),
    differences as (
      (
        select * from current_state
        except
        select * from desired
      )
      union all
      (
        select * from desired
        except
        select * from current_state
      )
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-physical-v13-placement-postcondition';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
    group by placement_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception
      'matchday-live-layout-physical-v13-transversal-postcondition';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
    group by
      placement_row.placement_type,
      placement_row.zone_id,
      placement_row.slot_position
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-physical-v13-target-postcondition';
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
    raise exception 'matchday-live-layout-physical-v13-displaced-postcondition';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_bank_item_ids
    ) as displaced_row
    where exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
        and placement_row.bank_item_id = displaced_row.bank_item_id
    )
      or exists (
        select 1
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
          and bank_row.id = displaced_row.bank_item_id
      )
  ) then
    raise exception
      'matchday-live-layout-physical-v13-displaced-conflict-postcondition';
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
    raise exception 'matchday-live-layout-physical-v13-bank-postcondition';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as explicit_row
    where exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
        and placement_row.bank_item_id = explicit_row.bank_item_id
    )
      or exists (
        select 1
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = p_matchday_id
          and memory_row.bank_item_id = explicit_row.bank_item_id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v13-bank-conflict-postcondition';
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
      'matchday-live-layout-physical-v13-faixa-postcondition';
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'selection'
  ) > 4 or (
    select pg_catalog.count(*)
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'opening'
  ) > 5 or (
    select pg_catalog.count(*)
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'video_highlight'
  ) > 1 then
    raise exception
      'matchday-live-layout-physical-v13-fixed-capacity-postcondition';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    left join public.matchday_live_layout_zones as zone_row
      on zone_row.id = placement_row.zone_id
     and zone_row.matchday_id = placement_row.matchday_id
    left join lateral (
      select pg_catalog.count(*) as block_count
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id = placement_row.matchday_id
        and block_row.block_type = 'zone'
        and block_row.zone_id = placement_row.zone_id
    ) as block_state on true
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'zone'
      and (
        zone_row.id is null
        or block_state.block_count <> 1
        or jornada_private
             .matchday_live_layout_visual_family_capacity_v13(
               zone_row.visual_family
             ) is null
        or placement_row.slot_position > jornada_private
             .matchday_live_layout_visual_family_capacity_v13(
               zone_row.visual_family
             )
      )
  ) then
    raise exception 'matchday-live-layout-physical-v13-zone-postcondition';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(v_placements_before) as previous_row(
      id uuid,
      bank_item_id uuid,
      placement_type text,
      zone_id uuid,
      slot_position integer,
      created_at timestamptz,
      updated_at timestamptz
    )
    join public.matchday_live_layout_placements as placement_row
      on placement_row.matchday_id = p_matchday_id
     and placement_row.bank_item_id = previous_row.bank_item_id
     and placement_row.placement_type = previous_row.placement_type
     and placement_row.zone_id is not distinct from previous_row.zone_id
     and placement_row.slot_position = previous_row.slot_position
    where placement_row.id is distinct from previous_row.id
      or placement_row.created_at is distinct from previous_row.created_at
      or placement_row.updated_at is distinct from previous_row.updated_at
  ) then
    raise exception
      'matchday-live-layout-physical-v13-unchanged-clock-postcondition';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(v_displaced_before) as previous_row(
      bank_item_id uuid,
      recorded_at timestamptz
    )
    join public.matchday_live_layout_bank_item_state_memory as memory_row
      on memory_row.matchday_id = p_matchday_id
     and memory_row.bank_item_id = previous_row.bank_item_id
     and memory_row.memory_kind = 'displaced'
    where memory_row.recorded_at is distinct from previous_row.recorded_at
  ) then
    raise exception
      'matchday-live-layout-physical-v13-displaced-clock-postcondition';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_faixa_arrival_bank_item_ids
    ) as arrival_row
    left join public.matchday_live_layout_placements as placement_row
      on placement_row.matchday_id = p_matchday_id
     and placement_row.bank_item_id = arrival_row.bank_item_id
     and placement_row.placement_type = 'faixa'
    where placement_row.id is null
      or placement_row.created_at is distinct from
         v_faixa_anchor
         - ((arrival_row.operation_order - 1) * interval '1 microsecond')
  ) then
    raise exception
      'matchday-live-layout-physical-v13-faixa-clock-postcondition';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_arrival_bank_item_ids
    ) as arrival_row
    left join public.matchday_live_layout_bank_item_state_memory as memory_row
      on memory_row.matchday_id = p_matchday_id
     and memory_row.bank_item_id = arrival_row.bank_item_id
     and memory_row.memory_kind = 'displaced'
    where memory_row.bank_item_id is null
      or memory_row.recorded_at is distinct from
         v_displaced_anchor
         - ((arrival_row.operation_order - 1) * interval '1 microsecond')
  ) then
    raise exception
      'matchday-live-layout-physical-v13-displaced-clock-postcondition';
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
        )
        order by bank_row.id
      ),
      '[]'::jsonb
    )::text)
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_matchday_id
  ) then
    raise exception
      'matchday-live-layout-physical-v13-classification-changed';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_worked_bank_item_ids
    ) as worked_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = worked_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where bank_row.editorially_worked_at is null
  ) then
    raise exception 'matchday-live-layout-physical-v13-worked-postcondition';
  end if;

  select token_row.state_token
  into v_final_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  return query
  select
    v_final_state_token,
    pg_catalog.jsonb_array_length(p_authoritative_placements),
    pg_catalog.jsonb_array_length(p_explicit_bank_item_ids),
    pg_catalog.jsonb_array_length(p_displaced_bank_item_ids),
    pg_catalog.jsonb_array_length(p_worked_bank_item_ids);
end;
$function$;

revoke all on function
  jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    uuid,
    text,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    uuid,
    text,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
is
  'Private shadow writer for authoritative physical placements, explicit Bank intent, displaced memory and event clocks. It is not an application authority.';

notify pgrst, 'reload schema';

commit;
