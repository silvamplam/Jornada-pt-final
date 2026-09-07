-- Fix PL/pgSQL output-column ambiguity in the physical topology constructor.
-- No data mutation; the existing v17 contract and function signature are preserved.

do $migration$
declare
  v_definition text;
  v_fixed text;
begin
  select pg_catalog.pg_get_functiondef(
    'jornada_private.materialize_matchday_live_layout_physical_topology_v17(uuid,uuid)'::pg_catalog.regprocedure
  )
  into v_definition;

  v_fixed := v_definition;

  v_fixed := pg_catalog.replace(
    v_fixed,
    'from jornada_private.matchday_live_layout_physical_topology_transitions where source_matchday_id=p_source_matchday_id or target_matchday_id=p_target_matchday_id',
    'from jornada_private.matchday_live_layout_physical_topology_transitions as row_value where row_value.source_matchday_id=p_source_matchday_id or row_value.target_matchday_id=p_target_matchday_id'
  );

  v_fixed := pg_catalog.replace(
    v_fixed,
    'from public.matchday_editorial_continuity_transitions where source_matchday_id=p_source_matchday_id or target_matchday_id=p_target_matchday_id',
    'from public.matchday_editorial_continuity_transitions as row_value where row_value.source_matchday_id=p_source_matchday_id or row_value.target_matchday_id=p_target_matchday_id'
  );

  if v_fixed = v_definition then
    raise exception 'matchday-live-layout-topology-v27-no-change';
  end if;

  if v_fixed like '%where source_matchday_id=p_source_matchday_id%'
     or v_fixed like '%or target_matchday_id=p_target_matchday_id%'
  then
    raise exception 'matchday-live-layout-topology-v27-ambiguity-remains';
  end if;

  execute v_fixed;
end;
$migration$;