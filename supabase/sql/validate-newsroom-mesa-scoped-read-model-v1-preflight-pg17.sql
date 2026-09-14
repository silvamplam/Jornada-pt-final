\set ON_ERROR_STOP on

-- Run on a disposable PostgreSQL 17 database immediately before
-- 20260914074012_newsroom_mesa_scoped_read_model_v1.sql.

begin;

do $preflight$
begin
  if to_regprocedure('public.newsroom_organize_theme_sources_v1(uuid,uuid,text,text,uuid[])') is null
    or to_regprocedure('public.newsroom_organize_theme_materials_v2(uuid,uuid,text,text,uuid[],jsonb)') is null
    or to_regclass('public.newsroom_mesa_output_source_usage') is null
    or to_regclass('public.newsroom_mesa_version_source_refs') is null
  then
    raise exception 'mesa-scoped-read-preflight-authority-missing';
  end if;
  if to_regprocedure('public.newsroom_mesa_source_counts_v1(timestamptz,text)') is not null
    or to_regprocedure('public.newsroom_mesa_page_identities_v1(timestamptz,text,text,text,integer,integer)') is not null
    or to_regprocedure('public.newsroom_mesa_theme_summaries_v1(uuid[])') is not null
  then
    raise exception 'mesa-scoped-read-preflight-target-present';
  end if;
end;
$preflight$;

select 'preflight-ok' as result;
rollback;
