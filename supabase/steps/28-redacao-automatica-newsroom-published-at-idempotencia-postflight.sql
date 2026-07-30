-- Redação Automática — published_at não destrutivo e idempotência canónica.
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
      select
        language_name = 'plpgsql'
        and prosecdef
        and owner_name = 'postgres'
        and coalesce(proconfig, array[]::text[]) @>
          array['search_path=public']::text[]
      from exact_rpc
    ), false) as function_security_matches,
    coalesce((
      select pg_catalog.has_function_privilege(
        'service_role',
        oid,
        'EXECUTE'
      )
      from exact_rpc
    ), false) as service_role_execute,
    coalesce((
      select
        not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege(
          'authenticated',
          oid,
          'EXECUTE'
        )
      from exact_rpc
    ), false) as browser_execute_absent,
    exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = to_regclass('public.newsroom_articles')
        and conname = 'newsroom_articles_source_url_key'
        and contype = 'u'
    ) as article_identity_present,
    exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = to_regclass('public.newsroom_article_snapshots')
        and conname = 'newsroom_article_snapshots_article_hash_key'
        and contype = 'u'
    ) as snapshot_identity_present,
    exists (
      select 1
      from pg_catalog.pg_trigger
      where tgrelid = to_regclass('public.newsroom_article_snapshots')
        and tgname = 'newsroom_article_snapshots_immutable'
        and not tgisinternal
        and tgenabled <> 'D'
    ) as snapshot_immutable,
    coalesce((
      select position(
        'v_effective_published_at'
        in definition_normalized
      ) > 0
        and position(
          'coalesce(p_published_at, v_article.published_at)'
          in definition_normalized
        ) > 0
      from exact_rpc
    ), false) as effective_published_at_present,
    coalesce((
      select position(
        'v_article.original_url is distinct from p_original_url'
        in definition_normalized
      ) = 0
        and position(
          'original_url = v_effective_original_url'
          in definition_normalized
        ) > 0
      from exact_rpc
    ), false) as canonical_identity_policy_present,
    coalesce((
      select position(
        'v_snapshot.body is distinct from p_body'
        in definition_normalized
      ) > 0
        and position(
          'v_snapshot.source_metadata is distinct from p_source_metadata'
          in definition_normalized
        ) = 0
      from exact_rpc
    ), false) as snapshot_reuse_policy_present,
    coalesce((
      select position(
        'v_article.external_id is distinct from p_external_id'
        in definition_normalized
      ) > 0
      from exact_rpc
    ), false) as external_id_conflict_present,
    coalesce((
      select
        definition_normalized !~
          'update\s+(public\.)?newsroom_article_snapshots'
        and definition_normalized !~
          'delete\s+from\s+(public\.)?newsroom_article_snapshots'
      from exact_rpc
    ), false) as snapshot_mutation_absent
)
select jsonb_build_object(
  'policy_matches',
    function_exists
    and exactly_one_overload
    and result_type_matches
    and function_security_matches
    and service_role_execute
    and browser_execute_absent
    and article_identity_present
    and snapshot_identity_present
    and snapshot_immutable
    and effective_published_at_present
    and canonical_identity_policy_present
    and snapshot_reuse_policy_present
    and external_id_conflict_present
    and snapshot_mutation_absent,
  'function_exists', function_exists,
  'exactly_one_overload', exactly_one_overload,
  'result_type_matches', result_type_matches,
  'function_security_matches', function_security_matches,
  'execute_grants_match',
    service_role_execute and browser_execute_absent,
  'identity_constraints_match',
    article_identity_present and snapshot_identity_present,
  'snapshot_immutable', snapshot_immutable,
  'effective_published_at_present', effective_published_at_present,
  'canonical_identity_policy_present',
    canonical_identity_policy_present,
  'snapshot_reuse_policy_present', snapshot_reuse_policy_present,
  'external_id_conflict_present', external_id_conflict_present,
  'snapshot_mutation_absent', snapshot_mutation_absent,
  'writes_performed', false,
  'next_step',
    'run 29-redacao-automatica-newsroom-published-at-idempotencia-smoke-rollback.sql manually'
) as postflight_summary
from checks;
