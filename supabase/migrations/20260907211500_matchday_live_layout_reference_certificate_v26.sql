-- Every physical matchday owns a lightweight standard reference composition
-- used only as the publication certificate for the physical handoff.

create or replace function
  jornada_private.ensure_physical_reference_certificate_v26()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.matchday_reference_compositions (
    matchday_id,
    status,
    is_current,
    internal_name,
    use_roundup_items,
    presentation_mode
  )
  select
    new.matchday_id,
    'draft',
    false,
    'Jornada ' || pg_catalog.lpad(matchday_row.number::text, 2, '0'),
    true,
    'standard'
  from public.matchdays as matchday_row
  where matchday_row.id = new.matchday_id
    and not exists (
      select 1
      from public.matchday_reference_compositions as composition_row
      where composition_row.matchday_id = new.matchday_id
        and composition_row.presentation_mode = 'standard'
        and composition_row.status in ('draft', 'published')
    );

  return new;
end;
$function$;

drop trigger if exists
  matchday_live_layout_reference_certificate_v26
on jornada_private.matchday_live_layout_physical_cutovers;

create trigger matchday_live_layout_reference_certificate_v26
after insert
on jornada_private.matchday_live_layout_physical_cutovers
for each row
execute function
  jornada_private.ensure_physical_reference_certificate_v26();

insert into public.matchday_reference_compositions (
  matchday_id,
  status,
  is_current,
  internal_name,
  use_roundup_items,
  presentation_mode
)
select
  cutover_row.matchday_id,
  'draft',
  false,
  'Jornada ' || pg_catalog.lpad(matchday_row.number::text, 2, '0'),
  true,
  'standard'
from jornada_private.matchday_live_layout_physical_cutovers as cutover_row
join public.matchdays as matchday_row
  on matchday_row.id = cutover_row.matchday_id
join public.matchday_editorial_desk_control as desk_row
  on desk_row.matchday_id = cutover_row.matchday_id
 and desk_row.is_managed = true
where not exists (
  select 1
  from public.matchday_reference_compositions as composition_row
  where composition_row.matchday_id = cutover_row.matchday_id
    and composition_row.presentation_mode = 'standard'
    and composition_row.status in ('draft', 'published')
);