-- Step 41 - smoke sintético da entrada manual.
-- Todas as escritas são revertidas obrigatoriamente.

begin;

do $$
declare
  v_submission_id uuid :=
    '00000000-0000-4000-8000-000000000410'::uuid;
  v_fingerprint text := repeat('a', 64);
  v_conflicting_fingerprint text := repeat('b', 64);
  v_content_hash text := repeat('c', 64);
  v_body jsonb := jsonb_build_array(
    jsonb_build_object(
      'type',
      'paragraph',
      'text',
      'Synthetic manual newsroom paragraph for rollback-only smoke.'
    ),
    jsonb_build_object(
      'type',
      'paragraph',
      'text',
      'Synthetic second paragraph preserves the manual snapshot structure.'
    )
  );
  v_first record;
  v_second record;
  v_article record;
  v_snapshot record;
  v_article_count integer;
  v_snapshot_count integer;
  v_request_count integer;
  v_editorial_article_count_before integer;
  v_editorial_article_count_after integer;
  v_dossier_count_before integer;
  v_dossier_count_after integer;
  v_dossier_source_count integer;
begin
  select count(*) into v_editorial_article_count_before
  from public.editorial_articles;
  select count(*) into v_dossier_count_before
  from public.newsroom_editorial_dossiers;

  select *
  into v_first
  from public.newsroom_create_manual_entry(
    v_submission_id,
    v_fingerprint,
    '__JORNADA_STEP41_SYNTHETIC_MANUAL_ENTRY__',
    v_body,
    '2020-01-02',
    null,
    v_content_hash
  );

  select *
  into v_second
  from public.newsroom_create_manual_entry(
    v_submission_id,
    v_fingerprint,
    '__JORNADA_STEP41_SYNTHETIC_MANUAL_ENTRY__',
    v_body,
    '2020-01-02',
    null,
    v_content_hash
  );

  if v_first.entry_action <> 'created'
     or v_second.entry_action <> 'reused'
     or v_first.newsroom_article_id <> v_second.newsroom_article_id
     or v_first.newsroom_snapshot_id <> v_second.newsroom_snapshot_id then
    raise exception 'manual_entry_smoke_idempotency_failed';
  end if;

  begin
    perform public.newsroom_create_manual_entry(
      v_submission_id,
      v_conflicting_fingerprint,
      'Synthetic conflicting title',
      v_body,
      '2020-01-02',
      null,
      v_content_hash
    );
    raise exception 'manual_entry_smoke_conflict_not_raised';
  exception
    when others then
      if sqlerrm not like '%manual_entry_payload_conflict%' then
        raise;
      end if;
  end;

  select article.*
  into v_article
  from public.newsroom_articles article
  where article.id = v_first.newsroom_article_id;

  select snapshot.*
  into v_snapshot
  from public.newsroom_article_snapshots snapshot
  where snapshot.id = v_first.newsroom_snapshot_id;

  select count(*) into v_article_count
  from public.newsroom_articles article
  where article.id = v_first.newsroom_article_id;
  select count(*) into v_snapshot_count
  from public.newsroom_article_snapshots snapshot
  where snapshot.article_id = v_first.newsroom_article_id;
  select count(*) into v_request_count
  from public.newsroom_manual_entry_requests request_row
  where request_row.submission_id = v_submission_id;
  select count(*) into v_dossier_source_count
  from public.newsroom_editorial_dossier_sources dossier_source
  where dossier_source.newsroom_article_id = v_first.newsroom_article_id;

  select count(*) into v_editorial_article_count_after
  from public.editorial_articles;
  select count(*) into v_dossier_count_after
  from public.newsroom_editorial_dossiers;

  if v_article_count <> 1
     or v_snapshot_count <> 1
     or v_request_count <> 1
     or v_article.source_code <> 'manual_entry'
     or v_article.original_url is not null
     or v_article.normalized_url is not null
     or v_article.processing_status <> 'ready_for_review'
     or v_article.published_at <>
       '2020-01-02T00:00:00.000Z'::timestamptz
     or v_article.image_url is not null
     or v_snapshot.article_id <> v_article.id
     or v_snapshot.content_hash <> v_content_hash
     or v_snapshot.body <> v_body
     or v_snapshot.source_metadata ->> 'origin' <> 'manual'
     or v_snapshot.source_metadata ->> 'sourceCode' <> 'manual_entry'
     or v_snapshot.source_metadata ->> 'sourceName' <> 'Entrada manual'
     or v_snapshot.source_metadata ->> 'manualSubmissionId' <>
       v_submission_id::text
     or v_snapshot.source_metadata ->> 'publishedAtPrecision' <> 'date'
     or v_snapshot.source_metadata ? 'originalUrl'
     or v_snapshot.source_metadata ? 'normalizedUrl'
     or v_dossier_source_count <> 0
     or v_editorial_article_count_after <> v_editorial_article_count_before
     or v_dossier_count_after <> v_dossier_count_before then
    raise exception 'manual_entry_smoke_contract_failed';
  end if;

  raise notice
    'step_41_smoke_passed: one manual article, one immutable snapshot, idempotent retry and no editorial publication';
end;
$$;

rollback;

with residue as (
  select count(*)::integer as residue_count
  from (
    select request_row.submission_id::text as identity
    from public.newsroom_manual_entry_requests request_row
    where request_row.submission_id =
      '00000000-0000-4000-8000-000000000410'::uuid
    union all
    select snapshot.id::text
    from public.newsroom_article_snapshots snapshot
    where snapshot.source_metadata ->> 'manualSubmissionId' =
      '00000000-0000-4000-8000-000000000410'
    union all
    select article.id::text
    from public.newsroom_articles article
    where article.source_code = 'manual_entry'
      and article.title = '__JORNADA_STEP41_SYNTHETIC_MANUAL_ENTRY__'
  ) found
)
select jsonb_build_object(
  'step', 41,
  'smoke_passed', residue.residue_count = 0,
  'writes_committed', false,
  'residue_count', residue.residue_count,
  'transaction_end', 'ROLLBACK'
) as smoke_summary
from residue;
