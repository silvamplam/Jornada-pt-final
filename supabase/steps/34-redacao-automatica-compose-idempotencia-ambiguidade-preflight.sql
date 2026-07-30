-- Step 34 - read-only preflight for the compose submission_id ambiguity hotfix.
-- This script performs no writes and accepts either the defective or corrected definition.

with prepare_catalog as (
  select
    proc.oid,
    pg_get_function_identity_arguments(proc.oid) as identity_arguments,
    pg_get_function_result(proc.oid) as result_type,
    pg_get_userbyid(proc.proowner) as owner_name,
    proc.prosecdef as security_definer,
    coalesce(array_to_string(proc.proconfig, ','), '') as function_config,
    pg_get_functiondef(proc.oid) as definition
  from pg_proc proc
  join pg_namespace namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'newsroom_prepare_editorial_compose'
),
expected_prepare as (
  select *
  from prepare_catalog
  where oid = to_regprocedure(
    'public.newsroom_prepare_editorial_compose(uuid,text,text,text,text,text,text,text,uuid[],uuid[],text[],integer[],text[])'
  )
),
prepare_state as (
  select
    (select count(*) from prepare_catalog) as overload_count,
    (select count(*) from expected_prepare) as expected_signature_count,
    expected_prepare.oid,
    expected_prepare.identity_arguments,
    expected_prepare.result_type,
    expected_prepare.owner_name,
    expected_prepare.security_definer,
    expected_prepare.function_config like '%search_path=%' as search_path_controlled,
    coalesce(
      has_function_privilege('service_role', expected_prepare.oid, 'EXECUTE'),
      false
    ) as service_role_execute,
    not coalesce(
      has_function_privilege('anon', expected_prepare.oid, 'EXECUTE'),
      false
    )
      and not coalesce(
        has_function_privilege('authenticated', expected_prepare.oid, 'EXECUTE'),
        false
      ) as browser_execute_absent,
    position(
      'on conflict (submission_id) do nothing'
      in lower(regexp_replace(expected_prepare.definition, '\s+', ' ', 'g'))
    ) > 0 as ambiguous_definition_present,
    position(
      'on conflict on constraint newsroom_editorial_compose_requests_pkey do nothing'
      in lower(regexp_replace(expected_prepare.definition, '\s+', ' ', 'g'))
    ) > 0 as constraint_definition_present
  from expected_prepare
  union all
  select
    (select count(*) from prepare_catalog),
    0,
    null::oid,
    null::text,
    null::text,
    null::name,
    false,
    false,
    false,
    false,
    false,
    false
  where not exists (select 1 from expected_prepare)
),
primary_key_state as (
  select
    count(*) filter (
      where constraint_row.conname = 'newsroom_editorial_compose_requests_pkey'
        and constraint_row.contype = 'p'
        and pg_get_constraintdef(constraint_row.oid) = 'PRIMARY KEY (submission_id)'
    ) = 1 as expected_primary_key_present,
    max(constraint_row.conname) filter (
      where constraint_row.contype = 'p'
    ) as actual_primary_key_name,
    max(pg_get_constraintdef(constraint_row.oid)) filter (
      where constraint_row.contype = 'p'
    ) as actual_primary_key_definition
  from pg_constraint constraint_row
  where constraint_row.conrelid =
    to_regclass('public.newsroom_editorial_compose_requests')
),
failed_smoke_residue as (
  select count(*)::integer as residue_count
  from (
    select 'request:' || request_row.submission_id::text as identity
    from public.newsroom_editorial_compose_requests request_row
    where request_row.submission_id =
      '00000000-0000-4000-8000-000000000330'::uuid
    union all
    select 'newsroom_article:' || article.id::text
    from public.newsroom_articles article
    where article.normalized_url =
      'https://example.invalid/compose-provenance-smoke/source'
    union all
    select 'snapshot:' || snapshot.id::text
    from public.newsroom_article_snapshots snapshot
    join public.newsroom_articles article
      on article.id = snapshot.article_id
    where article.normalized_url =
      'https://example.invalid/compose-provenance-smoke/source'
    union all
    select 'dossier:' || dossier.id::text
    from public.newsroom_editorial_dossiers dossier
    where dossier.title = 'Synthetic compose acceptance draft'
    union all
    select 'plan:' || plan.id::text
    from public.newsroom_editorial_dossier_article_plans plan
    where plan.working_title = 'Synthetic compose acceptance draft'
    union all
    select 'editorial_article:' || article.id::text
    from public.editorial_articles article
    where article.title = 'Synthetic compose acceptance draft'
  ) residue
),
data_state as (
  select
    count(*) filter (
      where (request_row.dossier_id is null)
        <> (request_row.article_plan_id is null)
         or (request_row.dossier_id is null)
        <> (request_row.editorial_article_id is null)
    ) as partial_composition_count,
    count(*) filter (
      where request_row.dossier_id is null
        and request_row.article_plan_id is null
        and request_row.editorial_article_id is null
    ) as request_without_composition_count,
    count(*) filter (
      where request_row.dossier_id is not null
        and (
          not exists (
            select 1
            from public.newsroom_editorial_dossiers dossier
            where dossier.id = request_row.dossier_id
          )
          or not exists (
            select 1
            from public.newsroom_editorial_dossier_article_plans plan
            where plan.id = request_row.article_plan_id
              and plan.dossier_id = request_row.dossier_id
              and plan.editorial_article_id = request_row.editorial_article_id
          )
          or not exists (
            select 1
            from public.editorial_articles article
            where article.id = request_row.editorial_article_id
          )
        )
    ) as broken_composition_relation_count,
    count(*) filter (
      where request_row.generation_status = 'completed'
        and not exists (
          select 1
          from public.newsroom_editorial_dossier_article_plan_generations generation
          where generation.article_plan_id = request_row.article_plan_id
            and generation.editorial_article_id = request_row.editorial_article_id
        )
    ) as completed_without_generation_count,
    count(*) filter (
      where request_row.generation_status <> 'completed'
        and exists (
          select 1
          from public.newsroom_editorial_dossier_article_plan_generations generation
          where generation.article_plan_id = request_row.article_plan_id
            and generation.editorial_article_id = request_row.editorial_article_id
        )
    ) as generation_without_completed_state_count
  from public.newsroom_editorial_compose_requests request_row
)
select jsonb_build_object(
  'step', 34,
  'request_table_present',
    to_regclass('public.newsroom_editorial_compose_requests') is not null,
  'prepare', jsonb_build_object(
    'overload_count', prepare_state.overload_count,
    'expected_signature_count', prepare_state.expected_signature_count,
    'identity_arguments', prepare_state.identity_arguments,
    'result_type', prepare_state.result_type,
    'owner', prepare_state.owner_name,
    'security_definer', prepare_state.security_definer,
    'search_path_controlled', prepare_state.search_path_controlled,
    'service_role_execute', prepare_state.service_role_execute,
    'browser_execute_absent', prepare_state.browser_execute_absent,
    'ambiguous_definition_present', prepare_state.ambiguous_definition_present,
    'constraint_definition_present', prepare_state.constraint_definition_present,
    'definition_state', case
      when prepare_state.ambiguous_definition_present then 'defective'
      when prepare_state.constraint_definition_present then 'already_corrected'
      else 'unrecognized'
    end
  ),
  'primary_key', to_jsonb(primary_key_state),
  'failed_step_33_residue_count', failed_smoke_residue.residue_count,
  'data', to_jsonb(data_state),
  'ready_to_apply',
    to_regclass('public.newsroom_editorial_compose_requests') is not null
    and prepare_state.overload_count = 1
    and prepare_state.expected_signature_count = 1
    and prepare_state.security_definer
    and prepare_state.search_path_controlled
    and prepare_state.service_role_execute
    and prepare_state.browser_execute_absent
    and (
      prepare_state.ambiguous_definition_present
      or prepare_state.constraint_definition_present
    )
    and primary_key_state.expected_primary_key_present
    and failed_smoke_residue.residue_count = 0
    and data_state.partial_composition_count = 0
    and data_state.request_without_composition_count = 0
    and data_state.broken_composition_relation_count = 0
    and data_state.completed_without_generation_count = 0
    and data_state.generation_without_completed_state_count = 0,
  'writes_performed', false,
  'next_step',
    'run 35-redacao-automatica-compose-idempotencia-ambiguidade-apply.sql manually'
) as preflight_summary
from prepare_state
cross join primary_key_state
cross join failed_smoke_residue
cross join data_state;
