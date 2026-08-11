do $$
declare
  v_default text;
  v_nullable text;
  v_function_definition text;
  v_mode_constraint_definition text;
  v_slot_constraint_definition text;
begin
  select column_default, is_nullable
  into v_default, v_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'matchday_reference_compositions'
    and column_name = 'presentation_mode';

  if v_default is null or v_default not ilike '%standard%' or v_nullable <> 'NO' then
    raise exception 'Postflight falhou: presentation_mode sem default standard/NOT NULL';
  end if;

  if exists (
    select 1
    from public.matchday_reference_compositions
    where presentation_mode not in ('standard', 'hierarchical')
  ) then
    raise exception 'Postflight falhou: presentation_mode inválido';
  end if;

  select pg_get_constraintdef(oid)
  into v_mode_constraint_definition
  from pg_constraint
  where conrelid = 'public.matchday_reference_compositions'::regclass
    and conname = 'matchday_reference_compositions_presentation_mode_check';

  if v_mode_constraint_definition is null
     or v_mode_constraint_definition not ilike '%standard%'
     or v_mode_constraint_definition not ilike '%hierarchical%' then
    raise exception 'Postflight falhou: constraint de presentation_mode ausente ou incompatível';
  end if;

  if to_regclass('public.matchday_hierarchical_composition_slots') is null then
    raise exception 'Postflight falhou: tabela de slots ausente';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'matchday_reference_compositions_draft_mode_unique_idx'
  ) then
    raise exception 'Postflight falhou: unicidade draft por modo ausente';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'matchday_reference_compositions_current_unique_idx'
      and indexdef ilike '%unique index%'
      and indexdef ilike '%is_current = true%'
  ) then
    raise exception 'Postflight falhou: unicidade current por Jornada foi alterada';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.matchday_hierarchical_composition_slots'::regclass
      and conname = 'matchday_hierarchical_composition_slots_composition_slot_unique'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.matchday_hierarchical_composition_slots'::regclass
      and conname = 'matchday_hierarchical_composition_slots_composition_source_unique'
  ) then
    raise exception 'Postflight falhou: constraints de slots/origens ausentes';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.matchday_hierarchical_composition_slots'::regclass
      and confrelid = 'public.matchday_editorial_bank_items'::regclass
      and contype = 'f'
      and confdeltype = 'n'
  ) then
    raise exception 'Postflight falhou: origem do banco não preserva snapshots com ON DELETE SET NULL';
  end if;

  select pg_get_constraintdef(oid)
  into v_slot_constraint_definition
  from pg_constraint
  where conrelid = 'public.matchday_hierarchical_composition_slots'::regclass
    and conname = 'matchday_hierarchical_composition_slots_slot_key_check';

  if v_slot_constraint_definition is null
     or v_slot_constraint_definition not ilike '%dominant_main%'
     or v_slot_constraint_definition not ilike '%dominant_side_top%'
     or v_slot_constraint_definition not ilike '%dominant_side_bottom%'
     or v_slot_constraint_definition not ilike '%other_chronicle_1%'
     or v_slot_constraint_definition not ilike '%other_chronicle_2%'
     or v_slot_constraint_definition not ilike '%other_chronicle_3%'
     or v_slot_constraint_definition not ilike '%secondary_strong_1%'
     or v_slot_constraint_definition not ilike '%secondary_strong_2%'
     or v_slot_constraint_definition not ilike '%secondary_1%'
     or v_slot_constraint_definition not ilike '%secondary_2%'
     or v_slot_constraint_definition not ilike '%secondary_3%'
     or v_slot_constraint_definition not ilike '%secondary_4%'
     or v_slot_constraint_definition not ilike '%closing_1%'
     or v_slot_constraint_definition not ilike '%closing_2%'
     or v_slot_constraint_definition not ilike '%closing_3%' then
    raise exception 'Postflight falhou: taxonomia dos 15 slots ausente ou incompatível';
  end if;

  select pg_get_functiondef('public.activate_matchday_reference_composition(uuid,uuid,boolean)'::regprocedure)
  into v_function_definition;

  if v_function_definition not ilike '%for update%'
     or v_function_definition not ilike '%is_current = false%'
     or v_function_definition not ilike '%is_current = true%'
     or v_function_definition not ilike '%hierarchical_composition_incomplete%' then
    raise exception 'Postflight falhou: RPC atómica incompleta';
  end if;
end
$$;
