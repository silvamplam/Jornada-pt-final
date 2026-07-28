-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-UX-1
-- SQL 1/4 — PREFLIGHT EXCLUSIVAMENTE READ-ONLY
-- Confirma o schema já validado e a ausência da RPC transacional desta fase.

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

  if to_regclass('public.newsroom_editorial_dossier_article_plans') is null then
    raise exception 'preflight_required_table_missing: public.newsroom_editorial_dossier_article_plans'
      using errcode = '42P01';
  end if;

  if to_regclass('public.newsroom_editorial_dossier_article_plan_sources') is null then
    raise exception 'preflight_required_table_missing: public.newsroom_editorial_dossier_article_plan_sources'
      using errcode = '42P01';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace procedure_namespace
      on procedure_namespace.oid = procedure_row.pronamespace
    where procedure_namespace.nspname = 'public'
      and procedure_row.proname = 'newsroom_save_editorial_dossier_article_plan'
  ) then
    raise exception 'preflight_target_function_exists: public.newsroom_save_editorial_dossier_article_plan'
      using errcode = '42723';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and conname = 'newsroom_editorial_dossier_article_plans_dossier_id_id_key'
      and contype = 'u'
  ) then
    raise exception 'preflight_required_plan_identity_constraint_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_article_plan_sources')
      and conname = 'newsroom_editorial_dossier_article_plan_sources_plan_source_key'
      and contype = 'u'
  ) then
    raise exception 'preflight_required_plan_source_unique_constraint_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and tgname = 'newsroom_editorial_dossier_article_plans_validate_limit'
      and not tgisinternal
  ) then
    raise exception 'preflight_required_plan_limit_trigger_missing'
      using errcode = '55000';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-UX-1',
  'article_plans_table', to_regclass('public.newsroom_editorial_dossier_article_plans')::text,
  'plan_sources_table', to_regclass('public.newsroom_editorial_dossier_article_plan_sources')::text,
  'target_rpc_absent', not exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace procedure_namespace
      on procedure_namespace.oid = procedure_row.pronamespace
    where procedure_namespace.nspname = 'public'
      and procedure_row.proname = 'newsroom_save_editorial_dossier_article_plan'
  ),
  'ready_for_apply', true
) as preflight_result;

rollback;
