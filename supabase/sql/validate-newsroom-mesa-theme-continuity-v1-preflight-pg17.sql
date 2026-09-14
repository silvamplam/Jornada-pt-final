\set ON_ERROR_STOP on

-- Run only on a disposable PostgreSQL 17.11 database immediately before
-- 20260914114311_newsroom_mesa_theme_continuity_v1.sql.

begin;

do $preflight$
begin
  if current_setting('server_version_num')::integer / 100 <> 1700
    or current_setting('server_version_num')::integer % 100 <> 11
  then
    raise exception 'theme-continuity-preflight-requires-postgresql-17.11:%',
      current_setting('server_version');
  end if;

  if to_regclass('public.newsroom_editorial_themes') is null
    or to_regclass('public.newsroom_editorial_theme_sources') is null
    or to_regclass('public.newsroom_editorial_theme_articles') is null
    or to_regclass('public.newsroom_mesa_production_contexts') is null
    or to_regclass('public.newsroom_mesa_production_context_items') is null
    or to_regclass('public.newsroom_mesa_production_context_sources') is null
    or to_regclass('public.newsroom_mesa_article_plan_contexts') is null
    or to_regclass('public.newsroom_mesa_output_publications') is null
    or to_regclass('public.newsroom_editorial_dossier_sources') is null
    or to_regclass('public.newsroom_articles') is null
    or to_regclass('public.newsroom_article_snapshots') is null
    or to_regclass('public.editorial_articles') is null
    or to_regclass('public.newsroom_mesa_containment_guard') is null
    or to_regclass('public.newsroom_editorial_source_packages') is null
    or to_regclass('public.newsroom_editorial_dossier_article_plans') is null
    or to_regclass('public.newsroom_mesa_output_source_usage') is null
    or to_regclass('public.newsroom_mesa_publication_events') is null
    or to_regclass('public.newsroom_editorial_dossiers') is null
    or to_regclass('public.newsroom_mesa_material_versions') is null
    or to_regclass('public.newsroom_mesa_theme_materials') is null
    or to_regprocedure('public.newsroom_prepare_mesa_contexts_v3(uuid,text,jsonb,uuid,uuid[])') is null
    or to_regprocedure('public.newsroom_save_mesa_context_article_plan_v1(uuid,uuid,text,text,integer,text,text,text,uuid[],uuid)') is null
    or to_regprocedure('public.newsroom_save_dossier_article_plan_state_v1(uuid,uuid,text,uuid,uuid[],text,uuid)') is null
    or to_regprocedure('public.newsroom_set_mesa_shared_outputs_v2(uuid,uuid[])') is null
    or to_regprocedure('public.newsroom_mesa_normalize_refs_v2(jsonb)') is null
    or to_regprocedure('public.newsroom_mesa_plan_context_sources_valid_v1(uuid,uuid,uuid)') is null
  then
    raise exception 'theme-continuity-preflight-authority-missing';
  end if;

  if to_regprocedure('public.newsroom_mesa_theme_continuity_v1(uuid)') is not null
    or to_regprocedure('public.newsroom_prepare_theme_continuity_v1(uuid,uuid,integer,text)') is not null
    or to_regprocedure('public.newsroom_finalize_theme_continuity_v1(uuid,uuid,uuid[])') is not null
  then
    raise exception 'theme-continuity-preflight-target-present';
  end if;
end;
$preflight$;

select 'theme-continuity-preflight-pg17.11-ok' as result;
rollback;
