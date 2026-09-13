-- Run only against a disposable PostgreSQL 17 database after
-- 20260913134418_newsroom_mesa_contexts_production_2c.sql has been applied.
-- Fixtures and contract probes are transactional and leave no data behind.
begin;

do $test$
declare
  v_definition text;
begin
  if to_regclass('public.newsroom_mesa_production_context_items') is null
    or to_regclass('public.newsroom_mesa_production_context_sources') is null
    or to_regclass('public.newsroom_mesa_article_plan_contexts') is null
  then
    raise exception 'test-2c-normalized-context-tables-missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'newsroom_mesa_output_publications'
      and column_row.column_name = 'production_context_id'
      and column_row.is_nullable = 'YES'
      and column_row.data_type = 'uuid'
  ) then
    raise exception 'test-2c-output-context-column-invalid';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.newsroom_mesa_article_plan_contexts'::regclass
      and constraint_row.contype = 'f'
      and pg_get_constraintdef(constraint_row.oid)
        like '%FOREIGN KEY (dossier_id, article_plan_id)%'
  ) or not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.newsroom_mesa_article_plan_contexts'::regclass
      and constraint_row.contype = 'f'
      and pg_get_constraintdef(constraint_row.oid)
        like '%FOREIGN KEY (dossier_id, production_context_id)%'
  ) then
    raise exception 'test-2c-cross-workspace-fkeys-missing';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.newsroom_mesa_production_context_sources'::regclass
      and constraint_row.contype = 'f'
      and pg_get_constraintdef(constraint_row.oid)
        like '%newsroom_editorial_dossier_sources(dossier_id, id)%'
  ) then
    raise exception 'test-2c-frozen-dossier-source-fkey-missing';
  end if;

  if to_regprocedure('public.newsroom_prepare_mesa_contexts_v3(uuid,text,jsonb,uuid,uuid[])') is null
    or to_regprocedure('public.newsroom_assign_mesa_article_plan_context_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('public.newsroom_save_mesa_context_article_plan_v1(uuid,uuid,text,text,integer,text,text,text,uuid[],uuid)') is null
    or to_regprocedure('public.newsroom_mesa_plan_context_sources_valid_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('public.newsroom_mesa_output_source_in_context_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('public.newsroom_editorial_source_package_manifest_v5_context_valid(uuid,text,text,jsonb)') is null
  then
    raise exception 'test-2c-contract-functions-missing';
  end if;

  select pg_get_functiondef(
    'public.newsroom_prepare_mesa_contexts_v3(uuid,text,jsonb,uuid,uuid[])'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%newsroom_prepare_mesa_materials_v2%'
    or v_definition not ilike '%newsroom_set_editorial_theme_source_membership_v1%'
    or v_definition not ilike '%contextRequestFingerprint%'
    or v_definition not ilike '%mesa-context-theme-membership-stale%'
    or v_definition not ilike '%mesa-context-source-not-loose%'
  then
    raise exception 'test-2c-atomic-prepare-contract-invalid';
  end if;

  select pg_get_functiondef(
    'public.newsroom_save_mesa_context_article_plan_v1(uuid,uuid,text,text,integer,text,text,text,uuid[],uuid)'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%newsroom_save_editorial_dossier_article_plan%'
    or v_definition not ilike '%newsroom_assign_mesa_article_plan_context_v1%'
    or v_definition not ilike '%contextContractVersion%1%'
    or v_definition ilike '%insert into public.newsroom_editorial_dossier_article_plans%'
  then
    raise exception 'test-2c-context-plan-writer-contract-invalid';
  end if;

  select pg_get_functiondef(
    'public.newsroom_mesa_plan_context_sources_valid_v1(uuid,uuid,uuid)'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%except%'
    or v_definition not ilike '%newsroom_mesa_production_context_sources%'
    or v_definition not ilike '%newsroom_editorial_dossier_article_plan_sources%'
  then
    raise exception 'test-2c-plan-context-exact-set-contract-invalid';
  end if;

  select pg_get_functiondef(
    'public.newsroom_mesa_output_source_in_context_v1(uuid,uuid,uuid)'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%source_scope%context%'
    or v_definition not ilike '%dossier_source_id%'
  then
    raise exception 'test-2c-output-source-scope-contract-invalid';
  end if;

  select pg_get_functiondef(
    'public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%v_source_scope text := ''workspace''%'
    or v_definition not ilike '%newsroom_mesa_plan_context_sources_valid_v1%'
    or v_definition not ilike '%v_declared_context_source_ids is distinct from v_frozen_context_source_ids%'
    or v_definition not ilike '%production_context_id%'
  then
    raise exception 'test-2c-context-publication-contract-invalid';
  end if;

  select pg_get_functiondef(
    'public.newsroom_mesa_consolidate_publication_v4(uuid)'::regprocedure
  ) into v_definition;
  if v_definition not ilike '%newsroom_mesa_consolidate_publication_v3%'
    or v_definition not ilike '%source_scope not in (''workspace'', ''context'')%'
    or v_definition not ilike '%newsroom_mesa_production_context_items%'
    or v_definition not ilike '%newsroom_editorial_theme_articles%'
  then
    raise exception 'test-2c-context-consolidation-contract-invalid';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.newsroom_mesa_output_source_usage'::regclass
      and trigger_row.tgname = 'newsroom_mesa_output_usage_context_scope_v1'
      and not trigger_row.tgisinternal
  ) or not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.newsroom_editorial_source_packages'::regclass
      and trigger_row.tgname = 'newsroom_mesa_context_package_valid_v1'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'test-2c-provenance-triggers-missing';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.newsroom_mesa_output_publications'::regclass
      and constraint_row.conname = 'newsroom_mesa_output_publications_source_scope_check'
      and pg_get_constraintdef(constraint_row.oid) ilike '%source_scope IS NULL%'
      and pg_get_constraintdef(constraint_row.oid) ilike '%source_scope = ''workspace''%'
      and pg_get_constraintdef(constraint_row.oid) ilike '%source_scope = ''context''%'
  ) then
    raise exception 'test-2c-backwards-compatible-source-scope-check-invalid';
  end if;
end;
$test$;

do $seed$
declare
  v_index integer;
  v_article_id uuid;
  v_snapshot_id uuid;
begin
  for v_index in 1..8 loop
    v_article_id := (
      '97000000-0000-4000-8000-' || lpad(v_index::text, 12, '0')
    )::uuid;
    v_snapshot_id := (
      '97000000-0000-4000-8000-' || lpad((100 + v_index)::text, 12, '0')
    )::uuid;

    insert into public.newsroom_articles(
      id,
      source_code,
      original_url,
      normalized_url,
      title,
      detected_at,
      first_detected_at,
      last_detected_at,
      processing_status
    ) values (
      v_article_id,
      '__mesa_2c_pg17__',
      'https://example.invalid/mesa-2c/' || v_index,
      'https://example.invalid/mesa-2c/' || v_index,
      'Fonte 2C ' || v_index,
      statement_timestamp(),
      statement_timestamp(),
      statement_timestamp(),
      'ready_for_review'
    );

    insert into public.newsroom_article_snapshots(
      id,
      article_id,
      content_hash,
      body,
      source_metadata,
      extracted_at
    ) values (
      v_snapshot_id,
      v_article_id,
      repeat(v_index::text, 64),
      jsonb_build_array(jsonb_build_object(
        'type', 'paragraph',
        'text', 'Conteudo factual congelado da fonte ' || v_index
      )),
      jsonb_build_object('fixture', 'mesa-2c-pg17'),
      statement_timestamp()
    );

    if v_index <> 5 then
      insert into public.newsroom_editorial_article_classifications(
        newsroom_article_id,
        classification_key,
        classification_source
      ) values (v_article_id, 'sporting', 'automatic');
    end if;
  end loop;

  insert into public.newsroom_editorial_themes(id, title, classification_key)
  values
    ('97000000-0000-4000-8000-000000000201', 'Tema A 2C', 'sporting'),
    ('97000000-0000-4000-8000-000000000202', 'Tema B 2C', 'sporting'),
    ('97000000-0000-4000-8000-000000000203', 'Tema C 2C', 'sporting');

  perform public.newsroom_set_editorial_theme_source_membership_v1(
    '97000000-0000-4000-8000-000000000201',
    '97000000-0000-4000-8000-000000000002',
    true
  );
  perform public.newsroom_set_editorial_theme_source_membership_v1(
    '97000000-0000-4000-8000-000000000201',
    '97000000-0000-4000-8000-000000000003',
    true
  );
  perform public.newsroom_set_editorial_theme_source_membership_v1(
    '97000000-0000-4000-8000-000000000202',
    '97000000-0000-4000-8000-000000000002',
    true
  );
  perform public.newsroom_set_editorial_theme_source_membership_v1(
    '97000000-0000-4000-8000-000000000203',
    '97000000-0000-4000-8000-000000000003',
    true
  );
end;
$seed$;

do $behaviour$
declare
  v_theme_a constant uuid := '97000000-0000-4000-8000-000000000201';
  v_theme_b constant uuid := '97000000-0000-4000-8000-000000000202';
  v_theme_c constant uuid := '97000000-0000-4000-8000-000000000203';
  v_source_context uuid;
  v_theme_context uuid;
  v_foreign_context uuid;
  v_workspace uuid;
  v_foreign_workspace uuid;
  v_incorporated_workspace uuid;
  v_historical_workspace uuid;
  v_plan_source uuid;
  v_plan_theme_one uuid;
  v_plan_theme_two uuid;
  v_plan_count bigint;
  v_source_context_sources uuid[];
  v_theme_context_sources uuid[];
  v_historical_sources uuid[];
  v_source_one_dossier_id uuid;
  v_source_two_dossier_id uuid;
  v_prepare record;
  v_contexts jsonb;
begin
  v_contexts := jsonb_build_array(
    jsonb_build_object(
      'kind', 'source',
      'sourceId', '97000000-0000-4000-8000-000000000001'::uuid,
      'sources', jsonb_build_array(jsonb_build_object(
        'newsroomArticleId', '97000000-0000-4000-8000-000000000001'::uuid,
        'newsroomSnapshotId', '97000000-0000-4000-8000-000000000101'::uuid
      ))
    ),
    jsonb_build_object(
      'kind', 'theme',
      'themeId', v_theme_a,
      'sources', jsonb_build_array(
        jsonb_build_object(
          'newsroomArticleId', '97000000-0000-4000-8000-000000000002'::uuid,
          'newsroomSnapshotId', '97000000-0000-4000-8000-000000000102'::uuid
        ),
        jsonb_build_object(
          'newsroomArticleId', '97000000-0000-4000-8000-000000000003'::uuid,
          'newsroomSnapshotId', '97000000-0000-4000-8000-000000000103'::uuid
        )
      )
    )
  );

  select * into strict v_prepare
  from public.newsroom_prepare_mesa_contexts_v3(
    '97000000-0000-4000-8000-000000000301',
    'Producao mista 2C',
    v_contexts,
    null,
    '{}'::uuid[]
  );
  v_workspace := v_prepare.dossier_id;
  if v_prepare.preparation_action <> 'created'
    or v_prepare.source_count <> 3
    or v_prepare.context_count <> 2
  then
    raise exception 'test-2c-real-preparation-invalid';
  end if;
  raise notice 'PASS 01: preparacao 2C real cria dois contextos e tres fontes';

  select * into strict v_prepare
  from public.newsroom_prepare_mesa_contexts_v3(
    '97000000-0000-4000-8000-000000000301',
    'Producao mista 2C',
    v_contexts,
    null,
    '{}'::uuid[]
  );
  if v_prepare.preparation_action <> 'reused'
    or v_prepare.dossier_id <> v_workspace
    or (select count(*) from public.newsroom_mesa_production_context_items
        where dossier_id = v_workspace) <> 2
  then
    raise exception 'test-2c-idempotent-preparation-invalid';
  end if;
  raise notice 'PASS 02: repeticao idempotente nao duplica workspace nem contextos';

  select id into strict v_source_context
  from public.newsroom_mesa_production_context_items
  where dossier_id = v_workspace and context_kind = 'source';
  select id into strict v_theme_context
  from public.newsroom_mesa_production_context_items
  where dossier_id = v_workspace and context_kind = 'theme';
  select array_agg(dossier_source_id order by sort_order)
  into strict v_source_context_sources
  from public.newsroom_mesa_production_context_sources
  where dossier_id = v_workspace and production_context_id = v_source_context;
  select array_agg(dossier_source_id order by sort_order)
  into strict v_theme_context_sources
  from public.newsroom_mesa_production_context_sources
  where dossier_id = v_workspace and production_context_id = v_theme_context;

  select saved.article_plan_id into strict v_plan_source
  from public.newsroom_save_mesa_context_article_plan_v1(
    v_workspace, null, 'Plano fonte', 'planned', 10,
    'news', 'standard', '', v_source_context_sources, v_source_context
  ) saved;
  select saved.article_plan_id into strict v_plan_theme_one
  from public.newsroom_save_mesa_context_article_plan_v1(
    v_workspace, null, 'Plano tema um', 'planned', 20,
    'analysis', 'developed', '', v_theme_context_sources, v_theme_context
  ) saved;
  select saved.article_plan_id into strict v_plan_theme_two
  from public.newsroom_save_mesa_context_article_plan_v1(
    v_workspace, null, 'Plano tema dois', 'planned', 30,
    'news', 'brief', '', v_theme_context_sources, v_theme_context
  ) saved;

  if (select count(*) from public.newsroom_mesa_article_plan_contexts
      where dossier_id = v_workspace) <> 3
    or (select production_context_id from public.newsroom_mesa_article_plan_contexts
        where dossier_id = v_workspace and article_plan_id = v_plan_theme_one)
       <> v_theme_context
    or (select array_agg(dossier_source_id order by sort_order)
        from public.newsroom_editorial_dossier_article_plan_sources
        where dossier_id = v_workspace and article_plan_id = v_plan_theme_one)
       is distinct from
       (select array_agg(dossier_source_id order by sort_order)
        from public.newsroom_editorial_dossier_article_plan_sources
        where dossier_id = v_workspace and article_plan_id = v_plan_theme_two)
  then
    raise exception 'test-2c-article-plan-context-reuse-invalid';
  end if;
  raise notice 'PASS 03: Article Plans apontam para contexto e reutilizam o mesmo conjunto congelado';

  v_contexts := jsonb_build_array(jsonb_build_object(
    'kind', 'source',
    'sourceId', '97000000-0000-4000-8000-000000000007'::uuid,
    'sources', jsonb_build_array(jsonb_build_object(
      'newsroomArticleId', '97000000-0000-4000-8000-000000000007'::uuid,
      'newsroomSnapshotId', '97000000-0000-4000-8000-000000000107'::uuid
    ))
  ));
  select * into strict v_prepare
  from public.newsroom_prepare_mesa_contexts_v3(
    '97000000-0000-4000-8000-000000000302',
    'Segundo workspace 2C',
    v_contexts,
    null,
    '{}'::uuid[]
  );
  v_foreign_workspace := v_prepare.dossier_id;
  select id into strict v_foreign_context
  from public.newsroom_mesa_production_context_items
  where dossier_id = v_foreign_workspace;

  begin
    perform * from public.newsroom_assign_mesa_article_plan_context_v1(
      v_workspace, v_plan_source, v_foreign_context
    );
    raise exception 'test-2c-cross-workspace-context-was-accepted';
  exception
    when others then
      if sqlerrm not like '%mesa-article-plan-context-sources-invalid%' then
        raise;
      end if;
  end;
  if (select production_context_id from public.newsroom_mesa_article_plan_contexts
      where dossier_id = v_workspace and article_plan_id = v_plan_source)
     <> v_source_context
  then
    raise exception 'test-2c-cross-workspace-context-changed-assignment';
  end if;
  raise notice 'PASS 04: contexto de outro workspace e rejeitado';

  begin
    update public.newsroom_mesa_production_context_items
    set title_snapshot = 'Mutacao proibida'
    where dossier_id = v_workspace and id = v_theme_context;
    raise exception 'test-2c-context-mutation-was-accepted';
  exception
    when check_violation then null;
  end;
  select id into strict v_source_one_dossier_id
  from public.newsroom_editorial_dossier_sources
  where dossier_id = v_workspace
    and newsroom_article_id = '97000000-0000-4000-8000-000000000001';
  begin
    update public.newsroom_editorial_dossier_sources
    set included = false
    where dossier_id = v_workspace and id = v_source_one_dossier_id;
    raise exception 'test-2c-frozen-dossier-source-mutation-was-accepted';
  exception
    when check_violation then null;
  end;
  raise notice 'PASS 05: contextos e snapshots congelados sao imutaveis';

  perform public.newsroom_set_editorial_theme_source_membership_v1(
    v_theme_a,
    '97000000-0000-4000-8000-000000000004',
    true
  );
  if (select count(*) from public.newsroom_mesa_production_context_sources
      where dossier_id = v_workspace and production_context_id = v_theme_context) <> 2
    or exists (
      select 1
      from public.newsroom_mesa_production_context_sources context_source
      join public.newsroom_editorial_dossier_sources dossier_source
        on dossier_source.dossier_id = context_source.dossier_id
        and dossier_source.id = context_source.dossier_source_id
      where context_source.dossier_id = v_workspace
        and context_source.production_context_id = v_theme_context
        and dossier_source.newsroom_article_id = '97000000-0000-4000-8000-000000000004'
    )
  then
    raise exception 'test-2c-theme-change-mutated-frozen-context';
  end if;
  raise notice 'PASS 06: membership posterior nao altera contexto congelado';

  insert into public.newsroom_editorial_source_packages(
    id, package_year, package_month, manifest, markdown
  ) values (
    '97000000-0000-4000-8000-000000000501',
    '2026',
    '09',
    jsonb_build_object(
      'version', '2',
      'packageId', '97000000-0000-4000-8000-000000000501',
      'year', '2026',
      'month', '09',
      'entries', jsonb_build_array()
    ),
    'Pacote transacional do teste 2C'
  );
  insert into public.editorial_articles(id, title, slug, status)
  values (
    '97000000-0000-4000-8000-000000000601',
    'Output transacional 2C',
    'output-transacional-mesa-2c-pg17',
    'published'
  );
  insert into public.newsroom_mesa_output_publications(
    dossier_id,
    article_plan_id,
    package_id,
    editorial_article_id,
    source_scope,
    production_context_id,
    fingerprint,
    payload
  ) values (
    v_workspace,
    v_plan_source,
    '97000000-0000-4000-8000-000000000501',
    '97000000-0000-4000-8000-000000000601',
    'context',
    v_source_context,
    repeat('a', 32),
    '{}'::jsonb
  );
  insert into public.newsroom_mesa_output_source_usage(
    dossier_id,
    article_plan_id,
    dossier_source_id,
    newsroom_article_id,
    newsroom_snapshot_id,
    editorial_article_id,
    package_id
  ) values (
    v_workspace,
    v_plan_source,
    v_source_one_dossier_id,
    '97000000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-000000000101',
    '97000000-0000-4000-8000-000000000601',
    '97000000-0000-4000-8000-000000000501'
  );

  select id into strict v_source_two_dossier_id
  from public.newsroom_editorial_dossier_sources
  where dossier_id = v_workspace
    and newsroom_article_id = '97000000-0000-4000-8000-000000000002';
  begin
    insert into public.newsroom_mesa_output_source_usage(
      dossier_id,
      article_plan_id,
      dossier_source_id,
      newsroom_article_id,
      newsroom_snapshot_id,
      editorial_article_id,
      package_id
    ) values (
      v_workspace,
      v_plan_source,
      v_source_two_dossier_id,
      '97000000-0000-4000-8000-000000000002',
      '97000000-0000-4000-8000-000000000102',
      '97000000-0000-4000-8000-000000000601',
      '97000000-0000-4000-8000-000000000501'
    );
    raise exception 'test-2c-outside-context-usage-was-accepted';
  exception
    when check_violation then null;
  end;
  if (select count(*) from public.newsroom_mesa_output_source_usage
      where dossier_id = v_workspace and article_plan_id = v_plan_source) <> 1
    or not public.newsroom_mesa_context_output_usage_valid_v1(
      v_workspace, v_plan_source
    )
  then
    raise exception 'test-2c-context-usage-set-invalid';
  end if;
  raise notice 'PASS 07: fonte fora do contexto e rejeitada e FONTES_UTILIZADAS fica limitada';

  v_contexts := jsonb_build_array(jsonb_build_object(
    'kind', 'theme',
    'themeId', v_theme_b,
    'sources', jsonb_build_array(
      jsonb_build_object(
        'newsroomArticleId', '97000000-0000-4000-8000-000000000002'::uuid,
        'newsroomSnapshotId', '97000000-0000-4000-8000-000000000102'::uuid
      ),
      jsonb_build_object(
        'newsroomArticleId', '97000000-0000-4000-8000-000000000006'::uuid,
        'newsroomSnapshotId', '97000000-0000-4000-8000-000000000106'::uuid
      )
    )
  ));
  select * into strict v_prepare
  from public.newsroom_prepare_mesa_contexts_v3(
    '97000000-0000-4000-8000-000000000303',
    'Incorporar e preparar 2C',
    v_contexts,
    v_theme_b,
    array['97000000-0000-4000-8000-000000000006'::uuid]
  );
  v_incorporated_workspace := v_prepare.dossier_id;
  if v_prepare.preparation_action <> 'created'
    or (select count(*) from public.newsroom_editorial_theme_sources
        where theme_id = v_theme_b
          and newsroom_article_id = '97000000-0000-4000-8000-000000000006') <> 1
    or (select count(*)
        from public.newsroom_mesa_production_context_sources context_source
        join public.newsroom_mesa_production_context_items context_item
          on context_item.dossier_id = context_source.dossier_id
          and context_item.id = context_source.production_context_id
        where context_source.dossier_id = v_incorporated_workspace
          and context_item.theme_id = v_theme_b) <> 2
  then
    raise exception 'test-2c-incorporate-and-prepare-invalid';
  end if;
  raise notice 'PASS 08: incorporar no Tema e preparar ocorre na mesma operacao';

  select * into strict v_prepare
  from public.newsroom_prepare_mesa_contexts_v3(
    '97000000-0000-4000-8000-000000000303',
    'Incorporar e preparar 2C',
    v_contexts,
    v_theme_b,
    array['97000000-0000-4000-8000-000000000006'::uuid]
  );
  if v_prepare.preparation_action <> 'reused'
    or v_prepare.dossier_id <> v_incorporated_workspace
    or (select count(*) from public.newsroom_editorial_theme_sources
        where theme_id = v_theme_b
          and newsroom_article_id = '97000000-0000-4000-8000-000000000006') <> 1
    or (select count(*) from public.newsroom_mesa_production_context_items
        where dossier_id = v_incorporated_workspace) <> 1
  then
    raise exception 'test-2c-incorporate-retry-duplicated-state';
  end if;
  raise notice 'PASS 09: retry da incorporacao e preparacao nao duplica memberships nem contextos';

  v_contexts := jsonb_build_array(jsonb_build_object(
    'kind', 'theme',
    'themeId', v_theme_c,
    'sources', jsonb_build_array(
      jsonb_build_object(
        'newsroomArticleId', '97000000-0000-4000-8000-000000000003'::uuid,
        'newsroomSnapshotId', '97000000-0000-4000-8000-000000000103'::uuid
      ),
      jsonb_build_object(
        'newsroomArticleId', '97000000-0000-4000-8000-000000000005'::uuid,
        'newsroomSnapshotId', '97000000-0000-4000-8000-000000000105'::uuid
      )
    )
  ));
  begin
    perform * from public.newsroom_prepare_mesa_contexts_v3(
      '97000000-0000-4000-8000-000000000304',
      'Preparacao que deve falhar',
      v_contexts,
      v_theme_c,
      array['97000000-0000-4000-8000-000000000005'::uuid]
    );
    raise exception 'test-2c-failing-preparation-was-accepted';
  exception
    when others then
      if sqlerrm not like '%mesa-material-classification-required%' then
        raise;
      end if;
  end;
  if exists (
    select 1 from public.newsroom_editorial_theme_sources
    where theme_id = v_theme_c
      and newsroom_article_id = '97000000-0000-4000-8000-000000000005'
  ) or exists (
    select 1 from public.newsroom_mesa_production_contexts
    where preparation_key = '97000000-0000-4000-8000-000000000304'
  ) or exists (
    select 1 from public.newsroom_editorial_dossiers
    where preparation_key = '97000000-0000-4000-8000-000000000304'
  ) then
    raise exception 'test-2c-failing-preparation-did-not-roll-back';
  end if;
  raise notice 'PASS 10: falha da preparacao faz rollback integral da membership';

  select * into strict v_prepare
  from public.newsroom_prepare_mesa_materials_v2(
    '97000000-0000-4000-8000-000000000305',
    null,
    'Workspace historico depois da 2C',
    jsonb_build_array(jsonb_build_object(
      'newsroomArticleId', '97000000-0000-4000-8000-000000000008'::uuid,
      'newsroomSnapshotId', '97000000-0000-4000-8000-000000000108'::uuid
    )),
    '[]'::jsonb
  );
  v_historical_workspace := v_prepare.dossier_id;
  if v_prepare.preparation_action <> 'created'
    or (select selection_payload ->> 'contractVersion'
        from public.newsroom_mesa_production_contexts
        where dossier_id = v_historical_workspace) <> '2'
    or exists (
      select 1 from public.newsroom_mesa_production_context_items
      where dossier_id = v_historical_workspace
    )
  then
    raise exception 'test-2c-historical-workspace-compatibility-invalid';
  end if;
  raise notice 'PASS 11: fluxo historico workspace v2 continua aceite sem contextos 2C';

  select array_agg(id order by id) into strict v_historical_sources
  from public.newsroom_editorial_dossier_sources
  where dossier_id = v_historical_workspace and included;
  update public.newsroom_mesa_production_contexts
  set selection_payload = selection_payload || jsonb_build_object(
    'contractVersion', 3,
    'contextContractVersion', 1
  )
  where dossier_id = v_historical_workspace;
  select count(*) into v_plan_count
  from public.newsroom_editorial_dossier_article_plans
  where dossier_id = v_historical_workspace;
  begin
    perform * from public.newsroom_save_mesa_context_article_plan_v1(
      v_historical_workspace,
      null,
      'Plano de workspace 2C incompleto',
      'planned',
      10,
      'news',
      'standard',
      '',
      v_historical_sources,
      v_source_context
    );
    raise exception 'test-2c-incomplete-workspace-fell-back';
  exception
    when others then
      if sqlerrm not like '%mesa-article-plan-context-workspace-invalid%' then
        raise;
      end if;
  end;
  if (select count(*) from public.newsroom_editorial_dossier_article_plans
      where dossier_id = v_historical_workspace) <> v_plan_count
  then
    raise exception 'test-2c-incomplete-workspace-created-legacy-plan';
  end if;
  raise notice 'PASS 12: workspace 2C incompleto falha explicitamente sem fallback';
end;
$behaviour$;

set constraints all immediate;

select jsonb_build_object(
  'phase', 'MESA-CONTEXTS-PRODUCTION-2C-PG17',
  'catalog_contracts', true,
  'real_preparation', true,
  'idempotent_preparation', true,
  'article_plan_context_workspace_fk', true,
  'immutable_contexts', true,
  'context_scoped_source_usage', true,
  'atomic_incorporation', true,
  'incorporation_rollback', true,
  'historical_workspace_compatible', true,
  'incomplete_2c_workspace_rejected', true,
  'persistent_writes', false
) as test_result;

rollback;
