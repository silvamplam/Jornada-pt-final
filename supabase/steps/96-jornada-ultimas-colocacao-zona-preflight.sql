begin;
set local transaction_read_only = on;

select
  to_regclass('public.matchday_editorials') is not null as matchday_editorials_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matchday_editorials'
      and column_name = 'latest_zone_placement'
  ) as latest_zone_placement_already_exists,
  exists (
    select 1
    from pg_constraint
    where conname = 'matchday_editorials_latest_zone_placement_check'
  ) as latest_zone_placement_check_already_exists,
  false as writes_performed;

rollback;
