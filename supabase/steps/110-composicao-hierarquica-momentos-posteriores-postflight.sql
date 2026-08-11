do $$
declare
  v_slot_constraint_definition text;
  v_source_constraint_definition text;
  v_position_constraint_definition text;
  v_position_index_definition text;
  v_function_definition text;
begin
  select pg_get_constraintdef(oid)
  into v_slot_constraint_definition
  from pg_constraint
  where conrelid = 'public.matchday_reference_composition_items'::regclass
    and conname = 'matchday_reference_composition_items_slot_type_check';

  if v_slot_constraint_definition is null
     or v_slot_constraint_definition not ilike '%beyond_matchday%'
     or v_slot_constraint_definition not ilike '%roundup%'
     or v_slot_constraint_definition not ilike '%complement%' then
    raise exception 'Postflight 110 falhou: slot types dos momentos posteriores incompletos';
  end if;

  select pg_get_constraintdef(oid)
  into v_source_constraint_definition
  from pg_constraint
  where conrelid = 'public.matchday_reference_composition_items'::regclass
    and conname = 'matchday_reference_composition_items_source_type_check';

  if v_source_constraint_definition is null
     or v_source_constraint_definition not ilike '%editorial_article%'
     or v_source_constraint_definition not ilike '%matchday_editorial_bank_item%'
     or v_source_constraint_definition not ilike '%matchday_roundup_item%' then
    raise exception 'Postflight 110 falhou: source types dos momentos posteriores incompletos';
  end if;

  select pg_get_constraintdef(oid)
  into v_position_constraint_definition
  from pg_constraint
  where conrelid = 'public.matchday_reference_composition_items'::regclass
    and conname = 'matchday_reference_composition_items_beyond_position_check';

  if v_position_constraint_definition is null
     or v_position_constraint_definition not ilike '%beyond_matchday%'
     or v_position_constraint_definition not ilike '%sort_order%'
     or v_position_constraint_definition not ilike '%1%'
     or v_position_constraint_definition not ilike '%5%' then
    raise exception 'Postflight 110 falhou: limite das posições 1..5 ausente';
  end if;

  select indexdef
  into v_position_index_definition
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'matchday_reference_composition_beyond_position_unique_idx';

  if v_position_index_definition is null
     or v_position_index_definition not ilike '%unique index%'
     or v_position_index_definition not ilike '%(composition_id, sort_order)%'
     or v_position_index_definition not ilike '%slot_type = ''beyond_matchday''%' then
    raise exception 'Postflight 110 falhou: unicidade das cinco posições ausente ou incompatível';
  end if;

  select pg_get_functiondef('public.activate_matchday_reference_composition(uuid,uuid,boolean)'::regprocedure)
  into v_function_definition;

  if v_function_definition not ilike '%for update%'
     or v_function_definition not ilike '%hierarchical_composition_incomplete%'
     or v_function_definition not ilike '%hierarchical_beyond_matchday_incomplete%'
     or v_function_definition not ilike '%v_target.status = ''draft''%'
     or v_function_definition not ilike '%v_target.status <> ''published''%'
     or v_function_definition not ilike '%v_target.presentation_mode = ''hierarchical''%'
     or v_function_definition not ilike '%is_current = false%'
     or v_function_definition not ilike '%is_current = true%' then
    raise exception 'Postflight 110 falhou: RPC não protege publicação e reativação hierarchical';
  end if;

  if exists (
    select 1
    from public.matchday_reference_compositions composition
    where composition.presentation_mode = 'hierarchical'
      and composition.status = 'published'
      and composition.is_current = true
      and (
        (
          select count(*)
          from public.matchday_hierarchical_composition_slots slot
          where slot.composition_id = composition.id
            and nullif(btrim(slot.label_snapshot), '') is not null
            and nullif(btrim(slot.title_snapshot), '') is not null
            and nullif(btrim(slot.subtitle_snapshot), '') is not null
            and nullif(btrim(slot.image_url_snapshot), '') is not null
        ) <> 15
        or (
          select count(*)
          from public.matchday_reference_composition_items item
          where item.composition_id = composition.id
            and item.slot_type = 'beyond_matchday'
            and item.sort_order between 1 and 5
            and nullif(btrim(item.label_snapshot), '') is not null
            and nullif(btrim(item.title_snapshot), '') is not null
            and nullif(btrim(item.subtitle_snapshot), '') is not null
            and nullif(btrim(item.image_url_snapshot), '') is not null
            and nullif(btrim(item.link_url_snapshot), '') is not null
        ) <> 5
      )
  ) then
    raise exception 'Postflight 110 falhou: existe uma composição hierarchical current incompleta';
  end if;
end
$$;
