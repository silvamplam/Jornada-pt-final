-- Step 37 - synthetic transactional smoke for the corrected compose function.
-- Every fixture is synthetic and the transaction always ends with ROLLBACK.

begin;

do $$
declare
  v_submission_id uuid := '00000000-0000-4000-8000-000000000370'::uuid;
  v_claim_one uuid := '00000000-0000-4000-8000-000000000371'::uuid;
  v_claim_two uuid := '00000000-0000-4000-8000-000000000372'::uuid;
  v_claim_three uuid := '00000000-0000-4000-8000-000000000373'::uuid;
  v_fingerprint text := repeat('a', 64);
  v_conflicting_fingerprint text := repeat('b', 64);
  v_source_url text :=
    'https://example.invalid/compose-submission-id-hotfix-smoke/source';
  v_initial_title text := 'Synthetic hotfix frozen source title';
  v_initial_published_at timestamptz := '2026-07-30 12:00:00+00';
  v_persistence record;
  v_second_persistence record;
  v_first_prepare record;
  v_repeated_prepare record;
  v_claim_result record;
  v_concurrent_claim_result record;
  v_recovery_claim_result record;
  v_recovery_concurrent_result record;
  v_completed_claim_result record;
  v_request_count integer;
  v_dossier_count integer;
  v_plan_count integer;
  v_article_count integer;
  v_source_count integer;
  v_assignment_count integer;
  v_generation_count integer;
  v_article_status text;
  v_published_at timestamptz;
  v_frozen_snapshot_id uuid;
  v_frozen_title text;
  v_frozen_published_at timestamptz;
  v_failed_status text;
  v_conflict_detected boolean := false;
