-- Step 32 — read-only postflight for persistent compose idempotency and provenance.
-- This script performs no writes.

with columns_state as (
  select
    count(*) filter (where attname = 'title_snapshot') = 1 as title_snapshot_present,
    count(*) filter (where attname = 'published_at_snapshot') = 1 as published_at_snapshot_present
  from pg_attribute
  where attrelid = to_regclass('public.newsroom_editorial_dossier_sources')
    and attname in ('title_snapshot', 'published_at_snapshot')
    and not attisdropped
),
constraints_state as (
  select
    count(*) filter (
      where conrelid = to_regclass('public.newsroom_editorial_compose_requests')
        and conname = 'newsroom_editorial_compose_requests_pkey'
        and contype = 'p'
    ) = 1 as submission_primary_key_present,
    count(*) filter (
      where conrelid = to_regclass('public.newsroom_editorial_compose_requests')
        and conname = 'newsroom_editorial_compose_requests_dossier_key'
        and contype = 'u'
    ) = 1 as dossier_unique_present,
    count(*) filter (
      where conrelid = to_regclass('public.newsroom_editorial_compose_requests')
        and conname = 'newsroom_editorial_compose_requests_plan_key'
        and contype = 'u'
    ) = 1 as plan_unique_present,
    count(*) filter (
      where conrelid = to_regclass('public.newsroom_editorial_compose_requests')
        and conname = 'newsroom_editorial_compose_requests_article_key'
        and contype = 'u'
    ) = 1 as article_unique_present,
    count(*) filter (
      where conrelid = to_regclass('public.newsroom_editorial_dossier_sources')
        and conname = 'newsroom_editorial_dossier_sources_title_snapshot_not_blank'
        and contype = 'c'
    ) = 1 as frozen_title_constraint_present
  from pg_constraint
),
functions_state as (
  select
    procedure_name,
    present,
    security_definer,
    search_path_controlled,
    service_role_execute,
    browser_execute_absent
  from (
    values
      (
        'prepare',
        to_regprocedure(
          'public.newsroom_prepare_editorial_compose(uuid,text,text,text,text,text,text,text,uuid[],uuid[],text[],integer[],text[])'
        )
      ),
      (
        'claim',
        to_regprocedure('public.newsroom_claim_editorial_compose_generation(uuid,text,uuid)')
      ),
      (
        'fail',
        to_regprocedure('public.newsroom_fail_editorial_compose_generation(uuid,text,uuid,text)')
      ),
      (
        'complete',
        to_regprocedure('public.newsroom_complete_editorial_compose_generation(uuid,text,uuid)')
      )
  ) requested(procedure_name, procedure_oid)
  cross join lateral (
    select
      procedure_oid is not null as present,
      coalesce(proc.prosecdef, false) as security_definer,
      coalesce(array_to_string(proc.proconfig, ',') like '%search_path=%', false) as search_path_controlled,
      coalesce(has_function_privilege('service_role', procedure_oid, 'EXECUTE'), false) as service_role_execute,
      not coalesce(has_function_privilege('anon', procedure_oid, 'EXECUTE'), false)
        and not coalesce(has_function_privilege('authenticated', procedure_oid, 'EXECUTE'), false)
        as browser_execute_absent
    from pg_proc proc
    where proc.oid = procedure_oid
    union all
    select false, false, false, false, false
    where procedure_oid is null
  ) checked
),
triggers_state as (
  select
    count(*) filter (
      where tgrelid = to_regclass('public.newsroom_editorial_dossier_sources')
        and tgname = 'newsroom_editorial_dossier_sources_protect_frozen_identity'
        and not tgisinternal
    ) = 1 as frozen_identity_trigger_present,
    count(*) filter (
      where tgrelid = to_regclass('public.newsroom_editorial_compose_requests')
        and tgname = 'newsroom_editorial_compose_requests_set_updated_at'
        and not tgisinternal
    ) = 1 as request_updated_trigger_present
  from pg_trigger
),
relation_security_state as (
  select
    coalesce(relrowsecurity and relforcerowsecurity, false) as request_rls_forced,
    to_regclass(
      'public.newsroom_editorial_compose_requests_generation_status_idx'
    ) is not null as generation_status_index_present,
    to_regprocedure(
      'public.newsroom_protect_editorial_dossier_source_frozen_identity()'
    ) is not null as frozen_trigger_function_present,
    coalesce((
      select not proc.prosecdef
        and array_to_string(proc.proconfig, ',') like '%search_path=%'
      from pg_proc proc
      where proc.oid = to_regprocedure(
        'public.newsroom_protect_editorial_dossier_source_frozen_identity()'
      )
    ), false) as frozen_trigger_security_invoker
  from pg_class relation
  where relation.oid = to_regclass('public.newsroom_editorial_compose_requests')
),
grants_state as (
  select
    not has_table_privilege('anon', 'public.newsroom_editorial_compose_requests', 'SELECT')
      and not has_table_privilege('authenticated', 'public.newsroom_editorial_compose_requests', 'SELECT')
      and not has_table_privilege('anon', 'public.newsroom_editorial_compose_requests', 'INSERT')
      and not has_table_privilege('authenticated', 'public.newsroom_editorial_compose_requests', 'INSERT')
      as browser_table_grants_absent
),
data_state as (
  select
    count(*) filter (
      where request_row.request_fingerprint !~ '^[0-9a-f]{64}$'
    ) as invalid_fingerprint_count,
    count(*) filter (
      where (request_row.dossier_id is null)
        <> (request_row.article_plan_id is null)
       or (request_row.dossier_id is null)
        <> (request_row.editorial_article_id is null)
    ) as partial_composition_count,
    count(*) filter (
      where request_row.generation_status = 'completed'
        and not exists (
          select 1
          from public.newsroom_editorial_dossier_article_plan_generations generation
          where generation.article_plan_id = request_row.article_plan_id
            and generation.editorial_article_id = request_row.editorial_article_id
        )
    ) as completed_without_generation_count
  from public.newsroom_editorial_compose_requests request_row
)
select jsonb_build_object(
  'step', 32,
  'request_table_present', to_regclass('public.newsroom_editorial_compose_requests') is not null,
  'columns', to_jsonb(columns_state),
  'constraints', to_jsonb(constraints_state),
  'functions',
    (select jsonb_object_agg(procedure_name, to_jsonb(functions_state) - 'procedure_name') from functions_state),
  'triggers', to_jsonb(triggers_state),
  'relation_security', to_jsonb(relation_security_state),
  'grants', to_jsonb(grants_state),
  'data', to_jsonb(data_state),
  'ready_for_smoke',
    to_regclass('public.newsroom_editorial_compose_requests') is not null
    and columns_state.title_snapshot_present
    and columns_state.published_at_snapshot_present
    and constraints_state.submission_primary_key_present
    and constraints_state.dossier_unique_present
    and constraints_state.plan_unique_present
    and constraints_state.article_unique_present
    and constraints_state.frozen_title_constraint_present
    and triggers_state.frozen_identity_trigger_present
    and triggers_state.request_updated_trigger_present
    and relation_security_state.request_rls_forced
    and relation_security_state.generation_status_index_present
    and relation_security_state.frozen_trigger_function_present
    and relation_security_state.frozen_trigger_security_invoker
    and grants_state.browser_table_grants_absent
    and not exists (
      select 1
      from functions_state
      where not (
        present
        and security_definer
        and search_path_controlled
        and service_role_execute
        and browser_execute_absent
      )
    )
    and data_state.invalid_fingerprint_count = 0
    and data_state.partial_composition_count = 0
    and data_state.completed_without_generation_count = 0,
  'writes_performed', false,
  'next_step', 'run 33-redacao-automatica-compose-idempotencia-proveniencia-smoke-rollback.sql manually'
) as postflight_summary
from columns_state
cross join constraints_state
cross join triggers_state
cross join relation_security_state
cross join grants_state
cross join data_state;
