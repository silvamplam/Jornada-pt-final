begin;

-- Add a distinct family; the existing six_news family and defaults stay intact.
create or replace function jornada_private.matchday_live_layout_layout_capacity_v20(
  p_layout_id text
)
returns integer
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $function$
  select case p_layout_id
    when 'six_news' then 6
    when 'five_news_balanced' then 5
    when 'five_news_secondary' then 5
    when 'four_news' then 4
    when 'six_news_1_2_3' then 6
    else null
  end;
$function$;

-- Preserve every other clause (including exact thematic keys) in both checks.
do $migration$
declare
  v_target record;
  v_definition text;
begin
  for v_target in select * from (values
    ('matchday_historical_composition_zones',
     'matchday_historical_composition_zones_visual_family_check', 1),
    ('matchday_editorial_profile_reconcile_control',
     'matchday_editorial_profile_reconcile_control_zone_layouts_check', 5)
  ) as targets(table_name, constraint_name, expected_matches)
  loop
    select pg_catalog.pg_get_constraintdef(oid) into strict v_definition
    from pg_catalog.pg_constraint
    where conrelid = pg_catalog.to_regclass('public.' || v_target.table_name)
      and conname = v_target.constraint_name;

    if (length(v_definition) - length(replace(v_definition, '''six_news''::text', '')))
        / length('''six_news''::text') <> v_target.expected_matches then
      raise exception 'six-news-1-2-3: unexpected constraint %', v_target.constraint_name;
    end if;
    v_definition := replace(v_definition, '''six_news''::text',
      '''six_news''::text, ''six_news_1_2_3''::text');
    execute format('alter table public.%I drop constraint %I',
      v_target.table_name, v_target.constraint_name);
    execute format('alter table public.%I add constraint %I %s',
      v_target.table_name, v_target.constraint_name, v_definition);
  end loop;
end;
$migration$;

-- Extend only existing family allowlists and capacity cases. Using the current
-- definitions preserves the locking, authorization, snapshot and publication
-- fixes from intervening migrations, plus ownership and EXECUTE grants.
do $migration$
declare
  v_signature text;
  v_oid regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.replace_historical_composition_dynamic_zones(uuid,uuid,jsonb)',
    'public.activate_matchday_reference_composition(uuid,uuid,boolean)',
    'public.apply_matchday_editorial_profile_workspace_v2(uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'jornada_private.apply_matchday_editorial_profile_workspace_v9_pre_bridge(uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'jornada_private.validate_matchday_live_layout_shadow_inputs(uuid[])'
  ]
  loop
    v_oid := pg_catalog.to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'six-news-1-2-3: missing function %', v_signature;
    end if;
    v_definition := pg_catalog.pg_get_functiondef(v_oid);
    v_updated := replace(v_definition, '''six_news'',',
      '''six_news'', ''six_news_1_2_3'',');
    v_updated := regexp_replace(v_updated,
      'when[[:space:]]+''six_news''[[:space:]]+then[[:space:]]+6',
      'when ''six_news'' then 6 when ''six_news_1_2_3'' then 6', 'gi');
    if v_updated = v_definition then
      raise exception 'six-news-1-2-3: no family validation found in %', v_signature;
    end if;
    execute v_updated;
  end loop;
end;
$migration$;

commit;
