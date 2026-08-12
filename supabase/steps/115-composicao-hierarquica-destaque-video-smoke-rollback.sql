begin;

do $$
declare
  v_matchday_id uuid;
  v_composition_id uuid := gen_random_uuid();
  v_slot_key text;
  v_index integer := 0;
  v_blocked boolean := false;
begin
  select matchday.id
  into v_matchday_id
  from public.matchdays matchday
  where not exists (
    select 1
    from public.matchday_reference_compositions composition
    where composition.matchday_id = matchday.id
      and composition.status = 'draft'
      and composition.presentation_mode = 'hierarchical'
  )
  order by matchday.created_at asc
  limit 1;

  if v_matchday_id is null then
    raise notice 'Smoke 115 ignorado: não existe jornada livre de draft hierarchical para ensaio transacional.';
    return;
  end if;

  insert into public.matchday_reference_compositions (
    id, matchday_id, status, is_current, internal_name, presentation_mode
  ) values (
    v_composition_id, v_matchday_id, 'draft', false, 'smoke-115-video', 'hierarchical'
  );

  foreach v_slot_key in array array[
    'dominant_main',
    'dominant_side_top',
    'dominant_side_bottom',
    'other_chronicle_1',
    'other_chronicle_2',
    'other_chronicle_3',
    'secondary_strong_1',
    'secondary_strong_2',
    'secondary_1',
    'secondary_2',
    'secondary_3',
    'secondary_4',
    'closing_1',
    'closing_2',
    'closing_3'
  ] loop
    v_index := v_index + 1;

    insert into public.matchday_hierarchical_composition_slots (
      composition_id,
      slot_key,
      source_identity,
      label_snapshot,
      title_snapshot,
      subtitle_snapshot,
      image_url_snapshot,
      link_url_snapshot,
      media_kind_snapshot,
      media_embed_url_snapshot
    ) values (
      v_composition_id,
      v_slot_key,
      'smoke-115:' || v_composition_id::text || ':' || v_index,
      'Antetítulo',
      'Título ' || v_index,
      'Pós-título',
      case when v_slot_key = 'dominant_main' then null else 'https://example.test/image-' || v_index || '.jpg' end,
      '/noticias/smoke-' || v_index,
      case when v_slot_key = 'dominant_main' then 'embed' else null end,
      case when v_slot_key = 'dominant_main' then 'https://www.youtube.com/embed/dQw4w9WgXcQ' else null end
    );
  end loop;

  for v_index in 1..5 loop
    insert into public.matchday_reference_composition_items (
      composition_id,
      slot_type,
      source_type,
      source_id,
      sort_order,
      label_snapshot,
      title_snapshot,
      subtitle_snapshot,
      image_url_snapshot,
      link_url_snapshot,
      status
    ) values (
      v_composition_id,
      'beyond_matchday',
      'editorial_article',
      gen_random_uuid(),
      v_index,
      'ATUALIDADE',
      'Notícia ' || v_index,
      'Contexto',
      'https://example.test/beyond-' || v_index || '.jpg',
      '/noticias/beyond-' || v_index,
      'draft'
    );
  end loop;

  perform public.activate_matchday_reference_composition(v_matchday_id, v_composition_id, true);

  if not exists (
    select 1
    from public.matchday_reference_compositions
    where id = v_composition_id
      and status = 'published'
      and is_current = true
  ) then
    raise exception 'Smoke 115 falhou: composição com Manchete-vídeo válida não foi publicada/current';
  end if;

  begin
    update public.matchday_hierarchical_composition_slots
    set image_url_snapshot = null
    where composition_id = v_composition_id
      and slot_key = 'dominant_side_top';

    perform public.activate_matchday_reference_composition(v_matchday_id, v_composition_id, false);
  exception
    when others then
      if sqlerrm ilike '%hierarchical_composition_incomplete%' then
        v_blocked := true;
      else
        raise;
      end if;
  end;

  if not v_blocked then
    raise exception 'Smoke 115 falhou: vídeo da Manchete relaxou indevidamente a obrigatoriedade de imagem nos outros 14 slots';
  end if;
end
$$;

rollback;
