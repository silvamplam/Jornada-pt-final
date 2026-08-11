begin;

do $$
declare
  v_matchday_id uuid;
  v_standard_id uuid := gen_random_uuid();
  v_hierarchical_id uuid := gen_random_uuid();
  v_bank_id uuid;
  v_slot_key text;
  v_index integer := 0;
  v_duplicate_blocked boolean := false;
  v_incomplete_blocked boolean := false;
begin
  select matchday.id
  into v_matchday_id
  from public.matchdays matchday
  where not exists (
    select 1
    from public.matchday_reference_compositions composition
    where composition.matchday_id = matchday.id
      and composition.status = 'draft'
  )
  order by matchday.created_at asc
  limit 1;
  if v_matchday_id is null then
    raise exception 'Smoke requer pelo menos uma jornada existente';
  end if;

  insert into public.matchday_reference_compositions (
    id, matchday_id, status, is_current, internal_name, presentation_mode
  ) values
    (v_standard_id, v_matchday_id, 'draft', false, 'smoke-standard', 'standard'),
    (v_hierarchical_id, v_matchday_id, 'draft', false, 'smoke-hierarchical', 'hierarchical');

  begin
    insert into public.matchday_reference_compositions (
      matchday_id, status, is_current, internal_name, presentation_mode
    ) values (v_matchday_id, 'draft', false, 'smoke-standard-duplicado', 'standard');
  exception when unique_violation then
    v_duplicate_blocked := true;
  end;

  if not v_duplicate_blocked then
    raise exception 'Smoke falhou: segundo draft standard foi aceite';
  end if;

  begin
    perform public.activate_matchday_reference_composition(v_matchday_id, v_hierarchical_id, true);
  exception when others then
    if sqlerrm ilike '%hierarchical_composition_incomplete%' then
      v_incomplete_blocked := true;
    else
      raise;
    end if;
  end;

  if not v_incomplete_blocked then
    raise exception 'Smoke falhou: draft hierárquico incompleto foi publicado';
  end if;

  foreach v_slot_key in array array[
    'dominant_main', 'dominant_side_top', 'dominant_side_bottom',
    'other_chronicle_1', 'other_chronicle_2', 'other_chronicle_3',
    'secondary_strong_1', 'secondary_strong_2',
    'secondary_1', 'secondary_2', 'secondary_3', 'secondary_4',
    'closing_1', 'closing_2', 'closing_3'
  ] loop
    v_index := v_index + 1;
    insert into public.matchday_editorial_bank_items (
      matchday_id, label, title, subtitle, image_url, link_url,
      source_type, source_id, status
    ) values (
      v_matchday_id, 'SMOKE', 'Notícia ' || v_index, 'Pós-título ' || v_index,
      'https://example.invalid/image-' || v_index || '.jpg',
      'https://example.invalid/item-' || v_index,
      'hierarchical_smoke', v_hierarchical_id::text || ':' || v_index, 'active'
    ) returning id into v_bank_id;

    insert into public.matchday_hierarchical_composition_slots (
      composition_id, slot_key, bank_item_id, source_identity,
      label_snapshot, title_snapshot, subtitle_snapshot, image_url_snapshot, link_url_snapshot
    ) values (
      v_hierarchical_id, v_slot_key, v_bank_id,
      'hierarchical_smoke:' || v_hierarchical_id::text || ':' || v_index,
      'SMOKE', 'Notícia ' || v_index, 'Pós-título ' || v_index,
      'https://example.invalid/image-' || v_index || '.jpg',
      'https://example.invalid/item-' || v_index
    );
  end loop;

  perform public.activate_matchday_reference_composition(v_matchday_id, v_hierarchical_id, true);

  if not exists (
    select 1 from public.matchday_reference_compositions
    where id = v_hierarchical_id and status = 'published' and is_current = true
  ) then
    raise exception 'Smoke falhou: hierárquica não foi publicada/current';
  end if;

  perform public.activate_matchday_reference_composition(v_matchday_id, v_standard_id, true);

  if not exists (
    select 1 from public.matchday_reference_compositions
    where id = v_standard_id and status = 'published' and is_current = true
  ) or not exists (
    select 1 from public.matchday_reference_compositions
    where id = v_hierarchical_id and status = 'published' and is_current = false
  ) or exists (
    select 1 from public.matchday_reference_compositions
    where id = v_hierarchical_id and is_current = true
  ) then
    raise exception 'Smoke falhou: reversão atómica para standard incoerente';
  end if;
end
$$;

rollback;
