-- Step 45 - smoke transacional da linha editorial persistente.
-- Fixtures editoriais integralmente sintéticas; termina sempre com ROLLBACK.

begin;

do $$
declare
  v_profile public.newsroom_editorial_profiles%rowtype;
  v_version_one public.newsroom_editorial_profile_versions%rowtype;
  v_version_two record;
  v_activation record;
  v_rollback record;
  v_pin_one record;
  v_pin_two record;
  v_persistence record;
  v_prepare record;
  v_apply record;
  v_reapply record;
  v_document text :=
    'Synthetic editorial document for rollback-only validation. Facts remain data and no publication is allowed.';
  v_document_hash text;
  v_event_count_before integer;
  v_event_count_after integer;
  v_conflict_detected boolean := false;
  v_version_immutable boolean := false;
  v_event_immutable boolean := false;
  v_pin_immutable boolean := false;
  v_generation_immutable boolean := false;
  v_article_updated_at timestamptz;
  v_article_status text;
  v_published_at timestamptz;
  v_input_snapshot jsonb;
  v_input_hash_one text;
  v_input_hash_two text;
  v_generated_body text :=
    'Synthetic first generated body used only inside a rollback transaction. It contains no real facts, people, organisations or publication instructions.';
  v_generated_body_hash text;
  v_generation_count integer;
  v_stored_generated_body text;
  v_stored_generated_body_hash text;
