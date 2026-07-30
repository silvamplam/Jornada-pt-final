-- Step 40 - postflight read-only da entrada manual de notícias.
-- Valida schema, função, segurança e invariantes sem escrever.

with manual_function as (
  select
    proc.oid,
    pg_get_function_identity_arguments(proc.oid) as identity_arguments,
    pg_get_function_result(proc.oid) as result_type,
    pg_get_userbyid(proc.proowner) as owner_name,
    proc.prosecdef as security_definer,
    coalesce(array_to_string(proc.proconfig, ','), '') as function_config,
    lower(regexp_replace(pg_get_functiondef(proc.oid), '\s+', ' ', 'g')) as definition
  from pg_proc proc
  join pg_namespace namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'newsroom_create_manual_entry'
),
expected_function as (
  select *
  from manual_function
  where oid = to_regprocedure(
    'public.newsroom_create_manual_entry(uuid,text,text,jsonb,text,text,text)'
  )
),
table_state as (
  select
    class.oid,
    pg_get_userbyid(class.relowner) as owner_name,
    class.relrowsecurity as rls_enabled,
    class.relforcerowsecurity as rls_forced
  from pg_class class
  join pg_namespace namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'newsroom_manual_entry_requests'
    and class.relkind = 'r'
),
grants_state as (
  select
    not has_table_privilege(
      'anon',
      'public.newsroom_manual_entry_requests',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    and not has_table_privilege(
      'authenticated',
      'public.newsroom_manual_entry_requests',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    and not has_table_privilege(
      'service_role',
      'public.newsroom_manual_entry_requests',
      'SELECT, INSERT, UPDATE, DELETE'
    ) as direct_table_access_absent
),
url_columns as (
  select
    count(*) filter (
      where column_name = 'original_url'
        and data_type = 'text'
        and is_nullable = 'YES'
    ) = 1 as original_url_nullable,
    count(*) filter (
      where column_name = 'normalized_url'
        and data_type = 'text'
        and is_nullable = 'YES'
    ) = 1 as normalized_url_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'newsroom_articles'
),
constraint_state as (
  select
    count(*) filter (
      where constraint_row.conname = 'newsroom_articles_manual_origin_urls_check'
        and constraint_row.contype = 'c'
    ) = 1 as manual_url_check_present,
    count(*) filter (
      where constraint_row.conname = 'newsroom_manual_entry_requests_pkey'
        and constraint_row.contype = 'p'
        and pg_get_constraintdef(constraint_row.oid) =
          'PRIMARY KEY (submission_id)'
    ) = 1 as request_primary_key_present,
    count(*) filter (
      where constraint_row.conname = 'newsroom_manual_entry_requests_article_key'
        and constraint_row.contype = 'u'
    ) = 1 as request_article_unique_present,
    count(*) filter (
      where constraint_row.conname = 'newsroom_manual_entry_requests_snapshot_key'
        and constraint_row.contype = 'u'
    ) = 1 as request_snapshot_unique_present,
    count(*) filter (
      where constraint_row.conname = 'newsroom_manual_entry_requests_article_fkey'
        and constraint_row.contype = 'f'
    ) = 1 as request_article_fk_present,
    count(*) filter (
      where constraint_row.conname = 'newsroom_manual_entry_requests_snapshot_fkey'
        and constraint_row.contype = 'f'
    ) = 1 as request_snapshot_fk_present
  from pg_constraint constraint_row
  where constraint_row.conrelid in (
    to_regclass('public.newsroom_articles'),
    to_regclass('public.newsroom_manual_entry_requests')
  )
),
data_state as (
  select
    count(*) filter (
      where (request_row.newsroom_article_id is null)
        <> (request_row.newsroom_snapshot_id is null)
    ) as partial_request_count,
    count(*) filter (
      where request_row.newsroom_article_id is not null
        and not exists (
          select 1
          from public.newsroom_articles article
          join public.newsroom_article_snapshots snapshot
            on snapshot.id = request_row.newsroom_snapshot_id
           and snapshot.article_id = article.id
          where article.id = request_row.newsroom_article_id
            and article.source_code = 'manual_entry'
            and article.original_url is null
            and article.normalized_url is null
            and snapshot.source_metadata ->> 'origin' = 'manual'
            and snapshot.source_metadata ->> 'manualSubmissionId' =
              request_row.submission_id::text
            and snapshot.source_metadata ->> 'publishedAtPrecision' = 'date'
        )
    ) as inconsistent_relation_count
  from public.newsroom_manual_entry_requests request_row
),
manual_article_state as (
  select
    count(*) filter (
      where article.original_url is not null
        or article.normalized_url is not null
        or article.processing_status not in (
          'detected',
          'normalized',
          'ready_for_review'
        )
    ) as invalid_manual_article_count
  from public.newsroom_articles article
  where article.source_code = 'manual_entry'
)
select jsonb_build_object(
  'step', 40,
  'request_table_present', (select count(*) from table_state) = 1,
  'request_table_owner', (select owner_name from table_state),
  'request_table_rls', jsonb_build_object(
    'enabled', coalesce((select rls_enabled from table_state), false),
    'forced', coalesce((select rls_forced from table_state), false)
  ),
  'function', jsonb_build_object(
    'overload_count', (select count(*) from manual_function),
    'expected_signature_count', (select count(*) from expected_function),
    'identity_arguments', (select identity_arguments from expected_function),
    'result_type', (select result_type from expected_function),
    'result_type_expected', coalesce(
      (
        select result_type =
          'TABLE(submission_id uuid, request_fingerprint text, newsroom_article_id uuid, newsroom_snapshot_id uuid, entry_action text)'
        from expected_function
      ),
      false
    ),
    'owner', (select owner_name from expected_function),
    'security_definer', coalesce(
      (select security_definer from expected_function),
      false
    ),
    'search_path_controlled', coalesce(
      (select function_config like '%search_path=%' from expected_function),
      false
    ),
    'service_role_execute', coalesce(
      (
        select has_function_privilege(
          'service_role',
          expected_function.oid,
          'EXECUTE'
        )
        from expected_function
      ),
      false
    ),
    'browser_execute_absent',
      not coalesce(
        (
          select has_function_privilege('anon', expected_function.oid, 'EXECUTE')
          from expected_function
        ),
        false
      )
      and not coalesce(
        (
          select has_function_privilege(
            'authenticated',
            expected_function.oid,
            'EXECUTE'
          )
          from expected_function
        ),
        false
      ),
    'persistent_idempotency_clause', coalesce(
      (
        select position(
          'on conflict on constraint newsroom_manual_entry_requests_pkey do nothing'
          in expected_function.definition
        ) > 0
        from expected_function
      ),
      false
    )
  ),
  'grants', to_jsonb(grants_state),
  'url_columns', to_jsonb(url_columns),
  'constraints', to_jsonb(constraint_state),
  'data', to_jsonb(data_state),
  'manual_articles', to_jsonb(manual_article_state),
  'writes_performed', false,
  'ready_for_smoke',
    (select count(*) from table_state) = 1
    and coalesce((select rls_enabled and rls_forced from table_state), false)
    and (select count(*) from manual_function) = 1
    and (select count(*) from expected_function) = 1
    and coalesce((select security_definer from expected_function), false)
    and coalesce(
      (
        select result_type =
          'TABLE(submission_id uuid, request_fingerprint text, newsroom_article_id uuid, newsroom_snapshot_id uuid, entry_action text)'
        from expected_function
      ),
      false
    )
    and coalesce(
      (select function_config like '%search_path=%' from expected_function),
      false
    )
    and (select owner_name from expected_function) =
      (select owner_name from table_state)
    and coalesce(
      (
        select has_function_privilege(
          'service_role',
          expected_function.oid,
          'EXECUTE'
        )
        from expected_function
      ),
      false
    )
    and not coalesce(
      (
        select has_function_privilege('anon', expected_function.oid, 'EXECUTE')
        from expected_function
      ),
      false
    )
    and grants_state.direct_table_access_absent
    and not coalesce(
      (
        select has_function_privilege(
          'authenticated',
          expected_function.oid,
          'EXECUTE'
        )
        from expected_function
      ),
      false
    )
    and url_columns.original_url_nullable
    and url_columns.normalized_url_nullable
    and constraint_state.manual_url_check_present
    and constraint_state.request_primary_key_present
    and constraint_state.request_article_unique_present
    and constraint_state.request_snapshot_unique_present
    and constraint_state.request_article_fk_present
    and constraint_state.request_snapshot_fk_present
    and data_state.partial_request_count = 0
    and data_state.inconsistent_relation_count = 0
    and manual_article_state.invalid_manual_article_count = 0,
  'next_step',
    'run 41-redacao-automatica-recolha-manual-smoke-rollback.sql manually'
) as postflight_summary
from url_columns
cross join grants_state
cross join constraint_state
cross join data_state
cross join manual_article_state;
