-- Step 36 - read-only postflight for the compose submission_id ambiguity hotfix.
-- This script performs no writes.

with expected_functions(function_name, procedure_oid) as (
  values
    (
      'prepare',
      to_regprocedure(
        'public.newsroom_prepare_editorial_compose(uuid,text,text,text,text,text,text,text,uuid[],uuid[],text[],integer[],text[])'
      )
    ),
    (
      'claim',
      to_regprocedure(
        'public.newsroom_claim_editorial_compose_generation(uuid,text,uuid)'
      )
    ),
    (
      'fail',
      to_regprocedure(
        'public.newsroom_fail_editorial_compose_generation(uuid,text,uuid,text)'
      )
    ),
    (
      'complete',
      to_regprocedure(
        'public.newsroom_complete_editorial_compose_generation(uuid,text,uuid)'
      )
    )
),
function_state as (
  select
    expected.function_name,
    expected.procedure_oid is not null as present,
    pg_get_function_identity_arguments(proc.oid) as identity_arguments,
    pg_get_function_result(proc.oid) as result_type,
    pg_get_userbyid(proc.proowner) as owner_name,
    coalesce(proc.prosecdef, false) as security_definer,
    coalesce(array_to_string(proc.proconfig, ','), '') like '%search_path=%'
      as search_path_controlled,
    coalesce(
      has_function_privilege('service_role', expected.procedure_oid, 'EXECUTE'),
      false
    ) as service_role_execute,
    not coalesce(
      has_function_privilege('anon', expected.procedure_oid, 'EXECUTE'),
      false
    )
      and not coalesce(
        has_function_privilege('authenticated', expected.procedure_oid, 'EXECUTE'),
        false
      ) as browser_execute_absent,
    lower(regexp_replace(pg_get_functiondef(proc.oid), '\s+', ' ', 'g'))
      as normalized_definition
  from expected_functions expected
  left join pg_proc proc
    on proc.oid = expected.procedure_oid
),
prepare_catalog_state as (
  select
    count(*) as overload_count,
    count(*) filter (
      where proc.oid = to_regprocedure(
        'public.newsroom_prepare_editorial_compose(uuid,text,text,text,text,text,text,text,uuid[],uuid[],text[],integer[],text[])'
      )
    ) as expected_signature_count
  from pg_proc proc
  join pg_namespace namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'newsroom_prepare_editorial_compose'
),
definition_state as (
  select
    coalesce(bool_or(
      function_state.function_name = 'prepare'
      and position(
        'on conflict on constraint newsroom_editorial_compose_requests_pkey do nothing'
        in function_state.normalized_definition
      ) > 0
    ), false) as constraint_clause_present,
    not coalesce(bool_or(
      position(
        'on conflict (submission_id)'
        in function_state.normalized_definition
      ) > 0
    ), false) as ambiguous_conflict_clause_absent,
    not coalesce(bool_or(
      function_state.normalized_definition ~
        'where (submission_id|request_fingerprint|dossier_id|article_plan_id|editorial_article_id|generation_status)[[:space:]]*[=<>]'
    ), false) as unqualified_collision_predicates_absent,
    not coalesce(bool_or(
      function_state.function_name in ('claim', 'fail', 'complete')
      and function_state.normalized_definition ~ 'on conflict[[:space:]]*\('
    ), false) as other_conflict_inference_absent
  from function_state
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
    ) as primary_key_name
  from pg_constraint constraint_row
  where constraint_row.conrelid =
    to_regclass('public.newsroom_editorial_compose_requests')
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
  'step', 36,
  'request_table_present',
    to_regclass('public.newsroom_editorial_compose_requests') is not null,
  'prepare_signature', to_jsonb(prepare_catalog_state),
  'functions',
    (
      select jsonb_object_agg(
        function_name,
        to_jsonb(function_state)
          - 'function_name'
          - 'normalized_definition'
      )
      from function_state
    ),
  'prepare_result_preserved',
    (
      select function_state.result_type =
        'TABLE(submission_id uuid, request_fingerprint text, dossier_id uuid, article_plan_id uuid, editorial_article_id uuid, composition_action text, generation_status text)'
      from function_state
      where function_state.function_name = 'prepare'
    ),
  'function_owners_match',
    (
      select count(distinct function_state.owner_name) = 1
      from function_state
      where function_state.present
    ),
  'definitions', to_jsonb(definition_state),
  'primary_key', to_jsonb(primary_key_state),
  'data', to_jsonb(data_state),
  'ready_for_smoke',
    to_regclass('public.newsroom_editorial_compose_requests') is not null
    and prepare_catalog_state.overload_count = 1
    and prepare_catalog_state.expected_signature_count = 1
    and not exists (
      select 1
      from function_state
      where not (
        present
        and security_definer
        and search_path_controlled
        and service_role_execute
        and browser_execute_absent
      )
    )
    and (
      select function_state.result_type =
        'TABLE(submission_id uuid, request_fingerprint text, dossier_id uuid, article_plan_id uuid, editorial_article_id uuid, composition_action text, generation_status text)'
      from function_state
      where function_state.function_name = 'prepare'
    )
    and (
      select count(distinct function_state.owner_name) = 1
      from function_state
      where function_state.present
    )
    and definition_state.constraint_clause_present
    and definition_state.ambiguous_conflict_clause_absent
    and definition_state.unqualified_collision_predicates_absent
    and definition_state.other_conflict_inference_absent
    and primary_key_state.expected_primary_key_present
    and data_state.partial_composition_count = 0
    and data_state.request_without_composition_count = 0
    and data_state.broken_composition_relation_count = 0
    and data_state.completed_without_generation_count = 0
    and data_state.generation_without_completed_state_count = 0,
  'writes_performed', false,
  'next_step',
    'run 37-redacao-automatica-compose-idempotencia-ambiguidade-smoke-rollback.sql manually'
) as postflight_summary
from prepare_catalog_state
cross join definition_state
cross join primary_key_state
cross join data_state;
