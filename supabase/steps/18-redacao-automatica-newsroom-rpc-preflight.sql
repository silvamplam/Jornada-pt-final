-- Redação Automática — persistência transacional de artigo e snapshot.
-- SQL 1/4 — PREFLIGHT READ-ONLY. Não altera schema nem dados.

select
  current_database() as database_name,
  current_user as executed_by,
  now() as checked_at,
  to_regprocedure('gen_random_uuid()') is not null as gen_random_uuid_available,
  exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'service_role'
  ) as service_role_exists,
  exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'anon'
  ) as anon_exists,
  exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'authenticated'
  ) as authenticated_exists;

select
  required.relation_name,
  to_regclass('public.' || required.relation_name) as existing_relation,
  c.relkind,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  owner_role.rolname as owner_name
from (
  values
    ('newsroom_articles'),
    ('newsroom_article_snapshots')
) as required(relation_name)
left join pg_catalog.pg_class c
  on c.oid = to_regclass('public.' || required.relation_name)
left join pg_catalog.pg_roles owner_role
  on owner_role.oid = c.relowner
order by required.relation_name;

select
  expected.table_name,
  expected.column_name,
  expected.expected_type,
  expected.contract_role,
  columns.data_type as actual_type,
  columns.udt_name,
  columns.is_nullable,
  columns.column_default,
  columns.ordinal_position,
  columns.data_type = expected.expected_type as type_matches
from (
  values
    ('newsroom_articles', 'id', 'uuid', 'generated identity'),
    ('newsroom_articles', 'source_code', 'text', 'immutable article identity'),
    ('newsroom_articles', 'original_url', 'text', 'immutable initial value'),
    ('newsroom_articles', 'normalized_url', 'text', 'immutable article identity'),
    ('newsroom_articles', 'external_id', 'text', 'write-once external identity'),
    ('newsroom_articles', 'title', 'text', 'mutable metadata'),
    ('newsroom_articles', 'subtitle', 'text', 'mutable metadata'),
    ('newsroom_articles', 'summary', 'text', 'mutable metadata'),
    ('newsroom_articles', 'author', 'text', 'mutable metadata'),
    ('newsroom_articles', 'published_at', 'timestamp with time zone', 'mutable metadata'),
    ('newsroom_articles', 'modified_at', 'timestamp with time zone', 'mutable metadata'),
    ('newsroom_articles', 'detected_at', 'timestamp with time zone', 'mutable metadata'),
    ('newsroom_articles', 'image_url', 'text', 'mutable metadata'),
    ('newsroom_articles', 'processing_status', 'text', 'mutable metadata'),
    ('newsroom_articles', 'first_detected_at', 'timestamp with time zone', 'immutable initial value'),
    ('newsroom_articles', 'last_detected_at', 'timestamp with time zone', 'mutable metadata'),
    ('newsroom_articles', 'created_at', 'timestamp with time zone', 'generated immutable value'),
    ('newsroom_articles', 'updated_at', 'timestamp with time zone', 'trigger-maintained value'),
    ('newsroom_article_snapshots', 'id', 'uuid', 'generated snapshot identity'),
    ('newsroom_article_snapshots', 'article_id', 'uuid', 'immutable snapshot identity'),
    ('newsroom_article_snapshots', 'content_hash', 'text', 'immutable snapshot identity'),
    ('newsroom_article_snapshots', 'body', 'jsonb', 'immutable payload'),
    ('newsroom_article_snapshots', 'source_metadata', 'jsonb', 'immutable payload'),
    ('newsroom_article_snapshots', 'extracted_at', 'timestamp with time zone', 'immutable payload'),
    ('newsroom_article_snapshots', 'created_at', 'timestamp with time zone', 'generated immutable value')
) as expected(table_name, column_name, expected_type, contract_role)
left join information_schema.columns columns
  on columns.table_schema = 'public'
 and columns.table_name = expected.table_name
 and columns.column_name = expected.column_name
order by expected.table_name, columns.ordinal_position, expected.column_name;

select
  n.nspname as schema_name,
  c.relname as table_name,
  constraint_row.conname as constraint_name,
  constraint_row.contype as constraint_type,
  pg_catalog.pg_get_constraintdef(constraint_row.oid, true) as definition,
  constraint_row.condeferrable,
  constraint_row.condeferred,
  referenced_namespace.nspname as referenced_schema,
  referenced_table.relname as referenced_table
from pg_catalog.pg_constraint constraint_row
join pg_catalog.pg_class c
  on c.oid = constraint_row.conrelid
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
left join pg_catalog.pg_class referenced_table
  on referenced_table.oid = constraint_row.confrelid
left join pg_catalog.pg_namespace referenced_namespace
  on referenced_namespace.oid = referenced_table.relnamespace
where n.nspname = 'public'
  and c.relname in ('newsroom_articles', 'newsroom_article_snapshots')
order by c.relname, constraint_row.conname;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in ('newsroom_articles', 'newsroom_article_snapshots')
order by tablename, indexname;

