begin;

-- Smoke transacional da fundacao do workspace. Todos os dados sao descartados.

do $seed$
begin
  insert into public.newsroom_articles (
    id,
    source_code,
    original_url,
    normalized_url,
    title,
    published_at,
    detected_at,
    image_url,
    processing_status,
    first_detected_at,
    last_detected_at
  ) values (
    '93000000-0000-4000-8000-000000000001'::uuid,
    '__workspace_foundation_smoke__',
    'https://example.invalid/workspace-source',
    'https://example.invalid/workspace-source',
    'Fonte do smoke do workspace',
    '2026-09-09 08:00:00+00'::timestamptz,
    '2026-09-09 08:01:00+00'::timestamptz,
    'https://example.invalid/workspace-source.jpg',
    'ready_for_review',
    '2026-09-09 08:01:00+00'::timestamptz,
    '2026-09-09 08:01:00+00'::timestamptz
  );

  insert into public.newsroom_article_snapshots (
    id,
    article_id,
    content_hash,
    body,
    source_metadata,
    extracted_at
  ) values (
    '93000000-0000-4000-8000-000000000002'::uuid,
    '93000000-0000-4000-8000-000000000001'::uuid,
    pg_catalog.repeat('a', 64),
    '[{"type":"paragraph","text":"Corpo concreto do smoke."}]'::jsonb,
    '{"fixture":"production-workspace"}'::jsonb,
    '2026-09-09 08:02:00+00'::timestamptz
  );

  insert into public.editorial_articles (
    id,
    title,
    slug,
    status,
    scope,
    body,
    image_url,
    published_at,
    created_at,
    updated_at
  ) values
  (
    '93000000-0000-4000-8000-000000000011'::uuid,
    'Publicada um do smoke',
    'workspace-smoke-publicada-um',
    'published',
    'general',
    'Corpo publicado um.',
    'https://example.invalid/workspace-published-one.jpg',
    '2026-09-09 07:00:00+00'::timestamptz,
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  ),
  (
    '93000000-0000-4000-8000-000000000012'::uuid,
    'Publicada dois do smoke',
    'workspace-smoke-publicada-dois',
    'published',
    'general',
    'Corpo publicado dois.',
    'https://example.invalid/workspace-published-two.jpg',
    '2026-09-09 07:10:00+00'::timestamptz,
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  ),
  (
    '93000000-0000-4000-8000-000000000013'::uuid,
    'Publicada de outro Dossie',
    'workspace-smoke-publicada-tres',
    'published',
    'general',
    'Corpo publicado tres.',
    'https://example.invalid/workspace-other-dossier.jpg',
    '2026-09-09 07:20:00+00'::timestamptz,
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  ),
  (
    '93000000-0000-4000-8000-000000000014'::uuid,
    'Rascunho invalido como target',
    'workspace-smoke-draft-target',
    'draft',
    'general',
    '',
    null,
    null,
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  );
end;
$seed$;

set local role service_role;

do $operations$
declare
  v_first record;
  v_retry record;
  v_second record;
  v_context_one uuid;
  v_context_two uuid;
  v_foreign_context uuid;
  v_source_image uuid;
  v_foreign_image uuid;
  v_plan_one uuid;
  v_plan_two uuid;
  v_plan_three uuid;
  v_legacy_dossier_id uuid;
  v_upload record;
  v_plan_count_before bigint;
  v_article_count_before bigint;
  v_package_count_before bigint;
  v_generation_count_before bigint;
