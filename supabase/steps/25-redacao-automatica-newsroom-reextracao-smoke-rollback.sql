-- Redação Automática — política transacional de reextração idêntica.
-- SQL 4/4 — SMOKE sintético, sempre terminado com ROLLBACK.

begin;

do $$
declare
  v_result record;
  v_article_id uuid;
  v_first_snapshot_id uuid;
  v_second_snapshot_id uuid;
  v_initial_extracted_at timestamptz;
  v_stored_extracted_at timestamptz;
  v_expected_error boolean;
  v_error_detail text;
  v_article_count integer;
  v_snapshot_count integer;
  v_persisted_title text;
  v_persisted_detected_at timestamptz;
  v_persisted_last_detected_at timestamptz;
begin
  select count(*)
  into v_article_count
  from public.newsroom_articles article
  where article.source_code = 'synthetic-reextraction-smoke'
    and article.normalized_url =
      'https://example.invalid/newsroom-reextraction-smoke/article';

  if v_article_count <> 0 then
    raise exception 'smoke_synthetic_fixture_already_exists'
      using errcode = '55000';
  end if;

  v_initial_extracted_at :=
    '2026-07-25 10:06:00+00'::timestamptz;

  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-reextraction-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-reextraction-smoke/article',
    p_normalized_url =>
      'https://example.invalid/newsroom-reextraction-smoke/article',
    p_external_id => 'synthetic-reextraction-001',
    p_title => 'Synthetic reextraction article version one',
    p_subtitle => 'Synthetic subtitle',
    p_summary => 'Synthetic summary version one.',
    p_author => 'Synthetic Author',
    p_published_at => '2026-07-25 10:00:00+00'::timestamptz,
    p_modified_at => null,
    p_detected_at => '2026-07-25 10:05:00+00'::timestamptz,
    p_image_url =>
      'https://example.invalid/newsroom-reextraction-smoke/image.jpg',
    p_processing_status => 'ready_for_review',
    p_content_hash => repeat('a', 64),
    p_body =>
      '[{"type":"heading","text":"Synthetic heading version one"},{"type":"paragraph","text":"Synthetic body version one."}]'::jsonb,
    p_source_metadata =>
      '{"adapterKey":"synthetic","fixture":"reextraction-smoke","ingestionMode":"offline_local_html","networkRequest":false,"version":1}'::jsonb,
    p_extracted_at => v_initial_extracted_at
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

  select snapshot.extracted_at
  into v_stored_extracted_at
  from public.newsroom_article_snapshots snapshot
  where snapshot.id = v_first_snapshot_id;

  if not found or v_stored_extracted_at <> v_initial_extracted_at then
    raise exception 'smoke_initial_extracted_at_unexpected'
      using errcode = '55000';
  end if;

  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-reextraction-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-reextraction-smoke/article',
    p_normalized_url =>
      'https://example.invalid/newsroom-reextraction-smoke/article',
    p_external_id => 'synthetic-reextraction-001',
    p_title => 'Synthetic reextraction article version one',
    p_subtitle => 'Synthetic subtitle',
    p_summary => 'Synthetic summary version one.',
    p_author => 'Synthetic Author',
    p_published_at => '2026-07-25 10:00:00+00'::timestamptz,
    p_modified_at => null,
    p_detected_at => '2026-07-25 10:05:00+00'::timestamptz,
    p_image_url =>
      'https://example.invalid/newsroom-reextraction-smoke/image.jpg',
    p_processing_status => 'ready_for_review',
    p_content_hash => repeat('a', 64),
    p_body =>
      '[{"type":"heading","text":"Synthetic heading version one"},{"type":"paragraph","text":"Synthetic body version one."}]'::jsonb,
    p_source_metadata =>
      '{"adapterKey":"synthetic","fixture":"reextraction-smoke","ingestionMode":"offline_local_html","networkRequest":false,"version":1}'::jsonb,
    p_extracted_at => '2026-07-25 11:06:00+00'::timestamptz
  );

  if not found
     or v_result.article_action <> 'reused'
     or v_result.snapshot_action <> 'reused'
     or v_result.article_id <> v_article_id
     or v_result.snapshot_id <> v_first_snapshot_id then
    raise exception 'smoke_identical_reextraction_unexpected'
      using errcode = '55000';
  end if;

  select
    snapshot.extracted_at,
    count(*) over ()
  into
    v_stored_extracted_at,
    v_snapshot_count
  from public.newsroom_article_snapshots snapshot
  where snapshot.article_id = v_article_id;

  if not found
     or v_snapshot_count <> 1
     or v_stored_extracted_at <> v_initial_extracted_at then
    raise exception 'smoke_identical_reextraction_changed_snapshot'
      using errcode = '55000';
  end if;

  v_expected_error := false;
  begin
    perform public.newsroom_persist_article_snapshot(
      p_source_code => 'synthetic-reextraction-smoke',
      p_original_url =>
        'https://example.invalid/newsroom-reextraction-smoke/article',
      p_normalized_url =>
        'https://example.invalid/newsroom-reextraction-smoke/article',
      p_external_id => 'synthetic-reextraction-001',
      p_title => 'Body conflict title that must roll back',
      p_subtitle => 'Body conflict subtitle',
      p_summary => 'Body conflict summary.',
      p_author => 'Synthetic Conflict Author',
      p_published_at => '2026-07-25 10:00:00+00'::timestamptz,
      p_modified_at => '2026-07-25 11:59:00+00'::timestamptz,
      p_detected_at => '2026-07-25 12:00:00+00'::timestamptz,
      p_image_url =>
        'https://example.invalid/newsroom-reextraction-smoke/body-conflict.jpg',
      p_processing_status => 'failed',
      p_content_hash => repeat('a', 64),
      p_body =>
        '[{"type":"paragraph","text":"Different body using the same synthetic hash."}]'::jsonb,
      p_source_metadata =>
        '{"adapterKey":"synthetic","fixture":"reextraction-smoke","ingestionMode":"offline_local_html","networkRequest":false,"version":1}'::jsonb,
      p_extracted_at => '2026-07-25 12:01:00+00'::timestamptz
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

  if not found then
    raise exception 'smoke_body_conflict_removed_article'
      using errcode = '55000';
  end if;

  select count(*)
  into v_snapshot_count
  from public.newsroom_article_snapshots snapshot
  where snapshot.article_id = v_article_id;

  if v_persisted_title <>
       'Synthetic reextraction article version one'
     or v_persisted_detected_at <>
       '2026-07-25 10:05:00+00'::timestamptz
     or v_persisted_last_detected_at <>
       '2026-07-25 10:05:00+00'::timestamptz
     or v_snapshot_count <> 1 then
    raise exception 'smoke_body_conflict_was_not_atomic'
      using errcode = '55000';
  end if;

  v_expected_error := false;
  begin
    perform public.newsroom_persist_article_snapshot(
      p_source_code => 'synthetic-reextraction-smoke',
      p_original_url =>
        'https://example.invalid/newsroom-reextraction-smoke/article',
      p_normalized_url =>
        'https://example.invalid/newsroom-reextraction-smoke/article',
      p_external_id => 'synthetic-reextraction-001',
      p_title => 'Metadata conflict title that must roll back',
      p_subtitle => 'Metadata conflict subtitle',
      p_summary => 'Metadata conflict summary.',
      p_author => 'Synthetic Conflict Author',
      p_published_at => '2026-07-25 10:00:00+00'::timestamptz,
      p_modified_at => '2026-07-25 12:59:00+00'::timestamptz,
      p_detected_at => '2026-07-25 13:00:00+00'::timestamptz,
      p_image_url =>
        'https://example.invalid/newsroom-reextraction-smoke/metadata-conflict.jpg',
      p_processing_status => 'failed',
      p_content_hash => repeat('a', 64),
      p_body =>
        '[{"type":"heading","text":"Synthetic heading version one"},{"type":"paragraph","text":"Synthetic body version one."}]'::jsonb,
      p_source_metadata =>
        '{"adapterKey":"synthetic","fixture":"reextraction-smoke","ingestionMode":"offline_local_html","networkRequest":false,"version":999}'::jsonb,
      p_extracted_at => '2026-07-25 13:01:00+00'::timestamptz
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
    raise exception 'smoke_source_metadata_conflict_not_rejected'
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

  if not found then
    raise exception 'smoke_source_metadata_conflict_removed_article'
      using errcode = '55000';
  end if;

  select count(*)
  into v_snapshot_count
  from public.newsroom_article_snapshots snapshot
  where snapshot.article_id = v_article_id;

  if v_persisted_title <>
       'Synthetic reextraction article version one'
     or v_persisted_detected_at <>
       '2026-07-25 10:05:00+00'::timestamptz
     or v_persisted_last_detected_at <>
       '2026-07-25 10:05:00+00'::timestamptz
     or v_snapshot_count <> 1 then
    raise exception 'smoke_source_metadata_conflict_was_not_atomic'
      using errcode = '55000';
  end if;

  select *
  into v_result
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'synthetic-reextraction-smoke',
    p_original_url =>
      'https://example.invalid/newsroom-reextraction-smoke/article',
    p_normalized_url =>
      'https://example.invalid/newsroom-reextraction-smoke/article',
    p_external_id => 'synthetic-reextraction-001',
    p_title => 'Synthetic reextraction article version two',
    p_subtitle => 'Synthetic subtitle version two',
    p_summary => 'Synthetic summary version two.',
    p_author => 'Synthetic Author',
    p_published_at => '2026-07-25 10:00:00+00'::timestamptz,
    p_modified_at => '2026-07-25 13:59:00+00'::timestamptz,
    p_detected_at => '2026-07-25 14:00:00+00'::timestamptz,
    p_image_url =>
      'https://example.invalid/newsroom-reextraction-smoke/image-v2.jpg',
    p_processing_status => 'ready_for_review',
    p_content_hash => repeat('b', 64),
    p_body =>
      '[{"type":"heading","text":"Synthetic heading version two"},{"type":"paragraph","text":"Synthetic body version two."}]'::jsonb,
    p_source_metadata =>
      '{"adapterKey":"synthetic","fixture":"reextraction-smoke","ingestionMode":"offline_local_html","networkRequest":false,"version":2}'::jsonb,
    p_extracted_at => '2026-07-25 14:01:00+00'::timestamptz
  );

  if not found
     or v_result.article_action <> 'updated'
     or v_result.snapshot_action <> 'created'
     or v_result.article_id <> v_article_id
     or v_result.snapshot_id = v_first_snapshot_id then
    raise exception 'smoke_new_content_call_unexpected'
      using errcode = '55000';
  end if;

  v_second_snapshot_id := v_result.snapshot_id;

  select count(*)
  into v_article_count
  from public.newsroom_articles article
  where article.id = v_article_id;

  select count(*)
  into v_snapshot_count
  from public.newsroom_article_snapshots snapshot
  where snapshot.article_id = v_article_id;

  if v_article_count <> 1 or v_snapshot_count <> 2 then
    raise exception 'smoke_counts_after_new_content_unexpected'
      using errcode = '55000';
  end if;

  v_expected_error := false;
  begin
    update public.newsroom_article_snapshots snapshot
    set extracted_at = snapshot.extracted_at + interval '1 second'
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
  where article.source_code = 'synthetic-reextraction-smoke'
    and article.normalized_url =
      'https://example.invalid/newsroom-reextraction-smoke/article';

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
where article.source_code = 'synthetic-reextraction-smoke'
  and article.normalized_url =
    'https://example.invalid/newsroom-reextraction-smoke/article'
order by snapshot.extracted_at;

select jsonb_build_object(
  'article_count', (
    select count(*)
    from public.newsroom_articles article
    where article.source_code = 'synthetic-reextraction-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-reextraction-smoke/article'
  ),
  'snapshot_count', (
    select count(*)
    from public.newsroom_article_snapshots snapshot
    join public.newsroom_articles article
      on article.id = snapshot.article_id
    where article.source_code = 'synthetic-reextraction-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-reextraction-smoke/article'
  ),
  'expected', 'one article and two immutable snapshots'
) as smoke_before_rollback;

rollback;

select jsonb_build_object(
  'article_count', (
    select count(*)
    from public.newsroom_articles article
    where article.source_code = 'synthetic-reextraction-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-reextraction-smoke/article'
  ),
  'snapshot_count', (
    select count(*)
    from public.newsroom_article_snapshots snapshot
    join public.newsroom_articles article
      on article.id = snapshot.article_id
    where article.source_code = 'synthetic-reextraction-smoke'
      and article.normalized_url =
        'https://example.invalid/newsroom-reextraction-smoke/article'
  ),
  'writes_persisted', false
) as rollback_verification;
