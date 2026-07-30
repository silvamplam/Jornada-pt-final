-- Redação Automática — published_at não destrutivo e idempotência canónica.
-- SQL 4/4 — SMOKE sintético, sempre terminado com ROLLBACK.

begin;

do $$
declare
  v_result record;
  v_article_id uuid;
  v_snapshot_id uuid;
  v_expected_error boolean;
  v_error_detail text;
  v_article_count integer;
  v_snapshot_count integer;
  v_original_url text;
  v_published_at timestamptz;
  v_snapshot_metadata jsonb;
begin
  select count(*)
  into v_article_count
  from public.newsroom_articles article
  where article.source_code = 'synthetic-idempotency-smoke'
    and article.normalized_url =
      'https://example.invalid/newsroom-idempotency-smoke/canonical';

  if v_article_count <> 0 then
    raise exception 'smoke_synthetic_fixture_already_exists'
      using errcode = '55000';
  end if;

  -- 1. Um artigo novo com published_at nulo cria uma única identidade e snapshot.
  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-idempotency-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-idempotency-smoke/original-a',
    p_normalized_url =>
      'https://example.invalid/newsroom-idempotency-smoke/canonical',
    p_external_id => 'synthetic-idempotency-001',
    p_title => 'Synthetic idempotency article',
    p_subtitle => 'Synthetic subtitle',
    p_summary => 'Synthetic summary.',
    p_author => 'Synthetic Author',
    p_published_at => null,
    p_modified_at => null,
    p_detected_at => '2026-07-29 10:00:00+00'::timestamptz,
    p_image_url =>
      'https://example.invalid/newsroom-idempotency-smoke/image.jpg',
    p_processing_status => 'detected',
    p_content_hash => repeat('a', 64),
    p_body =>
      '[{"type":"paragraph","text":"Synthetic immutable body."}]'::jsonb,
    p_source_metadata =>
      '{"adapterKey":"synthetic","byteLength":100,"redirectCount":0}'::jsonb,
    p_extracted_at => '2026-07-29 10:01:00+00'::timestamptz
  );

  if not found
     or v_result.article_action <> 'created'
     or v_result.snapshot_action <> 'created'
     or v_result.article_id is null
     or v_result.snapshot_id is null then
    raise exception 'smoke_create_unexpected'
      using errcode = '55000';
  end if;

  v_article_id := v_result.article_id;
  v_snapshot_id := v_result.snapshot_id;

  -- 2. Uma reingestão integralmente igual reutiliza artigo e snapshot.
  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-idempotency-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-idempotency-smoke/original-a',
    p_normalized_url =>
      'https://example.invalid/newsroom-idempotency-smoke/canonical',
    p_external_id => 'synthetic-idempotency-001',
    p_title => 'Synthetic idempotency article',
    p_subtitle => 'Synthetic subtitle',
    p_summary => 'Synthetic summary.',
    p_author => 'Synthetic Author',
    p_published_at => null,
    p_modified_at => null,
    p_detected_at => '2026-07-29 10:00:00+00'::timestamptz,
    p_image_url =>
      'https://example.invalid/newsroom-idempotency-smoke/image.jpg',
    p_processing_status => 'detected',
    p_content_hash => repeat('a', 64),
    p_body =>
      '[{"type":"paragraph","text":"Synthetic immutable body."}]'::jsonb,
    p_source_metadata =>
      '{"adapterKey":"synthetic","byteLength":100,"redirectCount":0}'::jsonb,
    p_extracted_at => '2026-07-29 10:02:00+00'::timestamptz
  );

  if not found
     or v_result.article_action <> 'reused'
     or v_result.snapshot_action <> 'reused'
     or v_result.article_id <> v_article_id
     or v_result.snapshot_id <> v_snapshot_id then
    raise exception 'smoke_identical_reuse_unexpected'
      using errcode = '55000';
  end if;

  -- 3, 6 e 8. A canonical prevalece sobre original_url; uma data preenche
  -- o valor nulo; byteLength diferente não duplica nem bloqueia o snapshot.
  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-idempotency-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-idempotency-smoke/original-b',
    p_normalized_url =>
      'https://example.invalid/newsroom-idempotency-smoke/canonical',
    p_external_id => 'synthetic-idempotency-001',
    p_title => 'Synthetic idempotency article',
    p_subtitle => 'Synthetic subtitle',
    p_summary => 'Synthetic summary.',
    p_author => 'Synthetic Author',
    p_published_at => '2026-07-29 00:00:00+00'::timestamptz,
    p_modified_at => null,
    p_detected_at => '2026-07-29 11:00:00+00'::timestamptz,
    p_image_url =>
      'https://example.invalid/newsroom-idempotency-smoke/image.jpg',
    p_processing_status => 'detected',
    p_content_hash => repeat('a', 64),
    p_body =>
      '[{"type":"paragraph","text":"Synthetic immutable body."}]'::jsonb,
    p_source_metadata =>
      '{"adapterKey":"synthetic","byteLength":200,"redirectCount":0}'::jsonb,
    p_extracted_at => '2026-07-29 11:01:00+00'::timestamptz
  );

  if not found
     or v_result.article_action <> 'updated'
     or v_result.snapshot_action <> 'reused'
     or v_result.article_id <> v_article_id
     or v_result.snapshot_id <> v_snapshot_id then
    raise exception 'smoke_canonical_date_fill_unexpected'
      using errcode = '55000';
  end if;

  select
    article.original_url,
    article.published_at
  into
    v_original_url,
    v_published_at
  from public.newsroom_articles article
  where article.id = v_article_id;

  if not found
     or v_original_url <>
       'https://example.invalid/newsroom-idempotency-smoke/original-b'
     or v_published_at <>
       '2026-07-29 00:00:00+00'::timestamptz then
    raise exception 'smoke_canonical_or_date_fill_not_persisted'
      using errcode = '55000';
  end if;

  -- 5. Um null mais recente nunca apaga published_at válido.
  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-idempotency-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-idempotency-smoke/original-b',
    p_normalized_url =>
      'https://example.invalid/newsroom-idempotency-smoke/canonical',
    p_external_id => 'synthetic-idempotency-001',
    p_title => 'Synthetic idempotency article',
    p_subtitle => 'Synthetic subtitle',
    p_summary => 'Synthetic summary.',
    p_author => 'Synthetic Author',
    p_published_at => null,
    p_modified_at => null,
    p_detected_at => '2026-07-29 12:00:00+00'::timestamptz,
    p_image_url =>
      'https://example.invalid/newsroom-idempotency-smoke/image.jpg',
    p_processing_status => 'detected',
    p_content_hash => repeat('a', 64),
    p_body =>
      '[{"type":"paragraph","text":"Synthetic immutable body."}]'::jsonb,
    p_source_metadata =>
      '{"adapterKey":"synthetic","byteLength":300,"redirectCount":0}'::jsonb,
    p_extracted_at => '2026-07-29 12:01:00+00'::timestamptz
  );

  if not found
     or v_result.article_action <> 'updated'
     or v_result.snapshot_action <> 'reused' then
    raise exception 'smoke_null_preservation_action_unexpected'
      using errcode = '55000';
  end if;

  select article.published_at
  into v_published_at
  from public.newsroom_articles article
  where article.id = v_article_id;

  if not found
     or v_published_at <>
       '2026-07-29 00:00:00+00'::timestamptz then
    raise exception 'smoke_valid_date_was_erased'
      using errcode = '55000';
  end if;

  -- 7. Uma data válida diferente segue a política temporal mais recente.
  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-idempotency-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-idempotency-smoke/original-b',
    p_normalized_url =>
      'https://example.invalid/newsroom-idempotency-smoke/canonical',
    p_external_id => 'synthetic-idempotency-001',
    p_title => 'Synthetic idempotency article',
    p_subtitle => 'Synthetic subtitle',
    p_summary => 'Synthetic summary.',
    p_author => 'Synthetic Author',
    p_published_at => '2026-07-30 00:00:00+00'::timestamptz,
    p_modified_at => null,
    p_detected_at => '2026-07-29 13:00:00+00'::timestamptz,
    p_image_url =>
      'https://example.invalid/newsroom-idempotency-smoke/image.jpg',
    p_processing_status => 'detected',
    p_content_hash => repeat('a', 64),
    p_body =>
      '[{"type":"paragraph","text":"Synthetic immutable body."}]'::jsonb,
    p_source_metadata =>
      '{"adapterKey":"synthetic","byteLength":300,"redirectCount":0}'::jsonb,
    p_extracted_at => '2026-07-29 13:01:00+00'::timestamptz
  );

  if not found
     or v_result.article_action <> 'updated'
     or v_result.snapshot_action <> 'reused' then
    raise exception 'smoke_newer_valid_date_action_unexpected'
      using errcode = '55000';
  end if;

  select article.published_at
  into v_published_at
  from public.newsroom_articles article
  where article.id = v_article_id;

  if not found
     or v_published_at <>
       '2026-07-30 00:00:00+00'::timestamptz then
    raise exception 'smoke_newer_valid_date_not_applied'
      using errcode = '55000';
  end if;

  -- 9. Outros metadados técnicos diferentes também reutilizam o snapshot.
  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-idempotency-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-idempotency-smoke/original-b',
    p_normalized_url =>
      'https://example.invalid/newsroom-idempotency-smoke/canonical',
    p_external_id => 'synthetic-idempotency-001',
    p_title => 'Synthetic idempotency article',
    p_subtitle => 'Synthetic subtitle',
    p_summary => 'Synthetic summary.',
    p_author => 'Synthetic Author',
    p_published_at => '2026-07-30 00:00:00+00'::timestamptz,
    p_modified_at => null,
    p_detected_at => '2026-07-29 13:00:00+00'::timestamptz,
    p_image_url =>
      'https://example.invalid/newsroom-idempotency-smoke/image.jpg',
    p_processing_status => 'detected',
    p_content_hash => repeat('a', 64),
    p_body =>
      '[{"type":"paragraph","text":"Synthetic immutable body."}]'::jsonb,
    p_source_metadata =>
      '{"adapterKey":"synthetic","byteLength":999,"loadedAt":"changed","redirectCount":2}'::jsonb,
    p_extracted_at => '2026-07-29 13:02:00+00'::timestamptz
  );

  if not found
     or v_result.article_action <> 'reused'
     or v_result.snapshot_action <> 'reused'
     or v_result.snapshot_id <> v_snapshot_id then
    raise exception 'smoke_technical_metadata_reuse_unexpected'
      using errcode = '55000';
  end if;

  select snapshot.source_metadata
  into v_snapshot_metadata
  from public.newsroom_article_snapshots snapshot
  where snapshot.id = v_snapshot_id;

  if not found
     or v_snapshot_metadata <>
       '{"adapterKey":"synthetic","byteLength":100,"redirectCount":0}'::jsonb then
    raise exception 'smoke_immutable_snapshot_metadata_changed'
      using errcode = '55000';
  end if;

  -- 4. Dois external_id não nulos incompatíveis continuam em conflito.
  v_expected_error := false;
  begin
    perform public.newsroom_persist_article_snapshot(
      p_source_code => 'synthetic-idempotency-smoke',
      p_original_url =>
        'https://example.invalid/newsroom-idempotency-smoke/original-b',
      p_normalized_url =>
        'https://example.invalid/newsroom-idempotency-smoke/canonical',
      p_external_id => 'synthetic-idempotency-conflict',
      p_title => 'Synthetic idempotency article',
      p_subtitle => 'Synthetic subtitle',
      p_summary => 'Synthetic summary.',
      p_author => 'Synthetic Author',
      p_published_at => '2026-07-30 00:00:00+00'::timestamptz,
      p_modified_at => null,
      p_detected_at => '2026-07-29 14:00:00+00'::timestamptz,
      p_image_url =>
        'https://example.invalid/newsroom-idempotency-smoke/image.jpg',
      p_processing_status => 'detected',
      p_content_hash => repeat('a', 64),
      p_body =>
        '[{"type":"paragraph","text":"Synthetic immutable body."}]'::jsonb,
      p_source_metadata => '{"adapterKey":"synthetic"}'::jsonb,
      p_extracted_at => '2026-07-29 14:01:00+00'::timestamptz
    );
  exception
    when raise_exception then
      get stacked diagnostics v_error_detail = pg_exception_detail;
      if sqlerrm <> 'persistence_conflict'
         or v_error_detail <> 'article' then
        raise;
      end if;
      v_expected_error := true;
  end;

  if not v_expected_error then
    raise exception 'smoke_external_id_conflict_not_rejected'
      using errcode = '55000';
  end if;

  -- 10. O mesmo hash com corpo diferente continua em conflito.
  v_expected_error := false;
  begin
    perform public.newsroom_persist_article_snapshot(
      p_source_code => 'synthetic-idempotency-smoke',
      p_original_url =>
        'https://example.invalid/newsroom-idempotency-smoke/original-b',
      p_normalized_url =>
        'https://example.invalid/newsroom-idempotency-smoke/canonical',
      p_external_id => 'synthetic-idempotency-001',
      p_title => 'Synthetic idempotency article',
      p_subtitle => 'Synthetic subtitle',
      p_summary => 'Synthetic summary.',
      p_author => 'Synthetic Author',
      p_published_at => '2026-07-30 00:00:00+00'::timestamptz,
      p_modified_at => null,
      p_detected_at => '2026-07-29 14:00:00+00'::timestamptz,
      p_image_url =>
        'https://example.invalid/newsroom-idempotency-smoke/image.jpg',
      p_processing_status => 'detected',
      p_content_hash => repeat('a', 64),
      p_body =>
        '[{"type":"paragraph","text":"Different body for the same hash."}]'::jsonb,
      p_source_metadata => '{"adapterKey":"synthetic"}'::jsonb,
      p_extracted_at => '2026-07-29 14:02:00+00'::timestamptz
    );
  exception
    when raise_exception then
      get stacked diagnostics v_error_detail = pg_exception_detail;
      if sqlerrm <> 'persistence_conflict'
         or v_error_detail <> 'snapshot' then
        raise;
      end if;
      v_expected_error := true;
  end;

  if not v_expected_error then
    raise exception 'smoke_body_conflict_not_rejected'
      using errcode = '55000';
  end if;

  -- 11 e 12. Continua a existir uma identidade e um snapshot para o hash.
  select count(*)
  into v_article_count
  from public.newsroom_articles article
  where article.source_code = 'synthetic-idempotency-smoke'
    and article.normalized_url =
      'https://example.invalid/newsroom-idempotency-smoke/canonical';

  select count(*)
  into v_snapshot_count
  from public.newsroom_article_snapshots snapshot
  where snapshot.article_id = v_article_id
    and snapshot.content_hash = repeat('a', 64);

  if v_article_count <> 1 or v_snapshot_count <> 1 then
    raise exception 'smoke_final_identity_counts_unexpected'
      using errcode = '55000';
  end if;
end;
$$;

select jsonb_build_object(
  'article_count_before_rollback', (
    select count(*)
    from public.newsroom_articles article
    where article.source_code = 'synthetic-idempotency-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-idempotency-smoke/canonical'
  ),
  'snapshot_count_before_rollback', (
    select count(*)
    from public.newsroom_article_snapshots snapshot
    join public.newsroom_articles article
      on article.id = snapshot.article_id
    where article.source_code = 'synthetic-idempotency-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-idempotency-smoke/canonical'
  ),
  'expected', 'one canonical article and one immutable snapshot'
) as smoke_before_rollback;

rollback;

select jsonb_build_object(
  'article_count_after_rollback', (
    select count(*)
    from public.newsroom_articles article
    where article.source_code = 'synthetic-idempotency-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-idempotency-smoke/canonical'
  ),
  'snapshot_count_after_rollback', (
    select count(*)
    from public.newsroom_article_snapshots snapshot
    join public.newsroom_articles article
      on article.id = snapshot.article_id
    where article.source_code = 'synthetic-idempotency-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-idempotency-smoke/canonical'
  ),
  'writes_persisted', false
) as rollback_verification;
