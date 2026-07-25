-- Redação Automática — persistência transacional de artigo e snapshot.
-- SQL 3/4 — POSTFLIGHT READ-ONLY. Não altera schema nem dados.

select
  p.oid::regprocedure::text as function_signature,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  language_name.lanname as language_name,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  owner_role.rolname as owner_name,
  pg_catalog.obj_description(p.oid, 'pg_proc') as function_comment,
  pg_catalog.pg_get_functiondef(p.oid) as function_definition
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
  p.oid::regprocedure::text as function_signature,
  case
    when function_acl.grantee = 0 then 'PUBLIC'
    else grantee_role.rolname
  end as grantee,
  function_acl.privilege_type,
  function_acl.is_grantable
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n
  on n.oid = p.pronamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
) function_acl
left join pg_catalog.pg_roles grantee_role
  on grantee_role.oid = function_acl.grantee
where n.nspname = 'public'
  and p.proname = 'newsroom_persist_article_snapshot'
order by function_signature, grantee, function_acl.privilege_type;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  owner_role.rolname as owner_name
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
join pg_catalog.pg_roles owner_role
  on owner_role.oid = c.relowner
where n.nspname = 'public'
  and c.relname in ('newsroom_articles', 'newsroom_article_snapshots')
order by c.relname;

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
  c.relname as table_name,
  constraint_row.conname as constraint_name,
  constraint_row.contype as constraint_type,
  pg_catalog.pg_get_constraintdef(constraint_row.oid, true) as definition
from pg_catalog.pg_constraint constraint_row
join pg_catalog.pg_class c
  on c.oid = constraint_row.conrelid
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('newsroom_articles', 'newsroom_article_snapshots')
order by c.relname, constraint_row.conname;

select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('newsroom_articles', 'newsroom_article_snapshots')
order by table_name, trigger_name, event_manipulation;

select jsonb_build_object(
  'function_exists', exact_rpc.oid is not null,
  'exact_signature', exact_rpc.oid = to_regprocedure(
    'public.newsroom_persist_article_snapshot(text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,text,jsonb,jsonb,timestamp with time zone)'
  ),
  'overload_count', (
    select count(*)
    from pg_catalog.pg_proc candidate
    join pg_catalog.pg_namespace candidate_namespace
      on candidate_namespace.oid = candidate.pronamespace
    where candidate_namespace.nspname = 'public'
      and candidate.proname = 'newsroom_persist_article_snapshot'
  ),
  'result_type', pg_catalog.pg_get_function_result(exact_rpc.oid),
  'result_type_matches',
    pg_catalog.pg_get_function_result(exact_rpc.oid) =
      'TABLE(article_id uuid, snapshot_id uuid, article_action text, snapshot_action text)',
  'language_plpgsql', language_name.lanname = 'plpgsql',
  'security_definer', exact_rpc.prosecdef,
  'search_path_public',
    coalesce(exact_rpc.proconfig, array[]::text[]) @>
      array['search_path=public']::text[],
  'owner_postgres', owner_role.rolname = 'postgres',
  'service_role_execute',
    pg_catalog.has_function_privilege('service_role', exact_rpc.oid, 'EXECUTE'),
  'public_execute', exists (
    select 1
    from pg_catalog.aclexplode(
      coalesce(exact_rpc.proacl, pg_catalog.acldefault('f', exact_rpc.proowner))
    ) function_acl
    where function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ),
  'anon_execute',
    pg_catalog.has_function_privilege('anon', exact_rpc.oid, 'EXECUTE'),
  'authenticated_execute',
    pg_catalog.has_function_privilege('authenticated', exact_rpc.oid, 'EXECUTE'),
  'unexpected_execute_grantee_count', (
    select count(*)
    from pg_catalog.aclexplode(
      coalesce(exact_rpc.proacl, pg_catalog.acldefault('f', exact_rpc.proowner))
    ) function_acl
    where function_acl.privilege_type = 'EXECUTE'
      and function_acl.grantee not in (
        exact_rpc.proowner,
        (select oid from pg_catalog.pg_roles where rolname = 'service_role')
      )
  ),
  'rls_enabled_and_forced', (
    select count(*) = 2
    from pg_catalog.pg_class newsroom_table
    where newsroom_table.oid in (
      to_regclass('public.newsroom_articles'),
      to_regclass('public.newsroom_article_snapshots')
    )
      and newsroom_table.relrowsecurity
      and newsroom_table.relforcerowsecurity
  ),
  'policy_count', (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('newsroom_articles', 'newsroom_article_snapshots')
  ),
  'browser_table_grant_count', (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('newsroom_articles', 'newsroom_article_snapshots')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'service_role_article_grants_match', (
    select coalesce(
      array_agg(
        distinct privilege_type::text
        order by privilege_type::text
      ),
      array[]::text[]
    ) = array[
      'DELETE',
      'INSERT',
      'REFERENCES',
      'SELECT',
      'TRIGGER',
      'TRUNCATE',
      'UPDATE'
    ]::text[]
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'newsroom_articles'
      and grantee = 'service_role'
  ),
  'service_role_snapshot_grants_match', (
    select coalesce(
      array_agg(
        distinct privilege_type::text
        order by privilege_type::text
      ),
      array[]::text[]
    ) = array[
      'DELETE',
      'INSERT',
      'REFERENCES',
      'SELECT',
      'TRIGGER',
      'TRUNCATE',
      'UPDATE'
    ]::text[]
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'newsroom_article_snapshots'
      and grantee = 'service_role'
  ),
  'article_identity_constraint_present', exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_articles')
      and conname = 'newsroom_articles_source_url_key'
      and contype = 'u'
  ),
  'snapshot_identity_constraint_present', exists (
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
  'writes_performed', false,
  'next_step_if_contract_matches',
    'run 21-redacao-automatica-newsroom-rpc-smoke-rollback.sql manually'
) as postflight_summary
from (values (true)) as audit_anchor(run_audit)
left join pg_catalog.pg_proc exact_rpc
  on exact_rpc.oid = to_regprocedure(
    'public.newsroom_persist_article_snapshot(text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,text,jsonb,jsonb,timestamp with time zone)'
  )
left join pg_catalog.pg_language language_name
  on language_name.oid = exact_rpc.prolang
left join pg_catalog.pg_roles owner_role
  on owner_role.oid = exact_rpc.proowner;