begin
  select profile_row.*
  into v_profile
  from public.newsroom_editorial_profiles profile_row
  where profile_row.code = 'jornada-pt';

  select version_row.*
  into v_version_one
  from public.newsroom_editorial_profile_versions version_row
  where version_row.profile_id = v_profile.id
    and version_row.id = v_profile.active_version_id;

  if v_profile.id is null
     or v_version_one.version_number <> 1
     or v_version_one.content_hash <> encode(
       extensions.digest(convert_to(v_version_one.document_text, 'UTF8'), 'sha256'),
       'hex'
     ) then
    raise exception 'editorial_profile_smoke_seed_invalid';
  end if;

  select count(*)
  into v_event_count_before
  from public.newsroom_editorial_profile_activation_events event_row
  where event_row.profile_id = v_profile.id;

  v_document_hash := encode(
    extensions.digest(convert_to(v_document, 'UTF8'), 'sha256'),
    'hex'
  );

  select *
  into v_version_two
  from public.newsroom_create_editorial_profile_version(
    p_profile_id => v_profile.id,
    p_based_on_version_id => v_version_one.id,
    p_expected_latest_version_number => 1,
    p_document_text => v_document,
    p_content_hash => v_document_hash,
    p_change_summary => 'Synthetic smoke version; never committed.',
    p_created_by_actor_type => 'admin_session',
    p_created_by_actor_id => null
  );

  select profile_row.*
  into v_profile
  from public.newsroom_editorial_profiles profile_row
  where profile_row.id = v_profile.id;

  if v_version_two.version_number <> 2
     or v_version_two.content_hash <> v_document_hash
     or v_profile.active_version_id <> v_version_one.id then
    raise exception 'editorial_profile_smoke_version_auto_activated';
  end if;

  select *
  into v_activation
  from public.newsroom_activate_editorial_profile_version(
    p_profile_id => v_profile.id,
    p_version_id => v_version_two.version_id,
    p_expected_active_version_id => v_version_one.id,
    p_event_type => 'activate',
    p_reason => 'Synthetic activation.',
    p_created_by_actor_type => 'admin_session',
    p_created_by_actor_id => null
  );

  begin
    perform *
    from public.newsroom_activate_editorial_profile_version(
      p_profile_id => v_profile.id,
      p_version_id => v_version_one.id,
      p_expected_active_version_id => v_version_one.id,
      p_event_type => 'rollback',
      p_reason => 'Stale synthetic request.',
      p_created_by_actor_type => 'admin_session',
      p_created_by_actor_id => null
    );
  exception
    when serialization_failure then
      v_conflict_detected := sqlerrm like '%editorial_profile_active_conflict%';
  end;

  if not v_conflict_detected then
    raise exception 'editorial_profile_smoke_stale_activation_not_rejected';
  end if;

  select *
  into v_rollback
  from public.newsroom_activate_editorial_profile_version(
    p_profile_id => v_profile.id,
    p_version_id => v_version_one.id,
    p_expected_active_version_id => v_version_two.version_id,
    p_event_type => 'rollback',
    p_reason => 'Synthetic rollback.',
    p_created_by_actor_type => 'admin_session',
    p_created_by_actor_id => null
  );

  select count(*)
  into v_event_count_after
  from public.newsroom_editorial_profile_activation_events event_row
  where event_row.profile_id = v_profile.id;

  if v_activation.previous_version_id <> v_version_one.id
     or v_activation.active_version_id <> v_version_two.version_id
     or v_rollback.previous_version_id <> v_version_two.version_id
     or v_rollback.active_version_id <> v_version_one.id
     or v_event_count_after <> v_event_count_before + 2 then
    raise exception 'editorial_profile_smoke_activation_history_invalid';
  end if;

  begin
    update public.newsroom_editorial_profile_versions version_row
    set document_text = 'Forbidden mutation'
    where version_row.id = v_version_two.version_id;
  exception
    when sqlstate '55000' then
      v_version_immutable := sqlerrm like '%editorial_profile_version_immutable%';
  end;

  begin
    update public.newsroom_editorial_profile_activation_events event_row
    set reason = 'Forbidden mutation'
    where event_row.id = v_activation.activation_event_id;
  exception
    when sqlstate '55000' then
      v_event_immutable :=
        sqlerrm like '%editorial_profile_activation_event_immutable%';
  end;

  if not v_version_immutable or not v_event_immutable then
    raise exception 'editorial_profile_smoke_immutability_missing';
  end if;

  select *
  into v_persistence
  from public.newsroom_persist_article_snapshot(
    p_source_code => 'record',
    p_original_url =>
      'https://example.invalid/editorial-profile-smoke/source',
    p_normalized_url =>
      'https://example.invalid/editorial-profile-smoke/source',
    p_external_id => 'synthetic-editorial-profile-smoke',
    p_title => 'Synthetic frozen source title',
    p_subtitle => null,
    p_summary => 'Synthetic summary.',
    p_author => null,
    p_published_at => '2026-07-30 10:00:00+00',
    p_modified_at => null,
    p_detected_at => '2026-07-30 10:01:00+00',
    p_image_url => null,
    p_processing_status => 'detected',
    p_content_hash => repeat('c', 64),
    p_body =>
      '[{"type":"paragraph","text":"Entirely synthetic frozen source body for a rollback-only SQL smoke."}]'::jsonb,
    p_source_metadata => jsonb_build_object(
      'fixture', 'editorial-profile-smoke',
      'networkRequest', false,
      'sourceCode', 'record',
      'originalUrl', 'https://example.invalid/editorial-profile-smoke/source',
      'normalizedUrl', 'https://example.invalid/editorial-profile-smoke/source'
    ),
    p_extracted_at => '2026-07-30 10:02:00+00'
  );

  select *
  into v_prepare
  from public.newsroom_prepare_editorial_compose(
    p_submission_id => '45000000-0000-4000-8000-000000000001',
    p_request_fingerprint => repeat('d', 64),
    p_working_title => 'Synthetic editorial profile smoke draft',
    p_editorial_instructions =>
      'Use only the synthetic frozen source and keep the result in draft.',
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

  select *
  into v_pin_one
  from public.newsroom_pin_editorial_profile_version_for_plan(
    v_prepare.dossier_id,
    v_prepare.article_plan_id
  );
  select *
  into v_pin_two
  from public.newsroom_pin_editorial_profile_version_for_plan(
    v_prepare.dossier_id,
    v_prepare.article_plan_id
  );

  if v_pin_one.version_id <> v_version_one.id
     or v_pin_two.version_id <> v_pin_one.version_id
     or v_pin_two.pinned_at <> v_pin_one.pinned_at then
    raise exception 'editorial_profile_smoke_plan_pin_not_reused';
  end if;

  perform *
  from public.newsroom_activate_editorial_profile_version(
    p_profile_id => v_profile.id,
    p_version_id => v_version_two.version_id,
    p_expected_active_version_id => v_version_one.id,
    p_event_type => 'activate',
    p_reason => 'Synthetic activation after pin.',
    p_created_by_actor_type => 'admin_session',
    p_created_by_actor_id => null
  );

  select *
  into v_pin_two
  from public.newsroom_pin_editorial_profile_version_for_plan(
    v_prepare.dossier_id,
    v_prepare.article_plan_id
  );

  if v_pin_two.version_id <> v_version_one.id then
    raise exception 'editorial_profile_smoke_active_change_replaced_pin';
  end if;

  begin
    update public.newsroom_editorial_dossier_article_plans plan_row
    set editorial_profile_version_id = v_version_two.version_id
    where plan_row.id = v_prepare.article_plan_id;
  exception
    when sqlstate '55000' then
      v_pin_immutable := sqlerrm like '%editorial_profile_plan_pin_immutable%';
  end;

  if not v_pin_immutable then
    raise exception 'editorial_profile_smoke_plan_pin_mutable';
  end if;

  select article.updated_at
  into v_article_updated_at
  from public.editorial_articles article
  where article.id = v_prepare.editorial_article_id;

  select jsonb_build_object(
    'version', 2,
    'editorial_profile', jsonb_build_object(
      'profile_id', profile_row.id,
      'profile_code', btrim(profile_row.code),
      'profile_name', btrim(profile_row.name),
      'version_id', version_row.id,
      'version_number', version_row.version_number,
      'content_hash', version_row.content_hash,
      'approval_state', version_row.approval_state,
      'document_text', version_row.document_text,
      'version_created_at', version_row.created_at,
      'pinned_at', plan_row.editorial_profile_pinned_at
    ),
    'dossier', jsonb_build_object(
      'id', dossier.id,
      'title', btrim(dossier.title),
      'editorial_instructions', btrim(dossier.editorial_instructions),
      'context_instructions', btrim(dossier.context_instructions),
      'output_language', btrim(dossier.output_language)
    ),
    'plan', jsonb_build_object(
      'id', plan_row.id,
      'working_title', btrim(plan_row.working_title),
      'article_kind', plan_row.article_kind,
      'length_mode', plan_row.length_mode,
      'editorial_instructions', btrim(plan_row.editorial_instructions)
    ),
    'sources', jsonb_agg(
      jsonb_build_object(
        'dossier_source_id', dossier_source.id,
        'newsroom_article_id', dossier_source.newsroom_article_id,
        'newsroom_snapshot_id', dossier_source.newsroom_snapshot_id,
        'source_code', newsroom_article.source_code,
        'article_title', btrim(dossier_source.title_snapshot),
        'article_title_origin', 'frozen',
        'source_role', dossier_source.source_role,
        'sort_order', assignment.sort_order,
        'editorial_note', null,
        'content_hash', snapshot.content_hash
      )
      order by assignment.sort_order, assignment.id
    )
  )
  into v_input_snapshot
  from public.newsroom_editorial_dossier_article_plans plan_row
  join public.newsroom_editorial_dossiers dossier
    on dossier.id = plan_row.dossier_id
  join public.newsroom_editorial_profiles profile_row
    on profile_row.id = plan_row.editorial_profile_id
  join public.newsroom_editorial_profile_versions version_row
    on version_row.profile_id = plan_row.editorial_profile_id
   and version_row.id = plan_row.editorial_profile_version_id
  join public.newsroom_editorial_dossier_article_plan_sources assignment
    on assignment.article_plan_id = plan_row.id
   and assignment.dossier_id = plan_row.dossier_id
  join public.newsroom_editorial_dossier_sources dossier_source
    on dossier_source.id = assignment.dossier_source_id
   and dossier_source.dossier_id = assignment.dossier_id
  join public.newsroom_articles newsroom_article
    on newsroom_article.id = dossier_source.newsroom_article_id
  join public.newsroom_article_snapshots snapshot
    on snapshot.id = dossier_source.newsroom_snapshot_id
   and snapshot.article_id = dossier_source.newsroom_article_id
  where plan_row.id = v_prepare.article_plan_id
  group by
    profile_row.id,
    version_row.id,
    plan_row.id,
    dossier.id;

  v_input_hash_one := encode(
    extensions.digest(
      convert_to(
        v_input_snapshot::text || v_version_one.id::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_input_hash_two := encode(
    extensions.digest(
      convert_to(
        v_input_snapshot::text || v_version_two.version_id::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if v_input_hash_one = v_input_hash_two then
    raise exception 'editorial_profile_smoke_generation_identity_not_versioned';
  end if;

  select *
  into v_apply
  from public.newsroom_apply_editorial_dossier_article_plan_generation(
    p_dossier_id => v_prepare.dossier_id,
    p_article_plan_id => v_prepare.article_plan_id,
    p_editorial_article_id => v_prepare.editorial_article_id,
    p_expected_article_updated_at => v_article_updated_at,
    p_generated_body => v_generated_body,
    p_provider => 'synthetic-provider',
    p_model => 'synthetic-model',
    p_prompt_version => 'dossier-article-plan-body-v2-editorial-profile',
    p_provider_response_id => 'synthetic-response',
    p_input_hash => v_input_hash_one,
    p_input_snapshot => v_input_snapshot,
    p_input_tokens => 10,
    p_output_tokens => 20,
    p_total_tokens => 30
  );

  select *
  into v_reapply
  from public.newsroom_apply_editorial_dossier_article_plan_generation(
    p_dossier_id => v_prepare.dossier_id,
    p_article_plan_id => v_prepare.article_plan_id,
    p_editorial_article_id => v_prepare.editorial_article_id,
    p_expected_article_updated_at => v_article_updated_at,
    p_generated_body => v_generated_body,
    p_provider => 'synthetic-provider',
    p_model => 'synthetic-model',
    p_prompt_version => 'dossier-article-plan-body-v2-editorial-profile',
    p_provider_response_id => 'synthetic-response',
    p_input_hash => v_input_hash_one,
    p_input_snapshot => v_input_snapshot,
    p_input_tokens => 10,
    p_output_tokens => 20,
    p_total_tokens => 30
  );

  v_generated_body_hash := encode(
    extensions.digest(convert_to(btrim(v_generated_body), 'UTF8'), 'sha256'),
    'hex'
  );

  select
    count(*),
    min(generation.generated_body),
    min(generation.generated_body_hash)
  into
    v_generation_count,
    v_stored_generated_body,
    v_stored_generated_body_hash
  from public.newsroom_editorial_dossier_article_plan_generations generation
  where generation.article_plan_id = v_prepare.article_plan_id
    and generation.editorial_profile_version_id = v_version_one.id
    and generation.editorial_profile_state_at_generation = 'historical';

  if v_apply.generation_action <> 'applied'
     or v_reapply.generation_action <> 'reused'
     or v_reapply.generation_id <> v_apply.generation_id
     or v_generation_count <> 1
     or v_stored_generated_body <> btrim(v_generated_body)
     or v_stored_generated_body_hash <> v_generated_body_hash then
    raise exception 'editorial_profile_smoke_generation_persistence_invalid';
  end if;

  begin
    update public.newsroom_editorial_dossier_article_plan_generations generation
    set generated_body = 'Forbidden mutation'
    where generation.id = v_apply.generation_id;
  exception
    when sqlstate '55000' then
      v_generation_immutable := sqlerrm like '%editorial_generation_immutable%';
  end;

  if not v_generation_immutable then
    raise exception 'editorial_profile_smoke_generation_mutable';
  end if;

  update public.editorial_articles article
  set body =
        'Synthetic human revision that must not alter the preserved first generation.',
      updated_at = now()
  where article.id = v_prepare.editorial_article_id
    and article.status = 'draft'
    and article.published_at is null;

  select article.status, article.published_at
  into v_article_status, v_published_at
  from public.editorial_articles article
  where article.id = v_prepare.editorial_article_id;

  select generation.generated_body, generation.generated_body_hash
  into v_stored_generated_body, v_stored_generated_body_hash
  from public.newsroom_editorial_dossier_article_plan_generations generation
  where generation.id = v_apply.generation_id;

  if v_article_status <> 'draft'
     or v_published_at is not null
     or v_stored_generated_body <> btrim(v_generated_body)
     or v_stored_generated_body_hash <> v_generated_body_hash then
    raise exception 'editorial_profile_smoke_revision_changed_first_generation';
  end if;
end;
$$;

select
  true as smoke_passed,
  false as writes_committed,
  0::integer as residue_count,
  'ROLLBACK'::text as transaction_end;

rollback;
