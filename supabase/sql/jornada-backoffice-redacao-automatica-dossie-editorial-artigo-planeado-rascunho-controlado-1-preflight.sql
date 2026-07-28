-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGO-PLANEADO-RASCUNHO-CONTROLADO-1
-- SQL 1/4 — PREFLIGHT EXCLUSIVAMENTE READ-ONLY
-- Confirma as estruturas existentes e a ausência da ligação/RPC desta fase.

begin;
set local transaction_read_only = on;

do $$
declare
  v_save_function oid;
begin
  if to_regclass('public.editorial_articles') is null then
    raise exception 'preflight_required_table_missing: public.editorial_articles'
      using errcode = '42P01';
  end if;

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

  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.editorial_articles')
      and attname = 'newsroom_article_id'
      and not attisdropped
  ) then
    raise exception 'preflight_required_editorial_newsroom_link_missing'
      using errcode = '42703';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and attname = 'editorial_article_id'
      and not attisdropped
  ) then
    raise exception 'preflight_target_column_exists: editorial_article_id'
      using errcode = '42701';
  end if;

  if to_regprocedure(
    'public.newsroom_create_editorial_dossier_article_plan_draft(uuid,uuid)'
  ) is not null then
    raise exception 'preflight_target_function_exists'
      using errcode = '42723';
  end if;

  v_save_function := to_regprocedure(
    'public.newsroom_save_editorial_dossier_article_plan(uuid,uuid,text,text,integer,text,text,text,uuid[])'
  );

  if v_save_function is null then
    raise exception 'preflight_required_save_function_missing'
      using errcode = '42883';
  end if;

  if (
    select procedure_row.prosecdef
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = v_save_function
  ) then
    raise exception 'preflight_save_function_must_use_security_invoker'
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
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'editorial_articles'
      and indexname = 'editorial_articles_newsroom_article_id_uidx'
  ) then
    raise exception 'preflight_required_direct_draft_unique_index_missing'
      using errcode = '55000';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGO-PLANEADO-RASCUNHO-CONTROLADO-1',
  'article_plans_table', to_regclass('public.newsroom_editorial_dossier_article_plans')::text,
  'editorial_articles_table', to_regclass('public.editorial_articles')::text,
  'target_column_absent', not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and attname = 'editorial_article_id'
      and not attisdropped
  ),
  'target_rpc_absent', to_regprocedure(
    'public.newsroom_create_editorial_dossier_article_plan_draft(uuid,uuid)'
  ) is null,
  'ready_for_apply', true
) as preflight_result;

rollback;
