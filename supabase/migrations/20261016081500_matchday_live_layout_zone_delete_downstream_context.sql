begin;

-- A physical zone deletion may cascade into the legacy projection table.
-- That cascade is not a legacy authoring write: it is a derived side-effect of
-- the authoritative physical Apply. Keep the legacy fence intact for external
-- writes, but enter the existing downstream context before the physical zone
-- delete so the cascade is correctly recognized as authorized projection work.
do $patch_physical_zone_delete$
declare
  v_signature constant text :=
    'jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)';
  v_definition text;
  v_rewritten text;
  v_delete_marker constant text :=
    E'  delete from public.matchday_live_layout_zones as zone_row\n';
  v_downstream_marker constant text :=
    E'  perform jornada_private.begin_matchday_live_layout_downstream_v14(\n    p_matchday_id\n  );\n\n  begin\n';
  v_delete_position integer;
  v_downstream_position integer;
begin
  select pg_catalog.pg_get_functiondef(v_signature::pg_catalog.regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'matchday-live-layout-zone-delete-downstream-function-missing';
  end if;

  v_delete_position := pg_catalog.strpos(v_definition, v_delete_marker);
  v_downstream_position := pg_catalog.strpos(v_definition, v_downstream_marker);

  if v_delete_position = 0 or v_downstream_position = 0 then
    raise exception 'matchday-live-layout-zone-delete-downstream-anchor-missing';
  end if;

  if v_downstream_position < v_delete_position then
    return;
  end if;

  v_rewritten := overlay(
    v_definition
    placing ''
    from v_downstream_position
    for pg_catalog.char_length(v_downstream_marker)
  );

  v_delete_position := pg_catalog.strpos(v_rewritten, v_delete_marker);
  if v_delete_position = 0 then
    raise exception 'matchday-live-layout-zone-delete-downstream-delete-lost';
  end if;

  v_rewritten := overlay(
    v_rewritten
    placing v_downstream_marker
    from v_delete_position
    for 0
  );

  execute v_rewritten;
end;
$patch_physical_zone_delete$;

-- Prove that the guard still exists and that only the ordering inside the
-- authoritative physical implementation changed.
do $postconditions$
declare
  v_definition text;
  v_delete_position integer;
  v_downstream_position integer;
begin
  select pg_catalog.pg_get_functiondef(
    'jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;

  v_delete_position := pg_catalog.strpos(
    v_definition,
    E'  delete from public.matchday_live_layout_zones as zone_row\n'
  );
  v_downstream_position := pg_catalog.strpos(
    v_definition,
    E'  perform jornada_private.begin_matchday_live_layout_downstream_v14(\n    p_matchday_id\n  );\n\n  begin\n'
  );

  if v_delete_position = 0
    or v_downstream_position = 0
    or v_downstream_position > v_delete_position
  then
    raise exception 'matchday-live-layout-zone-delete-downstream-order-invalid';
  end if;

  if pg_catalog.to_regprocedure(
    'jornada_private.assert_matchday_live_layout_projection_write_v14(uuid,boolean)'
  ) is null then
    raise exception 'matchday-live-layout-zone-delete-legacy-fence-missing';
  end if;
end;
$postconditions$;

commit;
