-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-SCHEMA-1
-- SQL 1/4 — PREFLIGHT EXCLUSIVAMENTE READ-ONLY
-- Confirma a fundação persistente do Dossiê e bloqueia conflitos antes da aplicação.

begin;
set local transaction_read_only = on;

do $$
begin
  if to_regclass('public.newsroom_editorial_dossiers') is null then
    raise exception 'preflight_required_table_missing: public.newsroom_editorial_dossiers'
      using errcode = '42P01';
  end if;

  if to_regclass('public.newsroom_editorial_dossier_sources') is null then
    raise exception 'preflight_required_table_missing: public.newsroom_editorial_dossier_sources'
      using errcode = '42P01';
  end if;

  if to_regclass('public.newsroom_editorial_dossier_article_plans') is not null then
    raise exception 'preflight_target_table_exists: public.newsroom_editorial_dossier_article_plans'
      using errcode = '42P07';
  end if;

  if to_regclass('public.newsroom_editorial_dossier_article_plan_sources') is not null then
    raise exception 'preflight_target_table_exists: public.newsroom_editorial_dossier_article_plan_sources'
      using errcode = '42P07';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_sources')
      and conname = 'newsroom_editorial_dossier_sources_dossier_id_id_key'
  ) then
    raise exception 'preflight_target_constraint_exists: newsroom_editorial_dossier_sources_dossier_id_id_key'
      using errcode = '42710';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace procedure_namespace
      on procedure_namespace.oid = procedure_row.pronamespace
    where procedure_namespace.nspname = 'public'
      and procedure_row.proname = 'newsroom_validate_editorial_dossier_article_plan_limit'
  ) then
    raise exception 'preflight_target_function_exists: public.newsroom_validate_editorial_dossier_article_plan_limit'
      using errcode = '42723';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'newsroom_editorial_dossiers'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    raise exception 'preflight_required_column_missing: public.newsroom_editorial_dossiers.id'
      using errcode = '42703';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'newsroom_editorial_dossier_sources'
      and column_name = 'id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'newsroom_editorial_dossier_sources'
      and column_name = 'dossier_id'
      and data_type = 'uuid'
  ) then
    raise exception 'preflight_required_dossier_source_identity_missing'
      using errcode = '42703';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_sources')
      and conname = 'newsroom_editorial_dossier_sources_dossier_fkey'
      and contype = 'f'
      and confrelid = to_regclass('public.newsroom_editorial_dossiers')
  ) then
    raise exception 'preflight_required_dossier_source_foreign_key_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace procedure_namespace
      on procedure_namespace.oid = procedure_row.pronamespace
    where procedure_namespace.nspname = 'public'
      and procedure_row.proname = 'newsroom_set_editorial_dossier_updated_at'
  ) then
    raise exception 'preflight_required_updated_at_function_missing'
      using errcode = '42883';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-SCHEMA-1',
  'dossiers_table', to_regclass('public.newsroom_editorial_dossiers')::text,
  'dossier_sources_table', to_regclass('public.newsroom_editorial_dossier_sources')::text,
  'target_article_plans_absent', to_regclass('public.newsroom_editorial_dossier_article_plans') is null,
  'target_plan_sources_absent', to_regclass('public.newsroom_editorial_dossier_article_plan_sources') is null,
  'ready_for_apply', true
) as preflight_result;

rollback;
