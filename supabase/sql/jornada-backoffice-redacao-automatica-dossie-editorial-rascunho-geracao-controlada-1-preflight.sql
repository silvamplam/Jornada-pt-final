-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-RASCUNHO-GERACAO-CONTROLADA-1
-- SQL 1/4 — PREFLIGHT EXCLUSIVAMENTE READ-ONLY
-- Confirma a fundação existente e a ausência da tabela/RPC desta fase.

begin;
set local transaction_read_only = on;

do $$
begin
  if to_regclass('public.editorial_articles') is null then
    raise exception 'preflight_required_table_missing: public.editorial_articles'
      using errcode = '42P01';
  end if;

  if to_regclass('public.newsroom_articles') is null
     or to_regclass('public.newsroom_article_snapshots') is null
     or to_regclass('public.newsroom_editorial_dossiers') is null
     or to_regclass('public.newsroom_editorial_dossier_sources') is null
     or to_regclass('public.newsroom_editorial_dossier_article_plans') is null
     or to_regclass('public.newsroom_editorial_dossier_article_plan_sources') is null then
    raise exception 'preflight_required_newsroom_structure_missing'
      using errcode = '42P01';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and attname = 'editorial_article_id'
      and atttypid = 'uuid'::regtype
      and not attisdropped
  ) then
    raise exception 'preflight_required_editorial_article_link_missing'
      using errcode = '42703';
  end if;

  if to_regprocedure(
    'public.newsroom_create_editorial_dossier_article_plan_draft(uuid,uuid)'
  ) is null then
    raise exception 'preflight_required_draft_function_missing'
      using errcode = '42883';
  end if;

  if to_regclass(
    'public.newsroom_editorial_dossier_article_plan_generations'
  ) is not null then
    raise exception 'preflight_target_table_exists'
      using errcode = '42P07';
  end if;

  if to_regprocedure(
    'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)'
  ) is not null then
    raise exception 'preflight_target_function_exists'
      using errcode = '42723';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-RASCUNHO-GERACAO-CONTROLADA-1',
  'article_plans_table', to_regclass('public.newsroom_editorial_dossier_article_plans')::text,
  'editorial_articles_table', to_regclass('public.editorial_articles')::text,
  'snapshots_table', to_regclass('public.newsroom_article_snapshots')::text,
  'target_table_absent', to_regclass(
    'public.newsroom_editorial_dossier_article_plan_generations'
  ) is null,
  'target_rpc_absent', to_regprocedure(
    'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)'
  ) is null,
  'ready_for_apply', true
) as preflight_result;

rollback;
