-- Step 95 - smoke rollback da entrada manual canónica completa.
-- Escreve apenas dentro desta transação e termina sempre em ROLLBACK.

begin;

do $$
declare
  v_submission_id uuid := '00000000-0000-4000-8000-000000000950'::uuid;
  v_fingerprint text := repeat('d', 64);
  v_content_hash text := repeat('e', 64);
  v_body jsonb := jsonb_build_array(jsonb_build_object('type','paragraph','text','Synthetic canonical manual article.'));
  v_first record;
  v_second record;
  v_article record;
  v_snapshot record;
begin
  select * into v_first from public.newsroom_create_complete_manual_entry(
    v_submission_id, v_fingerprint, 'ANTETÍTULO TESTE',
    '__JORNADA_STEP95_CANONICAL_MANUAL__', 'Pós-título sintético',
    'Autor Sintético', v_body, '2020-01-02', '12:34',
    'https://example.invalid/storage/v1/object/public/editorial-images/editorial/2020/01/test.webp',
    v_content_hash
  );
  select * into v_second from public.newsroom_create_complete_manual_entry(
    v_submission_id, v_fingerprint, 'ANTETÍTULO TESTE',
    '__JORNADA_STEP95_CANONICAL_MANUAL__', 'Pós-título sintético',
    'Autor Sintético', v_body, '2020-01-02', '12:34',
    'https://example.invalid/storage/v1/object/public/editorial-images/editorial/2020/01/test.webp',
    v_content_hash
  );

  if v_first.entry_action <> 'created' or v_second.entry_action <> 'reused' then
    raise exception 'canonical_manual_smoke_idempotency_failed';
  end if;

  select * into v_article from public.newsroom_articles where id = v_first.newsroom_article_id;
  select * into v_snapshot from public.newsroom_article_snapshots where id = v_first.newsroom_snapshot_id;

  if v_article.title <> '__JORNADA_STEP95_CANONICAL_MANUAL__'
     or v_article.subtitle <> 'Pós-título sintético'
     or v_article.author <> 'Autor Sintético'
     or v_article.image_url is null
     or to_char(v_article.published_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') <> '2020-01-02 12:34'
     or v_snapshot.body <> v_body
     or v_snapshot.source_metadata ->> 'anteTitle' <> 'ANTETÍTULO TESTE'
     or v_snapshot.source_metadata ->> 'postTitle' <> 'Pós-título sintético'
     or v_snapshot.source_metadata ->> 'author' <> 'Autor Sintético'
     or v_snapshot.source_metadata ->> 'publishedAtPrecision' <> 'instant' then
    raise exception 'canonical_manual_smoke_contract_failed';
  end if;
end;
$$;

rollback;

select jsonb_build_object(
  'step', 95,
  'writes_committed', false,
  'residue_count', (
    select count(*) from public.newsroom_articles
    where title = '__JORNADA_STEP95_CANONICAL_MANUAL__'
  )
) as smoke_summary;
