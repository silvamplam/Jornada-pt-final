-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-SCHEMA-1
-- SQL 3/4 — POSTFLIGHT READ-ONLY
-- Valida estrutura, relações internas, limite e segurança.

begin;
set local transaction_read_only = on;

do $$
declare
  v_missing_columns text;
begin
  if to_regclass('public.newsroom_editorial_dossier_article_plans') is null
     or to_regclass('public.newsroom_editorial_dossier_article_plan_sources') is null then
    raise exception 'postflight_target_table_missing'
      using errcode = '42P01';
  end if;

  select string_agg(required.column_name, ', ' order by required.table_name, required.column_name)
  into v_missing_columns
  from (
    values
      ('newsroom_editorial_dossier_article_plans', 'id'),
      ('newsroom_editorial_dossier_article_plans', 'dossier_id'),
      ('newsroom_editorial_dossier_article_plans', 'working_title'),
      ('newsroom_editorial_dossier_article_plans', 'status'),
      ('newsroom_editorial_dossier_article_plans', 'sort_order'),
      ('newsroom_editorial_dossier_article_plans', 'article_kind'),
      ('newsroom_editorial_dossier_article_plans', 'length_mode'),
      ('newsroom_editorial_dossier_article_plans', 'editorial_instructions'),
      ('newsroom_editorial_dossier_article_plans', 'created_at'),
      ('newsroom_editorial_dossier_article_plans', 'updated_at'),
      ('newsroom_editorial_dossier_article_plan_sources', 'id'),
      ('newsroom_editorial_dossier_article_plan_sources', 'dossier_id'),
      ('newsroom_editorial_dossier_article_plan_sources', 'article_plan_id'),
      ('newsroom_editorial_dossier_article_plan_sources', 'dossier_source_id'),
      ('newsroom_editorial_dossier_article_plan_sources', 'sort_order'),
      ('newsroom_editorial_dossier_article_plan_sources', 'created_at'),
      ('newsroom_editorial_dossier_article_plan_sources', 'updated_at')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = required.table_name
      and column_row.column_name = required.column_name
  );

  if v_missing_columns is not null then
    raise exception 'postflight_required_columns_missing: %', v_missing_columns
      using errcode = '42703';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_sources')
      and conname = 'newsroom_editorial_dossier_sources_dossier_id_id_key'
      and contype = 'u'
  ) then
    raise exception 'postflight_dossier_source_identity_constraint_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and conname = 'newsroom_editorial_dossier_article_plans_dossier_id_id_key'
      and contype = 'u'
  ) then
    raise exception 'postflight_article_plan_identity_constraint_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_article_plan_sources')
      and conname = 'newsroom_editorial_dossier_article_plan_sources_plan_identity_fkey'
      and contype = 'f'
      and confrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
  ) then
    raise exception 'postflight_plan_identity_foreign_key_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_article_plan_sources')
      and conname = 'newsroom_editorial_dossier_article_plan_sources_source_identity_fkey'
      and contype = 'f'
      and confrelid = to_regclass('public.newsroom_editorial_dossier_sources')
  ) then
    raise exception 'postflight_dossier_source_identity_foreign_key_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_article_plan_sources')
      and conname = 'newsroom_editorial_dossier_article_plan_sources_plan_source_key'
      and contype = 'u'
  ) then
    raise exception 'postflight_plan_source_unique_constraint_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and tgname = 'newsroom_editorial_dossier_article_plans_validate_limit'
      and not tgisinternal
  ) then
    raise exception 'postflight_article_plan_limit_trigger_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and tgname = 'newsroom_editorial_dossier_article_plans_set_updated_at'
      and not tgisinternal
  ) or not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = to_regclass('public.newsroom_editorial_dossier_article_plan_sources')
      and tgname = 'newsroom_editorial_dossier_article_plan_sources_set_updated_at'
      and not tgisinternal
  ) then
    raise exception 'postflight_updated_at_trigger_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class
    where oid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and relrowsecurity
      and relforcerowsecurity
  ) or not exists (
    select 1
    from pg_catalog.pg_class
    where oid = to_regclass('public.newsroom_editorial_dossier_article_plan_sources')
      and relrowsecurity
      and relforcerowsecurity
  ) then
    raise exception 'postflight_rls_not_forced'
      using errcode = '55000';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.newsroom_editorial_dossier_article_plans',
    'SELECT,INSERT,UPDATE,DELETE'
  ) or not has_table_privilege(
    'service_role',
    'public.newsroom_editorial_dossier_article_plan_sources',
    'SELECT,INSERT,UPDATE,DELETE'
  ) then
    raise exception 'postflight_service_role_grants_missing'
      using errcode = '42501';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.newsroom_editorial_dossier_article_plans',
    'SELECT'
  ) or has_table_privilege(
    'authenticated',
    'public.newsroom_editorial_dossier_article_plan_sources',
    'SELECT'
  ) or has_table_privilege(
    'anon',
    'public.newsroom_editorial_dossier_article_plans',
    'SELECT'
  ) or has_table_privilege(
    'anon',
    'public.newsroom_editorial_dossier_article_plan_sources',
    'SELECT'
  ) then
    raise exception 'postflight_unexpected_client_privilege'
      using errcode = '42501';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-SCHEMA-1',
  'article_plans_table', to_regclass('public.newsroom_editorial_dossier_article_plans')::text,
  'plan_sources_table', to_regclass('public.newsroom_editorial_dossier_article_plan_sources')::text,
  'article_plans_rls_forced', (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = to_regclass('public.newsroom_editorial_dossier_article_plans')
  ),
  'plan_sources_rls_forced', (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = to_regclass('public.newsroom_editorial_dossier_article_plan_sources')
  ),
  'active_plan_limit', 4,
  'postflight_ok', true
) as postflight_result;

rollback;
