-- Remove the entire synthetic dependency graph after the repair succeeds.
begin;
do $guard$ begin
 if current_database() <> 'jornada_migration_replay'
 or current_setting('jornada.replay',true) is distinct from 'on' then
 raise exception 'isolated replay fixture only'; end if;
end $guard$;
do $check$ begin
 if (select count(*) from public.competitions) <> 1
 or not exists(select 1 from public.competitions where id='11111111-1111-4111-8111-000000000101') then
 raise exception 'unexpected data in disposable replay'; end if;
 if exists(select 1 from public.matchday_live_layout_placements where matchday_id='11111111-1111-4111-8111-000000000103')
 or (select count(*) from public.matchday_live_layout_placements where matchday_id='11111111-1111-4111-8111-000000000104') <> 1 then
 raise exception 'synthetic retirement postcondition failed'; end if;
end $check$;
truncate public.competitions cascade;
commit;
