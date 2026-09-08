-- JORNADA-REDACAO-CLASSIFICACAO-PREPUBLICACAO-1
-- Smoke PostgreSQL transacional. Exige a migration do Lote 2B aplicada
-- num ambiente local/descartavel e termina sempre em rollback.

begin;

do $structure$
declare
  v_function regprocedure;
  v_role text;
begin
  if pg_catalog.to_regclass(
    'public.newsroom_editorial_article_classifications'
  ) is null
  then
    raise exception 'article_classification_smoke_target_table_missing'
      using errcode = '42P01';
  end if;

  if exists (
    select 1
    from (
      values
        (
          'newsroom_editorial_article_classifications_pkey',
          'p'
        ),
        (
          'newsroom_editorial_article_classifications_article_fkey',
          'f'
        ),
        (
          'newsroom_editorial_article_classifications_key_check',
          'c'
        ),
        (
          'newsroom_editorial_article_classifications_source_check',
          'c'
        )
    ) as required(constraint_name, constraint_type)
    where not exists (
      select 1
      from pg_catalog.pg_constraint as constraint_row
      where constraint_row.conrelid = pg_catalog.to_regclass(
        'public.newsroom_editorial_article_classifications'
      )
        and constraint_row.conname = required.constraint_name
        and constraint_row.contype = required.constraint_type::"char"
    )
  )
  then
    raise exception 'article_classification_smoke_constraint_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = pg_catalog.to_regclass(
      'public.newsroom_editorial_article_classifications'
    )
      and constraint_row.conname =
        'newsroom_editorial_article_classifications_article_fkey'
      and constraint_row.confrelid =
        pg_catalog.to_regclass('public.newsroom_articles')
      and constraint_row.confdeltype = 'c'
  )
  then
    raise exception 'article_classification_smoke_fk_contract_mismatch'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as table_row
    where table_row.oid = pg_catalog.to_regclass(
      'public.newsroom_editorial_article_classifications'
    )
      and table_row.relrowsecurity
      and table_row.relforcerowsecurity
  )
  then
    raise exception 'article_classification_smoke_rls_not_enabled_and_forced'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as table_row
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        table_row.relacl,
        pg_catalog.acldefault('r', table_row.relowner)
      )
    ) as privilege_row
    where table_row.oid = pg_catalog.to_regclass(
      'public.newsroom_editorial_article_classifications'
    )
      and privilege_row.grantee = 0
  )
  then
    raise exception 'article_classification_smoke_public_privilege_present'
      using errcode = '42501';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    if pg_catalog.has_table_privilege(
      v_role,
      'public.newsroom_editorial_article_classifications',
      'SELECT'
    )
      or pg_catalog.has_table_privilege(
        v_role,
        'public.newsroom_editorial_article_classifications',
        'INSERT'
      )
      or pg_catalog.has_table_privilege(
        v_role,
        'public.newsroom_editorial_article_classifications',
        'UPDATE'
      )
      or pg_catalog.has_table_privilege(
        v_role,
        'public.newsroom_editorial_article_classifications',
        'DELETE'
      )
      or pg_catalog.has_table_privilege(
        v_role,
        'public.newsroom_editorial_article_classifications',
        'TRUNCATE'
      )
      or pg_catalog.has_table_privilege(
        v_role,
        'public.newsroom_editorial_article_classifications',
        'REFERENCES'
      )
      or pg_catalog.has_table_privilege(
        v_role,
        'public.newsroom_editorial_article_classifications',
        'TRIGGER'
      )
    then
      raise exception 'article_classification_smoke_client_privilege_present:%',
        v_role
        using errcode = '42501';
    end if;
  end loop;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.newsroom_editorial_article_classifications',
    'SELECT'
  )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.newsroom_editorial_article_classifications',
      'INSERT'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.newsroom_editorial_article_classifications',
      'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.newsroom_editorial_article_classifications',
      'DELETE'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.newsroom_editorial_article_classifications',
      'TRUNCATE'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.newsroom_editorial_article_classifications',
      'REFERENCES'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.newsroom_editorial_article_classifications',
      'TRIGGER'
    )
  then
    raise exception 'article_classification_smoke_service_privileges_mismatch'
      using errcode = '42501';
  end if;

  foreach v_function in array array[
    pg_catalog.to_regprocedure(
      'public.newsroom_read_article_classification_states_v1(uuid[])'
    ),
    pg_catalog.to_regprocedure(
      'public.newsroom_apply_automatic_article_classification_v1(uuid,text)'
    ),
    pg_catalog.to_regprocedure(
      'public.newsroom_set_manual_article_classification_v1(uuid,text)'
    ),
    pg_catalog.to_regprocedure(
      'public.newsroom_clear_article_classification_v1(uuid)'
    )
  ] loop
    if v_function is null
      or not pg_catalog.has_function_privilege(
        'service_role',
        v_function,
        'EXECUTE'
      )
      or pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
      or pg_catalog.has_function_privilege(
        'authenticated',
        v_function,
        'EXECUTE'
      )
      or exists (
        select 1
        from pg_catalog.pg_proc as function_row
        cross join lateral pg_catalog.aclexplode(
          coalesce(
            function_row.proacl,
            pg_catalog.acldefault('f', function_row.proowner)
          )
        ) as privilege_row
        where function_row.oid = v_function
          and privilege_row.grantee = 0
      )
      or exists (
        select 1
        from pg_catalog.pg_proc as function_row
        where function_row.oid = v_function
          and (
            (
              function_row.oid <>
                pg_catalog.to_regprocedure(
                  'public.newsroom_read_article_classification_states_v1(uuid[])'
                )
              and not function_row.prosecdef
            )
            or (
              function_row.oid =
                pg_catalog.to_regprocedure(
                  'public.newsroom_read_article_classification_states_v1(uuid[])'
                )
              and function_row.prosecdef
            )
            or not exists (
              select 1
              from pg_catalog.unnest(
                coalesce(function_row.proconfig, array[]::text[])
              ) as setting(value)
              where setting.value in ('search_path=', 'search_path=""')
            )
          )
      )
    then
      raise exception 'article_classification_smoke_rpc_security_mismatch:%',
        v_function
        using errcode = '42501';
    end if;
  end loop;
