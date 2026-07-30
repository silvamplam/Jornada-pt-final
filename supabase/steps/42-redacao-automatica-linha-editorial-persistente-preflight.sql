-- Step 42 - preflight estritamente read-only da linha editorial persistente.
-- Não executa DDL, DML, RPCs de escrita ou alterações de configuração.

with required_tables as (
  select
    to_regclass('public.newsroom_editorial_dossier_article_plans') is not null
      as plans_present,
    to_regclass('public.newsroom_editorial_dossier_article_plan_generations') is not null
      as generations_present,
    to_regclass('public.newsroom_editorial_dossiers') is not null
      as dossiers_present,
    to_regclass('public.editorial_articles') is not null
      as editorial_articles_present
),
required_columns as (
  select
    count(*) filter (
      where table_name = 'newsroom_editorial_dossier_article_plan_generations'
        and column_name = 'generated_body'
        and data_type = 'text'
        and is_nullable = 'NO'
    ) = 1 as generated_body_present,
    count(*) filter (
      where table_name = 'newsroom_editorial_dossier_article_plan_generations'
        and column_name = 'input_snapshot'
        and data_type = 'jsonb'
    ) = 1 as input_snapshot_present,
    count(*) filter (
      where table_name = 'newsroom_editorial_dossier_article_plans'
        and column_name = 'editorial_article_id'
    ) = 1 as article_link_present
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'newsroom_editorial_dossier_article_plans',
      'newsroom_editorial_dossier_article_plan_generations'
    )
),
target_objects as (
  select
    to_regclass('public.newsroom_editorial_profiles') is not null
      as profiles_present,
    to_regclass('public.newsroom_editorial_profile_versions') is not null
      as versions_present,
    to_regclass('public.newsroom_editorial_profile_activation_events') is not null
      as events_present,
    (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and (
          (
            table_name = 'newsroom_editorial_dossier_article_plans'
            and column_name in (
              'editorial_profile_id',
              'editorial_profile_version_id',
              'editorial_profile_pinned_at'
            )
          )
          or (
            table_name = 'newsroom_editorial_dossier_article_plan_generations'
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
          )
        )
    ) as target_column_count
),
functions as (
  select
    to_regprocedure(
      'public.newsroom_prepare_editorial_compose(uuid,text,text,text,text,text,text,text,uuid[],uuid[],text[],integer[],text[])'
    ) is not null as prepare_present,
    to_regprocedure(
      'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)'
    ) is not null as apply_generation_present,
    to_regprocedure('extensions.digest(bytea,text)') is not null
      as sha256_digest_present
),
security_state as (
  select
    pg_get_userbyid(plan_table.relowner) as plan_owner,
    pg_get_userbyid(generation_table.relowner) as generation_owner,
    generation_table.relrowsecurity as generation_rls_enabled,
    generation_table.relforcerowsecurity as generation_rls_forced
  from pg_class plan_table
  join pg_namespace plan_namespace
    on plan_namespace.oid = plan_table.relnamespace
  join pg_class generation_table
    on generation_table.relname =
      'newsroom_editorial_dossier_article_plan_generations'
  join pg_namespace generation_namespace
    on generation_namespace.oid = generation_table.relnamespace
   and generation_namespace.nspname = 'public'
  where plan_namespace.nspname = 'public'
    and plan_table.relname = 'newsroom_editorial_dossier_article_plans'
),
legacy_counts as (
  select
    (select count(*) from public.newsroom_editorial_dossier_article_plans)
      as legacy_plan_count,
    (
      select count(*)
      from public.newsroom_editorial_dossier_article_plan_generations
    ) as legacy_generation_count,
    (
      select count(*)
      from public.newsroom_editorial_dossier_article_plan_generations generation
      where btrim(generation.generated_body) = ''
    ) as invalid_generated_body_count
)
select
  required_tables.*,
  required_columns.*,
  target_objects.*,
  functions.*,
  security_state.*,
  legacy_counts.*,
  (
    required_tables.plans_present
    and required_tables.generations_present
    and required_tables.dossiers_present
    and required_tables.editorial_articles_present
    and required_columns.generated_body_present
    and required_columns.input_snapshot_present
    and required_columns.article_link_present
    and not target_objects.profiles_present
    and not target_objects.versions_present
    and not target_objects.events_present
    and target_objects.target_column_count = 0
    and functions.prepare_present
    and functions.apply_generation_present
    and functions.sha256_digest_present
    and security_state.generation_rls_enabled
    and security_state.generation_rls_forced
    and legacy_counts.invalid_generated_body_count = 0
  ) as ready_to_apply,
  false as writes_performed
from required_tables
cross join required_columns
cross join target_objects
cross join functions
cross join security_state
cross join legacy_counts;
