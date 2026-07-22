-- Redação Automática — caixa de entrada persistente read-only.
-- SQL 4/4 — SMOKE TEST SINTÉTICO COM ROLLBACK.

begin;

insert into public.newsroom_articles (
  id,
  source_code,
  original_url,
  normalized_url,
  external_id,
  title,
  subtitle,
  summary,
  author,
  published_at,
  modified_at,
  detected_at,
  image_url,
  processing_status,
  first_detected_at,
  last_detected_at
) values (
  '00000000-0000-4000-8000-000000000101'::uuid,
  'synthetic-smoke',
  'https://example.invalid/newsroom/synthetic-article',
  'https://example.invalid/newsroom/synthetic-article',
  'synthetic-article-001',
  'Artigo sintético para smoke test com rollback',
  'Subtítulo totalmente sintético',
  'Resumo sintético sem relação com qualquer artigo real.',
  'Autor Sintético',
  '2026-01-01 10:00:00+00'::timestamptz,
  null,
  '2026-01-01 10:05:00+00'::timestamptz,
  null,
  'ready_for_review',
  '2026-01-01 10:05:00+00'::timestamptz,
  '2026-01-01 10:05:00+00'::timestamptz
);

insert into public.newsroom_article_snapshots (
  id,
  article_id,
  content_hash,
  body,
  source_metadata,
  extracted_at
) values (
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000101'::uuid,
  repeat('a', 64),
  '[{"type":"heading","text":"Título sintético"},{"type":"paragraph","text":"Corpo totalmente sintético para validar persistência e rollback."}]'::jsonb,
  '{"fixture":"synthetic-smoke","network_request":false}'::jsonb,
  '2026-01-01 10:06:00+00'::timestamptz
);

do $$
declare
  snapshot_update_rejected boolean := false;
begin
  begin
    insert into public.newsroom_articles (
      id, source_code, original_url, normalized_url, title, detected_at,
      processing_status, first_detected_at, last_detected_at
    ) values (
      '00000000-0000-4000-8000-000000000103'::uuid,
      'synthetic-smoke',
      'https://example.invalid/newsroom/duplicate-article',
      'https://example.invalid/newsroom/synthetic-article',
      'Duplicado sintético',
      '2026-01-01 10:07:00+00'::timestamptz,
      'duplicate',
      '2026-01-01 10:07:00+00'::timestamptz,
      '2026-01-01 10:07:00+00'::timestamptz
    );
    raise exception 'article deduplication did not reject the duplicate';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.newsroom_article_snapshots (
      id, article_id, content_hash, body, source_metadata, extracted_at
    ) values (
      '00000000-0000-4000-8000-000000000104'::uuid,
      '00000000-0000-4000-8000-000000000101'::uuid,
      repeat('a', 64),
      '[]'::jsonb,
      '{"fixture":"synthetic-smoke-duplicate"}'::jsonb,
      '2026-01-01 10:08:00+00'::timestamptz
    );
    raise exception 'snapshot deduplication did not reject the duplicate';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.newsroom_article_snapshots (
      id, article_id, content_hash, body, source_metadata, extracted_at
    ) values (
      '00000000-0000-4000-8000-000000000105'::uuid,
      '00000000-0000-4000-8000-000000000199'::uuid,
      repeat('b', 64),
      '[]'::jsonb,
      '{"fixture":"synthetic-smoke-invalid-fk"}'::jsonb,
      '2026-01-01 10:09:00+00'::timestamptz
    );
    raise exception 'foreign key did not reject the orphan snapshot';
  exception
    when foreign_key_violation then null;
  end;

  begin
    update public.newsroom_article_snapshots
    set content_hash = repeat('c', 64)
    where id = '00000000-0000-4000-8000-000000000102'::uuid;
  exception
    when raise_exception then snapshot_update_rejected := true;
  end;

  if not snapshot_update_rejected then
    raise exception 'snapshot immutability trigger did not reject the update';
  end if;
end;
$$;

select
  article.id as article_id,
  article.source_code,
  article.processing_status,
  snapshot.id as snapshot_id,
  snapshot.content_hash,
  jsonb_array_length(snapshot.body) as body_block_count,
  snapshot.extracted_at
from public.newsroom_articles article
join public.newsroom_article_snapshots snapshot on snapshot.article_id = article.id
where article.id = '00000000-0000-4000-8000-000000000101'::uuid;

do $$
declare
  article_count integer;
  snapshot_count integer;
begin
  select count(*) into article_count
  from public.newsroom_articles
  where id = '00000000-0000-4000-8000-000000000101'::uuid;

  select count(*) into snapshot_count
  from public.newsroom_article_snapshots
  where article_id = '00000000-0000-4000-8000-000000000101'::uuid;

  if article_count <> 1 or snapshot_count <> 1 then
    raise exception 'smoke read verification failed: articles %, snapshots %', article_count, snapshot_count;
  end if;
end;
$$;

rollback;

select jsonb_build_object(
  'article_rows_after_rollback', (
    select count(*)
    from public.newsroom_articles
    where id = '00000000-0000-4000-8000-000000000101'::uuid
  ),
  'snapshot_rows_after_rollback', (
    select count(*)
    from public.newsroom_article_snapshots
    where id = '00000000-0000-4000-8000-000000000102'::uuid
  ),
  'expected', 'both counts are zero'
) as rollback_verification;