end;
$structure$;

do $seed$
begin
  insert into public.newsroom_articles (
    id,
    source_code,
    original_url,
    normalized_url,
    title,
    detected_at,
    processing_status,
    first_detected_at,
    last_detected_at
  ) values
  (
    '92000000-0000-4000-8000-000000000001'::uuid,
    '__classification_smoke__',
    'https://example.invalid/classification-smoke/a',
    'https://example.invalid/classification-smoke/a',
    'Fonte A descartavel do smoke de classificacao',
    pg_catalog.statement_timestamp(),
    'ready_for_review',
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  ),
  (
    '92000000-0000-4000-8000-000000000002'::uuid,
    '__classification_smoke__',
    'https://example.invalid/classification-smoke/b',
    'https://example.invalid/classification-smoke/b',
    'Fonte B descartavel do smoke de classificacao',
    pg_catalog.statement_timestamp(),
    'ready_for_review',
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  );

  insert into public.newsroom_article_snapshots (
    id,
    article_id,
    content_hash,
    body,
    source_metadata,
    extracted_at
  ) values (
    '92000000-0000-4000-8000-000000000011'::uuid,
    '92000000-0000-4000-8000-000000000001'::uuid,
    'classification-smoke-snapshot-a',
    '[{"type":"paragraph","text":"Snapshot descartavel."}]'::jsonb,
    '{"smoke":"classification"}'::jsonb,
    pg_catalog.statement_timestamp()
  );

  insert into public.newsroom_editorial_review_states (
    newsroom_article_id,
    decision,
    reviewed_snapshot_id,
    reviewed_at
  ) values (
    '92000000-0000-4000-8000-000000000001'::uuid,
    'working',
    '92000000-0000-4000-8000-000000000011'::uuid,
    pg_catalog.statement_timestamp()
  );

  if exists (
    select 1
    from public.newsroom_editorial_article_classifications
    where newsroom_article_id in (
      '92000000-0000-4000-8000-000000000001'::uuid,
      '92000000-0000-4000-8000-000000000002'::uuid
    )
  )
  then
    raise exception 'article_classification_smoke_source_not_unclassified'
      using errcode = '55000';
  end if;

  begin
    insert into public.newsroom_editorial_article_classifications (
      newsroom_article_id,
      classification_key,
      classification_source
    ) values (
      '92000000-0000-4000-8000-000000000001'::uuid,
      'primeira_liga',
      'automatic'
    );

    raise exception 'article_classification_smoke_invalid_key_accepted'
      using errcode = '55000';
  exception
    when check_violation then
      null;
  end;

  begin
    insert into public.newsroom_editorial_article_classifications (
      newsroom_article_id,
      classification_key,
      classification_source
    ) values (
      '92000000-0000-4000-8000-000000000099'::uuid,
      'benfica',
      'automatic'
    );

    raise exception 'article_classification_smoke_fk_not_enforced'
      using errcode = '55000';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$seed$;

