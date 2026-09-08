begin;

-- V29 keeps `four_news` only as the storage encoding of a physical ZONE
-- destination. The editorial contract is the pair:
--   top       + null zone = HEADLINE
--   hidden    + null zone = HIDDEN
--   four_news + zone UUID = ZONE
-- Existing incomplete rows are preserved for explicit editor repair.

create function public.apply_matchday_live_layout_physical_v29(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_physical_state_token text,
  p_latest_companion_zone_id uuid,
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
  v_latest_zone_placement text;
begin
  v_latest_zone_placement :=
    p_presentation ->> 'latest_zone_placement';

  if (
    (
      v_latest_zone_placement in ('top', 'hidden')
      and p_latest_companion_zone_id is null
    )
    or (
      v_latest_zone_placement = 'four_news'
      and p_latest_companion_zone_id is not null
    )
  ) is not true then
    raise exception
      'matchday-live-layout-latest-destination-v29-incomplete';
  end if;

  return query
  select *
  from public.apply_matchday_live_layout_physical_v22(
    p_matchday_id,
    p_profile_key,
    p_expected_physical_state_token,
    p_latest_companion_zone_id,
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
  );
end;
$function$;

revoke all on function
  public.apply_matchday_live_layout_physical_v29(
    uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.apply_matchday_live_layout_physical_v29(
    uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
to service_role;

revoke all on function
  public.apply_matchday_live_layout_physical_v22(
    uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

revoke all on function
  public.apply_matchday_live_layout_physical_v20(
    uuid,text,text,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

revoke all on function
  public.apply_matchday_live_layout_physical_workspace_v14(
    uuid,text,text,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

comment on function
  public.apply_matchday_live_layout_physical_v29(
    uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
is
  'Single physical Apply authority for Latest destination: HEADLINE/HIDDEN require no companion; ZONE uses the existing companion zone UUID. Delegates the physical write to v22 after validation.';


create function public.set_matchday_latest_zone_placement_v29(
  p_matchday_id uuid,
  p_latest_zone_placement text
)
returns table (
  is_physical boolean,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_is_physical boolean;
  v_companion_changed boolean := false;
begin
  if p_matchday_id is null
    or p_latest_zone_placement not in ('top', 'hidden')
  then
    if p_latest_zone_placement = 'four_news' then
      raise exception
        'matchday-latest-destination-v29-zone-id-required';
    end if;
    raise exception
      'matchday-latest-destination-v29-invalid-input';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  select exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers
      as marker_row
    where marker_row.matchday_id = p_matchday_id
  )
  into v_is_physical;

  if v_is_physical then
    delete from public.matchday_live_layout_latest_companion
      as companion_row
    where companion_row.matchday_id = p_matchday_id;
    v_companion_changed := found;
  end if;

  return query
  select
    result_row.is_physical,
    result_row.changed or v_companion_changed
  from public.set_matchday_latest_zone_placement_v15(
    p_matchday_id,
    p_latest_zone_placement
  ) as result_row;
end;
$function$;

revoke all on function
  public.set_matchday_latest_zone_placement_v29(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.set_matchday_latest_zone_placement_v29(uuid, text)
to service_role;

revoke all on function
  public.set_matchday_latest_zone_placement_v15(uuid, text)
from public, anon, authenticated, service_role;

comment on function
  public.set_matchday_latest_zone_placement_v29(uuid, text)
is
  'Legacy placement facade for explicit HEADLINE or HIDDEN choices. ZONE always requires the atomic physical Apply with an explicit zone UUID.';


do $postconditions$
begin
  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.apply_matchday_live_layout_physical_v29(uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.apply_matchday_live_layout_physical_v29(uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.apply_matchday_live_layout_physical_v29(uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'public.apply_matchday_live_layout_physical_v22(uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'public.apply_matchday_live_layout_physical_v20(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'public.apply_matchday_live_layout_physical_workspace_v14(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    )
  then
    raise exception
      'matchday-live-layout-latest-destination-v29-apply-acl-invalid';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.set_matchday_latest_zone_placement_v29(uuid,text)',
    'EXECUTE'
  )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.set_matchday_latest_zone_placement_v29(uuid,text)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.set_matchday_latest_zone_placement_v29(uuid,text)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'public.set_matchday_latest_zone_placement_v15(uuid,text)',
      'EXECUTE'
    )
  then
    raise exception
      'matchday-live-layout-latest-destination-v29-placement-acl-invalid';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
