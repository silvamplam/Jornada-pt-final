do $$
declare
  v_function_definition text;
  v_constraint_definition text;
begin
  if exists (
    select 1
    from (values
      ('matchday_hierarchical_composition_slots', 'media_kind_snapshot'),
      ('matchday_hierarchical_composition_slots', 'media_embed_url_snapshot'),
      ('matchday_hierarchical_composition_slots', 'media_video_url_snapshot'),
      ('matchday_reference_composition_items', 'media_kind_snapshot'),
      ('matchday_reference_composition_items', 'media_embed_url_snapshot'),
      ('matchday_reference_composition_items', 'media_video_url_snapshot')
    ) as expected(table_name, column_name)
    where not exists (
      select 1
      from information_schema.columns column_row
      where column_row.table_schema = 'public'
        and column_row.table_name = expected.table_name
        and column_row.column_name = expected.column_name
        and column_row.data_type = 'text'
        and column_row.is_nullable = 'YES'
    )
  ) then
    raise exception 'Postflight 114 falhou: colunas de snapshot audiovisual ausentes ou incompatíveis';
  end if;

  select pg_get_constraintdef(constraint_row.oid)
  into v_constraint_definition
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.matchday_hierarchical_composition_slots'::regclass
    and constraint_row.conname = 'matchday_hierarchical_composition_slots_media_position_check';

  if v_constraint_definition is null
     or v_constraint_definition not ilike '%dominant_main%' then
    raise exception 'Postflight 114 falhou: media dos 15 slots não está limitado à Manchete dominante';
  end if;

  select pg_get_constraintdef(constraint_row.oid)
  into v_constraint_definition
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.matchday_reference_composition_items'::regclass
    and constraint_row.conname = 'matchday_reference_composition_items_media_position_check';

  if v_constraint_definition is null
     or v_constraint_definition not ilike '%headline%'
     or v_constraint_definition not ilike '%complement%' then
    raise exception 'Postflight 114 falhou: snapshot audiovisual das posições editoriais não está limitado a Manchete/Destaque';
  end if;

  select pg_get_functiondef('public.activate_matchday_reference_composition(uuid,uuid,boolean)'::regprocedure)
  into v_function_definition;

  if v_function_definition not ilike '%slot_key = ''dominant_main''%'
     or v_function_definition not ilike '%media_kind_snapshot = ''embed''%'
     or v_function_definition not ilike '%media_embed_url_snapshot%'
     or v_function_definition not ilike '%media_kind_snapshot = ''direct_video''%'
     or v_function_definition not ilike '%media_video_url_snapshot%'
     or v_function_definition not ilike '%hierarchical_beyond_matchday_incomplete%' then
    raise exception 'Postflight 114 falhou: RPC não valida corretamente Manchete-vídeo e restantes contratos hierárquicos';
  end if;
end
$$;