begin
  select pg_catalog.count(*) into v_plan_count_before
  from public.newsroom_editorial_dossier_article_plans;
  select pg_catalog.count(*) into v_article_count_before
  from public.editorial_articles;
  select pg_catalog.count(*) into v_package_count_before
  from public.newsroom_editorial_source_packages;
  select pg_catalog.count(*) into v_generation_count_before
  from public.newsroom_editorial_dossier_article_plan_generations;

  select * into v_first
  from public.newsroom_prepare_editorial_dossier_workspace_v1(
    '93000000-0000-4000-8000-000000000101'::uuid,
    'Dossie atomico do smoke',
    array['93000000-0000-4000-8000-000000000001'::uuid],
    array['93000000-0000-4000-8000-000000000002'::uuid],
    array[
      '93000000-0000-4000-8000-000000000011'::uuid,
      '93000000-0000-4000-8000-000000000012'::uuid
    ]
  );

  if v_first.preparation_action <> 'created'
    or v_first.source_count <> 1
    or v_first.published_context_count <> 2
    or v_first.image_count <> 3
  then
    raise exception 'workspace_smoke_prepare_result_invalid'
      using errcode = '55000';
  end if;

  update public.newsroom_articles as article_row
  set image_url = 'https://example.invalid/workspace-source-changed.jpg'
  where article_row.id =
    '93000000-0000-4000-8000-000000000001'::uuid;

  select * into v_retry
  from public.newsroom_prepare_editorial_dossier_workspace_v1(
    '93000000-0000-4000-8000-000000000101'::uuid,
    'Dossie atomico do smoke',
    array['93000000-0000-4000-8000-000000000001'::uuid],
    array['93000000-0000-4000-8000-000000000002'::uuid],
    array[
      '93000000-0000-4000-8000-000000000011'::uuid,
      '93000000-0000-4000-8000-000000000012'::uuid
    ]
  );

  if v_retry.preparation_action <> 'reused'
    or v_retry.dossier_id <> v_first.dossier_id
    or (
      select pg_catalog.count(*)
      from public.newsroom_editorial_dossiers as dossier_row
      where dossier_row.preparation_key =
        '93000000-0000-4000-8000-000000000101'::uuid
    ) <> 1
  then
    raise exception 'workspace_smoke_prepare_retry_duplicated'
      using errcode = '55000';
  end if;

  if (
    select pg_catalog.count(*)
    from public.newsroom_editorial_dossier_images as image_row
    where image_row.dossier_id = v_first.dossier_id
      and image_row.origin_kind = 'newsroom'
      and image_row.newsroom_article_id =
        '93000000-0000-4000-8000-000000000001'::uuid
      and image_row.frozen_url =
        'https://example.invalid/workspace-source.jpg'
  ) <> 1
    or exists (
      select 1
      from public.newsroom_editorial_dossier_images as image_row
      where image_row.dossier_id = v_first.dossier_id
        and image_row.frozen_url =
          'https://example.invalid/workspace-source-changed.jpg'
    )
  then
    raise exception 'workspace_smoke_retry_refreshed_frozen_image'
      using errcode = '55000';
  end if;

  begin
    perform *
    from public.newsroom_prepare_editorial_dossier_workspace_v1(
      '93000000-0000-4000-8000-000000000101'::uuid,
      'Payload diferente para a mesma chave',
      array['93000000-0000-4000-8000-000000000001'::uuid],
      array['93000000-0000-4000-8000-000000000002'::uuid],
      '{}'::uuid[]
    );
    raise exception 'workspace_smoke_idempotency_conflict_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then null;
  end;

  if (
    select source_row.newsroom_snapshot_id
    from public.newsroom_editorial_dossier_sources as source_row
    where source_row.dossier_id = v_first.dossier_id
  ) <> '93000000-0000-4000-8000-000000000002'::uuid
  then
    raise exception 'workspace_smoke_explicit_snapshot_not_preserved'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.newsroom_editorial_dossier_article_plans as plan_row
    where plan_row.dossier_id = v_first.dossier_id
  )
    or (
      select pg_catalog.count(*)
      from public.newsroom_editorial_dossier_article_plans
    ) <> v_plan_count_before
    or (
      select pg_catalog.count(*) from public.editorial_articles
    ) <> v_article_count_before
    or (
      select pg_catalog.count(*)
      from public.newsroom_editorial_source_packages
    ) <> v_package_count_before
    or (
      select pg_catalog.count(*)
      from public.newsroom_editorial_dossier_article_plan_generations
    ) <> v_generation_count_before
  then
    raise exception 'workspace_smoke_prepare_created_downstream_state'
      using errcode = '55000';
  end if;

  select context_row.id into v_context_one
  from public.newsroom_editorial_dossier_published_contexts as context_row
  where context_row.dossier_id = v_first.dossier_id
    and context_row.editorial_article_id =
      '93000000-0000-4000-8000-000000000011'::uuid;

  select context_row.id into v_context_two
  from public.newsroom_editorial_dossier_published_contexts as context_row
  where context_row.dossier_id = v_first.dossier_id
    and context_row.editorial_article_id =
      '93000000-0000-4000-8000-000000000012'::uuid;

  select image_row.id into v_source_image
  from public.newsroom_editorial_dossier_images as image_row
  where image_row.dossier_id = v_first.dossier_id
    and image_row.origin_kind = 'newsroom'
    and image_row.newsroom_article_id =
      '93000000-0000-4000-8000-000000000001'::uuid
    and image_row.frozen_url =
      'https://example.invalid/workspace-source.jpg';

  if v_context_one is null or v_context_two is null or v_source_image is null
  then
    raise exception 'workspace_smoke_provenance_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_dossier_images as image_row
    where image_row.dossier_id = v_first.dossier_id
      and image_row.origin_kind = 'published'
      and image_row.editorial_article_id =
        '93000000-0000-4000-8000-000000000011'::uuid
      and image_row.frozen_url =
        'https://example.invalid/workspace-published-one.jpg'
  ) then
    raise exception 'workspace_smoke_published_image_provenance_missing'
      using errcode = '55000';
  end if;

  select * into v_second
  from public.newsroom_prepare_editorial_dossier_workspace_v1(
    '93000000-0000-4000-8000-000000000102'::uuid,
    'Segundo Dossie atomico do smoke',
    '{}'::uuid[],
    '{}'::uuid[],
    array['93000000-0000-4000-8000-000000000013'::uuid]
  );

  select context_row.id into v_foreign_context
  from public.newsroom_editorial_dossier_published_contexts as context_row
  where context_row.dossier_id = v_second.dossier_id;

  select image_row.id into v_foreign_image
  from public.newsroom_editorial_dossier_images as image_row
  where image_row.dossier_id = v_second.dossier_id
    and image_row.origin_kind = 'published'
    and image_row.editorial_article_id =
      '93000000-0000-4000-8000-000000000013'::uuid;

  if v_foreign_context is null or v_foreign_image is null
  then
    raise exception 'workspace_smoke_second_dossier_material_missing'
      using errcode = '55000';
  end if;

  insert into public.newsroom_editorial_dossier_article_plans (
    dossier_id,
    working_title,
    status
  ) values (v_first.dossier_id, 'Plano um do smoke', 'planned')
  returning id into v_plan_one;

  insert into public.newsroom_editorial_dossier_article_plans (
    dossier_id,
    working_title,
    status
  ) values (v_first.dossier_id, 'Plano dois do smoke', 'planned')
  returning id into v_plan_two;

  insert into public.newsroom_editorial_dossier_article_plans (
    dossier_id,
    working_title,
    status
  ) values (v_second.dossier_id, 'Plano tres do smoke', 'planned')
  returning id into v_plan_three;

  perform *
  from public.newsroom_save_dossier_article_plan_state_v1(
    v_first.dossier_id,
    v_plan_one,
    'update',
    '93000000-0000-4000-8000-000000000011'::uuid,
    array[v_context_one, v_context_two],
    'dossier_image',
    v_source_image
  );

  perform *
  from public.newsroom_save_dossier_article_plan_state_v1(
    v_first.dossier_id,
    v_plan_two,
    'new',
    null,
    '{}'::uuid[],
    'dossier_image',
    v_source_image
  );

  if (
    select pg_catalog.count(*)
    from public.newsroom_editorial_dossier_article_plan_published_contexts
      as assignment_row
    where assignment_row.article_plan_id = v_plan_one
  ) <> 2
    or exists (
      select 1
      from public.newsroom_editorial_dossier_article_plan_published_contexts
        as assignment_row
      where assignment_row.article_plan_id = v_plan_two
    )
    or (
      select pg_catalog.count(*)
      from public.newsroom_editorial_dossier_article_plans as plan_row
      where plan_row.id in (v_plan_one, v_plan_two)
        and plan_row.dossier_image_id = v_source_image
    ) <> 2
  then
    raise exception 'workspace_smoke_plan_context_or_reusable_image_failed'
      using errcode = '55000';
  end if;

  begin
    perform *
    from public.newsroom_save_dossier_article_plan_state_v1(
      v_first.dossier_id,
      v_plan_two,
      'new',
      null,
      array[v_foreign_context],
      'unselected',
      null
    );
    raise exception 'workspace_smoke_foreign_context_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then null;
  end;

  begin
    perform *
    from public.newsroom_save_dossier_article_plan_state_v1(
      v_first.dossier_id,
      v_plan_two,
      'new',
      null,
      '{}'::uuid[],
      'dossier_image',
      v_foreign_image
    );
    raise exception 'workspace_smoke_foreign_image_rpc_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then null;
  end;

  begin
    update public.newsroom_editorial_dossier_article_plans
    set image_choice = 'dossier_image',
        dossier_image_id = v_foreign_image
    where id = v_plan_two;
    raise exception 'workspace_smoke_foreign_image_fk_not_blocked'
      using errcode = '55000';
  exception
    when foreign_key_violation then null;
  end;

  if (
    select plan_row.dossier_image_id
    from public.newsroom_editorial_dossier_article_plans as plan_row
    where plan_row.id = v_plan_two
  ) is distinct from v_source_image
  then
    raise exception 'workspace_smoke_foreign_image_changed_plan'
      using errcode = '55000';
  end if;

  begin
    update public.newsroom_editorial_dossier_article_plans
    set destination = 'update',
        update_target_editorial_article_id =
          '93000000-0000-4000-8000-000000000099'::uuid
    where id = v_plan_two;
    raise exception 'workspace_smoke_noncanonical_target_not_blocked'
      using errcode = '55000';
  exception
    when foreign_key_violation then null;
  end;

  begin
    update public.newsroom_editorial_dossier_article_plans
    set destination = 'new',
        update_target_editorial_article_id =
          '93000000-0000-4000-8000-000000000012'::uuid
    where id = v_plan_two;
    raise exception 'workspace_smoke_new_target_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then null;
  end;

  begin
    update public.newsroom_editorial_dossier_article_plans
    set destination = 'update',
        update_target_editorial_article_id = null
    where id = v_plan_two;
    raise exception 'workspace_smoke_update_without_target_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then null;
  end;

  begin
    perform *
    from public.newsroom_save_dossier_article_plan_state_v1(
      v_first.dossier_id,
      v_plan_two,
      'update',
      '93000000-0000-4000-8000-000000000014'::uuid,
      '{}'::uuid[],
      'unselected',
      null
    );
    raise exception 'workspace_smoke_draft_update_target_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then null;
  end;

  begin
    perform *
    from public.newsroom_save_dossier_article_plan_state_v1(
      v_first.dossier_id,
      v_plan_two,
      'new',
      null,
      '{}'::uuid[],
      'preserve_published',
      null
    );
    raise exception 'workspace_smoke_preserve_on_new_not_blocked'
      using errcode = '55000';
  exception
    when invalid_parameter_value then null;
  end;

  select * into v_upload
  from public.newsroom_add_dossier_upload_image_v1(
    v_first.dossier_id,
    'https://project.supabase.co/storage/v1/object/public/editorial-images/editorial/2026/09/smoke.jpg',
    'editorial-images',
    'editorial/2026/09/smoke.jpg',
    'smoke.jpg'
  );

  begin
    perform *
    from public.newsroom_add_dossier_upload_image_v1(
      v_first.dossier_id,
      'https://project.supabase.co/storage/v1/object/public/outro-bucket/editorial/2026/09/smoke.jpg',
      'outro-bucket',
      'editorial/2026/09/smoke.jpg',
      'smoke.jpg'
    );
    raise exception 'workspace_smoke_upload_bucket_not_blocked'
      using errcode = '55000';
  exception
    when invalid_parameter_value then null;
  end;

  if v_upload.image_action <> 'created'
    or not exists (
      select 1
      from public.newsroom_editorial_dossier_images as image_row
      where image_row.id = v_upload.dossier_image_id
        and image_row.origin_kind = 'upload'
        and image_row.storage_bucket = 'editorial-images'
        and not exists (
          select 1
          from public.newsroom_editorial_dossier_article_plans as plan_row
          where plan_row.dossier_image_id = image_row.id
        )
    )
  then
    raise exception 'workspace_smoke_unassigned_upload_failed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.newsroom_editorial_dossiers as dossier_row
    where dossier_row.id = v_first.dossier_id
      and dossier_row.status <> 'draft'
  ) then
    raise exception 'workspace_smoke_prepare_changed_dossier_lifecycle'
      using errcode = '55000';
  end if;

  -- Uma linha legacy sem preparation_key e um plano sem novos valores
  -- continuam validos pelos defaults semanticamente seguros.
  insert into public.newsroom_editorial_dossiers (title)
  values ('Dossie legacy compativel do smoke')
  returning id into v_legacy_dossier_id;

  insert into public.newsroom_editorial_dossier_article_plans (
    dossier_id,
    working_title
  ) values (
    v_legacy_dossier_id,
    'Plano legacy compativel do smoke'
  )
  returning id into v_plan_three;

  if not exists (
    select 1
    from public.newsroom_editorial_dossier_article_plans as plan_row
    where plan_row.id = v_plan_three
      and plan_row.destination = 'new'
      and plan_row.update_target_editorial_article_id is null
      and plan_row.image_choice = 'unselected'
      and plan_row.dossier_image_id is null
      and plan_row.editorial_article_id is null
  ) then
    raise exception 'workspace_smoke_legacy_defaults_invalid'
      using errcode = '55000';
  end if;
end;
$operations$;

select jsonb_build_object(
  'phase', 'JORNADA-REDACAO-WORKSPACE-PRODUCAO-FUNDACAO-1',
  'atomic_prepare', true,
  'idempotent_prepare', true,
  'same_dossier_contexts', true,
  'destination_invariants', true,
  'shared_dossier_images', true,
  'legacy_compatible', true,
  'persistent_writes', false
) as smoke_result;

rollback;