set local role service_role;

do $operations$
declare
  v_change record;
  v_first_classified_at timestamptz;
  v_source_before jsonb;
  v_snapshot_before jsonb;
  v_review_before jsonb;
  v_editorial_articles_before bigint;
  v_bank_before bigint;
  v_themes_before bigint;
  v_theme_sources_before bigint;
  v_dossier_sources_before bigint;
  v_packages_before bigint;
begin
  select * into v_change
  from public.newsroom_read_article_classification_states_v1(
    array[
      '92000000-0000-4000-8000-000000000001'::uuid,
      '92000000-0000-4000-8000-000000000002'::uuid
    ]
  )
  where newsroom_article_id =
    '92000000-0000-4000-8000-000000000001'::uuid;

  if v_change.classified
    or v_change.classification_key is not null
    or v_change.classification_source is not null
  then
    raise exception 'article_classification_smoke_unclassified_read_failed'
      using errcode = '55000';
  end if;

  select pg_catalog.to_jsonb(source_row)
  into v_source_before
  from public.newsroom_articles as source_row
  where source_row.id = '92000000-0000-4000-8000-000000000001'::uuid;

  select pg_catalog.to_jsonb(snapshot_row)
  into v_snapshot_before
  from public.newsroom_article_snapshots as snapshot_row
  where snapshot_row.id = '92000000-0000-4000-8000-000000000011'::uuid;

  select pg_catalog.to_jsonb(review_row)
  into v_review_before
  from public.newsroom_editorial_review_states as review_row
  where review_row.newsroom_article_id =
    '92000000-0000-4000-8000-000000000001'::uuid;

  select pg_catalog.count(*) into v_editorial_articles_before
  from public.editorial_articles;
  select pg_catalog.count(*) into v_bank_before
  from public.matchday_editorial_bank_items;
  select pg_catalog.count(*) into v_themes_before
  from public.newsroom_editorial_themes;
  select pg_catalog.count(*) into v_theme_sources_before
  from public.newsroom_editorial_theme_sources;
  select pg_catalog.count(*) into v_dossier_sources_before
  from public.newsroom_editorial_dossier_sources;
  select pg_catalog.count(*) into v_packages_before
  from public.newsroom_editorial_source_packages;

  select * into v_change
  from public.newsroom_apply_automatic_article_classification_v1(
    '92000000-0000-4000-8000-000000000001'::uuid,
    'benfica'
  );

  if not v_change.classified
    or not v_change.applied
    or not v_change.changed
    or v_change.classification_key <> 'benfica'
    or v_change.classification_source <> 'automatic'
  then
    raise exception 'article_classification_smoke_automatic_create_failed'
      using errcode = '55000';
  end if;
  v_first_classified_at := v_change.classified_at;

  select * into v_change
  from public.newsroom_read_article_classification_states_v1(
    array['92000000-0000-4000-8000-000000000001'::uuid]
  );

  if not v_change.classified
    or v_change.classification_key <> 'benfica'
    or v_change.classification_source <> 'automatic'
  then
    raise exception 'article_classification_smoke_classified_read_failed'
      using errcode = '55000';
  end if;

  select * into v_change
  from public.newsroom_apply_automatic_article_classification_v1(
    '92000000-0000-4000-8000-000000000001'::uuid,
    'benfica'
  );

  if not v_change.applied
    or v_change.changed
    or v_change.classified_at is distinct from v_first_classified_at
  then
    raise exception 'article_classification_smoke_automatic_not_idempotent'
      using errcode = '55000';
  end if;

  select * into v_change
  from public.newsroom_apply_automatic_article_classification_v1(
    '92000000-0000-4000-8000-000000000001'::uuid,
    'sporting'
  );

  if not v_change.applied
    or not v_change.changed
    or v_change.classification_key <> 'sporting'
    or v_change.classification_source <> 'automatic'
  then
    raise exception 'article_classification_smoke_automatic_replace_failed'
      using errcode = '55000';
  end if;

  select * into v_change
  from public.newsroom_set_manual_article_classification_v1(
    '92000000-0000-4000-8000-000000000001'::uuid,
    'fc_porto'
  );

  if not v_change.applied
    or not v_change.changed
    or v_change.classification_key <> 'fc_porto'
    or v_change.classification_source <> 'manual'
  then
    raise exception 'article_classification_smoke_manual_replace_failed'
      using errcode = '55000';
  end if;
  v_first_classified_at := v_change.classified_at;

  select * into v_change
  from public.newsroom_apply_automatic_article_classification_v1(
    '92000000-0000-4000-8000-000000000001'::uuid,
    'outside_liga_other'
  );

  if v_change.applied
    or v_change.changed
    or v_change.classification_key <> 'fc_porto'
    or v_change.classification_source <> 'manual'
    or v_change.classified_at is distinct from v_first_classified_at
  then
    raise exception 'article_classification_smoke_manual_precedence_failed'
      using errcode = '55000';
  end if;

  select * into v_change
  from public.newsroom_set_manual_article_classification_v1(
    '92000000-0000-4000-8000-000000000001'::uuid,
    'other_liga_clubs'
  );

  if not v_change.applied
    or not v_change.changed
    or v_change.classification_key <> 'other_liga_clubs'
    or v_change.classification_source <> 'manual'
  then
    raise exception 'article_classification_smoke_manual_correction_failed'
      using errcode = '55000';
  end if;
  v_first_classified_at := v_change.classified_at;

  select * into v_change
  from public.newsroom_set_manual_article_classification_v1(
    '92000000-0000-4000-8000-000000000001'::uuid,
    'other_liga_clubs'
  );

  if not v_change.applied
    or v_change.changed
    or v_change.classified_at is distinct from v_first_classified_at
  then
    raise exception 'article_classification_smoke_manual_not_idempotent'
      using errcode = '55000';
  end if;

  begin
    insert into public.newsroom_editorial_article_classifications (
      newsroom_article_id,
      classification_key,
      classification_source
    ) values (
      '92000000-0000-4000-8000-000000000002'::uuid,
      'benfica',
      'automatic'
    );

    raise exception 'article_classification_smoke_service_direct_write_allowed'
      using errcode = '55000';
  exception
    when insufficient_privilege then
      null;
  end;

  select * into v_change
  from public.newsroom_clear_article_classification_v1(
    '92000000-0000-4000-8000-000000000001'::uuid
  );

  if v_change.classified
    or not v_change.applied
    or not v_change.changed
    or v_change.classification_key is not null
    or v_change.classification_source is not null
    or exists (
      select 1
      from public.newsroom_editorial_article_classifications
      where newsroom_article_id =
        '92000000-0000-4000-8000-000000000001'::uuid
    )
  then
    raise exception 'article_classification_smoke_clear_failed'
      using errcode = '55000';
  end if;

  select * into v_change
  from public.newsroom_clear_article_classification_v1(
    '92000000-0000-4000-8000-000000000001'::uuid
  );

  if v_change.classified or not v_change.applied or v_change.changed then
    raise exception 'article_classification_smoke_clear_not_idempotent'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.newsroom_editorial_article_classifications
    where newsroom_article_id =
      '92000000-0000-4000-8000-000000000001'::uuid
      and classification_key = 'outside_liga_other'
  )
  then
    raise exception 'article_classification_smoke_silent_fallback_present'
      using errcode = '55000';
  end if;

  if (
    select pg_catalog.to_jsonb(source_row)
    from public.newsroom_articles as source_row
    where source_row.id = '92000000-0000-4000-8000-000000000001'::uuid
  ) is distinct from v_source_before
    or (
      select pg_catalog.to_jsonb(snapshot_row)
      from public.newsroom_article_snapshots as snapshot_row
      where snapshot_row.id = '92000000-0000-4000-8000-000000000011'::uuid
    ) is distinct from v_snapshot_before
    or (
      select pg_catalog.to_jsonb(review_row)
      from public.newsroom_editorial_review_states as review_row
      where review_row.newsroom_article_id =
        '92000000-0000-4000-8000-000000000001'::uuid
    ) is distinct from v_review_before
    or (select pg_catalog.count(*) from public.editorial_articles)
      <> v_editorial_articles_before
    or (select pg_catalog.count(*) from public.matchday_editorial_bank_items)
      <> v_bank_before
    or (select pg_catalog.count(*) from public.newsroom_editorial_themes)
      <> v_themes_before
    or (select pg_catalog.count(*) from public.newsroom_editorial_theme_sources)
      <> v_theme_sources_before
    or (select pg_catalog.count(*) from public.newsroom_editorial_dossier_sources)
      <> v_dossier_sources_before
    or (select pg_catalog.count(*) from public.newsroom_editorial_source_packages)
      <> v_packages_before
  then
    raise exception 'article_classification_smoke_unrelated_authority_changed'
      using errcode = '55000';
  end if;
