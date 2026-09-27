-- Run after the migration on a local test database. No production data needed.
begin;
do $test$
declare
  v_signature text;
  v_definition text;
  v_old_cases integer;
  v_new_cases integer;
begin
  assert jornada_private.matchday_live_layout_layout_capacity_v20('six_news_1_2_3') = 6;
  assert jornada_private.matchday_live_layout_layout_capacity_v20('six_news') = 6;
  assert jornada_private.matchday_live_layout_layout_capacity_v20('five_news_balanced') = 5;
  assert jornada_private.matchday_live_layout_layout_capacity_v20('five_news_secondary') = 5;
  assert jornada_private.matchday_live_layout_layout_capacity_v20('four_news') = 4;
  assert jornada_private.matchday_live_layout_layout_capacity_v20('unknown') is null;

  foreach v_signature in array array[
    'public.replace_historical_composition_dynamic_zones(uuid,uuid,jsonb)',
    'public.activate_matchday_reference_composition(uuid,uuid,boolean)',
    'public.apply_matchday_editorial_profile_workspace_v2(uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'jornada_private.apply_matchday_editorial_profile_workspace_v9_pre_bridge(uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'jornada_private.validate_matchday_live_layout_shadow_inputs(uuid[])'
  ]
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_signature::regprocedure);
    assert position('''six_news_1_2_3''' in v_definition) > 0, v_signature;
    select count(*) into v_old_cases from regexp_matches(v_definition,
      'when[[:space:]]+''six_news''[[:space:]]+then[[:space:]]+6', 'gi');
    select count(*) into v_new_cases from regexp_matches(v_definition,
      'when[[:space:]]+''six_news_1_2_3''[[:space:]]+then[[:space:]]+6', 'gi');
    assert v_old_cases = v_new_cases, v_signature || ': every six-slot capacity branch must support both families';
  end loop;

  select pg_catalog.pg_get_constraintdef(oid) into strict v_definition
  from pg_catalog.pg_constraint
  where conrelid = 'public.matchday_historical_composition_zones'::regclass
    and conname = 'matchday_historical_composition_zones_visual_family_check'
    and convalidated;
  assert position('six_news_1_2_3' in v_definition) > 0;

  select pg_catalog.pg_get_constraintdef(oid) into strict v_definition
  from pg_catalog.pg_constraint
  where conrelid = 'public.matchday_editorial_profile_reconcile_control'::regclass
    and conname = 'matchday_editorial_profile_reconcile_control_zone_layouts_check'
    and convalidated;
  assert (length(v_definition) - length(replace(v_definition, 'six_news_1_2_3', '')))
    / length('six_news_1_2_3') = 5, 'all five thematic zones must accept the family';
  raise notice 'PASS: capacities, five RPC definitions, historical and Viva constraints';
end;
$test$;
rollback;
