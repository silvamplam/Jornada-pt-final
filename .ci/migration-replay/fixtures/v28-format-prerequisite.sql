-- Replay prerequisite, NOT a migration or an unrecorded functional improvement.
-- v28's literal replacement expects spacing absent from the recorded v18 body.
-- Preserve both historical files. Change only that spacing in the disposable DB.
begin;
do $format$
declare
  original text;
  formatted text;
begin
  if current_database() <> 'jornada_migration_replay'
     or current_setting('jornada.replay',true) is distinct from 'on' then
    raise exception 'isolated replay prerequisite only';
  end if;
  select pg_get_functiondef('jornada_private.materialize_matchday_live_layout_physical_carryover_v18(uuid,uuid,uuid,uuid)'::regprocedure)
    into original;
  formatted := replace(original,
    '  select pg_catalog.count(*)::integer into v_roundup_count from public.matchday_roundup_items as roundup_row where roundup_row.matchday_id=p_source_matchday_id;',
    '  select pg_catalog.count(*)::integer into v_roundup_count
  from public.matchday_roundup_items as roundup_row
  where roundup_row.matchday_id = p_source_matchday_id;');
  formatted := replace(formatted,
    '    from public.matchday_roundup_items as source_row
    where source_row.matchday_id=p_source_matchday_id',
    '    from public.matchday_roundup_items as source_row
    where source_row.matchday_id = p_source_matchday_id');
  if formatted = original or
     regexp_replace(original,'[[:space:]]','','g') <>
     regexp_replace(formatted,'[[:space:]]','','g') then
    raise exception 'v28 prerequisite must change whitespace only';
  end if;
  execute formatted;
end $format$;
commit;
