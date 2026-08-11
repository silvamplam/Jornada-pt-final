do $$
declare
  v_duplicate_drafts record;
  v_mode_column_exists boolean;
  v_current_index_definition text;
  v_hierarchical_slots_relation regclass;
begin
  if to_regclass('public.matchday_reference_compositions') is null then
    raise exception 'Preflight falhou: tabela public.matchday_reference_compositions ausente';
  end if;

  if to_regclass('public.matchday_editorial_bank_items') is null then
    raise exception 'Preflight falhou: tabela public.matchday_editorial_bank_items ausente';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matchday_reference_compositions'
      and column_name = 'presentation_mode'
  ) into v_mode_column_exists;

  if v_mode_column_exists then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'matchday_reference_compositions'
        and column_name = 'presentation_mode'
        and data_type <> 'text'
    ) then
      raise exception 'Preflight falhou: presentation_mode existe com tipo incompatível';
    end if;

    if exists (
      select 1
      from public.matchday_reference_compositions
      where presentation_mode is null
         or presentation_mode not in ('standard', 'hierarchical')
    ) then
      raise exception 'Preflight falhou: presentation_mode contém valores incompatíveis';
    end if;

    execute $query$
      select matchday_id, presentation_mode, count(*) as draft_count
      from public.matchday_reference_compositions
      where status = 'draft'
      group by matchday_id, presentation_mode
      having count(*) > 1
      limit 1
    $query$ into v_duplicate_drafts;
  else
    select matchday_id, 'standard'::text as presentation_mode, count(*) as draft_count
    into v_duplicate_drafts
    from public.matchday_reference_compositions
    where status = 'draft'
    group by matchday_id
    having count(*) > 1
    limit 1;
  end if;

  if v_duplicate_drafts.matchday_id is not null then
    raise exception 'Preflight falhou: jornada % tem % drafts no modo %',
      v_duplicate_drafts.matchday_id,
      v_duplicate_drafts.draft_count,
      v_duplicate_drafts.presentation_mode;
  end if;

  select indexdef
  into v_current_index_definition
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'matchday_reference_compositions_current_unique_idx';

  if v_current_index_definition is null
     or v_current_index_definition not ilike '%unique index%'
     or v_current_index_definition not ilike '%(matchday_id)%'
     or v_current_index_definition not ilike '%is_current = true%' then
    raise exception 'Preflight falhou: índice current único ausente ou incompatível';
  end if;

  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'matchday_reference_compositions'
      and indexname <> 'matchday_reference_compositions_draft_mode_unique_idx'
      and indexdef ilike '%unique index%'
      and indexdef ilike '%matchday_id%'
      and indexdef ilike '%status%'
      and indexdef ilike '%draft%'
      and indexdef not ilike '%presentation_mode%'
  ) then
    raise exception 'Preflight falhou: existe um índice legado que impede drafts simultâneos por modo';
  end if;

  v_hierarchical_slots_relation := to_regclass('public.matchday_hierarchical_composition_slots');

  if v_hierarchical_slots_relation is not null then
    if (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'matchday_hierarchical_composition_slots'
        and column_name in (
          'id', 'composition_id', 'slot_key', 'bank_item_id', 'source_identity',
          'label_snapshot', 'title_snapshot', 'subtitle_snapshot', 'image_url_snapshot',
          'link_url_snapshot', 'created_at', 'updated_at'
        )
    ) <> 12 then
      raise exception 'Preflight falhou: tabela hierárquica parcial/incompatível';
    end if;

    if (
      select count(*)
      from pg_constraint
      where conrelid = v_hierarchical_slots_relation
        and conname in (
          'matchday_hierarchical_composition_slots_slot_key_check',
          'matchday_hierarchical_composition_slots_source_identity_check',
          'matchday_hierarchical_composition_slots_composition_slot_unique',
          'matchday_hierarchical_composition_slots_composition_source_unique'
        )
    ) <> 4 then
      raise exception 'Preflight falhou: constraints da tabela hierárquica parciais/incompatíveis';
    end if;
  end if;
end
$$;
