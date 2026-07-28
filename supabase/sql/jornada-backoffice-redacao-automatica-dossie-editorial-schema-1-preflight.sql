-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-SCHEMA-1
-- SQL 1/4 — PREFLIGHT EXCLUSIVAMENTE READ-ONLY
-- Confirma a base necessária e bloqueia conflitos antes da aplicação.

begin;
set local transaction_read_only = on;

do $$
begin
  if to_regclass('public.newsroom_articles') is null then
    raise exception 'preflight_required_table_missing: public.newsroom_articles'
      using errcode = '42P01';
  end if;

  if to_regclass('public.newsroom_article_snapshots') is null then
    raise exception 'preflight_required_table_missing: public.newsroom_article_snapshots'
      using errcode = '42P01';
  end if;

  if to_regclass('public.newsroom_editorial_dossiers') is not null then
    raise exception 'preflight_target_table_exists: public.newsroom_editorial_dossiers'
      using errcode = '42P07';
  end if;

  if to_regclass('public.newsroom_editorial_dossier_sources') is not null then
    raise exception 'preflight_target_table_exists: public.newsroom_editorial_dossier_sources'
      using errcode = '42P07';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'newsroom_article_snapshots_article_id_id_key'
  ) then
    raise exception 'preflight_target_constraint_exists: newsroom_article_snapshots_article_id_id_key'
      using errcode = '42710';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace procedure_namespace
      on procedure_namespace.oid = procedure_row.pronamespace
    where procedure_namespace.nspname = 'public'
      and procedure_row.proname = 'newsroom_set_editorial_dossier_updated_at'
  ) then
    raise exception 'preflight_target_function_exists: public.newsroom_set_editorial_dossier_updated_at'
      using errcode = '42723';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'newsroom_articles'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    raise exception 'preflight_required_column_missing: public.newsroom_articles.id'
      using errcode = '42703';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'newsroom_article_snapshots'
      and column_name = 'id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'newsroom_article_snapshots'
      and column_name = 'article_id'
      and data_type = 'uuid'
  ) then
    raise exception 'preflight_required_snapshot_identity_missing'
      using errcode = '42703';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_article_snapshots')
      and conname = 'newsroom_article_snapshots_article_fkey'
      and contype = 'f'
      and confrelid = to_regclass('public.newsroom_articles')
  ) then
    raise exception 'preflight_required_snapshot_foreign_key_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_article_snapshots')
      and conname = 'newsroom_article_snapshots_article_hash_key'
      and contype = 'u'
  ) then
    raise exception 'preflight_required_snapshot_unique_constraint_missing'
      using errcode = '55000';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-SCHEMA-1',
  'newsroom_articles_exists', to_regclass('public.newsroom_articles') is not null,
  'newsroom_article_snapshots_exists', to_regclass('public.newsroom_article_snapshots') is not null,
  'target_dossiers_absent', to_regclass('public.newsroom_editorial_dossiers') is null,
  'target_sources_absent', to_regclass('public.newsroom_editorial_dossier_sources') is null,
  'ready_for_apply', true
) as preflight_result;

rollback;