end;
$operations$;

reset role;

do $constraints_and_delete$
begin
  insert into public.newsroom_editorial_article_classifications (
    newsroom_article_id,
    classification_key,
    classification_source
  ) values (
    '92000000-0000-4000-8000-000000000002'::uuid,
    'outside_liga_other',
    'automatic'
  );

  begin
    insert into public.newsroom_editorial_article_classifications (
      newsroom_article_id,
      classification_key,
      classification_source
    ) values (
      '92000000-0000-4000-8000-000000000002'::uuid,
      'benfica',
      'manual'
    );

    raise exception 'article_classification_smoke_uniqueness_not_enforced'
      using errcode = '55000';
  exception
    when unique_violation then
      null;
  end;

  delete from public.newsroom_articles
  where id = '92000000-0000-4000-8000-000000000002'::uuid;

  if exists (
    select 1
    from public.newsroom_editorial_article_classifications
    where newsroom_article_id =
      '92000000-0000-4000-8000-000000000002'::uuid
  )
  then
    raise exception 'article_classification_smoke_delete_cascade_failed'
      using errcode = '55000';
  end if;
end;
$constraints_and_delete$;

select pg_catalog.jsonb_build_object(
  'phase', 'JORNADA-REDACAO-CLASSIFICACAO-PREPUBLICACAO-1',
  'smoke_ok', true,
  'persistent_writes', false,
  'transaction_end', 'ROLLBACK'
) as smoke_result;

rollback;
