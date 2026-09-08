-- JORNADA-REDACAO-TEMA-FUNDACAO-1
-- Smoke PostgreSQL transacional. Exige a migration do Lote 1 já aplicada
-- num ambiente local/descartável e não deixa dados persistentes.

begin;

do $structure$
declare
  v_table text;
  v_role text;
  v_function regprocedure;
begin
  if pg_catalog.to_regclass('public.newsroom_editorial_themes') is null
    or pg_catalog.to_regclass('public.newsroom_editorial_theme_sources') is null
    or pg_catalog.to_regclass('public.newsroom_editorial_theme_articles') is null
  then
    raise exception 'theme_smoke_target_table_missing'
      using errcode = '42P01';
  end if;

  if exists (
    select 1
    from (
      values
        ('newsroom_editorial_themes', 'newsroom_editorial_themes_pkey', 'p'),
        ('newsroom_editorial_themes', 'newsroom_editorial_themes_title_not_blank', 'c'),
        ('newsroom_editorial_themes', 'newsroom_editorial_themes_classification_check', 'c'),
        ('newsroom_editorial_themes', 'newsroom_editorial_themes_status_check', 'c'),
        ('newsroom_editorial_themes', 'newsroom_editorial_themes_context_not_blank', 'c'),
        ('newsroom_editorial_theme_sources', 'newsroom_editorial_theme_sources_pkey', 'p'),
        ('newsroom_editorial_theme_articles', 'newsroom_editorial_theme_articles_pkey', 'p')
    ) as required(table_name, constraint_name, constraint_type)
    where not exists (
      select 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = pg_catalog.to_regclass(
        'public.' || required.table_name
      )
        and constraint_row.conname = required.constraint_name
        and constraint_row.contype = required.constraint_type::"char"
    )
  ) then
    raise exception 'theme_smoke_required_constraint_missing'
      using errcode = '55000';
  end if;

  -- confdeltype: n = ON DELETE SET NULL; c = ON DELETE CASCADE.
  if exists (
    select 1
    from (
      values
        (
          'newsroom_editorial_themes',
          'newsroom_editorial_themes_competition_fkey',
          'competitions',
          'n'
        ),
        (
          'newsroom_editorial_themes',
          'newsroom_editorial_themes_season_fkey',
          'seasons',
          'n'
        ),
        (
          'newsroom_editorial_themes',
          'newsroom_editorial_themes_matchday_fkey',
          'matchdays',
          'n'
        ),
        (
          'newsroom_editorial_themes',
          'newsroom_editorial_themes_match_fkey',
          'matches',
          'n'
        ),
        (
          'newsroom_editorial_theme_sources',
          'newsroom_editorial_theme_sources_theme_fkey',
          'newsroom_editorial_themes',
          'c'
        ),
        (
          'newsroom_editorial_theme_sources',
          'newsroom_editorial_theme_sources_article_fkey',
          'newsroom_articles',
          'c'
        ),
        (
          'newsroom_editorial_theme_articles',
          'newsroom_editorial_theme_articles_theme_fkey',
          'newsroom_editorial_themes',
          'c'
        ),
        (
          'newsroom_editorial_theme_articles',
          'newsroom_editorial_theme_articles_article_fkey',
          'editorial_articles',
          'c'
        )
    ) as required(table_name, constraint_name, referenced_table, delete_action)
    where not exists (
      select 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = pg_catalog.to_regclass(
        'public.' || required.table_name
      )
        and constraint_row.conname = required.constraint_name
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = pg_catalog.to_regclass(
          'public.' || required.referenced_table
        )
        and constraint_row.confdeltype = required.delete_action::"char"
    )
  ) then
    raise exception 'theme_smoke_foreign_key_contract_mismatch'
      using errcode = '55000';
  end if;

  foreach v_table in array array[
    'newsroom_editorial_themes',
    'newsroom_editorial_theme_sources',
    'newsroom_editorial_theme_articles'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class table_row
      where table_row.oid = pg_catalog.to_regclass('public.' || v_table)
        and table_row.relrowsecurity
        and table_row.relforcerowsecurity
    ) then
      raise exception 'theme_smoke_rls_not_enabled_and_forced: %', v_table
        using errcode = '55000';
    end if;

    if exists (
      select 1
      from pg_catalog.pg_class table_row
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          table_row.relacl,
          pg_catalog.acldefault('r', table_row.relowner)
        )
      ) as privilege_row
      where table_row.oid = pg_catalog.to_regclass('public.' || v_table)
        and privilege_row.grantee = 0
    ) then
      raise exception 'theme_smoke_public_table_privilege_present: %', v_table
        using errcode = '42501';
    end if;

    foreach v_role in array array['anon', 'authenticated'] loop
      if pg_catalog.has_table_privilege(v_role, 'public.' || v_table, 'SELECT')
        or pg_catalog.has_table_privilege(v_role, 'public.' || v_table, 'INSERT')
        or pg_catalog.has_table_privilege(v_role, 'public.' || v_table, 'UPDATE')
        or pg_catalog.has_table_privilege(v_role, 'public.' || v_table, 'DELETE')
        or pg_catalog.has_table_privilege(v_role, 'public.' || v_table, 'TRUNCATE')
        or pg_catalog.has_table_privilege(v_role, 'public.' || v_table, 'REFERENCES')
        or pg_catalog.has_table_privilege(v_role, 'public.' || v_table, 'TRIGGER')
      then
        raise exception 'theme_smoke_client_table_privilege_present: %.%',
          v_role,
          v_table
          using errcode = '42501';
      end if;
    end loop;
  end loop;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.newsroom_editorial_themes',
    'SELECT,INSERT,UPDATE'
  )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.newsroom_editorial_themes',
      'DELETE'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.newsroom_editorial_themes',
      'TRUNCATE'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.newsroom_editorial_themes',
      'REFERENCES'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.newsroom_editorial_themes',
      'TRIGGER'
    )
  then
    raise exception 'theme_smoke_service_theme_privileges_mismatch'
      using errcode = '42501';
  end if;

  foreach v_table in array array[
    'newsroom_editorial_theme_sources',
    'newsroom_editorial_theme_articles'
  ] loop
    if not pg_catalog.has_table_privilege(
      'service_role',
      'public.' || v_table,
      'SELECT,INSERT,DELETE'
    )
      or pg_catalog.has_table_privilege(
        'service_role',
        'public.' || v_table,
        'UPDATE'
      )
      or pg_catalog.has_table_privilege(
        'service_role',
        'public.' || v_table,
        'TRUNCATE'
      )
      or pg_catalog.has_table_privilege(
        'service_role',
        'public.' || v_table,
        'REFERENCES'
      )
      or pg_catalog.has_table_privilege(
        'service_role',
        'public.' || v_table,
        'TRIGGER'
      )
    then
      raise exception 'theme_smoke_service_membership_privileges_mismatch: %',
        v_table
        using errcode = '42501';
    end if;
  end loop;

  foreach v_function in array array[
    pg_catalog.to_regprocedure(
      'public.newsroom_create_editorial_theme_v1(text,text,text,uuid,uuid,uuid,uuid)'
    ),
    pg_catalog.to_regprocedure(
      'public.newsroom_update_editorial_theme_v1(uuid,text,text,text,uuid,uuid,uuid,uuid)'
    ),
    pg_catalog.to_regprocedure(
      'public.newsroom_set_editorial_theme_status_v1(uuid,text)'
    ),
    pg_catalog.to_regprocedure(
      'public.newsroom_set_editorial_theme_source_membership_v1(uuid,uuid,boolean)'
    ),
    pg_catalog.to_regprocedure(
      'public.newsroom_set_editorial_theme_article_membership_v1(uuid,uuid,boolean)'
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
        from pg_catalog.pg_proc function_row
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
        from pg_catalog.pg_proc function_row
        where function_row.oid = v_function
          and (
            function_row.prosecdef
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
      raise exception 'theme_smoke_rpc_security_contract_mismatch: %',
        v_function
        using errcode = '42501';
    end if;
  end loop;
end;
$structure$;

do $seed$
declare
  v_matchday_id uuid;
begin
  select matchday.id
  into v_matchday_id
  from public.matchdays as matchday
  order by matchday.id
  limit 1;

  if v_matchday_id is null then
    raise exception 'theme_smoke_requires_existing_matchday'
      using errcode = '55000';
  end if;

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
  ) values (
    '91000000-0000-4000-8000-000000000001'::uuid,
    '__theme_foundation_smoke__',
    'https://example.invalid/theme-foundation-smoke',
    'https://example.invalid/theme-foundation-smoke',
    'Fonte descartável do smoke de Tema',
    pg_catalog.statement_timestamp(),
    'ready_for_review',
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  );

  insert into public.editorial_articles (
    id,
    title,
    slug,
    status,
    scope,
    label,
    subtitle,
    body,
    image_url,
    published_at,
    matchday_id,
    created_at,
    updated_at
  ) values (
    '91000000-0000-4000-8000-000000000002'::uuid,
    'Artigo descartável do smoke de Tema',
    'smoke-tema-fundacao-910000000002',
    'published',
    'matchday',
    'Teste',
    'Subtítulo descartável',
    'Corpo descartável para validar membership de Tema.',
    '/images/smoke-tema-fundacao.jpg',
    pg_catalog.statement_timestamp(),
    v_matchday_id,
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  );
end;
$seed$;

set local role service_role;

do $operations$
declare
  v_theme public.newsroom_editorial_themes%rowtype;
  v_change record;
  v_source_before jsonb;
  v_source_after jsonb;
  v_article_before jsonb;
  v_article_after jsonb;
begin
  select pg_catalog.to_jsonb(source_row)
  into v_source_before
  from public.newsroom_articles as source_row
  where source_row.id = '91000000-0000-4000-8000-000000000001'::uuid;

  select pg_catalog.to_jsonb(article_row)
  into v_article_before
  from public.editorial_articles as article_row
  where article_row.id = '91000000-0000-4000-8000-000000000002'::uuid;

  select *
  into v_theme
  from public.newsroom_create_editorial_theme_v1(
    'Tema descartável do smoke',
    'benfica',
    '__JORNADA_THEME_FOUNDATION_SMOKE__',
    null,
    null,
    null,
    null
  );

  if v_theme.id is null
    or v_theme.status <> 'open'
    or exists (
      select 1
      from public.newsroom_editorial_theme_sources as relation_row
      where relation_row.theme_id = v_theme.id
    )
    or exists (
      select 1
      from public.newsroom_editorial_theme_articles as relation_row
      where relation_row.theme_id = v_theme.id
    )
  then
    raise exception 'theme_smoke_empty_theme_contract_failed'
      using errcode = '55000';
  end if;

  begin
    perform *
    from public.newsroom_create_editorial_theme_v1(
      'Tema com classificação inválida',
      'primeira_liga',
      null,
      null,
      null,
      null,
      null
    );

    raise exception 'theme_smoke_invalid_classification_was_not_rejected'
      using errcode = '55000';
  exception
    when check_violation then
      null;
  end;

  select *
  into v_theme
  from public.newsroom_update_editorial_theme_v1(
    v_theme.id,
    'Tema descartável atualizado',
    'benfica',
    '__JORNADA_THEME_FOUNDATION_SMOKE__',
    null,
    null,
    null,
    null
  );

  if v_theme.title <> 'Tema descartável atualizado'
    or v_theme.status <> 'open'
  then
    raise exception 'theme_smoke_update_rpc_failed'
      using errcode = '55000';
  end if;

  select *
  into v_change
  from public.newsroom_set_editorial_theme_source_membership_v1(
    v_theme.id,
    '91000000-0000-4000-8000-000000000001'::uuid,
    true
  );

  if not v_change.associated or not v_change.changed then
    raise exception 'theme_smoke_source_attach_failed'
      using errcode = '55000';
  end if;

  select *
  into v_change
  from public.newsroom_set_editorial_theme_source_membership_v1(
    v_theme.id,
    '91000000-0000-4000-8000-000000000001'::uuid,
    true
  );

  if not v_change.associated or v_change.changed then
    raise exception 'theme_smoke_source_attach_not_idempotent'
      using errcode = '55000';
  end if;

  begin
    insert into public.newsroom_editorial_theme_sources (
      theme_id,
      newsroom_article_id
    ) values (
      v_theme.id,
      '91000000-0000-4000-8000-000000000001'::uuid
    );

    raise exception 'theme_smoke_duplicate_source_was_not_rejected'
      using errcode = '55000';
  exception
    when unique_violation then
      null;
  end;

  select *
  into v_change
  from public.newsroom_set_editorial_theme_source_membership_v1(
    v_theme.id,
    '91000000-0000-4000-8000-000000000001'::uuid,
    false
  );

  if v_change.associated or not v_change.changed then
    raise exception 'theme_smoke_source_detach_failed'
      using errcode = '55000';
  end if;

  select *
  into v_change
  from public.newsroom_set_editorial_theme_source_membership_v1(
    v_theme.id,
    '91000000-0000-4000-8000-000000000001'::uuid,
    false
  );

  if v_change.associated or v_change.changed then
    raise exception 'theme_smoke_source_detach_not_idempotent'
      using errcode = '55000';
  end if;

  perform *
  from public.newsroom_set_editorial_theme_source_membership_v1(
    v_theme.id,
    '91000000-0000-4000-8000-000000000001'::uuid,
    true
  );

  select *
  into v_change
  from public.newsroom_set_editorial_theme_article_membership_v1(
    v_theme.id,
    '91000000-0000-4000-8000-000000000002'::uuid,
    true
  );

  if not v_change.associated or not v_change.changed then
    raise exception 'theme_smoke_article_attach_failed'
      using errcode = '55000';
  end if;

  select *
  into v_change
  from public.newsroom_set_editorial_theme_article_membership_v1(
    v_theme.id,
    '91000000-0000-4000-8000-000000000002'::uuid,
    true
  );

  if not v_change.associated or v_change.changed then
    raise exception 'theme_smoke_article_attach_not_idempotent'
      using errcode = '55000';
  end if;

  begin
    insert into public.newsroom_editorial_theme_articles (
      theme_id,
      editorial_article_id
    ) values (
      v_theme.id,
      '91000000-0000-4000-8000-000000000002'::uuid
    );

    raise exception 'theme_smoke_duplicate_article_was_not_rejected'
      using errcode = '55000';
  exception
    when unique_violation then
      null;
  end;

  select *
  into v_change
  from public.newsroom_set_editorial_theme_article_membership_v1(
    v_theme.id,
    '91000000-0000-4000-8000-000000000002'::uuid,
    false
  );

  if v_change.associated or not v_change.changed then
    raise exception 'theme_smoke_article_detach_failed'
      using errcode = '55000';
  end if;

  select *
  into v_change
  from public.newsroom_set_editorial_theme_article_membership_v1(
    v_theme.id,
    '91000000-0000-4000-8000-000000000002'::uuid,
    false
  );

  if v_change.associated or v_change.changed then
    raise exception 'theme_smoke_article_detach_not_idempotent'
      using errcode = '55000';
  end if;

  perform *
  from public.newsroom_set_editorial_theme_article_membership_v1(
    v_theme.id,
    '91000000-0000-4000-8000-000000000002'::uuid,
    true
  );

  select *
  into v_theme
  from public.newsroom_set_editorial_theme_status_v1(
    v_theme.id,
    'archived'
  );

  if v_theme.status <> 'archived'
    or not exists (
      select 1
      from public.newsroom_editorial_theme_sources as relation_row
      where relation_row.theme_id = v_theme.id
        and relation_row.newsroom_article_id =
          '91000000-0000-4000-8000-000000000001'::uuid
    )
    or not exists (
      select 1
      from public.newsroom_editorial_theme_articles as relation_row
      where relation_row.theme_id = v_theme.id
        and relation_row.editorial_article_id =
          '91000000-0000-4000-8000-000000000002'::uuid
    )
  then
    raise exception 'theme_smoke_archive_did_not_preserve_memberships'
      using errcode = '55000';
  end if;

  select pg_catalog.to_jsonb(source_row)
  into v_source_after
  from public.newsroom_articles as source_row
  where source_row.id = '91000000-0000-4000-8000-000000000001'::uuid;

  select pg_catalog.to_jsonb(article_row)
  into v_article_after
  from public.editorial_articles as article_row
  where article_row.id = '91000000-0000-4000-8000-000000000002'::uuid;

  if v_source_after is distinct from v_source_before then
    raise exception 'theme_smoke_membership_mutated_newsroom_article'
      using errcode = '55000';
  end if;

  if v_article_after is distinct from v_article_before then
    raise exception 'theme_smoke_membership_mutated_editorial_article'
      using errcode = '55000';
  end if;

  perform pg_catalog.set_config(
    'jornada.theme_smoke_theme_id',
    v_theme.id::text,
    true
  );
end;
$operations$;

reset role;

do $delete_actions$
declare
  v_theme_id uuid := pg_catalog.current_setting(
    'jornada.theme_smoke_theme_id'
  )::uuid;
  v_second_theme_id uuid := '91000000-0000-4000-8000-000000000003'::uuid;
begin
  insert into public.newsroom_editorial_themes (
    id,
    title,
    classification_key
  ) values (
    v_second_theme_id,
    'Segundo Tema descartável',
    'sporting'
  );

  insert into public.newsroom_editorial_theme_sources (
    theme_id,
    newsroom_article_id
  ) values (
    v_second_theme_id,
    '91000000-0000-4000-8000-000000000001'::uuid
  );

  insert into public.newsroom_editorial_theme_articles (
    theme_id,
    editorial_article_id
  ) values (
    v_second_theme_id,
    '91000000-0000-4000-8000-000000000002'::uuid
  );

  delete from public.newsroom_editorial_themes
  where id = v_second_theme_id;

  if exists (
    select 1
    from public.newsroom_editorial_theme_sources as relation_row
    where relation_row.theme_id = v_second_theme_id
  )
    or exists (
      select 1
      from public.newsroom_editorial_theme_articles as relation_row
      where relation_row.theme_id = v_second_theme_id
    )
    or not exists (
      select 1
      from public.newsroom_editorial_theme_sources as relation_row
      where relation_row.theme_id = v_theme_id
    )
    or not exists (
      select 1
      from public.newsroom_editorial_theme_articles as relation_row
      where relation_row.theme_id = v_theme_id
    )
  then
    raise exception 'theme_smoke_theme_delete_cascade_failed'
      using errcode = '55000';
  end if;

  delete from public.newsroom_articles
  where id = '91000000-0000-4000-8000-000000000001'::uuid;

  if exists (
    select 1
    from public.newsroom_editorial_theme_sources as relation_row
    where relation_row.theme_id = v_theme_id
  )
    or not exists (
      select 1
      from public.newsroom_editorial_theme_articles as relation_row
      where relation_row.theme_id = v_theme_id
    )
  then
    raise exception 'theme_smoke_source_delete_cascade_failed'
      using errcode = '55000';
  end if;

  update public.matchday_editorial_bank_items
  set status = 'archived'
  where source_type = 'editorial_article'
    and source_id = '91000000-0000-4000-8000-000000000002';

  delete from public.editorial_articles
  where id = '91000000-0000-4000-8000-000000000002'::uuid;

  if exists (
    select 1
    from public.newsroom_editorial_theme_articles as relation_row
    where relation_row.theme_id = v_theme_id
  )
    or not exists (
      select 1
      from public.newsroom_editorial_themes as theme_row
      where theme_row.id = v_theme_id
        and theme_row.status = 'archived'
    )
  then
    raise exception 'theme_smoke_article_delete_cascade_failed'
      using errcode = '55000';
  end if;
end;
$delete_actions$;

select pg_catalog.jsonb_build_object(
  'phase', 'JORNADA-REDACAO-TEMA-FUNDACAO-1',
  'smoke_ok', true,
  'persistent_writes', false,
  'transaction_end', 'ROLLBACK'
) as smoke_result;

rollback;
