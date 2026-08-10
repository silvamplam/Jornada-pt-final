begin;

alter table public.matchday_editorials
  add column if not exists latest_zone_placement text not null default 'top';

alter table public.matchday_editorials
  alter column latest_zone_placement set default 'top';

update public.matchday_editorials
set latest_zone_placement = 'top'
where latest_zone_placement is null;

alter table public.matchday_editorials
  alter column latest_zone_placement set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matchday_editorials_latest_zone_placement_check'
  ) then
    alter table public.matchday_editorials
      add constraint matchday_editorials_latest_zone_placement_check
      check (latest_zone_placement in ('top', 'hidden'));
  end if;
end
$$;

comment on column public.matchday_editorials.latest_zone_placement is
  'Presentation placement of the Latest zone. Supported now: top or hidden; lower may be added later.';

notify pgrst, 'reload schema';

commit;
