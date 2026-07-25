-- Redação Automática — política transacional de reextração idêntica.
-- SQL 3/4 — POSTFLIGHT READ-ONLY. Não altera schema nem dados.

with exact_rpc as (
  select
    p.oid,
    p.proowner,
    p.proacl,
    p.proconfig,
    p.prosecdef,
    language_name.lanname as language_name,
    owner_role.rolname as owner_name,
    pg_catalog.pg_get_function_result(p.oid) as result_type,
    lower(
      regexp_replace(
        pg_catalog.pg_get_functiondef(p.oid),
        '\s+',
        ' ',
        'g'
      )
    ) as definition_normalized
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n
    on n.oid = p.pronamespace
  join pg_catalog.pg_language language_name
    on language_name.oid = p.prolang
  join pg_catalog.pg_roles owner_role
    on owner_role.oid = p.proowner
  where p.oid = to_regprocedure(
    'public.newsroom_persist_article_snapshot(text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,text,jsonb,jsonb,timestamp with time zone)'
  )
),
checks as (
  select
    exists (select 1 from exact_rpc) as function_exists,
    (
      select count(*) = 1
      from pg_catalog.pg_proc candidate
      join pg_catalog.pg_namespace candidate_namespace
        on candidate_namespace.oid = candidate.pronamespace
      where candidate_namespace.nspname = 'public'
        and candidate.proname = 'newsroom_persist_article_snapshot'
    ) as exactly_one_overload,
    coalesce((
      select result_type =
        'TABLE(article_id uuid, snapshot_id uuid, article_action text, snapshot_action text)'
      from exact_rpc
    ), false) as result_type_matches,
    coalesce((
      select language_name = 'plpgsql'
      from exact_rpc
    ), false) as language_plpgsql,
    coalesce((
      select prosecdef
      from exact_rpc
    ), false) as security_definer,
    coalesce((
      select
        coalesce(proconfig, array[]::text[]) @>
          array['search_path=public']::text[]
      from exact_rpc
    ), false) as search_path_public,
    coalesce((
      select owner_name = 'postgres'
      from exact_rpc
    ), false) as owner_postgres,
    coalesce((
      select pg_catalog.has_function_privilege(
        'service_role',
        oid,
        'EXECUTE'
      )
      from exact_rpc
    ), false) as service_role_execute,
    not exists (
      select 1
      from exact_rpc
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          exact_rpc.proacl,
          pg_catalog.acldefault('f', exact_rpc.proowner)
        )
      ) function_acl
      where function_acl.grantee = 0
        and function_acl.privilege_type = 'EXECUTE'
    ) as public_execute_absent,
    coalesce((
      select not pg_catalog.has_function_privilege(
        'anon',
        oid,
        'EXECUTE'
      )
      from exact_rpc
    ), false) as anon_execute_absent,
    coalesce((
      select not pg_catalog.has_function_privilege(
        'authenticated',
        oid,
        'EXECUTE'
      )
      from exact_rpc
    ), false) as authenticated_execute_absent,
    not exists (
      select 1
      from exact_rpc
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          exact_rpc.proacl,
          pg_catalog.acldefault('f', exact_rpc.proowner)
        )
      ) function_acl
      where function_acl.privilege_type = 'EXECUTE'
        and function_acl.grantee not in (
          exact_rpc.proowner,
          (
            select oid
            from pg_catalog.pg_roles
            where rolname = 'service_role'
          )
        )
    ) as unexpected_execute_absent,
    (
      select count(*) = 2
      from pg_catalog.pg_class newsroom_table
      where newsroom_table.oid in (
        to_regclass('public.newsroom_articles'),
        to_regclass('public.newsroom_article_snapshots')
      )
        and newsroom_table.relkind = 'r'
        and newsroom_table.relrowsecurity
        and newsroom_table.relforcerowsecurity
    ) as tables_and_rls_match,
    (
      select count(*) = 0
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename in (
          'newsroom_articles',
          'newsroom_article_snapshots'
        )
    ) as policies_match,
    exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = to_regclass('public.newsroom_articles')
        and conname = 'newsroom_articles_source_url_key'
        and contype = 'u'
    ) as article_identity_constraint_present,
    exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = to_regclass('public.newsroom_article_snapshots')
        and conname = 'newsroom_article_snapshots_article_hash_key'
        and contype = 'u'
    ) as snapshot_identity_constraint_present,
    exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = to_regclass('public.newsroom_article_snapshots')
        and conname = 'newsroom_article_snapshots_article_fkey'
        and contype = 'f'
        and confrelid = to_regclass('public.newsroom_articles')
    ) as snapshot_foreign_key_present,
    exists (
      select 1
      from pg_catalog.pg_trigger
      where tgrelid = to_regclass('public.newsroom_article_snapshots')
        and tgname = 'newsroom_article_snapshots_immutable'
        and not tgisinternal
        and tgenabled <> 'D'
    ) as snapshot_immutability_trigger_present,
    (
      select count(*) = 0
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in (
          'newsroom_articles',
          'newsroom_article_snapshots'
        )
        and grantee in ('PUBLIC', 'anon', 'authenticated')
    ) as browser_table_grants_absent,
    (
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
    ) as service_role_article_grants_match,
    (
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
    ) as service_role_snapshot_grants_match,
    coalesce((
      select definition_normalized ~
        'insert into public\.newsroom_article_snapshots \( article_id, content_hash, body, source_metadata, extracted_at \) values \( v_article\.id, p_content_hash, p_body, p_source_metadata, p_extracted_at \)'
      from exact_rpc
    ), false) as extracted_at_inserted,
    coalesce((
      select position(
        'v_snapshot.body is distinct from p_body'
        in definition_normalized
      ) > 0
      from exact_rpc
    ), false) as body_compatibility_present,
    coalesce((
      select position(
        'v_snapshot.source_metadata is distinct from p_source_metadata'
        in definition_normalized
      ) > 0
      from exact_rpc
    ), false) as source_metadata_compatibility_present,
    coalesce((
      select position(
        'v_snapshot.extracted_at is distinct from p_extracted_at'
        in definition_normalized
      ) = 0
      from exact_rpc
    ), false) as extracted_at_compatibility_absent,
    coalesce((
      select definition_normalized !~
        'update\s+(public\.)?newsroom_article_snapshots'
      from exact_rpc
    ), false) as snapshot_update_absent,
    coalesce((
      select definition_normalized !~
        'delete\s+from\s+(public\.)?newsroom_article_snapshots'
      from exact_rpc
    ), false) as snapshot_delete_absent
)
select jsonb_build_object(
  'policy_matches',
  function_exists
    and exactly_one_overload
    and result_type_matches
    and language_plpgsql
    and security_definer
    and search_path_public
    and owner_postgres
    and service_role_execute
    and public_execute_absent
    and anon_execute_absent
    and authenticated_execute_absent
    and unexpected_execute_absent
    and tables_and_rls_match
    and policies_match
    and article_identity_constraint_present
    and snapshot_identity_constraint_present
    and snapshot_foreign_key_present
    and snapshot_immutability_trigger_present
    and browser_table_grants_absent
    and service_role_article_grants_match
    and service_role_snapshot_grants_match
    and extracted_at_inserted
    and body_compatibility_present
    and source_metadata_compatibility_present
    and extracted_at_compatibility_absent
    and snapshot_update_absent
    and snapshot_delete_absent,
  'function_exists', function_exists,
  'exactly_one_overload', exactly_one_overload,
  'result_type_matches', result_type_matches,
  'security_contract_matches',
    language_plpgsql
    and security_definer
    and search_path_public
    and owner_postgres,
  'execute_grants_match',
    service_role_execute
    and public_execute_absent
    and anon_execute_absent
    and authenticated_execute_absent
    and unexpected_execute_absent,
  'schema_security_matches',
    tables_and_rls_match
    and policies_match
    and article_identity_constraint_present
    and snapshot_identity_constraint_present
    and snapshot_foreign_key_present
    and snapshot_immutability_trigger_present
    and browser_table_grants_absent
    and service_role_article_grants_match
    and service_role_snapshot_grants_match,
  'extracted_at_inserted', extracted_at_inserted,
  'body_compatibility_present', body_compatibility_present,
  'source_metadata_compatibility_present',
    source_metadata_compatibility_present,
  'extracted_at_compatibility_absent',
    extracted_at_compatibility_absent,
  'snapshot_mutation_absent',
    snapshot_update_absent and snapshot_delete_absent,
  'writes_performed', false,
  'next_step',
    'run 25-redacao-automatica-newsroom-reextracao-smoke-rollback.sql manually'
) as postflight_summary
from checks;
