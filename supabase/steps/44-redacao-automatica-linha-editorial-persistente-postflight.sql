-- Step 44 - postflight estritamente read-only da linha editorial persistente.

with target_tables as (
  select
    count(*) filter (
      where class.relname = 'newsroom_editorial_profiles'
        and class.relrowsecurity
        and class.relforcerowsecurity
    ) = 1 as profiles_secure,
    count(*) filter (
      where class.relname = 'newsroom_editorial_profile_versions'
        and class.relrowsecurity
        and class.relforcerowsecurity
    ) = 1 as versions_secure,
    count(*) filter (
      where class.relname = 'newsroom_editorial_profile_activation_events'
        and class.relrowsecurity
        and class.relforcerowsecurity
    ) = 1 as events_secure,
    array_agg(distinct pg_get_userbyid(class.relowner))
      filter (
        where class.relname in (
          'newsroom_editorial_profiles',
          'newsroom_editorial_profile_versions',
          'newsroom_editorial_profile_activation_events'
        )
      ) as owners
  from pg_class class
  join pg_namespace namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname in (
      'newsroom_editorial_profiles',
      'newsroom_editorial_profile_versions',
      'newsroom_editorial_profile_activation_events'
    )
),
columns_state as (
  select
    count(*) filter (
      where table_name = 'newsroom_editorial_dossier_article_plans'
        and column_name in (
          'editorial_profile_id',
          'editorial_profile_version_id',
          'editorial_profile_pinned_at'
        )
        and is_nullable = 'YES'
    ) = 3 as plan_columns_present,
    count(*) filter (
      where table_name =
        'newsroom_editorial_dossier_article_plan_generations'
        and column_name in (
          'editorial_profile_id',
          'editorial_profile_version_id',
          'editorial_profile_version_number',
          'editorial_profile_content_hash',
          'editorial_profile_state_at_generation',
          'editorial_profile_version_created_at',
          'editorial_profile_pinned_at',
          'generated_body_hash'
        )
        and is_nullable = 'YES'
    ) = 8 as generation_columns_present
  from information_schema.columns
  where table_schema = 'public'
),
constraints_state as (
  select
    count(*) filter (
      where constraint_row.conname =
        'newsroom_editorial_profiles_active_version_fkey'
        and constraint_row.contype = 'f'
    ) = 1 as active_version_fk_present,
    count(*) filter (
      where constraint_row.conname =
        'newsroom_editorial_profile_versions_profile_number_key'
        and constraint_row.contype = 'u'
    ) = 1 as version_number_unique_present,
    count(*) filter (
      where constraint_row.conname =
        'newsroom_editorial_dossier_article_plans_profile_version_fkey'
        and constraint_row.contype = 'f'
    ) = 1 as plan_composite_fk_present,
    count(*) filter (
      where constraint_row.conname =
        'newsroom_editorial_dossier_article_plan_generations_profile_version_fkey'
        and constraint_row.contype = 'f'
    ) = 1 as generation_composite_fk_present,
    count(*) filter (
      where constraint_row.conname =
        'newsroom_editorial_dossier_article_plan_generations_body_hash_check'
        and constraint_row.contype = 'c'
    ) = 1 as generated_body_hash_check_present
  from pg_constraint constraint_row
  where constraint_row.connamespace =
    (select oid from pg_namespace where nspname = 'public')
),
indexes_state as (
  select
    count(*) filter (
      where index_row.indexname =
        'newsroom_editorial_profile_versions_profile_number_desc_idx'
    ) = 1 as version_history_index_present,
    count(*) filter (
      where index_row.indexname =
        'newsroom_editorial_profile_activation_events_profile_created_idx'
    ) = 1 as activation_history_index_present,
    count(*) filter (
      where index_row.indexname =
        'newsroom_editorial_dossier_article_plans_profile_version_idx'
    ) = 1 as plan_profile_index_present,
    count(*) filter (
      where index_row.indexname =
        'newsroom_editorial_dossier_article_plan_generations_profile_version_idx'
    ) = 1 as generation_profile_index_present
  from pg_indexes index_row
  where index_row.schemaname = 'public'
),
triggers_state as (
  select
    count(*) filter (
      where trigger_row.tgname =
        'newsroom_editorial_profile_versions_immutable'
        and not trigger_row.tgisinternal
    ) = 1 as versions_immutable,
    count(*) filter (
      where trigger_row.tgname =
        'newsroom_editorial_profile_activation_events_immutable'
        and not trigger_row.tgisinternal
    ) = 1 as events_immutable,
    count(*) filter (
      where trigger_row.tgname =
        'newsroom_editorial_dossier_article_plans_profile_pin_immutable'
        and not trigger_row.tgisinternal
    ) = 1 as plan_pin_immutable,
    count(*) filter (
      where trigger_row.tgname =
        'newsroom_editorial_dossier_article_plan_generations_immutable'
        and not trigger_row.tgisinternal
    ) = 1 as generation_immutable
  from pg_trigger trigger_row
  where trigger_row.tgrelid in (
    to_regclass('public.newsroom_editorial_profiles'),
    to_regclass('public.newsroom_editorial_profile_versions'),
    to_regclass('public.newsroom_editorial_profile_activation_events'),
    to_regclass('public.newsroom_editorial_dossier_article_plans'),
    to_regclass('public.newsroom_editorial_dossier_article_plan_generations')
  )
),
rpc_state as (
  select
    count(*) filter (
      where proc.oid = to_regprocedure(
        'public.newsroom_create_editorial_profile_version(uuid,uuid,integer,text,text,text,text,text)'
      )
      and proc.prosecdef
      and pg_get_userbyid(proc.proowner) = 'postgres'
      and coalesce(array_to_string(proc.proconfig, ','), '') like
        '%search_path=%'
    ) = 1 as create_version_secure,
    count(*) filter (
      where proc.oid = to_regprocedure(
        'public.newsroom_activate_editorial_profile_version(uuid,uuid,uuid,text,text,text,text)'
      )
      and proc.prosecdef
      and pg_get_userbyid(proc.proowner) = 'postgres'
      and coalesce(array_to_string(proc.proconfig, ','), '') like
        '%search_path=%'
    ) = 1 as activate_version_secure,
    count(*) filter (
      where proc.oid = to_regprocedure(
        'public.newsroom_pin_editorial_profile_version_for_plan(uuid,uuid)'
      )
      and proc.prosecdef
      and pg_get_userbyid(proc.proowner) = 'postgres'
      and coalesce(array_to_string(proc.proconfig, ','), '') like
        '%search_path=%'
    ) = 1 as pin_version_secure,
    count(*) filter (
      where proc.oid = to_regprocedure(
        'public.newsroom_prepare_editorial_compose(uuid,text,text,text,text,text,text,text,uuid[],uuid[],text[],integer[],text[])'
      )
      and proc.prosecdef
    ) = 1 as prepare_signature_preserved,
    count(*) filter (
      where proc.oid = to_regprocedure(
        'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)'
      )
      and not proc.prosecdef
    ) = 1 as apply_signature_preserved
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
),
rpc_definitions as (
  select
    lower(regexp_replace(
      pg_get_functiondef(to_regprocedure(
        'public.newsroom_prepare_editorial_compose(uuid,text,text,text,text,text,text,text,uuid[],uuid[],text[],integer[],text[])'
      )),
      '\s+',
      ' ',
      'g'
    )) as prepare_definition,
    lower(regexp_replace(
      pg_get_functiondef(to_regprocedure(
        'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)'
      )),
      '\s+',
      ' ',
      'g'
    )) as apply_definition
),
grants_state as (
  select
    has_function_privilege(
      'service_role',
      'public.newsroom_create_editorial_profile_version(uuid,uuid,integer,text,text,text,text,text)',
      'EXECUTE'
    )
    and has_function_privilege(
      'service_role',
      'public.newsroom_activate_editorial_profile_version(uuid,uuid,uuid,text,text,text,text)',
      'EXECUTE'
    )
    and has_function_privilege(
      'service_role',
      'public.newsroom_pin_editorial_profile_version_for_plan(uuid,uuid)',
      'EXECUTE'
    ) as service_role_execute_present,
    not has_function_privilege(
      'anon',
      'public.newsroom_create_editorial_profile_version(uuid,uuid,integer,text,text,text,text,text)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.newsroom_create_editorial_profile_version(uuid,uuid,integer,text,text,text,text,text)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.newsroom_activate_editorial_profile_version(uuid,uuid,uuid,text,text,text,text)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.newsroom_activate_editorial_profile_version(uuid,uuid,uuid,text,text,text,text)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.newsroom_pin_editorial_profile_version_for_plan(uuid,uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.newsroom_pin_editorial_profile_version_for_plan(uuid,uuid)',
      'EXECUTE'
    ) as browser_execute_absent,
    not has_table_privilege(
      'anon',
      'public.newsroom_editorial_profiles',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    and not has_table_privilege(
      'authenticated',
      'public.newsroom_editorial_profiles',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    and not has_table_privilege(
      'anon',
      'public.newsroom_editorial_profile_versions',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    and not has_table_privilege(
      'authenticated',
      'public.newsroom_editorial_profile_versions',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    and not has_table_privilege(
      'anon',
      'public.newsroom_editorial_profile_activation_events',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    and not has_table_privilege(
      'authenticated',
      'public.newsroom_editorial_profile_activation_events',
      'SELECT, INSERT, UPDATE, DELETE'
    ) as browser_table_access_absent
),
seed_state as (
  select
    count(distinct profile.id) = 1 as one_profile,
    count(*) filter (
      where profile.active_version_id = version_row.id
        and version_row.version_number = 1
        and version_row.content_hash = encode(
          extensions.digest(convert_to(version_row.document_text, 'UTF8'), 'sha256'),
          'hex'
        )
    ) = 1 as active_seed_valid,
    count(event_row.id) filter (
      where event_row.event_type = 'activate'
        and event_row.previous_version_id is null
        and event_row.activated_version_id = version_row.id
    ) = 1 as initial_event_valid
  from public.newsroom_editorial_profiles profile
  join public.newsroom_editorial_profile_versions version_row
    on version_row.profile_id = profile.id
   and version_row.id = profile.active_version_id
  left join public.newsroom_editorial_profile_activation_events event_row
    on event_row.profile_id = profile.id
  where profile.code = 'jornada-pt'
  group by profile.id
),
legacy_state as (
  select
    count(*) filter (
      where plan.editorial_profile_id is null
        and (
          plan.editorial_profile_version_id is not null
          or plan.editorial_profile_pinned_at is not null
        )
    ) = 0 as plan_relations_consistent,
    (
      select count(*) = 0
      from public.newsroom_editorial_dossier_article_plan_generations generation
      where generation.editorial_profile_id is null
        and (
          generation.editorial_profile_version_id is not null
          or generation.editorial_profile_version_number is not null
          or generation.editorial_profile_content_hash is not null
          or generation.editorial_profile_state_at_generation is not null
          or generation.editorial_profile_version_created_at is not null
          or generation.editorial_profile_pinned_at is not null
        )
    ) as generation_relations_consistent
  from public.newsroom_editorial_dossier_article_plans plan
)
select
  target_tables.*,
  columns_state.*,
  constraints_state.*,
  indexes_state.*,
  triggers_state.*,
  rpc_state.*,
  grants_state.*,
  seed_state.*,
  legacy_state.*,
  (
    target_tables.profiles_secure
    and target_tables.versions_secure
    and target_tables.events_secure
    and cardinality(target_tables.owners) = 1
    and target_tables.owners[1] = 'postgres'
    and columns_state.plan_columns_present
    and columns_state.generation_columns_present
    and constraints_state.active_version_fk_present
    and constraints_state.version_number_unique_present
    and constraints_state.plan_composite_fk_present
    and constraints_state.generation_composite_fk_present
    and constraints_state.generated_body_hash_check_present
    and indexes_state.version_history_index_present
    and indexes_state.activation_history_index_present
    and indexes_state.plan_profile_index_present
    and indexes_state.generation_profile_index_present
    and triggers_state.versions_immutable
    and triggers_state.events_immutable
    and triggers_state.plan_pin_immutable
    and triggers_state.generation_immutable
    and rpc_state.create_version_secure
    and rpc_state.activate_version_secure
    and rpc_state.pin_version_secure
    and rpc_state.prepare_signature_preserved
    and rpc_state.apply_signature_preserved
    and grants_state.service_role_execute_present
    and grants_state.browser_execute_absent
    and grants_state.browser_table_access_absent
    and seed_state.one_profile
    and seed_state.active_seed_valid
    and seed_state.initial_event_valid
    and legacy_state.plan_relations_consistent
    and legacy_state.generation_relations_consistent
    and rpc_definitions.prepare_definition like
      '%on conflict on constraint newsroom_editorial_compose_requests_pkey do nothing%'
    and rpc_definitions.prepare_definition like
      '%editorial_profile_version_id%'
    and rpc_definitions.apply_definition like
      '%dossier-article-plan-body-v2-editorial-profile%'
    and rpc_definitions.apply_definition like '%generated_body_hash%'
    and rpc_definitions.apply_definition like '%title_snapshot%'
  ) as ready_for_smoke,
  false as writes_performed
from target_tables
cross join columns_state
cross join constraints_state
cross join indexes_state
cross join triggers_state
cross join rpc_state
cross join rpc_definitions
cross join grants_state
cross join seed_state
cross join legacy_state;
