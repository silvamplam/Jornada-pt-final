-- Retire the legacy "selection" placement from physical-authority matchdays.
-- Legacy/non-physical workspaces remain readable and untouched.

create or replace function jornada_private.reject_physical_selection_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.placement_type = 'selection'
    and exists (
      select 1
      from jornada_private.matchday_live_layout_physical_cutovers
        as cutover_row
      where cutover_row.matchday_id = new.matchday_id
    )
  then
    raise exception
      'matchday-live-layout-physical-selection-retired';
  end if;

  return new;
end;
$function$;

drop trigger if exists
  matchday_live_layout_physical_selection_guard
on public.matchday_live_layout_placements;

create trigger matchday_live_layout_physical_selection_guard
before insert or update of matchday_id, placement_type
on public.matchday_live_layout_placements
for each row
execute function jornada_private.reject_physical_selection_placement();


create or replace function jornada_private.assert_physical_cutover_has_no_selection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = new.matchday_id
      and placement_row.placement_type = 'selection'
  )
  then
    raise exception
      'matchday-live-layout-physical-selection-retired';
  end if;

  return new;
end;
$function$;

drop trigger if exists
  matchday_live_layout_physical_selection_cutover_guard
on jornada_private.matchday_live_layout_physical_cutovers;

create constraint trigger
  matchday_live_layout_physical_selection_cutover_guard
after insert or update
on jornada_private.matchday_live_layout_physical_cutovers
deferrable initially deferred
for each row
execute function jornada_private.assert_physical_cutover_has_no_selection();


-- Preserve the former selection order as displaced arrival order.
with retired as materialized (
  select
    placement_row.matchday_id,
    placement_row.bank_item_id,
    pg_catalog.row_number() over (
      partition by placement_row.matchday_id
      order by
        placement_row.slot_position,
        placement_row.bank_item_id
    ) as operation_order
  from public.matchday_live_layout_placements as placement_row
  join jornada_private.matchday_live_layout_physical_cutovers
    as cutover_row
    on cutover_row.matchday_id = placement_row.matchday_id
  where placement_row.placement_type = 'selection'
)
insert into public.matchday_live_layout_bank_item_state_memory
  as memory_row (
    matchday_id,
    bank_item_id,
    memory_kind,
    recorded_at
  )
select
  retired_row.matchday_id,
  retired_row.bank_item_id,
  'displaced',
  pg_catalog.statement_timestamp()
    - (
        ((retired_row.operation_order - 1)::integer)
        * interval '1 microsecond'
      )
from retired as retired_row
on conflict (matchday_id, bank_item_id)
do update
set memory_kind = 'displaced',
    recorded_at = excluded.recorded_at;


delete from public.matchday_live_layout_placements as placement_row
where placement_row.placement_type = 'selection'
  and exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers
      as cutover_row
    where cutover_row.matchday_id = placement_row.matchday_id
  );


do $postcondition$
begin
  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join jornada_private.matchday_live_layout_physical_cutovers
      as cutover_row
      on cutover_row.matchday_id = placement_row.matchday_id
    where placement_row.placement_type = 'selection'
  ) then
    raise exception
      'matchday-live-layout-physical-selection-retirement-postcondition';
  end if;
end;
$postcondition$;