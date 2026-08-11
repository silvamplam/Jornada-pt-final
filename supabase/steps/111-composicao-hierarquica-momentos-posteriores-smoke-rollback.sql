begin;

do $$
declare
  v_matchday_id uuid;
  v_standard_id uuid := gen_random_uuid();
  v_hierarchical_id uuid := gen_random_uuid();
  v_slot_key text;
  v_index integer := 0;
  v_beyond_index integer;
  v_incomplete_draft_blocked boolean := false;
  v_missing_beyond_blocked boolean := false;
  v_duplicate_position_blocked boolean := false;
  v_published_beyond_reactivation_blocked boolean := false;
  v_published_core_reactivation_blocked boolean := false;
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
    raise exception 'Smoke 111 requer pelo menos uma jornada sem drafts';
  end if;

  insert into public.matchday_reference_compositions (
    id, matchday_id, status, is_current, internal_name, presentation_mode
  ) values
    (v_standard_id, v_matchday_id, 'draft', false, 'smoke-111-standard', 'standard'),
    (v_hierarchical_id, v_matchday_id, 'draft', false, 'smoke-111-hierarchical', 'hierarchical');

  begin
    perform public.activate_matchday_reference_composition(v_matchday_id, v_hierarchical_id, true);
  exception when others then
    if sqlerrm ilike '%hierarchical_composition_incomplete%' then
      v_incomplete_draft_blocked := true;
    else
      raise;
    end if;
  end;

  if not v_incomplete_draft_blocked then
    raise exception 'Smoke 111 falhou: draft hierarchical sem os 15 slots tornou-se current';
  end if;

  foreach v_slot_key in array array[
    'dominant_main', 'dominant_side_top', 'dominant_side_bottom',
    'other_chronicle_1', 'other_chronicle_2', 'other_chronicle_3',
    'secondary_strong_1', 'secondary_strong_2',
    'secondary_1', 'secondary_2', 'secondary_3', 'secondary_4',
    'closing_1', 'closing_2', 'closing_3'
  ] loop
    v_index := v_index + 1;
    insert into public.matchday_hierarchical_composition_slots (
      composition_id, slot_key, source_identity,
      label_snapshot, title_snapshot, subtitle_snapshot,
      image_url_snapshot, link_url_snapshot
    ) values (
      v_hierarchical_id, v_slot_key,
      'smoke-111:' || v_hierarchical_id::text || ':' || v_index,
      'SMOKE', 'Notícia ' || v_index, 'Pós-título ' || v_index,
      'https://example.invalid/core-' || v_index || '.jpg',
      '/noticias/core-' || v_index
    );
  end loop;

  begin
    perform public.activate_matchday_reference_composition(v_matchday_id, v_hierarchical_id, true);
  exception when others then
    if sqlerrm ilike '%hierarchical_beyond_matchday_incomplete%' then
      v_missing_beyond_blocked := true;
    else
      raise;
    end if;
  end;

  if not v_missing_beyond_blocked then
    raise exception 'Smoke 111 falhou: draft hierarchical sem as cinco posições tornou-se current';
  end if;

  for v_beyond_index in 1..5 loop
    insert into public.matchday_reference_composition_items (
      composition_id, slot_type, source_type, source_id, sort_order,
      label_snapshot, title_snapshot, subtitle_snapshot,
      image_url_snapshot, link_url_snapshot, status
    ) values (
      v_hierarchical_id, 'beyond_matchday', 'editorial_article', gen_random_uuid(), v_beyond_index,
      'ATUALIDADE', 'Para lá ' || v_beyond_index, 'Contexto ' || v_beyond_index,
      'https://example.invalid/beyond-' || v_beyond_index || '.jpg',
      '/noticias/beyond-' || v_beyond_index,
      'draft'
    );
  end loop;

  begin
    insert into public.matchday_reference_composition_items (
      composition_id, slot_type, source_type, source_id, sort_order,
      label_snapshot, title_snapshot, subtitle_snapshot,
      image_url_snapshot, link_url_snapshot, status
    ) values (
      v_hierarchical_id, 'beyond_matchday', 'editorial_article', gen_random_uuid(), 5,
      'ATUALIDADE', 'Posição duplicada', 'Contexto duplicado',
      'https://example.invalid/beyond-duplicate.jpg',
      '/noticias/beyond-duplicate',
      'draft'
    );
  exception when unique_violation then
    v_duplicate_position_blocked := true;
  end;

  if not v_duplicate_position_blocked then
    raise exception 'Smoke 111 falhou: posição duplicada de Para Lá da Jornada foi aceite';
  end if;

  perform public.activate_matchday_reference_composition(v_matchday_id, v_hierarchical_id, true);

  if not exists (
    select 1
    from public.matchday_reference_compositions
    where id = v_hierarchical_id
      and status = 'published'
      and is_current = true
  ) then
    raise exception 'Smoke 111 falhou: hierarchical completa não foi publicada/current';
  end if;

  perform public.activate_matchday_reference_composition(v_matchday_id, v_standard_id, true);

  delete from public.matchday_reference_composition_items
  where composition_id = v_hierarchical_id
    and slot_type = 'beyond_matchday'
    and sort_order = 5;

  begin
    perform public.activate_matchday_reference_composition(v_matchday_id, v_hierarchical_id, false);
  exception when others then
    if sqlerrm ilike '%hierarchical_beyond_matchday_incomplete%' then
      v_published_beyond_reactivation_blocked := true;
    else
      raise;
    end if;
  end;

  if not v_published_beyond_reactivation_blocked then
    raise exception 'Smoke 111 falhou: hierarchical published sem as cinco posições foi reativada';
  end if;

  insert into public.matchday_reference_composition_items (
    composition_id, slot_type, source_type, source_id, sort_order,
    label_snapshot, title_snapshot, subtitle_snapshot,
    image_url_snapshot, link_url_snapshot, status
  ) values (
    v_hierarchical_id, 'beyond_matchday', 'editorial_article', gen_random_uuid(), 5,
    'ATUALIDADE', 'Para lá 5 restaurada', 'Contexto 5 restaurado',
    'https://example.invalid/beyond-5-restored.jpg',
    '/noticias/beyond-5-restored',
    'draft'
  );

  delete from public.matchday_hierarchical_composition_slots
  where composition_id = v_hierarchical_id
    and slot_key = 'closing_3';

  begin
    perform public.activate_matchday_reference_composition(v_matchday_id, v_hierarchical_id, false);
  exception when others then
    if sqlerrm ilike '%hierarchical_composition_incomplete%' then
      v_published_core_reactivation_blocked := true;
    else
      raise;
    end if;
  end;

  if not v_published_core_reactivation_blocked then
    raise exception 'Smoke 111 falhou: hierarchical published sem os 15 slots foi reativada';
  end if;

  if not exists (
    select 1
    from public.matchday_reference_compositions
    where id = v_standard_id
      and status = 'published'
      and is_current = true
  ) or exists (
    select 1
    from public.matchday_reference_compositions
    where id = v_hierarchical_id
      and is_current = true
  ) then
    raise exception 'Smoke 111 falhou: tentativa inválida alterou a composição current';
  end if;
end
$$;

rollback;