begin
  select *
  into v_persistence
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'record',
    p_original_url => v_source_url,
    p_normalized_url => v_source_url,
    p_external_id => 'synthetic-compose-submission-id-hotfix-smoke',
    p_title => v_initial_title,
    p_subtitle => null,
    p_summary => 'Synthetic hotfix summary.',
    p_author => null,
    p_published_at => v_initial_published_at,
    p_modified_at => null,
    p_detected_at => '2026-07-30 12:01:00+00',
    p_image_url => null,
    p_processing_status => 'detected',
    p_content_hash => repeat('c', 64),
    p_body =>
      '[{"type":"paragraph","text":"Entirely synthetic source body for the rollback-only hotfix smoke."}]'::jsonb,
    p_source_metadata => jsonb_build_object(
      'fixture', 'compose-submission-id-hotfix-smoke',
      'networkRequest', false,
      'sourceCode', 'record',
      'originalUrl', v_source_url,
      'normalizedUrl', v_source_url
    ),
    p_extracted_at => '2026-07-30 12:02:00+00'
  );

  select *
  into v_first_prepare
  from public.newsroom_prepare_editorial_compose(
    p_submission_id => v_submission_id,
    p_request_fingerprint => v_fingerprint,
    p_working_title => 'Synthetic compose hotfix acceptance draft',
    p_editorial_instructions =>
      'Synthetic instructions with no real editorial content.',
    p_context_instructions => 'Synthetic context.',
    p_article_kind => 'news',
    p_length_mode => 'standard',
    p_output_language => 'pt-PT',
    p_newsroom_article_ids => array[v_persistence.article_id],
    p_newsroom_snapshot_ids => array[v_persistence.snapshot_id],
    p_source_roles => array['primary']::text[],
    p_source_priorities => array[1],
    p_source_notes => array[null]::text[]
  );

  if v_first_prepare.composition_action <> 'created' then
    raise exception 'hotfix_smoke_first_prepare_not_created';
  end if;

  select *
  into v_repeated_prepare
  from public.newsroom_prepare_editorial_compose(
    p_submission_id => v_submission_id,
    p_request_fingerprint => v_fingerprint,
    p_working_title => 'Synthetic compose hotfix acceptance draft',
    p_editorial_instructions =>
      'Synthetic instructions with no real editorial content.',
    p_context_instructions => 'Synthetic context.',
    p_article_kind => 'news',
    p_length_mode => 'standard',
    p_output_language => 'pt-PT',
    p_newsroom_article_ids => array[v_persistence.article_id],
    p_newsroom_snapshot_ids => array[v_persistence.snapshot_id],
    p_source_roles => array['primary']::text[],
    p_source_priorities => array[1],
    p_source_notes => array[null]::text[]
  );

  if v_repeated_prepare.composition_action <> 'reused'
     or v_repeated_prepare.dossier_id <> v_first_prepare.dossier_id
     or v_repeated_prepare.article_plan_id <> v_first_prepare.article_plan_id
     or v_repeated_prepare.editorial_article_id <>
       v_first_prepare.editorial_article_id then
    raise exception 'hotfix_smoke_repeated_prepare_not_reused';
  end if;

  begin
    perform *
    from public.newsroom_prepare_editorial_compose(
      p_submission_id => v_submission_id,
      p_request_fingerprint => v_conflicting_fingerprint,
      p_working_title => 'Different synthetic hotfix payload',
      p_editorial_instructions => 'Different synthetic instructions.',
      p_context_instructions => 'Different synthetic context.',
      p_article_kind => 'analysis',
      p_length_mode => 'brief',
      p_output_language => 'pt-PT',
      p_newsroom_article_ids => array[v_persistence.article_id],
      p_newsroom_snapshot_ids => array[v_persistence.snapshot_id],
      p_source_roles => array['context']::text[],
      p_source_priorities => array[2],
      p_source_notes => array['Different synthetic note']::text[]
    );
  exception
    when unique_violation then
      v_conflict_detected := sqlerrm like '%compose_payload_conflict%';
  end;
  if not v_conflict_detected then
    raise exception 'hotfix_smoke_payload_conflict_not_detected';
  end if;

  select count(*) into v_request_count
  from public.newsroom_editorial_compose_requests request_row
  where request_row.submission_id = v_submission_id;
  select count(*) into v_dossier_count
  from public.newsroom_editorial_dossiers dossier
  where dossier.id = v_first_prepare.dossier_id;
  select count(*) into v_plan_count
  from public.newsroom_editorial_dossier_article_plans plan
  where plan.id = v_first_prepare.article_plan_id;
  select count(*) into v_article_count
  from public.editorial_articles article
  where article.id = v_first_prepare.editorial_article_id;
  select count(*) into v_source_count
  from public.newsroom_editorial_dossier_sources source_row
  where source_row.dossier_id = v_first_prepare.dossier_id;
  select count(*) into v_assignment_count
  from public.newsroom_editorial_dossier_article_plan_sources assignment
  where assignment.article_plan_id = v_first_prepare.article_plan_id;

  if v_request_count <> 1
     or v_dossier_count <> 1
     or v_plan_count <> 1
     or v_article_count <> 1
     or v_source_count <> 1
     or v_assignment_count <> 1 then
    raise exception 'hotfix_smoke_composition_cardinality_invalid';
  end if;

  select article.status, article.published_at
  into v_article_status, v_published_at
  from public.editorial_articles article
  where article.id = v_first_prepare.editorial_article_id;
  if v_article_status <> 'draft' or v_published_at is not null then
    raise exception 'hotfix_smoke_article_not_draft';
  end if;

  select
    source_row.newsroom_snapshot_id,
    source_row.title_snapshot,
    source_row.published_at_snapshot
  into
    v_frozen_snapshot_id,
    v_frozen_title,
    v_frozen_published_at
  from public.newsroom_editorial_dossier_sources source_row
  where source_row.dossier_id = v_first_prepare.dossier_id;

  select *
  into v_second_persistence
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'record',
    p_original_url => v_source_url,
    p_normalized_url => v_source_url,
    p_external_id => 'synthetic-compose-submission-id-hotfix-smoke',
    p_title => 'Synthetic changed current hotfix title',
    p_subtitle => null,
    p_summary => 'Changed synthetic hotfix summary.',
    p_author => null,
    p_published_at => '2026-07-30 13:00:00+00',
    p_modified_at => null,
    p_detected_at => '2026-07-30 13:01:00+00',
    p_image_url => null,
    p_processing_status => 'detected',
    p_content_hash => repeat('d', 64),
    p_body =>
      '[{"type":"paragraph","text":"A newer synthetic snapshot that must not replace the frozen snapshot."}]'::jsonb,
    p_source_metadata => jsonb_build_object(
      'fixture', 'compose-submission-id-hotfix-smoke-newer',
      'networkRequest', false,
      'sourceCode', 'record',
      'originalUrl', v_source_url,
      'normalizedUrl', v_source_url
    ),
    p_extracted_at => '2026-07-30 13:02:00+00'
  );

  if v_second_persistence.snapshot_id = v_frozen_snapshot_id
     or v_frozen_snapshot_id <> v_persistence.snapshot_id
     or v_frozen_title <> v_initial_title
     or v_frozen_published_at <> v_initial_published_at then
    raise exception 'hotfix_smoke_frozen_provenance_changed';
  end if;

  select *
  into v_claim_result
  from public.newsroom_claim_editorial_compose_generation(
    v_submission_id,
    v_fingerprint,
    v_claim_one
  );
  select *
  into v_concurrent_claim_result
  from public.newsroom_claim_editorial_compose_generation(
    v_submission_id,
    v_fingerprint,
    v_claim_two
  );
  if v_claim_result.claim_action <> 'claimed'
     or v_concurrent_claim_result.claim_action <> 'in_progress' then
    raise exception 'hotfix_smoke_generation_claim_not_exclusive';
  end if;

  perform public.newsroom_fail_editorial_compose_generation(
    v_submission_id,
    v_fingerprint,
    v_claim_one,
    'synthetic_recoverable_failure'
  );
  select request_row.generation_status
  into v_failed_status
  from public.newsroom_editorial_compose_requests request_row
  where request_row.submission_id = v_submission_id;
  if v_failed_status <> 'failed' then
    raise exception 'hotfix_smoke_failure_not_recorded';
  end if;

  select *
  into v_recovery_claim_result
  from public.newsroom_claim_editorial_compose_generation(
    v_submission_id,
    v_fingerprint,
    v_claim_two
  );
  select *
  into v_recovery_concurrent_result
  from public.newsroom_claim_editorial_compose_generation(
    v_submission_id,
    v_fingerprint,
    v_claim_three
  );
  if v_recovery_claim_result.claim_action <> 'claimed'
     or v_recovery_concurrent_result.claim_action <> 'in_progress' then
    raise exception 'hotfix_smoke_generation_recovery_not_exclusive';
  end if;

  insert into public.newsroom_editorial_dossier_article_plan_generations (
    id,
    dossier_id,
    article_plan_id,
    editorial_article_id,
    provider,
    model,
    prompt_version,
    provider_response_id,
    input_hash,
    input_snapshot,
    generated_body,
    input_tokens,
    output_tokens,
    total_tokens
  ) values (
    pg_catalog.gen_random_uuid(),
    v_first_prepare.dossier_id,
    v_first_prepare.article_plan_id,
    v_first_prepare.editorial_article_id,
    'synthetic-provider',
    'synthetic-model',
    'synthetic-prompt-v1',
    'synthetic-response',
    repeat('e', 64),
    jsonb_build_object(
      'version', '1',
      'dossier_id', v_first_prepare.dossier_id,
      'article_plan_id', v_first_prepare.article_plan_id,
      'sources', jsonb_build_array(jsonb_build_object(
        'dossier_source_id', (
          select source_row.id
          from public.newsroom_editorial_dossier_sources source_row
          where source_row.dossier_id = v_first_prepare.dossier_id
          limit 1
        ),
        'newsroom_snapshot_id', v_frozen_snapshot_id
      ))
    ),
    repeat(
      'Synthetic generated draft body for rollback-only hotfix smoke. ',
      2
    ),
    10,
    20,
    30
  );

  update public.editorial_articles article
  set body = repeat(
        'Synthetic generated draft body for rollback-only hotfix smoke. ',
        2
      ),
      updated_at = now()
  where article.id = v_first_prepare.editorial_article_id;

  perform public.newsroom_complete_editorial_compose_generation(
    v_submission_id,
    v_fingerprint,
    v_claim_two
  );

  select *
  into v_completed_claim_result
  from public.newsroom_claim_editorial_compose_generation(
    v_submission_id,
    v_fingerprint,
    v_claim_three
  );
  select count(*) into v_generation_count
  from public.newsroom_editorial_dossier_article_plan_generations generation
  where generation.article_plan_id = v_first_prepare.article_plan_id;

  select article.status, article.published_at
  into v_article_status, v_published_at
  from public.editorial_articles article
  where article.id = v_first_prepare.editorial_article_id;

  if v_completed_claim_result.claim_action <> 'completed'
     or v_completed_claim_result.editorial_article_id <>
       v_first_prepare.editorial_article_id
     or v_generation_count <> 1
     or v_article_status <> 'draft'
     or v_published_at is not null then
    raise exception 'hotfix_smoke_completed_generation_not_reused';
  end if;

  raise notice
    'step_37_smoke_passed: no 42702; all synthetic rows will be rolled back';
end;
$$;

rollback;

with residue as (
  select count(*)::integer as residue_count
  from (
    select request_row.submission_id::text as identity
    from public.newsroom_editorial_compose_requests request_row
    where request_row.submission_id =
      '00000000-0000-4000-8000-000000000370'::uuid
    union all
    select article.id::text
    from public.newsroom_articles article
    where article.normalized_url =
      'https://example.invalid/compose-submission-id-hotfix-smoke/source'
  ) found
)
select jsonb_build_object(
  'step', 37,
  'smoke_passed', residue.residue_count = 0,
  'writes_committed', false,
  'residue_count', residue.residue_count,
  'transaction_end', 'ROLLBACK'
) as smoke_summary
from residue;
