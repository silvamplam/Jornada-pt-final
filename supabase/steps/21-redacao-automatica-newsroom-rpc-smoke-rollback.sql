-- Redação Automática — persistência transacional de artigo e snapshot.
-- SQL 4/4 — SMOKE TEST totalmente sintético, sempre terminado com ROLLBACK.

begin;

do $$
declare
  v_result record;
  v_article_id uuid;
  v_first_snapshot_id uuid;
  v_second_snapshot_id uuid;
  v_expected_error boolean;
  v_error_detail text;
  v_article_count integer;
  v_snapshot_count integer;
  v_article_found boolean;
  v_persisted_title text;
  v_persisted_detected_at timestamptz;
  v_persisted_last_detected_at timestamptz;
begin
  select count(*)
  into v_article_count
  from public.newsroom_articles article
  where article.source_code = 'synthetic-rpc-smoke'
    and article.normalized_url =
      'https://example.invalid/newsroom-rpc-smoke/synthetic-article';

  if v_article_count <> 0 then
    raise exception 'smoke_synthetic_fixture_already_exists'
      using errcode = '55000';
  end if;

  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-rpc-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-rpc-smoke/synthetic-article',
    p_normalized_url =>
      'https://example.invalid/newsroom-rpc-smoke/synthetic-article',
    p_external_id => 'synthetic-external-001',
    p_title => 'Synthetic RPC article version one',
    p_subtitle => 'Synthetic subtitle',
    p_summary => 'Synthetic summary version one.',
    p_author => 'Synthetic Author',
    p_published_at => '2026-01-01 10:00:00+00'::timestamptz,
    p_modified_at => null,
    p_detected_at => '2026-01-01 10:05:00+00'::timestamptz,
    p_image_url => 'https://example.invalid/newsroom-rpc-smoke/image.jpg',
    p_processing_status => 'ready_for_review',
    p_content_hash => repeat('a', 64),
    p_body =>
      '[{"type":"heading","text":"Synthetic heading version one"},{"type":"paragraph","text":"Synthetic body version one."}]'::jsonb,
    p_source_metadata =>
      '{"fixture":"newsroom-rpc-smoke","network_request":false,"version":1}'::jsonb,
    p_extracted_at => '2026-01-01 10:06:00+00'::timestamptz
  );

  if not found
     or v_result.article_action <> 'created'
     or v_result.snapshot_action <> 'created'
     or v_result.article_id is null
     or v_result.snapshot_id is null then
    raise exception 'smoke_first_call_unexpected'
      using errcode = '55000';
  end if;

  v_article_id := v_result.article_id;
  v_first_snapshot_id := v_result.snapshot_id;

  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-rpc-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-rpc-smoke/synthetic-article',
    p_normalized_url =>
      'https://example.invalid/newsroom-rpc-smoke/synthetic-article',
    p_external_id => 'synthetic-external-001',
    p_title => 'Synthetic RPC article version one',
    p_subtitle => 'Synthetic subtitle',
    p_summary => 'Synthetic summary version one.',
    p_author => 'Synthetic Author',
    p_published_at => '2026-01-01 10:00:00+00'::timestamptz,
    p_modified_at => null,
    p_detected_at => '2026-01-01 10:05:00+00'::timestamptz,
    p_image_url => 'https://example.invalid/newsroom-rpc-smoke/image.jpg',
    p_processing_status => 'ready_for_review',
    p_content_hash => repeat('a', 64),
    p_body =>
      '[{"type":"heading","text":"Synthetic heading version one"},{"type":"paragraph","text":"Synthetic body version one."}]'::jsonb,
    p_source_metadata =>
      '{"fixture":"newsroom-rpc-smoke","network_request":false,"version":1}'::jsonb,
    p_extracted_at => '2026-01-01 10:06:00+00'::timestamptz
  );

  if not found
     or v_result.article_action <> 'reused'
     or v_result.snapshot_action <> 'reused'
     or v_result.article_id <> v_article_id
     or v_result.snapshot_id <> v_first_snapshot_id then
    raise exception 'smoke_idempotent_call_unexpected'
      using errcode = '55000';
  end if;

  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-rpc-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-rpc-smoke/synthetic-article',
    p_normalized_url =>
      'https://example.invalid/newsroom-rpc-smoke/synthetic-article',
    p_external_id => 'synthetic-external-001',
    p_title => 'Synthetic RPC article version two',
    p_subtitle => 'Synthetic subtitle',
    p_summary => 'Synthetic summary version two.',
    p_author => 'Synthetic Author',
    p_published_at => '2026-01-01 10:00:00+00'::timestamptz,
    p_modified_at => '2026-01-01 10:59:00+00'::timestamptz,
    p_detected_at => '2026-01-01 11:00:00+00'::timestamptz,
    p_image_url => 'https://example.invalid/newsroom-rpc-smoke/image-v2.jpg',
    p_processing_status => 'ready_for_review',
    p_content_hash => repeat('b', 64),
    p_body =>
      '[{"type":"heading","text":"Synthetic heading version two"},{"type":"paragraph","text":"Synthetic body version two."}]'::jsonb,
    p_source_metadata =>
      '{"fixture":"newsroom-rpc-smoke","network_request":false,"version":2}'::jsonb,
    p_extracted_at => '2026-01-01 11:01:00+00'::timestamptz
  );

  if not found
     or v_result.article_action <> 'updated'
     or v_result.snapshot_action <> 'created'
     or v_result.article_id <> v_article_id
     or v_result.snapshot_id = v_first_snapshot_id then
    raise exception 'smoke_mutable_update_call_unexpected'
      using errcode = '55000';
  end if;

  v_second_snapshot_id := v_result.snapshot_id;

  select count(*)
  into v_article_count
  from public.newsroom_articles article
  where article.source_code = 'synthetic-rpc-smoke'
    and article.normalized_url =
      'https://example.invalid/newsroom-rpc-smoke/synthetic-article';

  select count(*)
  into v_snapshot_count
  from public.newsroom_article_snapshots snapshot
  where snapshot.article_id = v_article_id;

  if v_article_count <> 1 or v_snapshot_count <> 2 then
    raise exception 'smoke_counts_after_update_unexpected'
      using errcode = '55000';
  end if;

  v_expected_error := false;
  begin
    perform public.newsroom_persist_article_snapshot(
      p_source_code => 'synthetic-rpc-smoke',
      p_original_url =>
        'https://example.invalid/newsroom-rpc-smoke/synthetic-article',
      p_normalized_url =>
        'https://example.invalid/newsroom-rpc-smoke/synthetic-article',
      p_external_id => 'synthetic-external-conflict',
      p_title => 'Synthetic identity conflict attempt',
      p_subtitle => 'Synthetic subtitle',
      p_summary => 'Synthetic identity conflict summary.',
      p_author => 'Synthetic Author',
      p_published_at => '2026-01-01 10:00:00+00'::timestamptz,
      p_modified_at => '2026-01-01 11:59:00+00'::timestamptz,
      p_detected_at => '2026-01-01 12:00:00+00'::timestamptz,
      p_image_url => 'https://example.invalid/newsroom-rpc-smoke/image-v3.jpg',
      p_processing_status => 'ready_for_review',
      p_content_hash => repeat('c', 64),
      p_body =>
        '[{"type":"paragraph","text":"Synthetic identity conflict body."}]'::jsonb,
      p_source_metadata =>
        '{"fixture":"newsroom-rpc-smoke","network_request":false,"version":3}'::jsonb,
      p_extracted_at => '2026-01-01 12:01:00+00'::timestamptz
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

  select
    article.title,
    article.detected_at,
    article.last_detected_at
  into
    v_persisted_title,
    v_persisted_detected_at,
    v_persisted_last_detected_at
  from public.newsroom_articles article
  where article.id = v_article_id;

  if not found
     or v_persisted_title <> 'Synthetic RPC article version two'
     or v_persisted_detected_at <>
       '2026-01-01 11:00:00+00'::timestamptz
     or v_persisted_last_detected_at <>
       '2026-01-01 11:00:00+00'::timestamptz then
    raise exception 'smoke_external_id_conflict_changed_article'
      using errcode = '55000';
  end if;

  v_expected_error := false;
  begin
    perform public.newsroom_persist_article_snapshot(
      p_source_code => 'synthetic-rpc-smoke',
      p_original_url =>
        'https://example.invalid/newsroom-rpc-smoke/synthetic-article',
      p_normalized_url =>
        'https://example.invalid/newsroom-rpc-smoke/synthetic-article',
      p_external_id => 'synthetic-external-001',
      p_title => 'Synthetic title that must be rolled back',
      p_subtitle => 'Synthetic subtitle that must be rolled back',
      p_summary => 'Synthetic summary that must be rolled back.',
      p_author => 'Synthetic Rollback Author',
      p_published_at => '2026-01-01 10:00:00+00'::timestamptz,
      p_modified_at => '2026-01-01 12:59:00+00'::timestamptz,
      p_detected_at => '2026-01-01 13:00:00+00'::timestamptz,
      p_image_url =>
        'https://example.invalid/newsroom-rpc-smoke/rollback-image.jpg',
      p_processing_status => 'failed',
      p_content_hash => repeat('b', 64),
      p_body =>
        '[{"type":"paragraph","text":"Incompatible synthetic body for the same hash."}]'::jsonb,
      p_source_metadata =>
        '{"fixture":"newsroom-rpc-smoke","network_request":false,"version":999}'::jsonb,
      p_extracted_at => '2026-01-01 13:01:00+00'::timestamptz
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
    raise exception 'smoke_snapshot_payload_conflict_not_rejected'
      using errcode = '55000';
  end if;

  select
    article.title,
    article.detected_at,
    article.last_detected_at
  into
    v_persisted_title,
    v_persisted_detected_at,
    v_persisted_last_detected_at
  from public.newsroom_articles article
  where article.id = v_article_id;

  v_article_found := found;

  select count(*)
  into v_snapshot_count
  from public.newsroom_article_snapshots snapshot
  where snapshot.article_id = v_article_id;

  if not v_article_found
     or v_persisted_title <> 'Synthetic RPC article version two'
     or v_persisted_detected_at <>
       '2026-01-01 11:00:00+00'::timestamptz
     or v_persisted_last_detected_at <>
       '2026-01-01 11:00:00+00'::timestamptz
     or v_snapshot_count <> 2 then
    raise exception 'smoke_snapshot_failure_was_not_atomic'
      using errcode = '55000';
  end if;

  v_expected_error := false;
  begin
    update public.newsroom_article_snapshots snapshot
    set body = '[]'::jsonb
    where snapshot.id = v_first_snapshot_id;
  exception
    when raise_exception then
      if sqlerrm <> 'newsroom article snapshots are immutable' then
        raise;
      end if;
      v_expected_error := true;
  end;

  if not v_expected_error then
    raise exception 'smoke_direct_snapshot_update_not_rejected'
      using errcode = '55000';
  end if;

  v_expected_error := false;
  begin
    delete from public.newsroom_article_snapshots snapshot
    where snapshot.id = v_second_snapshot_id;
  exception
    when raise_exception then
      if sqlerrm <> 'newsroom article snapshots are immutable' then
        raise;
      end if;
      v_expected_error := true;
  end;

  if not v_expected_error then
    raise exception 'smoke_direct_snapshot_delete_not_rejected'
      using errcode = '55000';
  end if;

  select count(*)
  into v_article_count
  from public.newsroom_articles article
  where article.source_code = 'synthetic-rpc-smoke'
    and article.normalized_url =
      'https://example.invalid/newsroom-rpc-smoke/synthetic-article';

  select count(*)
  into v_snapshot_count
  from public.newsroom_article_snapshots snapshot
  where snapshot.article_id = v_article_id;

  if v_article_count <> 1 or v_snapshot_count <> 2 then
    raise exception 'smoke_final_counts_unexpected'
      using errcode = '55000';
  end if;
end;
$$;

select
  article.id as article_id,
  article.title,
  article.original_url,
  article.first_detected_at,
  article.last_detected_at,
  snapshot.id as snapshot_id,
  snapshot.content_hash,
  snapshot.extracted_at
from public.newsroom_articles article
join public.newsroom_article_snapshots snapshot
  on snapshot.article_id = article.id
where article.source_code = 'synthetic-rpc-smoke'
  and article.normalized_url =
    'https://example.invalid/newsroom-rpc-smoke/synthetic-article'
order by snapshot.extracted_at;

select jsonb_build_object(
  'article_count_before_rollback', (
    select count(*)
    from public.newsroom_articles article
    where article.source_code = 'synthetic-rpc-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-rpc-smoke/synthetic-article'
  ),
  'snapshot_count_before_rollback', (
    select count(*)
    from public.newsroom_article_snapshots snapshot
    join public.newsroom_articles article
      on article.id = snapshot.article_id
    where article.source_code = 'synthetic-rpc-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-rpc-smoke/synthetic-article'
  ),
  'expected', 'one article and two immutable snapshots'
) as smoke_before_rollback;

rollback;

select jsonb_build_object(
  'article_count_after_rollback', (
    select count(*)
    from public.newsroom_articles article
    where article.source_code = 'synthetic-rpc-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-rpc-smoke/synthetic-article'
  ),
  'snapshot_count_after_rollback', (
    select count(*)
    from public.newsroom_article_snapshots snapshot
    join public.newsroom_articles article
      on article.id = snapshot.article_id
    where article.source_code = 'synthetic-rpc-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-rpc-smoke/synthetic-article'
  ),
  'expected', 'both counts are zero',
  'writes_persisted', false
) as rollback_verification;
