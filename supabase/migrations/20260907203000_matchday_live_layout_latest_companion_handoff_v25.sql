-- Carry the Latest companion through physical topology handoff.
-- The relation is mapped by physical zone identity, never by title or layout.

create or replace function
  jornada_private.carry_matchday_live_layout_latest_companion_v25()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transition_id uuid;
  v_source_matchday_id uuid;
  v_source_zone_id uuid;
  v_target_zone_id uuid;
begin
  select
    transition_row.id,
    transition_row.source_matchday_id
  into
    v_transition_id,
    v_source_matchday_id
  from jornada_private.matchday_live_layout_physical_topology_transitions
    as transition_row
  where transition_row.target_matchday_id = new.matchday_id;

  if not found then
    return new;
  end if;

  select companion_row.zone_id
  into v_source_zone_id
  from public.matchday_live_layout_latest_companion as companion_row
  where companion_row.matchday_id = v_source_matchday_id;

  if not found then
    return new;
  end if;

  select map_row.target_zone_id
  into v_target_zone_id
  from jornada_private.matchday_live_layout_physical_zone_maps as map_row
  where map_row.topology_transition_id = v_transition_id
    and map_row.source_zone_id = v_source_zone_id;

  if not found then
    raise exception
      'matchday-live-layout-latest-companion-v25-zone-map-missing';
  end if;

  insert into public.matchday_live_layout_latest_companion (
    matchday_id,
    zone_id,
    created_at,
    updated_at
  )
  values (
    new.matchday_id,
    v_target_zone_id,
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  )
  on conflict (matchday_id)
  do update
  set zone_id = excluded.zone_id,
      updated_at = excluded.updated_at;

  return new;
end;
$function$;

drop trigger if exists
  matchday_live_layout_latest_companion_handoff_v25
on jornada_private.matchday_live_layout_physical_cutovers;

create trigger matchday_live_layout_latest_companion_handoff_v25
after insert
on jornada_private.matchday_live_layout_physical_cutovers
for each row
execute function
  jornada_private.carry_matchday_live_layout_latest_companion_v25();


create or replace function
  jornada_private.assert_matchday_live_layout_handoff_companion_v25()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_zone_id uuid;
  v_expected_target_zone_id uuid;
  v_actual_target_zone_id uuid;
begin
  select companion_row.zone_id
  into v_source_zone_id
  from public.matchday_live_layout_latest_companion as companion_row
  where companion_row.matchday_id = new.source_matchday_id;

  if not found then
    if exists (
      select 1
      from public.matchday_live_layout_latest_companion as companion_row
      where companion_row.matchday_id = new.target_matchday_id
    ) then
      raise exception
        'matchday-live-layout-latest-companion-v25-unexpected-target';
    end if;

    return new;
  end if;

  select map_row.target_zone_id
  into v_expected_target_zone_id
  from jornada_private.matchday_live_layout_physical_zone_maps as map_row
  where map_row.topology_transition_id = new.topology_transition_id
    and map_row.source_zone_id = v_source_zone_id;

  if not found then
    raise exception
      'matchday-live-layout-latest-companion-v25-zone-map-missing';
  end if;

  select companion_row.zone_id
  into v_actual_target_zone_id
  from public.matchday_live_layout_latest_companion as companion_row
  where companion_row.matchday_id = new.target_matchday_id;

  if not found
    or v_actual_target_zone_id is distinct from v_expected_target_zone_id
  then
    raise exception
      'matchday-live-layout-latest-companion-v25-handoff-incomplete';
  end if;

  return new;
end;
$function$;

drop trigger if exists
  matchday_live_layout_latest_companion_handoff_certificate_v25
on jornada_private.matchday_live_layout_physical_handoffs;

create trigger
  matchday_live_layout_latest_companion_handoff_certificate_v25
before insert or update of
  topology_transition_id,
  source_matchday_id,
  target_matchday_id
on jornada_private.matchday_live_layout_physical_handoffs
for each row
execute function
  jornada_private.assert_matchday_live_layout_handoff_companion_v25();


create or replace function
  jornada_private.freeze_handed_off_source_companion_v25()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_matchday_id uuid;
begin
  v_matchday_id := case
    when tg_op = 'DELETE' then old.matchday_id
    else new.matchday_id
  end;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_handoffs
      as handoff_row
    where handoff_row.source_matchday_id = v_matchday_id
  ) then
    raise exception
      'matchday-live-layout-latest-companion-v25-source-frozen';
  end if;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;
end;
$function$;

drop trigger if exists
  matchday_live_layout_latest_companion_source_freeze_v25
on public.matchday_live_layout_latest_companion;

create trigger matchday_live_layout_latest_companion_source_freeze_v25
before insert or update or delete
on public.matchday_live_layout_latest_companion
for each row
execute function
  jornada_private.freeze_handed_off_source_companion_v25();