begin;

do $$
declare
  v_matchday_id uuid;
  v_composition_id uuid := gen_random_uuid();
  v_original_slot_id uuid := gen_random_uuid();
  v_valid_bank_id uuid;
  v_missing_bank_id uuid := gen_random_uuid();
  v_original_editorial_source_id uuid := gen_random_uuid();
  v_failed boolean := false;
begin
  select matchday.id
  into v_matchday_id
  from public.matchdays as matchday
  where not exists (
    select 1
    from public.matchday_reference_compositions as composition
    where composition.matchday_id = matchday.id
      and composition.status = 'draft'
      and composition.presentation_mode = 'hierarchical'
  )
  order by matchday.created_at asc
  limit 1;

  if v_matchday_id is null then
    raise exception 'Smoke 124 requer uma jornada sem draft hierarchical';
  end if;

  insert into public.matchday_reference_compositions (
    id,
    matchday_id,
    status,
    is_current,
    internal_name,
    presentation_mode,
    hierarchical_editorial_title,
    hierarchical_editorial_excerpt,
    hierarchical_editorial_text,
    hierarchical_editorial_author,
    hierarchical_editorial_source_type,
    hierarchical_editorial_source_id
  ) values (
    v_composition_id,
    v_matchday_id,
    'draft',
    false,
    'smoke-124-atomic-workspace',
    'hierarchical',
    'Editorial original',
    'Resumo original',
    'Texto original',
    'Autor original',
    'editorial_article',
    v_original_editorial_source_id
  );

  insert into public.matchday_hierarchical_composition_slots (
    id,
    composition_id,
    slot_key,
    bank_item_id,
    source_identity,
    label_snapshot,
    title_snapshot,
    subtitle_snapshot,
    image_url_snapshot,
    link_url_snapshot
  ) values (
    v_original_slot_id,
    v_composition_id,
    'dominant_main',
    null,
    'smoke-124:original',
    'SMOKE',
    'Estado original',
    'Deve sobreviver à falha',
    'https://example.invalid/original.jpg',
    'https://example.invalid/original'
  );

  insert into public.matchday_editorial_bank_items (
    matchday_id,
    label,
    title,
    subtitle,
    image_url,
    link_url,
    source_type,
    source_id,
    status
  ) values (
    v_matchday_id,
    'SMOKE',
    'Nova atribuição transitória',
    'Esta inserção tem de ser revertida',
    'https://example.invalid/new.jpg',
    'https://example.invalid/new',
    'editorial_article',
    gen_random_uuid()::text,
    'active'
  ) returning id into v_valid_bank_id;

  begin
    perform public.apply_historical_composition_workspace_plan(
      v_matchday_id,
      v_composition_id,
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'unassign_slot',
          'slotId', v_original_slot_id
        ),
        jsonb_build_object(
          'kind', 'remove_editorial'
        ),
        jsonb_build_object(
          'kind', 'assign_slot',
          'slotKey', 'dominant_main',
          'bankItemId', v_valid_bank_id
        ),
        jsonb_build_object(
          'kind', 'assign_slot',
          'slotKey', 'dominant_side_top',
          'bankItemId', v_missing_bank_id
        )
      ),
      jsonb_build_object(
        'headlineTitleColor', '#8B1538',
        'zone1Title', 'Título que não pode ficar parcial',
        'zone2Title', 'Outro título transitório',
        'blockOrder', jsonb_build_array('zone_2', 'opening', 'zone_1', 'video', 'beyond')
      )
    );
  exception when others then
    if sqlerrm ilike '%historical_composition_workspace_bank_item_invalid%' then
      v_failed := true;
    else
      raise;
    end if;
  end;

  if not v_failed then
    raise exception 'Smoke 124 falhou: o plano inválido foi aceite';
  end if;

  if not exists (
    select 1
    from public.matchday_hierarchical_composition_slots as slot
    where slot.id = v_original_slot_id
      and slot.composition_id = v_composition_id
      and slot.slot_key = 'dominant_main'
      and slot.source_identity = 'smoke-124:original'
      and slot.title_snapshot = 'Estado original'
  ) then
    raise exception 'Smoke 124 falhou: a remoção anterior ao erro não foi revertida';
  end if;

  if exists (
    select 1
    from public.matchday_hierarchical_composition_slots as slot
    where slot.composition_id = v_composition_id
      and slot.bank_item_id = v_valid_bank_id
  ) then
    raise exception 'Smoke 124 falhou: uma atribuição parcial sobreviveu ao erro';
  end if;

  if exists (
    select 1
    from public.matchday_reference_compositions as composition
    where composition.id = v_composition_id
      and (
        composition.hierarchical_headline_title_color is not null
        or composition.hierarchical_zone_1_title is not null
        or composition.hierarchical_zone_2_title is not null
        or composition.hierarchical_block_order is not null
      )
  ) then
    raise exception 'Smoke 124 falhou: settings parciais sobreviveram ao erro';
  end if;

  if not exists (
    select 1
    from public.matchday_reference_compositions as composition
    where composition.id = v_composition_id
      and composition.hierarchical_editorial_title = 'Editorial original'
      and composition.hierarchical_editorial_excerpt = 'Resumo original'
      and composition.hierarchical_editorial_text = 'Texto original'
      and composition.hierarchical_editorial_author = 'Autor original'
      and composition.hierarchical_editorial_source_type = 'editorial_article'
      and composition.hierarchical_editorial_source_id = v_original_editorial_source_id
  ) then
    raise exception 'Smoke 124 falhou: o Editorial removido não foi restaurado';
  end if;
end
$$;

rollback;