select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_orientation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('newsroom_articles', 'newsroom_article_snapshots')
order by table_name, trigger_name, event_manipulation;

select
  p.oid::regprocedure::text as function_signature,
  language_name.lanname as language_name,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n
  on n.oid = p.pronamespace
join pg_catalog.pg_language language_name
  on language_name.oid = p.prolang
where n.nspname = 'public'
  and p.proname in (
    'newsroom_set_article_updated_at',
    'newsroom_reject_snapshot_mutation'
  )
order by p.proname;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in ('newsroom_articles', 'newsroom_article_snapshots')
order by tablename, policyname;

select
  grantee,
  table_name,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('newsroom_articles', 'newsroom_article_snapshots')
order by table_name, grantee, privilege_type;

select
  p.oid,
  p.oid::regprocedure::text as function_signature,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  language_name.lanname as language_name,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  owner_role.rolname as owner_name,
  pg_catalog.obj_description(p.oid, 'pg_proc') as function_comment
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n
  on n.oid = p.pronamespace
join pg_catalog.pg_language language_name
  on language_name.oid = p.prolang
join pg_catalog.pg_roles owner_role
  on owner_role.oid = p.proowner
where n.nspname = 'public'
  and p.proname = 'newsroom_persist_article_snapshot'
order by p.oid;

select
  count(*) as overload_count,
  count(*) filter (
    where p.oid = to_regprocedure(
      'public.newsroom_persist_article_snapshot(text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,text,jsonb,jsonb,timestamp with time zone)'
    )
  ) as exact_signature_count,
  case
    when count(*) = 0 then 'absent_ready_to_create'
    when count(*) = 1
     and count(*) filter (
       where p.oid = to_regprocedure(
         'public.newsroom_persist_article_snapshot(text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,text,jsonb,jsonb,timestamp with time zone)'
       )
     ) = 1 then 'exact_signature_already_exists'
    else 'conflicting_signature_or_overload'
  end as signature_status
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'newsroom_persist_article_snapshot';

select
  dependency.object_name,
  dependency.object_kind,
  dependency.existing_object
from (
  values
    ('public.newsroom_articles', 'table', to_regclass('public.newsroom_articles')::text),
    (
      'public.newsroom_article_snapshots',
      'table',
      to_regclass('public.newsroom_article_snapshots')::text
    ),
    ('gen_random_uuid()', 'function', to_regprocedure('gen_random_uuid()')::text),
    (
      'public.newsroom_set_article_updated_at()',
      'trigger function',
      to_regprocedure('public.newsroom_set_article_updated_at()')::text
    ),
    (
      'public.newsroom_reject_snapshot_mutation()',
      'trigger function',
      to_regprocedure('public.newsroom_reject_snapshot_mutation()')::text
    )
) as dependency(object_name, object_kind, existing_object)
order by dependency.object_kind, dependency.object_name;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-CAIXA-ENTRADA-PERSISTENCIA-TRANSACIONAL-RPC-1',
  'articles_table_exists', to_regclass('public.newsroom_articles') is not null,
  'snapshots_table_exists', to_regclass('public.newsroom_article_snapshots') is not null,
  'required_column_count', (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'newsroom_articles' and column_name in (
          'id', 'source_code', 'original_url', 'normalized_url', 'external_id',
          'title', 'subtitle', 'summary', 'author', 'published_at', 'modified_at',
          'detected_at', 'image_url', 'processing_status', 'first_detected_at',
          'last_detected_at', 'created_at', 'updated_at'
        ))
        or
        (table_name = 'newsroom_article_snapshots' and column_name in (
          'id', 'article_id', 'content_hash', 'body', 'source_metadata',
          'extracted_at', 'created_at'
        ))
      )
  ),
  'articles_identity_constraint_present', exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_articles')
      and conname = 'newsroom_articles_source_url_key'
      and contype = 'u'
  ),
  'snapshots_identity_constraint_present', exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_article_snapshots')
      and conname = 'newsroom_article_snapshots_article_hash_key'
      and contype = 'u'
  ),
  'snapshot_foreign_key_present', exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_article_snapshots')
      and conname = 'newsroom_article_snapshots_article_fkey'
      and contype = 'f'
      and confrelid = to_regclass('public.newsroom_articles')
  ),
  'snapshot_immutability_trigger_present', exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = to_regclass('public.newsroom_article_snapshots')
      and tgname = 'newsroom_article_snapshots_immutable'
      and not tgisinternal
      and tgenabled <> 'D'
  ),
  'rls_enabled_and_forced', (
    select count(*) = 2
    from pg_catalog.pg_class
    where oid in (
      to_regclass('public.newsroom_articles'),
      to_regclass('public.newsroom_article_snapshots')
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  'rpc_overload_count', (
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'newsroom_persist_article_snapshot'
  ),
  'writes_performed', false,
  'next_step_if_all_contract_rows_match',
    'run 19-redacao-automatica-newsroom-rpc-apply.sql manually'
) as preflight_summary;
