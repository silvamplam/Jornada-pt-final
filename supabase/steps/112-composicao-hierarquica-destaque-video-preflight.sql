do $$
declare
  v_column record;
  v_function_definition text;
begin
  if to_regclass('public.matchday_hierarchical_composition_slots') is null then
    raise exception 'Preflight 112 falhou: tabela dos 15 slots hierárquicos ausente';
  end if;

  if to_regclass('public.matchday_reference_composition_items') is null then
    raise exception 'Preflight 112 falhou: tabela dos momentos posteriores ausente';
  end if;

  if to_regclass('public.editorial_contents') is null then
    raise exception 'Preflight 112 falhou: origem canónica editorial_contents ausente';
  end if;

  if to_regprocedure('public.activate_matchday_reference_composition(uuid,uuid,boolean)') is null then
    raise exception 'Preflight 112 falhou: RPC de ativação da Composição ausente';
  end if;

  for v_column in
    select *
    from (values
      ('matchday_hierarchical_composition_slots', 'media_kind_snapshot'),
      ('matchday_hierarchical_composition_slots', 'media_embed_url_snapshot'),
      ('matchday_hierarchical_composition_slots', 'media_video_url_snapshot'),
      ('matchday_reference_composition_items', 'media_kind_snapshot'),
      ('matchday_reference_composition_items', 'media_embed_url_snapshot'),
      ('matchday_reference_composition_items', 'media_video_url_snapshot')
    ) as expected(table_name, column_name)
  loop
    if exists (
      select 1
      from information_schema.columns column_row
      where column_row.table_schema = 'public'
        and column_row.table_name = v_column.table_name
        and column_row.column_name = v_column.column_name
        and (column_row.data_type <> 'text' or column_row.is_nullable <> 'YES')
    ) then
      raise exception 'Preflight 112 falhou: %.% existe com definição incompatível', v_column.table_name, v_column.column_name;
    end if;
  end loop;

  select pg_get_functiondef('public.activate_matchday_reference_composition(uuid,uuid,boolean)'::regprocedure)
  into v_function_definition;

  if v_function_definition not ilike '%hierarchical_composition_incomplete%'
     or v_function_definition not ilike '%hierarchical_beyond_matchday_incomplete%'
     or v_function_definition not ilike '%v_target.presentation_mode = ''hierarchical''%' then
    raise exception 'Preflight 112 falhou: RPC atual não corresponde à fundação hierárquica protegida';
  end if;
end
$$;
