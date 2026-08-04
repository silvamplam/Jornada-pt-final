begin;

do $$
declare
  v_article_a uuid := gen_random_uuid();
  v_article_b uuid := gen_random_uuid();
  v_snapshot_a1 uuid := gen_random_uuid();
  v_snapshot_a2 uuid := gen_random_uuid();
  v_snapshot_b uuid := gen_random_uuid();
  v_batch_id uuid;
  v_count integer;
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.newsroom_articles (
    id, source_code, original_url, normalized_url, title,
    detected_at, processing_status, first_detected_at, last_detected_at
  ) values
  (
    v_article_a, 'smoke', 'https://example.invalid/' || v_suffix || '/a',
    'https://example.invalid/' || v_suffix || '/a', 'Smoke A', now(),
    'normalized', now(), now()
  ),
  (
    v_article_b, 'smoke', 'https://example.invalid/' || v_suffix || '/b',
    'https://example.invalid/' || v_suffix || '/b', 'Smoke B', now(),
    'normalized', now(), now()
  );

  insert into public.newsroom_article_snapshots (
    id, article_id, content_hash, body, source_metadata, extracted_at
  ) values
  (
    v_snapshot_a1, v_article_a, 'smoke-a1-' || v_suffix,
    '[{"type":"paragraph","text":"Primeira versão."}]'::jsonb,
    '{}'::jsonb, now() - interval '1 minute'
  ),
  (
    v_snapshot_b, v_article_b, 'smoke-b-' || v_suffix,
    '[{"type":"paragraph","text":"Versão B."}]'::jsonb,
    '{}'::jsonb, now()
  );

  perform *
  from public.newsroom_apply_editorial_review(
    'working',
    jsonb_build_array(jsonb_build_object(
      'articleId', v_article_a,
      'snapshotId', v_snapshot_a1
    ))
  );

  if not exists (
    select 1
    from public.newsroom_editorial_review_states state
    where state.newsroom_article_id = v_article_a
      and state.decision = 'working'
      and state.reviewed_snapshot_id = v_snapshot_a1
  ) then
    raise exception 'Smoke falhou: decisão em trabalho não foi persistida';
  end if;

  perform *
  from public.newsroom_apply_editorial_review(
    'reopen',
    jsonb_build_array(jsonb_build_object(
      'articleId', v_article_a,
      'snapshotId', v_snapshot_a1
    ))
  );

  if exists (
    select 1
    from public.newsroom_editorial_review_states state
    where state.newsroom_article_id = v_article_a
  ) then
    raise exception 'Smoke falhou: reabrir não removeu o estado';
  end if;

  insert into public.newsroom_article_snapshots (
    id, article_id, content_hash, body, source_metadata, extracted_at
  ) values (
    v_snapshot_a2, v_article_a, 'smoke-a2-' || v_suffix,
    '[{"type":"paragraph","text":"Segunda versão."}]'::jsonb,
    '{}'::jsonb, now()
  );

  begin
    perform *
    from public.newsroom_apply_editorial_review(
      'seen',
      jsonb_build_array(jsonb_build_object(
        'articleId', v_article_a,
        'snapshotId', v_snapshot_a1
      ))
    );
    raise exception 'Smoke falhou: snapshot antigo foi aceite';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'snapshot_stale' then
        raise;
      end if;
  end;

  select result.review_batch_id, result.affected_count
  into v_batch_id, v_count
  from public.newsroom_apply_editorial_review(
    'close_block',
    jsonb_build_array(
      jsonb_build_object('articleId', v_article_a, 'snapshotId', v_snapshot_a2),
      jsonb_build_object('articleId', v_article_b, 'snapshotId', v_snapshot_b)
    )
  ) result;

  if v_batch_id is null or v_count <> 2 then
    raise exception 'Smoke falhou: o bloco não devolveu identidade e contagem corretas';
  end if;

  if (
    select count(*)
    from public.newsroom_editorial_review_states state
    where state.newsroom_article_id in (v_article_a, v_article_b)
      and state.decision = 'seen'
      and state.last_batch_id = v_batch_id
  ) <> 2 then
    raise exception 'Smoke falhou: os dois artigos não ficaram vistos no bloco';
  end if;

  if (
    select count(*)
    from public.newsroom_editorial_review_batch_items item
    where item.batch_id = v_batch_id
  ) <> 2 then
    raise exception 'Smoke falhou: o histórico do bloco não preservou os dois snapshots';
  end if;
end
$$;

select 'Smoke concluído: decisões individuais, reabertura, proteção contra snapshot antigo e fecho transacional de bloco funcionam; rollback preservará os dados' as resultado;

rollback;
